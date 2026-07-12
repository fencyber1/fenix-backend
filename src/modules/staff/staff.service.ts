import { AuditAction, Prisma, Role, TokenType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { ConflictError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { buildOrderBy, buildPaginationMeta, resolvePagination } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import { hashPassword, generateTempPassword } from '@/utils/password';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { createAuthToken } from '@/modules/auth/token.service';
import { getEmail } from '@/adapters/email';
import type { AuthContext } from '@/types/express';
import type { CreateStaffInput, ListStaffQuery, UpdateStaffInput } from './staff.schemas';

const SORTABLE = ['createdAt', 'lastName', 'firstName', 'employeeNumber', 'role'] as const;

function requireTenant(auth: AuthContext): string {
  if (!auth.tenantId) throw new ForbiddenError('User is not associated with a tenant');
  return auth.tenantId;
}

export async function createStaff(auth: AuthContext, input: CreateStaffInput, ctx: AuditContext): Promise<unknown> {
  const tenantId = requireTenant(auth);

  const existing = await prisma.user.findFirst({ where: { email: input.email, tenantId } });
  if (existing) throw new ConflictError('A user with this email already exists', [{ field: 'email', message: 'Already in use' }]);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.systemRole as Role,
        tenantId,
        isVerified: false,
      },
    });
    const staff = await tx.staff.create({
      data: {
        userId: user.id,
        tenantId,
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        department: input.department ?? null,
        phone: input.phone ?? null,
        joinDate: new Date(input.joinDate),
      },
    });
    await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'staff', recordId: staff.id, after: staff }, tx);
    return { user, staff };
  });

  // Email a verification link with the temporary password (out of band).
  const { rawToken } = await createAuthToken(result.user.id, TokenType.EMAIL_VERIFICATION);
  const link = `${env.APP_PUBLIC_URL}/verify-email?token=${rawToken}`;
  await getEmail().send({
    to: input.email,
    subject: 'Your staff account has been created',
    html: `<p>An account has been created for you.</p><p>Temporary password: <strong>${tempPassword}</strong></p><p><a href="${link}">Verify your email</a> then sign in and change your password.</p>`,
    text: `Account created. Temporary password: ${tempPassword}. Verify your email: ${link}`,
  });

  return { id: result.staff.id, userId: result.user.id, email: input.email };
}

export async function listStaff(auth: AuthContext, query: ListStaffQuery): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  const tenantId = requireTenant(auth);
  const { skip, take, page, limit } = resolvePagination(query);
  const where: Prisma.StaffWhereInput = {
    tenantId,
    deletedAt: null,
    ...(query.department && { department: query.department }),
    ...(query.search && {
      OR: [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { employeeNumber: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };
  const orderBy = buildOrderBy(query.sortBy, query.sortOrder, SORTABLE, 'lastName');
  const [rows, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { user: { select: { email: true, role: true, isVerified: true } } },
    }),
    prisma.staff.count({ where }),
  ]);
  return { items: rows, meta: buildPaginationMeta(page, limit, total) };
}

export async function getStaff(auth: AuthContext, id: string): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const staff = await prisma.staff.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      user: { select: { email: true, role: true, isVerified: true, lastLoginAt: true } },
      classesAsTeacher: { where: { deletedAt: null }, select: { id: true, name: true, section: true } },
      subjectsTaught: { select: { id: true, name: true, code: true } },
    },
  });
  if (!staff) throw new NotFoundError('Staff');
  return staff;
}

export async function updateStaff(auth: AuthContext, id: string, input: UpdateStaffInput, ctx: AuditContext): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const before = await prisma.staff.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!before) throw new NotFoundError('Staff');
  const data: Prisma.StaffUpdateInput = {
    ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
    ...(input.firstName !== undefined && { firstName: input.firstName }),
    ...(input.lastName !== undefined && { lastName: input.lastName }),
    ...(input.role !== undefined && { role: input.role }),
    ...(input.department !== undefined && { department: input.department }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.photoUrl !== undefined && { photoUrl: input.photoUrl }),
  };
  const updated = await prisma.staff.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: AuditAction.UPDATE, tableName: 'staff', recordId: id, before, after: updated });
  return updated;
}

export async function softDeleteStaff(auth: AuthContext, id: string, ctx: AuditContext): Promise<void> {
  const tenantId = requireTenant(auth);
  const before = await prisma.staff.findFirst({ where: { id, tenantId, deletedAt: null }, include: { user: true } });
  if (!before) throw new NotFoundError('Staff');
  await prisma.$transaction(async (tx) => {
    const after = await tx.staff.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
    await writeAudit({ ...ctx, action: AuditAction.DELETE, tableName: 'staff', recordId: id, before, after }, tx);
  });
}
