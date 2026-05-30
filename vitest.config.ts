import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 60_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/worker.ts',
        'src/types/**',
        'src/**/*.routes.ts',
        'src/adapters/email/resend.email.ts',
        'src/adapters/email/sendgrid.email.ts',
        'src/adapters/sms/twilio.sms.ts',
        'src/adapters/sms/africastalking.sms.ts',
        'src/adapters/storage/s3.storage.ts',
        'src/adapters/queue/bullmq.queue.ts',
      ],
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
  },
});
