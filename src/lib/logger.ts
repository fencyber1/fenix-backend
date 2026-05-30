import pino from 'pino';
import { env, isProd } from '@/config/env';

/**
 * Structured logger. In dev we pretty print; in prod we emit JSON.
 * Redacts known sensitive fields so passwords/tokens are never logged.
 * Level is configurable via LOG_LEVEL (defaults: test=silent, prod=info, dev=debug).
 */
const level = env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug');

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'password_hash',
      'token',
      'refreshToken',
      'accessToken',
      'apiKey',
      'secret',
      '*.password',
      '*.passwordHash',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
});
