import { AuditAction, Role, TokenType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { BadRequestError, ConflictError, ForbiddenError } from '@/utils/errors';
import { generateTempPassword, hashPassword } from '@/utils/password';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { createAuthToken } from '@/modules/auth/token.service';
import { getEmail } from '@/adapters/email';
import type { AuthContext } from '@/types/express';
import type { InviteUserInput } from './users.schemas';

function requireSchool(auth: AuthContext): string {
  if (!auth.schoolId) throw new ForbiddenError('User is not associated with a school');
  return auth.schoolId;
}

/**
 * Invite a user: creates the account with a temporary password and emails an
 * email-verification link. PARENT/STUDENT roles are linked to a student record.
 */
export async function inviteUser(auth: AuthContext, input: InviteUserInput, ctx: AuditContext): Promise<{ userId: string; email: string }> {
  const schoolId = requireSchool(auth);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('A user with this email already exists', [{ field: 'email', message: 'Already in use' }]);

  if ((input.role === 'PARENT' || input.role === 'STUDENT') && !input.studentId) {
    throw new BadRequestError('studentId is required for PARENT and STUDENT roles');
  }
  if (input.studentId) {
    const student = await prisma.student.findFirst({ where: { id: input.studentId, schoolId, deletedAt: null }, select: { id: true, userId: true } });
    if (!student) throw new BadRequestError('Student not found in your school');
    if (input.role === 'STUDENT' && student.userId) throw new ConflictError('Student already has a linked account');
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, passwordHash, role: input.role as Role, schoolId, isVerified: false },
    });

    if (input.role === 'PARENT' && input.studentId) {
      await tx.parent.create({
        data: {
          userId: user.id,
          studentId: input.studentId,
          relationship: input.relationship ?? 'Guardian',
          phone: input.phone ?? '',
          isPrimary: false,
        },
      });
    }
    if (input.role === 'STUDENT' && input.studentId) {
      await tx.student.update({ where: { id: input.studentId }, data: { userId: user.id } });
    }

    await writeAudit({ ...ctx, action: AuditAction.CREATE, tableName: 'users', recordId: user.id, after: { email: user.email, role: user.role } }, tx);
    return user;
  });

  const { rawToken } = await createAuthToken(created.id, TokenType.EMAIL_VERIFICATION);
  const link = `${env.APP_PUBLIC_URL}/verify-email?token=${rawToken}`;
  await getEmail().send({
    to: input.email,
    subject: "You've been invited to the school portal",
    html: `<p>You have been invited as <strong>${input.role}</strong>.</p><p>Temporary password: <strong>${tempPassword}</strong></p><p><a href="${link}">Verify your email</a> then sign in and change your password.</p>`,
    text: `Invited as ${input.role}. Temporary password: ${tempPassword}. Verify: ${link}`,
  });

  return { userId: created.id, email: input.email };
}
