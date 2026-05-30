import type { Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ForbiddenError } from '@/utils/errors';
import type { AuthContext } from '@/types/express';

/**
 * Row-level-security helpers. These translate the authenticated user's role into
 * Prisma `where` constraints so:
 *  - SUPER_ADMIN sees everything
 *  - ADMIN sees everything within their school
 *  - TEACHER sees only students in classes they teach / are class-teacher of
 *  - PARENT sees only their own children
 *  - STUDENT sees only their own record
 */

export async function teacherStudentIds(staffUserId: string): Promise<string[]> {
  const staff = await prisma.staff.findFirst({
    where: { userId: staffUserId, deletedAt: null },
    select: { id: true },
  });
  if (!staff) return [];
  const classes = await prisma.class.findMany({
    where: {
      deletedAt: null,
      OR: [{ classTeacherId: staff.id }, { subjects: { some: { teacherId: staff.id } } }],
    },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return [];
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: { in: classIds } },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  return enrollments.map((e) => e.studentId);
}

export async function teacherClassIds(staffUserId: string): Promise<string[]> {
  const staff = await prisma.staff.findFirst({
    where: { userId: staffUserId, deletedAt: null },
    select: { id: true },
  });
  if (!staff) return [];
  const classes = await prisma.class.findMany({
    where: {
      deletedAt: null,
      OR: [{ classTeacherId: staff.id }, { subjects: { some: { teacherId: staff.id } } }],
    },
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

export async function parentStudentIds(parentUserId: string): Promise<string[]> {
  const parents = await prisma.parent.findMany({
    where: { userId: parentUserId },
    select: { studentId: true },
  });
  return parents.map((p) => p.studentId);
}

export async function studentSelfId(studentUserId: string): Promise<string | null> {
  const student = await prisma.student.findFirst({
    where: { userId: studentUserId, deletedAt: null },
    select: { id: true },
  });
  return student?.id ?? null;
}

/**
 * Returns a `Prisma.StudentWhereInput` constraining results to those the auth
 * context may access. Throws Forbidden when the role can access nothing.
 */
export async function studentScopeWhere(auth: AuthContext): Promise<Prisma.StudentWhereInput> {
  switch (auth.role) {
    case 'SUPER_ADMIN':
      return {};
    case 'ADMIN':
      return auth.schoolId ? { schoolId: auth.schoolId } : { id: '__none__' };
    case 'TEACHER': {
      const ids = await teacherStudentIds(auth.userId);
      return { id: { in: ids.length ? ids : ['__none__'] } };
    }
    case 'PARENT': {
      const ids = await parentStudentIds(auth.userId);
      return { id: { in: ids.length ? ids : ['__none__'] } };
    }
    case 'STUDENT': {
      const id = await studentSelfId(auth.userId);
      return { id: id ?? '__none__' };
    }
    default:
      throw new ForbiddenError();
  }
}

/** Assert the auth context may access a specific student id. */
export async function assertCanAccessStudent(auth: AuthContext, studentId: string): Promise<void> {
  const where = await studentScopeWhere(auth);
  const found = await prisma.student.findFirst({
    where: { AND: [where, { id: studentId, deletedAt: null }] },
    select: { id: true },
  });
  if (!found) throw new ForbiddenError('You do not have access to this student');
}

/** True when the role is allowed to see sensitive fields (DOB, medical notes). */
export function canSeeSensitive(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}
