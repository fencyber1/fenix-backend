import { AuditAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, NotFoundError } from '@/utils/errors';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import type { AuthContext } from '@/types/express';
import type { NotificationPrefInput, UpdateTenantInput } from './tenants.schemas';

function requireTenant(auth: AuthContext): string {
  if (!auth.tenantId) throw new ForbiddenError('User is not associated with a tenant');
  return auth.tenantId;
}

export async function listAllTenants(): Promise<unknown[]> {
  return prisma.tenant.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { students: true, staff: true, classes: true, users: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteTenant(tenantId: string, ctx: AuditContext): Promise<void> {
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!tenant) throw new NotFoundError('Tenant');

  const before = { ...tenant };

  await prisma.$transaction(async (tx) => {
    // Soft-delete all users in the tenant
    await tx.user.updateMany({ where: { tenantId }, data: { deletedAt: new Date() } });
    // Soft-delete the tenant itself
    await tx.tenant.update({ where: { id: tenantId }, data: { deletedAt: new Date() } });
  });

  await writeAudit({ ...ctx, action: AuditAction.DELETE, tableName: 'tenants', recordId: tenantId, before, after: null });
}

export async function getTenant(auth: AuthContext): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}

export async function updateTenant(auth: AuthContext, input: UpdateTenantInput, ctx: AuditContext): Promise<unknown> {
  const tenantId = requireTenant(auth);
  const before = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!before) throw new NotFoundError('Tenant');
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.academicYearStart !== undefined && { academicYearStart: new Date(input.academicYearStart) }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
    },
  });
  await writeAudit({ ...ctx, action: AuditAction.UPDATE, tableName: 'tenants', recordId: tenantId, before, after: updated });
  return updated;
}

export async function getNotificationPreferences(auth: AuthContext): Promise<unknown[]> {
  return prisma.notificationPreference.findMany({ where: { userId: auth.userId }, orderBy: [{ type: 'asc' }, { channel: 'asc' }] });
}

export async function setNotificationPreferences(auth: AuthContext, input: NotificationPrefInput): Promise<unknown[]> {
  const tenantId = requireTenant(auth);
  await prisma.$transaction(
    input.preferences.map((p) =>
      prisma.notificationPreference.upsert({
        where: { tenantId_userId_type_channel: { tenantId, userId: auth.userId, type: p.type, channel: p.channel } },
        create: { tenantId, userId: auth.userId, type: p.type, channel: p.channel, enabled: p.enabled },
        update: { enabled: p.enabled },
      }),
    ),
  );
  return getNotificationPreferences(auth);
}
