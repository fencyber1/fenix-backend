import { AuditAction, TokenType, type User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { hashPassword, verifyPassword } from '@/utils/password';
import { UnauthorizedError, BadRequestError } from '@/utils/errors';
import { verifyRefreshToken } from '@/utils/jwt';
import { getEmail } from '@/adapters/email';
import { writeAudit } from '@/modules/audit/audit.service';
import {
  consumeAuthToken,
  createAuthToken,
  isRefreshTokenValid,
  issueTokens,
  revokeAllUserTokens,
  revokeRefreshToken,
  type IssuedTokens,
} from './token.service';
import type { LoginInput, RegisterInput } from './auth.schemas';

interface RequestMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  role: User['role'];
  tenantId: string;
  isVerified: boolean;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    isVerified: user.isVerified,
  };
}

export interface LoginResult extends IssuedTokens {
  user: PublicUser;
}

/** Register a new school/tenant with an admin account. */
export async function register(input: RegisterInput, meta: RequestMeta): Promise<LoginResult> {
  // Check if email is already used across all tenants
  const existing = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new UnauthorizedError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the tenant (school)
    const tenant = await tx.tenant.create({
      data: {
        name: input.schoolName,
        email: input.email,
        adminEmail: input.email,
        academicYearStart: new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`),
        timezone: 'UTC',
      },
    });

    // 2. Create the admin user
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: 'ADMIN',
        tenantId: tenant.id,
        isVerified: false,
      },
    });

    // 3. Create a staff record for the admin
    await tx.staff.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        employeeNumber: `ADM-${Date.now()}`,
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'ADMIN',
        joinDate: new Date(),
      },
    });

    // 4. Write audit log
    await writeAudit({
      tenantId: tenant.id,
      actorId: user.id,
      action: AuditAction.CREATE,
      tableName: 'tenants',
      recordId: tenant.id,
      after: { name: tenant.name, adminEmail: input.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, tx);

    return { tenant, user };
  });

  // 5. Issue tokens so user is immediately logged in
  const tokens = await issueTokens(
    { sub: result.user.id, role: result.user.role, tenantId: result.user.tenantId, email: result.user.email },
    meta,
  );

  // 6. Send verification email
  const { rawToken } = await createAuthToken(result.user.id, TokenType.EMAIL_VERIFICATION);
  const link = `${env.APP_PUBLIC_URL}/verify-email?token=${rawToken}`;
  await getEmail().send({
    to: result.user.email,
    subject: 'Verify your FenDux account',
    html: `<p>Welcome to FenDux! Your school <strong>${result.tenant.name}</strong> has been created.</p><p><a href="${link}">Verify your email</a> to activate your account.</p>`,
    text: `Welcome to FenDux! Verify your email: ${link}`,
  });

  // 7. Update last login
  await prisma.user.update({
    where: { id: result.user.id },
    data: { lastLoginAt: new Date() },
  });

  return { ...tokens, user: toPublicUser(result.user) };
}

/** Authenticate a user and issue tokens. Uses a constant-ish path to limit user enumeration. */
export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });

  // Always run a hash comparison to mitigate timing-based user enumeration.
  const hashToCompare = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordOk = await verifyPassword(input.password, hashToCompare);

  if (!user || !passwordOk) {
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
    }
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) throw new UnauthorizedError('Account is disabled');
  if (!user.isVerified) throw new UnauthorizedError('Please verify your email before logging in');

  const tokens = await issueTokens(
    { sub: user.id, role: user.role, tenantId: user.tenantId, email: user.email },
    meta,
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLoginCount: 0 },
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: AuditAction.LOGIN,
    tableName: 'users',
    recordId: user.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { ...tokens, user: toPublicUser(user) };
}

/** Rotate a refresh token: validate, revoke the old, issue a fresh pair. */
export async function refresh(rawRefreshToken: string, meta: RequestMeta): Promise<IssuedTokens & { user: PublicUser }> {
  const payload = verifyRefreshToken(rawRefreshToken);
  const valid = await isRefreshTokenValid(payload.jti, rawRefreshToken);
  if (!valid) throw new UnauthorizedError('Refresh token is invalid or has been revoked');

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, isActive: true },
  });
  if (!user) throw new UnauthorizedError('User no longer active');

  // Rotation: revoke the presented token, then issue a new pair.
  await revokeRefreshToken(payload.jti);
  const tokens = await issueTokens(
    { sub: user.id, role: user.role, tenantId: user.tenantId, email: user.email },
    meta,
  );
  return { ...tokens, user: toPublicUser(user) };
}

/** Logout: revoke the presented refresh token (best-effort even if expired). */
export async function logout(rawRefreshToken: string | undefined, actorId: string | null, meta: RequestMeta): Promise<void> {
  if (rawRefreshToken) {
    try {
      const payload = verifyRefreshToken(rawRefreshToken);
      await revokeRefreshToken(payload.jti);
    } catch {
      // token already invalid/expired — nothing to revoke
    }
  }
  if (actorId) {
    const actor = await prisma.user.findFirst({ where: { id: actorId, deletedAt: null }, select: { tenantId: true } });
    await writeAudit({
      tenantId: actor?.tenantId ?? '',
      actorId,
      action: AuditAction.LOGOUT,
      tableName: 'users',
      recordId: actorId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
}

/**
 * Begin password reset. Always returns success to avoid user enumeration;
 * the email is only sent if the account exists.
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    logger.debug({ email }, 'Password reset requested for unknown email');
    return;
  }
  const { rawToken } = await createAuthToken(user.id, TokenType.PASSWORD_RESET);
  const link = `${env.APP_PUBLIC_URL}/reset-password?token=${rawToken}`;
  await getEmail().send({
    to: user.email,
    subject: 'Reset your password',
    html: `<p>We received a request to reset your password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in ${env.PASSWORD_RESET_TTL_MIN} minutes. If you did not request this, ignore this email.</p>`,
    text: `Reset your password: ${link} (expires in ${env.PASSWORD_RESET_TTL_MIN} minutes)`,
  });
}

/** Complete password reset using a single-use token, then revoke all sessions. */
export async function resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
  const userId = await consumeAuthToken(token, TokenType.PASSWORD_RESET);
  if (!userId) throw new BadRequestError('Reset link is invalid or has expired');
  const passwordHash = await hashPassword(newPassword);
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { tenantId: true } });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllUserTokens(userId);
  await writeAudit({
    tenantId: user?.tenantId ?? '',
    actorId: userId,
    action: AuditAction.UPDATE,
    tableName: 'users',
    recordId: userId,
    after: { passwordChanged: true },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

/** Verify a user's email using a single-use token. */
export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeAuthToken(token, TokenType.EMAIL_VERIFICATION);
  if (!userId) throw new BadRequestError('Verification link is invalid or has expired');
  await prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
}

/** Authenticated password change. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new UnauthorizedError();
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new BadRequestError('Current password is incorrect');
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllUserTokens(userId);
  await writeAudit({
    tenantId: user.tenantId,
    actorId: userId,
    action: AuditAction.UPDATE,
    tableName: 'users',
    recordId: userId,
    after: { passwordChanged: true },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

/** Fetch the authenticated user's public profile. */
export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new UnauthorizedError();
  return toPublicUser(user);
}
