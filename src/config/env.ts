import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralized, validated environment configuration. Fails fast at boot.
 * In production we additionally enforce: no placeholder secrets, real CORS
 * origins (https), provider credentials for the chosen drivers, and a secure
 * public app URL.
 */

const FORBIDDEN_SECRET_FRAGMENTS = [
  'change-me',
  'please-change',
  'dev-access-secret',
  'dev-refresh-secret',
  'test-access-secret',
  'test-refresh-secret',
  'ci-access-secret',
  'ci-refresh-secret',
];

const csv = (def: string) =>
  z
    .string()
    .default(def)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

    CORS_ORIGINS: csv('http://localhost:5173'),

    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    AUTH_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    GLOBAL_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage-local'),
    STORAGE_PUBLIC_BASE_URL: z.string().default('http://localhost:4000/files'),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().optional(),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5242880),
    UPLOAD_ALLOWED_MIME: csv('image/jpeg,image/png,image/webp,application/pdf'),

    EMAIL_DRIVER: z.enum(['console', 'resend', 'sendgrid']).default('console'),
    EMAIL_FROM: z.string().default('SMS <no-reply@sms.local>'),
    RESEND_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),

    SMS_DRIVER: z.enum(['console', 'twilio', 'africastalking']).default('console'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),
    AT_USERNAME: z.string().optional(),
    AT_API_KEY: z.string().optional(),
    AT_FROM: z.string().optional(),

    QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),

    APP_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
    PASSWORD_RESET_TTL_MIN: z.coerce.number().int().positive().default(30),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
    SENTRY_DSN: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  })
  .superRefine((cfg, ctx) => {
    const need = (path: string, value: string | undefined, message: string): void => {
      if (!value || value.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      }
    };

    if (cfg.STORAGE_DRIVER === 's3') {
      need('S3_BUCKET', cfg.S3_BUCKET, 'STORAGE_DRIVER=s3 requires S3_BUCKET');
      need('S3_ACCESS_KEY_ID', cfg.S3_ACCESS_KEY_ID, 'STORAGE_DRIVER=s3 requires S3_ACCESS_KEY_ID');
      need('S3_SECRET_ACCESS_KEY', cfg.S3_SECRET_ACCESS_KEY, 'STORAGE_DRIVER=s3 requires S3_SECRET_ACCESS_KEY');
      need('S3_PUBLIC_BASE_URL', cfg.S3_PUBLIC_BASE_URL, 'STORAGE_DRIVER=s3 requires S3_PUBLIC_BASE_URL');
    }
    if (cfg.EMAIL_DRIVER === 'resend') need('RESEND_API_KEY', cfg.RESEND_API_KEY, 'EMAIL_DRIVER=resend requires RESEND_API_KEY');
    if (cfg.EMAIL_DRIVER === 'sendgrid') need('SENDGRID_API_KEY', cfg.SENDGRID_API_KEY, 'EMAIL_DRIVER=sendgrid requires SENDGRID_API_KEY');
    if (cfg.SMS_DRIVER === 'twilio') {
      need('TWILIO_ACCOUNT_SID', cfg.TWILIO_ACCOUNT_SID, 'SMS_DRIVER=twilio requires TWILIO_ACCOUNT_SID');
      need('TWILIO_AUTH_TOKEN', cfg.TWILIO_AUTH_TOKEN, 'SMS_DRIVER=twilio requires TWILIO_AUTH_TOKEN');
      need('TWILIO_FROM', cfg.TWILIO_FROM, 'SMS_DRIVER=twilio requires TWILIO_FROM');
    }
    if (cfg.SMS_DRIVER === 'africastalking') {
      need('AT_USERNAME', cfg.AT_USERNAME, 'SMS_DRIVER=africastalking requires AT_USERNAME');
      need('AT_API_KEY', cfg.AT_API_KEY, 'SMS_DRIVER=africastalking requires AT_API_KEY');
    }

    if (cfg.NODE_ENV === 'production') {
      const secrets: ReadonlyArray<readonly [string, string]> = [
        ['JWT_ACCESS_SECRET', cfg.JWT_ACCESS_SECRET],
        ['JWT_REFRESH_SECRET', cfg.JWT_REFRESH_SECRET],
      ];
      for (const [path, secret] of secrets) {
        const lowered = secret.toLowerCase();
        if (FORBIDDEN_SECRET_FRAGMENTS.some((f) => lowered.includes(f))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${path} is a known placeholder; set a strong unique secret in production` });
        }
      }
      if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_REFRESH_SECRET'], message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET' });
      }
      if (cfg.CORS_ORIGINS.length === 0 || cfg.CORS_ORIGINS.some((o) => o.includes('localhost'))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGINS'], message: 'CORS_ORIGINS must be set to real (non-localhost) origins in production' });
      }
      if (!cfg.APP_PUBLIC_URL.startsWith('https://')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['APP_PUBLIC_URL'], message: 'APP_PUBLIC_URL must use https in production' });
      }
      if (cfg.BCRYPT_SALT_ROUNDS < 12) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BCRYPT_SALT_ROUNDS'], message: 'BCRYPT_SALT_ROUNDS must be >= 12 in production' });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';
