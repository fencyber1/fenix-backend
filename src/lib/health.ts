import { prisma } from '@/lib/prisma';
import { getRedis } from '@/lib/redis';
import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';
import { getStorage } from '@/adapters/storage';
import { getEmail } from '@/adapters/email';
import { getSms } from '@/adapters/sms';

export interface ComponentHealth {
  ok: boolean;
  detail?: string;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  env: string;
  checks: Record<string, ComponentHealth>;
}

const APP_VERSION = process.env.APP_VERSION ?? '1.0.0';

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} check timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function checkDatabase(): Promise<ComponentHealth> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000, 'database');
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  if (isTest) return { ok: true, detail: 'skipped in test' };
  try {
    const pong = await withTimeout(getRedis().ping(), 3000, 'redis');
    return { ok: pong === 'PONG' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Liveness: is the process up? Cheap, no dependency calls. Used by orchestrators
 * to decide whether to restart the container.
 */
export function liveness(): { status: 'alive'; uptime: number } {
  return { status: 'alive', uptime: process.uptime() };
}

/**
 * Readiness/deep health: checks every critical dependency. Used by load
 * balancers and the /health endpoint. DB/Redis failures => unhealthy (503);
 * provider (storage/email/sms) failures => degraded (still 200, but flagged).
 */
export async function deepHealth(includeProviders = true): Promise<HealthReport> {
  const checks: Record<string, ComponentHealth> = {};

  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  checks.database = db;
  checks.redis = redis;

  if (includeProviders) {
    const [storage, email, sms] = await Promise.all([
      withTimeout(getStorage().verify(), 5000, 'storage').catch((e) => ({
        ok: false,
        driver: env.STORAGE_DRIVER,
        detail: e instanceof Error ? e.message : String(e),
      })),
      withTimeout(getEmail().verify(), 5000, 'email').catch((e) => ({
        ok: false,
        driver: env.EMAIL_DRIVER,
        detail: e instanceof Error ? e.message : String(e),
      })),
      withTimeout(getSms().verify(), 5000, 'sms').catch((e) => ({
        ok: false,
        driver: env.SMS_DRIVER,
        detail: e instanceof Error ? e.message : String(e),
      })),
    ]);
    checks.storage = { ok: storage.ok, detail: storage.detail ?? storage.driver };
    checks.email = { ok: email.ok, detail: email.detail ?? email.driver };
    checks.sms = { ok: sms.ok, detail: sms.detail ?? sms.driver };
  }

  const critical = [checks.database, checks.redis];
  const criticalOk = critical.every((c) => c.ok);
  const allOk = Object.values(checks).every((c) => c.ok);

  const status: HealthReport['status'] = !criticalOk ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

  return {
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    env: env.NODE_ENV,
    checks,
  };
}

/**
 * Startup self-check. Verifies external providers at boot so misconfiguration
 * surfaces immediately in logs. Critical failures (DB/Redis) throw; provider
 * failures warn but do not block startup (the app can still serve, and the
 * console drivers always pass).
 */
export async function startupSelfCheck(): Promise<void> {
  const report = await deepHealth(true);
  for (const [name, check] of Object.entries(report.checks)) {
    if (check.ok) {
      logger.info({ component: name, detail: check.detail }, `Health: ${name} OK`);
    } else {
      logger.warn({ component: name, detail: check.detail }, `Health: ${name} FAILED`);
    }
  }
  if (report.status === 'unhealthy') {
    throw new Error('Startup self-check failed: a critical dependency (database/redis) is unavailable');
  }
}
