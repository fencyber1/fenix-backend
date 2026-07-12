import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../helpers/db';
import { createTenant, createUser } from '../helpers/factories';
import { agentFor, authHeader, originHeader } from '../helpers/request';

let app: Application;
beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('security guarantees', () => {
  it('blocks cross-site mutation requests (CSRF) when Origin is not allow-listed', async () => {
    const res = await agentFor(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://evil.example')
      .send({ email: 'a@b.com', password: 'whatever' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('never returns password hashes in any response', async () => {
    const tenant = await createTenant();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', tenantId: tenant.id });
    const me = await agentFor(app).get('/api/v1/auth/me').set(authHeader(admin));
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects access with a tampered JWT (401)', async () => {
    const res = await agentFor(app)
      .get('/api/v1/students')
      .set({ Authorization: 'Bearer tampered.jwt.value', ...originHeader });
    expect(res.status).toBe(401);
  });

  it('enforces role guard server-side on audit logs (PARENT -> 403)', async () => {
    const tenant = await createTenant();
    const parent = await createUser({ email: 'p@s.test', password: 'Str0ng!Pass99', role: 'PARENT', tenantId: tenant.id });
    const res = await agentFor(app).get('/api/v1/audit-logs').set(authHeader(parent));
    expect(res.status).toBe(403);
  });

  it('treats invalid UUID path params as validation errors (422)', async () => {
    const tenant = await createTenant();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', tenantId: tenant.id });
    const res = await agentFor(app).get('/api/v1/students/not-a-uuid').set(authHeader(admin));
    expect(res.status).toBe(422);
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await agentFor(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });
});
