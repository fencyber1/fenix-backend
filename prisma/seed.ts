/**
 * Bootstrap script — creates the FIRST tenant and a SUPER_ADMIN account so the
 * system can be administered. This is operational provisioning, NOT demo/mock
 * data: all values come from environment variables and nothing else is seeded.
 * Real students/staff/classes are created through the authenticated API.
 *
 * Required env:
 *   BOOTSTRAP_TENANT_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD
 * Optional:
 *   BOOTSTRAP_ACADEMIC_YEAR_START (YYYY-MM-DD, default = Jan 1 current year)
 *   BOOTSTRAP_TIMEZONE (default UTC)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenantName = process.env.BOOTSTRAP_TENANT_NAME ?? process.env.BOOTSTRAP_SCHOOL_NAME;
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  if (!tenantName || !adminEmail || !adminPassword) {
    throw new Error(
      'Set BOOTSTRAP_TENANT_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to bootstrap.',
    );
  }
  if (adminPassword.length < 10) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters.');
  }

  const yearStartRaw =
    process.env.BOOTSTRAP_ACADEMIC_YEAR_START ?? `${new Date().getUTCFullYear()}-01-01`;
  const timezone = process.env.BOOTSTRAP_TIMEZONE ?? 'UTC';

  const existing = await prisma.user.findFirst({ where: { email: adminEmail, deletedAt: null } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Super admin ${adminEmail} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        academicYearStart: new Date(`${yearStartRaw}T00:00:00.000Z`),
        timezone,
      },
    });
    const user = await tx.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
        isVerified: true,
        tenantId: tenant.id,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: user.id,
        action: 'CREATE',
        tableName: 'users',
        recordId: user.id,
        afterJson: { bootstrap: true, role: 'SUPER_ADMIN', email: adminEmail },
      },
    });
    return { tenant, user };
  });

  // eslint-disable-next-line no-console
  console.log(
    `Bootstrapped tenant "${result.tenant.name}" (${result.tenant.id}) and super admin ${adminEmail}.`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
