import IORedis, { Redis } from 'ioredis';
import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Shared Redis connection used for the refresh-token / rate-limit stores.
 *
 * BullMQ ships its own bundled ioredis, so to avoid the dual-package type
 * hazard we hand BullMQ a plain connection-options object (see redisConnectionOptions)
 * and let it construct its own client, while this module owns the app-level client.
 */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    });
    client.on('error', (err) => {
      if (!isTest) logger.error({ err }, 'Redis error');
    });
    client.on('connect', () => logger.info('Redis connected'));
  }
  return client;
}

/**
 * Connection options for BullMQ (Queue/Worker). Parsed from REDIS_URL so BullMQ
 * builds its own (bundled) ioredis client. `maxRetriesPerRequest: null` is
 * required by BullMQ blocking commands.
 */
export function redisConnectionOptions(): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
} {
  const url = new URL(env.REDIS_URL);
  const db = url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isFinite(db) ? { db } : {}),
    maxRetriesPerRequest: null,
  };
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
