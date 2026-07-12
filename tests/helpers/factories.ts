import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Test data factories. These create REAL rows in the test database via Prisma
 * (no mocks). They exist only to arrange test preconditions.
 */
export async function createTenant(name = 'Test School') {
  return prisma.tenant.create({
    data: { name, academicYearStart: new Date('2026-01-01T00:00:00.000Z'), timezone: 'UTC' },
  });
}

export async function createUser(opts: {
  email: string;
  password: string;
  role: Role;
  tenantId: string;
  isVerified?: boolean;
}) {
  const passwordHash = await bcrypt.hash(opts.password, 8);
  return prisma.user.create({
    data: {
      email: opts.email.toLowerCase(),
      passwordHash,
      role: opts.role,
      tenantId: opts.tenantId,
      isVerified: opts.isVerified ?? true,
    },
  });
}

export async function createStaffUser(opts: {
  email: string;
  password: string;
  tenantId: string;
  role?: Role;
  employeeNumber?: string;
}) {
  const user = await createUser({
    email: opts.email,
    password: opts.password,
    role: opts.role ?? 'TEACHER',
    tenantId: opts.tenantId,
  });
  const staff = await prisma.staff.create({
    data: {
      userId: user.id,
      tenantId: opts.tenantId,
      employeeNumber: opts.employeeNumber ?? `EMP-${Date.now()}`,
      firstName: 'Test',
      lastName: 'Teacher',
      role: 'Teacher',
      joinDate: new Date('2026-01-10T00:00:00.000Z'),
    },
  });
  return { user, staff };
}

export async function createStudentRow(opts: {
  tenantId: string;
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
}) {
  return prisma.student.create({
    data: {
      tenantId: opts.tenantId,
      studentNumber: opts.studentNumber ?? `STU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      firstName: opts.firstName ?? 'Jane',
      lastName: opts.lastName ?? 'Doe',
      dob: new Date('2014-05-20T00:00:00.000Z'),
      gender: 'FEMALE',
      admissionDate: new Date('2026-01-10T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });
}

export async function createClassRow(opts: {
  tenantId: string;
  name?: string;
  section?: string;
  classTeacherId?: string;
}) {
  return prisma.class.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name ?? 'Grade 5',
      section: opts.section ?? 'A',
      academicYear: '2026',
      classTeacherId: opts.classTeacherId ?? null,
      capacity: 40,
    },
  });
}

export async function createEnrollment(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  academicYear?: string;
}) {
  return prisma.enrollment.create({
    data: {
      tenantId: opts.tenantId,
      studentId: opts.studentId,
      classId: opts.classId,
      academicYear: opts.academicYear ?? '2026',
    },
  });
}

export async function createSubject(opts: {
  tenantId: string;
  classId: string;
  name?: string;
  code?: string;
  teacherId?: string;
}) {
  return prisma.subject.create({
    data: {
      tenantId: opts.tenantId,
      classId: opts.classId,
      name: opts.name ?? 'Mathematics',
      code: opts.code ?? 'MATH',
      teacherId: opts.teacherId ?? null,
    },
  });
}

export async function createParent(opts: {
  tenantId: string;
  userId: string;
  studentId: string;
  relationship?: string;
  phone?: string;
  isPrimary?: boolean;
}) {
  return prisma.parent.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      studentId: opts.studentId,
      relationship: opts.relationship ?? 'Mother',
      phone: opts.phone ?? '+10000000',
      isPrimary: opts.isPrimary ?? true,
    },
  });
}
