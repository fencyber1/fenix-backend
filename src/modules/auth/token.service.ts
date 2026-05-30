import { nanoid } from 'nanoid';
import { TokenType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRedis } from '@/lib/redis';
import { env, isTest } from '@/config/env';
import { generateRandomToken, sha256 } from '@/utils/password';
import { signAccessToken, signRefreshToken, type AccessTokenPayload } from '@/utils/jwt';

const REFRESH_TTL_MS = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Issues an access token plus a rotated refresh token. The refresh token is
 * persisted (hashed) as the revocation source of truth; its jti is also tracked
 * in Redis for O(1) blacklist checks.
 */
export async function issueTokens(
  payload: AccessTokenPayload,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<IssuedTokens> {
  const jti = nanoid();
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: payload.sub, jti });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      jti,
      tokenHash: sha256(refreshToken),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
}

/** Marks a refresh token (by jti) revoked in the DB and the Redis blacklist. */
export async function revokeRefreshToken(jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!isTest) {
    await getRedis().set(`bl:rt:${jti}`, '1', 'PX', REFRESH_TTL_MS);
  }
}

/** Returns true if the refresh token (by jti) is blacklisted/revoked/expired. */
export async function isRefreshTokenValid(jti: string, rawToken: string): Promise<boolean> {
  if (!isTest) {
    const blacklisted = await getRedis().get(`bl:rt:${jti}`);
    if (blacklisted) return false;
  }
  const record = await prisma.refreshToken.findUnique({ where: { jti } });
  if (!record) return false;
  if (record.revokedAt) return false;
  if (record.expiresAt.getTime() < Date.now()) return false;
  return record.tokenHash === sha256(rawToken);
}

/** Revoke all refresh tokens for a user (e.g. on password reset). */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const tokens = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null },
    select: { jti: true },
  });
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!isTest) {
    const redis = getRedis();
    await Promise.all(tokens.map((t) => redis.set(`bl:rt:${t.jti}`, '1', 'PX', REFRESH_TTL_MS)));
  }
}

/** Create a single-use, hashed, time-limited auth token (verify / reset). */
export async function createAuthToken(
  userId: string,
  type: TokenType,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateRandomToken(32);
  const ttlMs =
    type === TokenType.EMAIL_VERIFICATION
      ? env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000
      : env.PASSWORD_RESET_TTL_MIN * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  // Invalidate any prior unused tokens of the same type.
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.authToken.create({
    data: { userId, type, tokenHash: sha256(rawToken), expiresAt },
  });
  return { rawToken, expiresAt };
}

/** Consume a single-use auth token, returning the userId if valid. */
export async function consumeAuthToken(
  rawToken: string,
  type: TokenType,
): Promise<string | null> {
  const record = await prisma.authToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!record || record.type !== type) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  await prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return record.userId;
}
