import rateLimit, { type RateLimitRequestHandler, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env, isTest } from '@/config/env';
import { getRedis } from '@/lib/redis';

/**
 * Builds a Redis-backed rate limiter so limits hold across multiple instances.
 * Falls back to the in-memory store when Redis is unavailable (e.g. tests).
 */
function buildStore(prefix: string): Store | undefined {
  if (isTest) return undefined;
  try {
    const redis = getRedis();
    return new RedisStore({
      prefix,
      sendCommand: (...args: string[]): Promise<never> =>
        redis.call(args[0] as string, ...args.slice(1)) as Promise<never>,
    });
  } catch {
    return undefined;
  }
}

const rateLimitResponse = {
  success: false,
  message: 'Too many requests, please try again later',
  errors: [],
  code: 'RATE_LIMITED',
};

/** Strict limiter for auth endpoints: default 5 attempts / 15 min / IP. */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:auth:'),
  message: rateLimitResponse,
  skipSuccessfulRequests: false,
});

/** Global limiter applied to the whole API. */
export const globalRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
  max: env.GLOBAL_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('rl:global:'),
  message: rateLimitResponse,
});
