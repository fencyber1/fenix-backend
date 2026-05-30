import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { buildPaginationMeta } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { assertCanAccessStudent, teacherClassIds } from '@/modules/shared/scope';
import { computeGrade, gpa } from './grade.calc';
import type { AuthContext } from '@/types/express';
import type {
  ListGradesQuery,
  ReportCardQuery,
  UpdateGradeInput,
  UpsertGradeInput,
} from './grades.schemas';

/** A teacher may grade only subjects they teach (or are class-teacher of). */
async function assertCanGradeSubject(auth: AuthContext, subjectId: string): Promise<void> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId },
    select: { id: true, classId: true, teacherId: true, class: { select: { schoolId: true } } },
  });
  if (!subject) throw new NotFoundError('Subject');
  if (auth.role === 'SUPER_ADMIN') return;
  if (auth.role === 'ADMIN') {
    if (subject.class.schoolId !== auth.schoolId) throw new ForbiddenError('Subject outside your school');
    return;
  }
  if (auth.role === 'TEACHER') {
    const classIds = await teacherClassIds(auth.userId);
    if (!classIds.includes(subject.classId)) throw new ForbiddenError('You do not teach this class');
    return;
  }
  throw new ForbiddenError();
}

export async function upsertGrade(
  auth: AuthContext,
  input: UpsertGradeInput,
  ctx: AuditContext,
): Promise<unknown> {
  await assertCanGradeSubject(auth, input.subjectId);

  // Student must be enrolled in the subject's class.
  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: input.subjectId },
    select: { classId: true },
  });
  const enrolled = await prisma.enrollment.findFirst({
    where: { studentId: input.studentId, classId: subject.classId },
    select: { id: true },
  });
  if (!enrolled) throw new BadRequestError('Student is not enrolled in this subject\'s class');

  const { letter, remark } = computeGrade(input.score, input.maxScore);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.grade.findUnique({
      where: { studentId_subjectId_term: { studentId: input.studentId, subjectId: input.subjectId, term: input.term } },
    });
    const grade = await tx.grade.upsert({
      where: {
        studentId_subjectId_term: {
          studentId: input.studentId,
          subjectId: input.subjectId,
          term: input.term,
        },
      },
      create: {
        studentId: input.studentId,
        subjectId: input.subjectId,
        term: input.term,
        score: new Prisma.Decimal(input.score),
        maxScore: new Prisma.Decimal(input.maxScore),
        gradeLetter: letter,
        remark: input.remark ?? remark,
        recordedBy: auth.userId,
      },
      update: {
        score: new Prisma.Decimal(input.score),
        maxScore: new Prisma.Decimal(input.maxScore),
        gradeLetter: letter,
        remark: input.remark ?? remark,
        recordedBy: auth.userId,
      },
    });
    await writeAudit(
      {
        ...ctx,
        action: before ? AuditAction.UPDATE : AuditAction.CREATE,
        tableName: 'grades',
        recordId: grade.id,
        before,
        after: grade,
      },
      tx,
    );
    return grade;
  });

  return result;
}

export async function updateGrade(
  auth: AuthContext,
  id: string,
  input: UpdateGradeInput,
  ctx: AuditContext,
): Promise<unknown> {
  const before = await prisma.grade.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('Grade');
  await assertCanGradeSubject(auth, before.subjectId);

  const { letter, remark } = computeGrade(input.score, input.maxScore);
  return prisma.$transaction(async (tx) => {
    const grade = await tx.grade.update({
      where: { id },
      data: {
        score: new Prisma.Decimal(input.score),
        maxScore: new Prisma.Decimal(input.maxScore),
        gradeLetter: letter,
        remark: input.remark ?? remark,
        recordedBy: auth.userId,
      },
    });
    await writeAudit(
      { ...ctx, action: AuditAction.UPDATE, tableName: 'grades', recordId: id, before, after: grade },
      tx,
    );
    return grade;
  });
}

export async function listGrades(
  auth: AuthContext,
  query: ListGradesQuery,
): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  if (query.studentId) await assertCanAccessStudent(auth, query.studentId);

  const where: Prisma.GradeWhereInput = {
    ...(query.studentId && { studentId: query.studentId }),
    ...(query.subjectId && { subjectId: query.subjectId }),
    ...(query.term && { term: query.term }),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.grade.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        subject: { select: { name: true, code: true } },
        student: { select: { firstName: true, lastName: true, studentNumber: true } },
      },
    }),
    prisma.grade.count({ where }),
  ]);

  return { items: rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export interface ReportCardData {
  student: { id: string; name: string; studentNumber: string };
  term: string;
  school: { name: string; logoUrl: string | null };
  subjects: {
    subject: string;
    code: string;
    score: number;
    maxScore: number;
    percentage: number;
    letter: string;
    remark: string | null;
  }[];
  summary: { average: number; gpa: number; totalSubjects: number };
}

/** Aggregate a student's grades for a term into report-card data (consumed by the PDF renderer). */
export async function getReportCardData(
  auth: AuthContext,
  query: ReportCardQuery,
): Promise<ReportCardData> {
  await assertCanAccessStudent(auth, query.studentId);

  const student = await prisma.student.findFirst({
    where: { id: query.studentId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentNumber: true,
      school: { select: { name: true, logoUrl: true } },
    },
  });
  if (!student) throw new NotFoundError('Student');

  const grades = await prisma.grade.findMany({
    where: { studentId: query.studentId, term: query.term },
    include: { subject: { select: { name: true, code: true } } },
    orderBy: { subject: { name: 'asc' } },
  });

  const subjects = grades.map((g) => {
    const score = g.score.toNumber();
    const maxScore = g.maxScore.toNumber();
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
    return {
      subject: g.subject.name,
      code: g.subject.code,
      score,
      maxScore,
      percentage: pct,
      letter: g.gradeLetter,
      remark: g.remark,
    };
  });

  const percentages = subjects.map((s) => s.percentage);
  const average =
    percentages.length > 0
      ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 100) / 100
      : 0;

  return {
    student: { id: student.id, name: `${student.firstName} ${student.lastName}`, studentNumber: student.studentNumber },
    term: query.term,
    school: { name: student.school.name, logoUrl: student.school.logoUrl },
    subjects,
    summary: { average, gpa: gpa(percentages), totalSubjects: subjects.length },
  };
}
