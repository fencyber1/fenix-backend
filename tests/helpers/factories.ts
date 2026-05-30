import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Test data factories. These create REAL rows in the test database via Prisma
 * (no mocks). They exist only to arrange test preconditions.
 */
export async function createSchool(name = 'Test School') {
  return prisma.school.create({
    data: { name, academicYearStart: new Date('2026-01-01T00:00:00.000Z'), timezone: 'UTC' },
  });
}

export async function createUser(opts: {
  email: string;
  password: string;
  role: Role;
  schoolId?: string | null;
  isVerified?: boolean;
}) {
  const passwordHash = await bcrypt.hash(opts.password, 8);
  return prisma.user.create({
    data: {
      email: opts.email.toLowerCase(),
      passwordHash,
      role: opts.role,
      schoolId: opts.schoolId ?? null,
      isVerified: opts.isVerified ?? true,
    },
  });
}

export async function createStaffUser(opts: {
  email: string;
  password: string;
  schoolId: string;
  role?: Role;
  employeeNumber?: string;
}) {
  const user = await createUser({
    email: opts.email,
    password: opts.password,
    role: opts.role ?? 'TEACHER',
    schoolId: opts.schoolId,
  });
  const staff = await prisma.staff.create({
    data: {
      userId: user.id,
      schoolId: opts.schoolId,
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
  schoolId: string;
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
}) {
  return prisma.student.create({
    data: {
      schoolId: opts.schoolId,
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
  schoolId: string;
  name?: string;
  section?: string;
  classTeacherId?: string;
}) {
  return prisma.class.create({
    data: {
      schoolId: opts.schoolId,
      name: opts.name ?? 'Grade 5',
      section: opts.section ?? 'A',
      academicYear: '2026',
      classTeacherId: opts.classTeacherId ?? null,
      capacity: 40,
    },
  });
}
