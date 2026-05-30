import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The env module validates process.env at import time and throws on invalid
 * production config. We assert that behavior by importing it in a child process
 * with a controlled environment, so a misconfigured prod deploy fails fast.
 */
function loadEnv(overrides: Record<string, string>): { code: number; stderr: string } {
  const script = "require('tsx/cjs'); require('./src/config/env');";
  try {
    execFileSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...overrides },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return { code: 0, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer };
    return { code: e.status ?? 1, stderr: e.stderr?.toString() ?? '' };
  }
}

const baseProd = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  APP_PUBLIC_URL: 'https://app.example.com',
  CORS_ORIGINS: 'https://app.example.com',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  BCRYPT_SALT_ROUNDS: '12',
  PATH: process.env.PATH ?? '',
};

describe('production env guards', () => {
  it('accepts a well-formed production configuration', () => {
    expect(loadEnv(baseProd).code).toBe(0);
  });

  it('rejects placeholder JWT secrets in production', () => {
    const r = loadEnv({ ...baseProd, JWT_ACCESS_SECRET: 'change-me-change-me-change-me-change-me' });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('JWT_ACCESS_SECRET');
  });

  it('rejects identical access and refresh secrets', () => {
    const same = 'z'.repeat(40);
    const r = loadEnv({ ...baseProd, JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('JWT_REFRESH_SECRET');
  });

  it('rejects localhost CORS origins in production', () => {
    const r = loadEnv({ ...baseProd, CORS_ORIGINS: 'http://localhost:5173' });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('CORS_ORIGINS');
  });

  it('rejects non-https APP_PUBLIC_URL in production', () => {
    const r = loadEnv({ ...baseProd, APP_PUBLIC_URL: 'http://app.example.com' });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('APP_PUBLIC_URL');
  });

  it('requires provider credentials when a non-console driver is selected', () => {
    const r = loadEnv({ ...baseProd, EMAIL_DRIVER: 'resend' });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('RESEND_API_KEY');
  });
});
