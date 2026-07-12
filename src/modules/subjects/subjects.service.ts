import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import type { AuthContext } from '@/types/express';
import type { CreateSubjectInput, ListSubjectsQuery, UpdateSubjectInput } from './subjects.schemas';

function requireTenant(auth: AuthContext): string {
  if (!auth.tenantId) throw new ForbiddenError('User is not associated with a tenant');
  return auth.tenantId;
}

async function assertClassInTenant(tenantId: string, classId: string): Promise<void> {
  const klass = await prisma.class.findFirst({ where: { id: classId, tenantId, deletedAt: null }, select: { id: true } });
  if (!klass) throw new BadRequestError('Class not found in your tenant');
}

async function assertTeacherInTenant(tenantId: string, teacherId: string): Promise<void> {
  const staff = await prisma.staff.findFirst({ where: { id: teacherId, tenantId, deletedAt: null }, select: { id: true } });
  if (!staff) throw new BadRequestError('Teacher must be staff in your tenant');
}

export async function createSubject(auth: AuthContext, input: CreateSubjectInput, ctx: AuditContext): Promise<unknown> {
  const tenantId = requireTenant(auth);
  await assertClassInTenant(tenantId, input.classId);
  if (input.teacherId) await assertTeacherInTenant(tenantId, input.teacherId);
  const subject = await prisma.subject.create({
    data: { tenantId, classId: input.classId, name: input.name, code: input.code, teacherId: input.teacherId ?? null },
  });
  await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'subjects', recordId: subject.id, after: subject });
  return subject;
}

export async function listSubjects(auth: AuthContext, query: ListSubjectsQuery): Promise<unknown[]> {
  const tenantId = requireTenant(auth);
  const where: Prisma.SubjectWhereInput = {
    class: { tenantId, deletedAt: null },
    ...(query.classId && { classId: query.classId }),
    ...(query.teacherId && { teacherId: query.teacherId }),
  };
  return prisma.subject.findMany({
    where,
    include: {
      teacher: { select: { id: true, firstName: true, lastName: true } },
      class: { select: { id: true, name: true, section: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function updateSubject(auth: AuthContext, id: string, input: UpdateSubjectInput, ctx: AuditContext): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const before = await prisma.subject.findFirst({ where: { id, class: { tenantId } } });
  if (!before) throw new NotFoundError('Subject');
  if (input.teacherId) await assertTeacherInTenant(tenantId, input.teacherId);
  const data: Prisma.SubjectUpdateInput = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.code !== undefined && { code: input.code }),
    ...(input.teacherId !== undefined && {
      teacher: input.teacherId ? { connect: { id: input.teacherId } } : { disconnect: true },
    }),
  };
  const updated = await prisma.subject.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: AuditAction.UPDATE, tableName: 'subjects', recordId: id, before, after: updated });
  return updated;
}

export async function deleteSubject(auth: AuthContext, id: string, ctx: AuditContext): Promise<void> {
  const tenantId = requireTenant(auth);
  const before = await prisma.subject.findFirst({ where: { id, class: { tenantId } } });
  if (!before) throw new NotFoundError('Subject');
  await prisma.subject.delete({ where: { id } });
  await writeAudit({ ...ctx, action: AuditAction.DELETE, tableName: 'subjects', recordId: id, before });
}
