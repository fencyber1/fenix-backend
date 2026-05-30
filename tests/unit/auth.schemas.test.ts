import { describe, it, expect } from 'vitest';
import { loginSchema, passwordSchema, resetPasswordSchema } from '@/modules/auth/auth.schemas';

describe('auth.schemas', () => {
  describe('passwordSchema', () => {
    it('accepts a strong password', () => {
      expect(passwordSchema.safeParse('Str0ng!Pass99').success).toBe(true);
    });
    it.each([
      ['short', 'Aa1!aa'],
      ['no upper', 'lower1!lower'],
      ['no lower', 'UPPER1!UPPER'],
      ['no digit', 'NoDigits!Here'],
      ['no symbol', 'NoSymbols123'],
    ])('rejects weak password (%s)', (_label, pw) => {
      expect(passwordSchema.safeParse(pw).success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('lowercases and trims email', () => {
      const r = loginSchema.parse({ email: '  USER@MAIL.COM ', password: 'x' });
      expect(r.email).toBe('user@mail.com');
    });
    it('rejects invalid email', () => {
      expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('requires token and strong password', () => {
      expect(
        resetPasswordSchema.safeParse({ token: 'abcdefghijkl', password: 'Str0ng!Pass99' }).success,
      ).toBe(true);
      expect(resetPasswordSchema.safeParse({ token: 'x', password: 'weak' }).success).toBe(false);
    });
  });
});
