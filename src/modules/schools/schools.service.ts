import { AuditAction } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, NotFoundError } from '@/utils/errors';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import type { AuthContext } from '@/types/express';
import type { NotificationPrefInput, UpdateSchoolInput } from './schools.schemas';

function requireSchool(auth: AuthContext): string {
  if (!auth.schoolId) throw new ForbiddenError('User is not associated with a school');
  return auth.schoolId;
}

export async function getSchool(auth: AuthContext): Promise<unknown> {
  const schoolId = requireSchool(auth);
  const school = await prisma.school.findFirst({ where: { id: schoolId, deletedAt: null } });
  if (!school) throw new NotFoundError('School');
  return school;
}

export async function updateSchool(auth: AuthContext, input: UpdateSchoolInput, ctx: AuditContext): Promise<unknown> {
  const schoolId = requireSchool(auth);
  const before = await prisma.school.findFirst({ where: { id: schoolId, deletedAt: null } });
  if (!before) throw new NotFoundError('School');
  const updated = await prisma.school.update({
    where: { id: schoolId },
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
  await writeAudit({ ...ctx, action: AuditAction.UPDATE, tableName: 'schools', recordId: schoolId, before, after: updated });
  return updated;
}

export async function getNotificationPreferences(auth: AuthContext): Promise<unknown[]> {
  return prisma.notificationPreference.findMany({ where: { userId: auth.userId }, orderBy: [{ type: 'asc' }, { channel: 'asc' }] });
}

export async function setNotificationPreferences(auth: AuthContext, input: NotificationPrefInput): Promise<unknown[]> {
  await prisma.$transaction(
    input.preferences.map((p) =>
      prisma.notificationPreference.upsert({
        where: { userId_type_channel: { userId: auth.userId, type: p.type, channel: p.channel } },
        create: { userId: auth.userId, type: p.type, channel: p.channel, enabled: p.enabled },
        update: { enabled: p.enabled },
      }),
    ),
  );
  return getNotificationPreferences(auth);
}
