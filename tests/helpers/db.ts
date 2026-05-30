import { execSync } from 'node:child_process';
import { prisma } from '@/lib/prisma';

/** Apply migrations to the test database (idempotent). */
export function migrateTestDb(): void {
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env } });
}

/** Truncate all data between test files for isolation. */
export async function resetDb(): Promise<void> {
  const tables = [
    'audit_logs',
    'payments',
    'fee_invoices',
    'fee_structures',
    'grades',
    'attendance',
    'enrollments',
    'subjects',
    'documents',
    'notification_preferences',
    'notifications',
    'auth_tokens',
    'refresh_tokens',
    'parents',
    'students',
    'staff',
    'classes',
    'users',
    'schools',
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}
