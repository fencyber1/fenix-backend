import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '@/config/env';

/** Hash a plaintext password with bcrypt (salt rounds from env, >= 12 in prod). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

/** Constant-time compare of a plaintext password against a bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Generate a cryptographically strong random token (URL-safe). */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash used to store reset/verification/refresh tokens at rest. */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Generate a temporary password that satisfies the password policy. */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (set: string): string => set[crypto.randomInt(0, set.length)] as string;
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 8; i += 1) base.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [base[i], base[j]] = [base[j] as string, base[i] as string];
  }
  return base.join('');
}
