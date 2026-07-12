import supertest from 'supertest';
import type { Application } from 'express';
import { signAccessToken } from '@/utils/jwt';
import type { Role } from '@prisma/client';

/**
 * Helpers around supertest. The CSRF guard allows requests that carry a Bearer
 * token (non-cookie auth) so we set the Origin header anyway to mirror browsers.
 */
const ORIGIN = 'http://localhost:5173';

export function agentFor(app: Application) {
  return supertest(app);
}

export function authHeader(user: {
  id: string;
  role: Role;
  tenantId: string | null;
  email: string;
}): { Authorization: string; Origin: string } {
  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId ?? '',
    email: user.email,
  });
  return { Authorization: `Bearer ${token}`, Origin: ORIGIN };
}

export const originHeader = { Origin: ORIGIN };
