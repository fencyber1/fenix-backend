import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateTempPassword, sha256 } from '@/utils/password';
import { signAccessToken, verifyAccessToken, verifyRefreshToken } from '@/utils/jwt';
import { buildOrderBy, resolvePagination } from '@/utils/pagination';
import { buildPaginationMeta } from '@/utils/http';
import { passwordSchema } from '@/modules/auth/auth.schemas';

describe('password utils', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('Str0ng!Pass99');
    expect(hash).not.toBe('Str0ng!Pass99');
    expect(await verifyPassword('Str0ng!Pass99', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
  it('generates a temp password that satisfies the policy', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(passwordSchema.safeParse(generateTempPassword()).success).toBe(true);
    }
  });
  it('sha256 is deterministic', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });
});

describe('jwt utils', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken({ sub: 'u1', role: 'ADMIN', tenantId: 's1', email: 'a@b.com' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('ADMIN');
  });
  it('rejects a tampered token', () => {
    expect(() => verifyAccessToken('not.a.token')).toThrow();
    expect(() => verifyRefreshToken('not.a.token')).toThrow();
  });
});

describe('pagination utils', () => {
  it('resolves skip/take', () => {
    expect(resolvePagination({ page: 3, limit: 20 })).toEqual({ page: 3, limit: 20, skip: 40, take: 20 });
  });
  it('builds safe orderBy from allow-list', () => {
    const allowed = ['createdAt', 'name'] as const;
    expect(buildOrderBy('name', 'asc', allowed, 'createdAt')).toEqual({ name: 'asc' });
    // disallowed field falls back to default
    expect(buildOrderBy('DROP TABLE', 'desc', allowed, 'createdAt')).toEqual({ createdAt: 'desc' });
  });
  it('builds pagination meta', () => {
    const meta = buildPaginationMeta(2, 10, 35);
    expect(meta).toMatchObject({ page: 2, limit: 10, total: 35, totalPages: 4, hasNext: true, hasPrev: true });
  });
});
