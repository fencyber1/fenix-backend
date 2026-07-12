import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const saltRounds = 12;
  const adminEmail = 'fenyiemmanuel3@gmail.com';
  const adminPassword = 'Dream3@Big';
  const tenantName = 'Fenix Academy';

  console.log('Clearing all data...');
  const tables = [
    'refresh_tokens', 'auth_tokens', 'documents', 'audit_logs',
    'notification_preferences', 'notifications', 'payments',
    'fee_invoices', 'fee_structures', 'grades', 'attendance',
    'enrollments', 'subjects', 'classes', 'staff', 'parents',
    'students', 'users', 'tenants',
  ];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  console.log('All data cleared.');

  console.log('Creating tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      academicYearStart: new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`),
      timezone: 'UTC',
    },
  });

  console.log('Creating super admin...');
  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);
  const user = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
      isVerified: true,
      tenantId: tenant.id,
    },
  });

  await prisma.staff.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      employeeNumber: 'SUPER-001',
      firstName: 'Feny',
      lastName: 'Emmanuel',
      role: 'SUPER_ADMIN',
      joinDate: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: user.id,
      action: 'CREATE',
      tableName: 'users',
      recordId: user.id,
      afterJson: { bootstrap: true, role: 'SUPER_ADMIN', email: adminEmail },
    },
  });

  console.log(`Done. Tenant: "${tenant.name}" (${tenant.id}), Admin: ${adminEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
