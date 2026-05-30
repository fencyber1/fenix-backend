import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { agentFor } from '../helpers/request';

let app: Application;

beforeAll(() => {
  app = createApp();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('health endpoints', () => {
  it('GET /health/live returns alive without touching dependencies', async () => {
    const res = await agentFor(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('alive');
    expect(typeof res.body.data.uptime).toBe('number');
  });

  it('GET /health/ready reports database and redis checks', async () => {
    const res = await agentFor(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.data.checks).toHaveProperty('database');
    expect(res.body.data.checks).toHaveProperty('redis');
    // DB must be reachable in the test environment.
    expect(res.body.data.checks.database.ok).toBe(true);
  });

  it('GET /health includes provider checks and console drivers pass', async () => {
    const res = await agentFor(app).get('/health');
    expect(res.body.data.checks).toHaveProperty('storage');
    expect(res.body.data.checks).toHaveProperty('email');
    expect(res.body.data.checks).toHaveProperty('sms');
    // Test env uses console/local drivers which always verify ok.
    expect(res.body.data.checks.email.ok).toBe(true);
    expect(res.body.data.checks.sms.ok).toBe(true);
    expect(res.body.data.checks.storage.ok).toBe(true);
    expect(res.body.data.version).toBeDefined();
  });
});
