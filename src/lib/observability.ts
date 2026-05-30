import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Optional error-tracking integration (Sentry).
 *
 * Kept dependency-light: if SENTRY_DSN is set AND @sentry/node is installed, we
 * initialize it; otherwise these calls are safe no-ops. This lets the app ship
 * without forcing the dependency, while production deployments can `npm i
 * @sentry/node` and set SENTRY_DSN to enable full error tracking.
 */

interface SentryLike {
  init(opts: Record<string, unknown>): void;
  captureException(err: unknown): void;
  flush(timeout?: number): Promise<boolean>;
}

let sentry: SentryLike | null = null;

export function initErrorTracking(): void {
  if (!env.SENTRY_DSN) {
    logger.debug('Error tracking disabled (no SENTRY_DSN)');
    return;
  }
  try {
    // Dynamic, optional require so the package is not a hard dependency.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mod = require('@sentry/node') as SentryLike;
    mod.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    });
    sentry = mod;
    logger.info('Sentry error tracking initialized');
  } catch {
    logger.warn('SENTRY_DSN set but @sentry/node is not installed; run "npm i @sentry/node" to enable');
  }
}

export function captureException(err: unknown): void {
  try {
    sentry?.captureException(err);
  } catch {
    // never let telemetry break the app
  }
}

export async function flushErrorTracking(): Promise<void> {
  try {
    if (sentry) await sentry.flush(2000);
  } catch {
    // ignore
  }
}
