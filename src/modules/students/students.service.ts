import { parse } from 'csv-parse/sync';
import { AuditAction, Prisma, type Student } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { buildOrderBy, buildPaginationMeta, resolvePagination } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import {
  assertCanAccessStudent,
  canSeeSensitive,
  studentScopeWhere,
} from '@/modules/shared/scope';
import type { AuthContext } from '@/types/express';
import type {
  CreateStudentInput,
  ImportStudentsInput,
  ListStudentsQuery,
  UpdateStudentInput,
} from './students.schemas';

const SORTABLE = ['createdAt', 'lastName', 'firstName', 'studentNumber', 'admissionDate', 'status'] as const;

type StudentDto = Omit<Student, 'dob' | 'medicalNotes'> & {
  dob: string | null;
  medicalNotes: string | null;
};

/** Strip / mask sensitive fields based on the requester's role. */
function toDto(student: Student, role: AuthContext['role']): StudentDto {
  const sensitive = canSeeSensitive(role);
  return {
    ...student,
    dob: sensitive ? toDateString(student.dob) : null,
    medicalNotes: sensitive ? student.medicalNotes : null,
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function requireSchool(auth: AuthContext): string {
  if (!auth.schoolId) throw new ForbiddenError('User is not associated with a school');
  return auth.schoolId;
}

export async function listStudents(
  auth: AuthContext,
  query: ListStudentsQuery,
): Promise<{ items: StudentDto[]; meta: PaginationMeta }> {
  const scope = await studentScopeWhere(auth);
  const { skip, take, page, limit } = resolvePagination(query);

  const where: Prisma.StudentWhereInput = {
    AND: [
      scope,
      { deletedAt: null },
      query.status ? { status: query.status } : {},
      query.classId
        ? { enrollments: { some: { classId: query.classId } } }
        : {},
      query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { studentNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };

  const orderBy = buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, 'createdAt');

  const [rows, total] = await Promise.all([
    prisma.student.findMany({ where, orderBy, skip, take }),
    prisma.student.count({ where }),
  ]);

  return { items: rows.map((s) => toDto(s, auth.role)), meta: buildPaginationMeta(page, limit, total) };
}

export async function getStudent(auth: AuthContext, id: string): Promise<StudentDto> {
  await assertCanAccessStudent(auth, id);
  const student = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!student) throw new NotFoundError('Student');
  return toDto(student, auth.role);
}

export async function createStudent(
  auth: AuthContext,
  input: CreateStudentInput,
  ctx: AuditContext,
): Promise<StudentDto> {
  const schoolId = requireSchool(auth);

  const created = await prisma.$transaction(async (tx) => {
    if (input.classId) {
      const klass = await tx.class.findFirst({
        where: { id: input.classId, schoolId, deletedAt: null },
        select: { id: true, academicYear: true },
      });
      if (!klass) throw new BadRequestError('Class not found in your school');
    }

    const student = await tx.student.create({
      data: {
        schoolId,
        studentNumber: input.studentNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: new Date(input.dob),
        gender: input.gender,
        admissionDate: new Date(input.admissionDate),
        status: input.status,
        bloodGroup: input.bloodGroup ?? null,
        medicalNotes: input.medicalNotes ?? null,
        address: input.address ?? null,
        photoUrl: input.photoUrl ?? null,
      },
    });

    if (input.classId) {
      const klass = await tx.class.findUniqueOrThrow({
        where: { id: input.classId },
        select: { academicYear: true },
      });
      await tx.enrollment.create({
        data: {
          studentId: student.id,
          classId: input.classId,
          academicYear: input.academicYear ?? klass.academicYear,
        },
      });
    }

    await writeAudit(
      {
        ...ctx,
        action: AuditAction.CREATE,
        tableName: 'students',
        recordId: student.id,
        after: student,
      },
      tx,
    );

    return student;
  });

  return toDto(created, auth.role);
}

export async function updateStudent(
  auth: AuthContext,
  id: string,
  input: UpdateStudentInput,
  ctx: AuditContext,
): Promise<StudentDto> {
  await assertCanAccessStudent(auth, id);

  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.student.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Student');

    const data: Prisma.StudentUpdateInput = {
      ...(input.studentNumber !== undefined && { studentNumber: input.studentNumber }),
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.dob !== undefined && { dob: new Date(input.dob) }),
      ...(input.gender !== undefined && { gender: input.gender }),
      ...(input.admissionDate !== undefined && { admissionDate: new Date(input.admissionDate) }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.bloodGroup !== undefined && { bloodGroup: input.bloodGroup }),
      ...(input.medicalNotes !== undefined && { medicalNotes: input.medicalNotes }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.photoUrl !== undefined && { photoUrl: input.photoUrl }),
    };

    const student = await tx.student.update({ where: { id }, data });
    await writeAudit(
      { ...ctx, action: AuditAction.UPDATE, tableName: 'students', recordId: id, before, after: student },
      tx,
    );
    return student;
  });

  return toDto(updated, auth.role);
}

export async function softDeleteStudent(
  auth: AuthContext,
  id: string,
  ctx: AuditContext,
): Promise<void> {
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
    throw new ForbiddenError('Only administrators can delete students');
  }
  await assertCanAccessStudent(auth, id);

  await prisma.$transaction(async (tx) => {
    const before = await tx.student.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Student');
    const after = await tx.student.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'WITHDRAWN' },
    });
    await writeAudit(
      { ...ctx, action: AuditAction.DELETE, tableName: 'students', recordId: id, before, after },
      tx,
    );
  });
}

interface ImportRow {
  studentNumber: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  admissionDate: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** Bulk import students from CSV. Validates each row; existing numbers are skipped. */
export async function importStudents(
  auth: AuthContext,
  input: ImportStudentsInput,
  ctx: AuditContext,
): Promise<ImportResult> {
  const schoolId = requireSchool(auth);

  let records: Record<string, string>[];
  try {
    records = parse(input.csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch {
    throw new BadRequestError('Could not parse CSV content');
  }
  if (records.length === 0) throw new BadRequestError('CSV contains no data rows');
  if (records.length > 1000) throw new BadRequestError('Import is limited to 1000 rows per request');

  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  const genders = new Set(['MALE', 'FEMALE', 'OTHER']);

  for (let i = 0; i < records.length; i += 1) {
    const raw = records[i] as Record<string, string>;
    const rowNo = i + 2; // account for header row
    const row: ImportRow = {
      studentNumber: (raw.studentNumber ?? raw.student_number ?? '').trim(),
      firstName: (raw.firstName ?? raw.first_name ?? '').trim(),
      lastName: (raw.lastName ?? raw.last_name ?? '').trim(),
      dob: (raw.dob ?? '').trim(),
      gender: (raw.gender ?? '').trim().toUpperCase(),
      admissionDate: (raw.admissionDate ?? raw.admission_date ?? '').trim(),
    };

    if (!row.studentNumber || !row.firstName || !row.lastName) {
      result.errors.push({ row: rowNo, message: 'Missing required name/number fields' });
      continue;
    }
    if (!genders.has(row.gender)) {
      result.errors.push({ row: rowNo, message: `Invalid gender "${row.gender}"` });
      continue;
    }
    if (Number.isNaN(Date.parse(row.dob)) || Number.isNaN(Date.parse(row.admissionDate))) {
      result.errors.push({ row: rowNo, message: 'Invalid dob or admissionDate (use YYYY-MM-DD)' });
      continue;
    }

    const exists = await prisma.student.findFirst({
      where: { schoolId, studentNumber: row.studentNumber },
      select: { id: true },
    });
    if (exists) {
      result.skipped += 1;
      continue;
    }

    try {
      const student = await prisma.student.create({
        data: {
          schoolId,
          studentNumber: row.studentNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          dob: new Date(row.dob),
          gender: row.gender as ImportRow['gender'] as 'MALE' | 'FEMALE' | 'OTHER',
          admissionDate: new Date(row.admissionDate),
          status: 'ACTIVE',
        },
      });
      if (input.classId) {
        const klass = await prisma.class.findFirst({
          where: { id: input.classId, schoolId, deletedAt: null },
          select: { academicYear: true },
        });
        if (klass) {
          await prisma.enrollment.create({
            data: {
              studentId: student.id,
              classId: input.classId,
              academicYear: input.academicYear ?? klass.academicYear,
            },
          });
        }
      }
      await writeAudit({
        ...ctx,
        action: AuditAction.CREATE,
        tableName: 'students',
        recordId: student.id,
        after: { imported: true, studentNumber: row.studentNumber },
      });
      result.created += 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        result.skipped += 1;
      } else {
        result.errors.push({ row: rowNo, message: 'Failed to create student' });
      }
    }
  }

  if (result.created === 0 && result.errors.length > 0 && result.skipped === 0) {
    throw new ConflictError('No students were imported', []);
  }
  return result;
}
