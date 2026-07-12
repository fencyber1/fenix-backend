import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { buildOrderBy, buildPaginationMeta, resolvePagination } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { generateRandomToken, sha256 } from '@/utils/password';
import type { AuthContext } from '@/types/express';
import type {
  CreateClassInput,
  EnrollStudentInput,
  InviteStudentToClassInput,
  ListClassesQuery,
  UpdateClassInput,
} from './classes.schemas';

const SORTABLE = ['createdAt', 'name', 'section', 'academicYear'] as const;

function requireTenant(auth: AuthContext): string {
  if (!auth.tenantId) throw new ForbiddenError('User is not associated with a tenant');
  return auth.tenantId;
}

async function assertTeacherInTenant(tenantId: string, teacherId: string): Promise<void> {
  const staff = await prisma.staff.findFirst({
    where: { id: teacherId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!staff) throw new BadRequestError('Class teacher must be staff in your tenant');
}

export async function createClass(
  auth: AuthContext,
  input: CreateClassInput,
  ctx: AuditContext,
): Promise<unknown> {
  const tenantId = requireTenant(auth);
  if (input.classTeacherId) await assertTeacherInTenant(tenantId, input.classTeacherId);

  const count = await prisma.class.count({ where: { tenantId } });
  const displayId = `CLASS-${String(count + 1).padStart(3, '0')}`;

  const klass = await prisma.class.create({
    data: {
      tenantId,
      name: input.name,
      section: input.section,
      academicYear: input.academicYear,
      classTeacherId: input.classTeacherId ?? null,
      capacity: input.capacity,
      displayId,
    },
  });
  await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'classes', recordId: klass.id, after: klass });
  return klass;
}

export async function listClasses(
  auth: AuthContext,
  query: ListClassesQuery,
): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  const tenantId = requireTenant(auth);
  const { skip, take, page, limit } = resolvePagination(query);
  const where: Prisma.ClassWhereInput = {
    tenantId,
    deletedAt: null,
    ...(query.academicYear && { academicYear: query.academicYear }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { section: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };
  const orderBy = buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, 'name');
  const [rows, total] = await Promise.all([
    prisma.class.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        classTeacher: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { enrollments: true, subjects: true } },
      },
    }),
    prisma.class.count({ where }),
  ]);
  return { items: rows, meta: buildPaginationMeta(page, limit, total) };
}

export async function getClass(auth: AuthContext, id: string): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const klass = await prisma.class.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      classTeacher: { select: { id: true, firstName: true, lastName: true } },
      subjects: { include: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!klass) throw new NotFoundError('Class');
  return klass;
}

export async function getRoster(auth: AuthContext, id: string): Promise<unknown[]> {
  const tenantId = requireTenant(auth);
  const klass = await prisma.class.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
  if (!klass) throw new NotFoundError('Class');
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: id, student: { deletedAt: null } },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, studentNumber: true, status: true, photoUrl: true } },
    },
    orderBy: { student: { lastName: 'asc' } },
  });
  return enrollments.map((e) => e.student);
}

export async function updateClass(
  auth: AuthContext,
  id: string,
  input: UpdateClassInput,
  ctx: AuditContext,
): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const before = await prisma.class.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!before) throw new NotFoundError('Class');
  if (input.classTeacherId) await assertTeacherInTenant(tenantId, input.classTeacherId);

  const data: Prisma.ClassUpdateInput = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.section !== undefined && { section: input.section }),
    ...(input.academicYear !== undefined && { academicYear: input.academicYear }),
    ...(input.capacity !== undefined && { capacity: input.capacity }),
    ...(input.classTeacherId !== undefined && {
      classTeacher: input.classTeacherId
        ? { connect: { id: input.classTeacherId } }
        : { disconnect: true },
    }),
  };
  const updated = await prisma.class.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: AuditAction.UPDATE, tableName: 'classes', recordId: id, before, after: updated });
  return updated;
}

export async function softDeleteClass(auth: AuthContext, id: string, ctx: AuditContext): Promise<void> {
  const tenantId = requireTenant(auth);
  const before = await prisma.class.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!before) throw new NotFoundError('Class');
  const after = await prisma.class.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ ...ctx, action: AuditAction.DELETE, tableName: 'classes', recordId: id, before, after });
}

export async function enrollStudent(
  auth: AuthContext,
  classId: string,
  input: EnrollStudentInput,
  ctx: AuditContext,
): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const klass = await prisma.class.findFirst({ where: { id: classId, tenantId, deletedAt: null } });
  if (!klass) throw new NotFoundError('Class');
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new BadRequestError('Student not found in your tenant');

  const count = await prisma.enrollment.count({ where: { classId } });
  if (count >= klass.capacity) throw new BadRequestError('Class is at full capacity');

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId,
      classId,
      studentId: input.studentId,
      academicYear: input.academicYear ?? klass.academicYear,
    },
  });
  await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'enrollments', recordId: enrollment.id, after: enrollment });
  return enrollment;
}

export async function inviteStudentToClass(
  auth: AuthContext,
  classId: string,
  input: InviteStudentToClassInput,
  ctx: AuditContext,
): Promise<{ token: string }> {
  const tenantId = requireTenant(auth);
  const klass = await prisma.class.findFirst({ where: { id: classId, tenantId, deletedAt: null } });
  if (!klass) throw new NotFoundError('Class');

  if (auth.role === 'TEACHER') {
    const staff = await prisma.staff.findFirst({
      where: { userId: auth.userId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!staff || klass.classTeacherId !== staff.id) {
      throw new ForbiddenError('You can only invite students to your own class');
    }
  }

  const rawToken = generateRandomToken();
  const tokenHash = sha256(rawToken);

  const invitation = await prisma.invitationToken.create({
    data: {
      tenantId,
      tokenHash,
      role: 'STUDENT',
      email: input.email,
      name: `${input.firstName} ${input.lastName}`,
      roleData: JSON.stringify({ firstName: input.firstName, lastName: input.lastName, classId }),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'invitation_tokens', recordId: invitation.id, after: invitation });
  return { token: rawToken };
}
