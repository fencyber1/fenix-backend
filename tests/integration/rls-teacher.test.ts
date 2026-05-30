import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../helpers/db';
import { createClassRow, createSchool, createStaffUser, createStudentRow, createUser } from '../helpers/factories';
import { agentFor, authHeader } from '../helpers/request';

let app: Application;
beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('teacher row-level security', () => {
  it('a teacher only sees students in classes they teach', async () => {
    const school = await createSchool();
    const { user: teacher, staff } = await createStaffUser({ email: 't@s.test', password: 'Str0ng!Pass99', schoolId: school.id, role: 'TEACHER' });

    // Class the teacher is class-teacher of, with an enrolled student.
    const myClass = await createClassRow({ schoolId: school.id, classTeacherId: staff.id });
    const myStudent = await createStudentRow({ schoolId: school.id, studentNumber: 'MINE' });
    await prisma.enrollment.create({ data: { studentId: myStudent.id, classId: myClass.id, academicYear: '2026' } });

    // Another class the teacher does NOT teach.
    const otherClass = await createClassRow({ schoolId: school.id, name: 'Other', section: 'Z' });
    const otherStudent = await createStudentRow({ schoolId: school.id, studentNumber: 'OTHER' });
    await prisma.enrollment.create({ data: { studentId: otherStudent.id, classId: otherClass.id, academicYear: '2026' } });

    const list = await agentFor(app).get('/api/v1/students').set(authHeader(teacher));
    expect(list.status).toBe(200);
    const ids = (list.body.data as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(myStudent.id);
    expect(ids).not.toContain(otherStudent.id);

    // Direct access to the out-of-scope student is forbidden.
    const forbidden = await agentFor(app).get(`/api/v1/students/${otherStudent.id}`).set(authHeader(teacher));
    expect(forbidden.status).toBe(403);

    // In-scope student is accessible (but sensitive fields are masked for teachers).
    const ok = await agentFor(app).get(`/api/v1/students/${myStudent.id}`).set(authHeader(teacher));
    expect(ok.status).toBe(200);
    expect(ok.body.data.dob).toBeNull();
  });

  it('a teacher assigned via a subject can mark attendance for that class', async () => {
    const school = await createSchool();
    const { user: teacher, staff } = await createStaffUser({ email: 't2@s.test', password: 'Str0ng!Pass99', schoolId: school.id, role: 'TEACHER' });
    const klass = await createClassRow({ schoolId: school.id });
    await prisma.subject.create({ data: { classId: klass.id, name: 'Art', code: 'ART', teacherId: staff.id } });
    const student = await createStudentRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: klass.id, academicYear: '2026' } });

    const mark = await agentFor(app)
      .post('/api/v1/attendance')
      .set(authHeader(teacher))
      .send({ classId: klass.id, date: '2026-05-07', records: [{ studentId: student.id, status: 'PRESENT' }] });
    expect(mark.status).toBe(201);
  });

  it('a student can read only their own attendance', async () => {
    const school = await createSchool();
    const studentRow = await createStudentRow({ schoolId: school.id });
    const studentUser = await createUser({ email: 'kid@s.test', password: 'Str0ng!Pass99', role: 'STUDENT', schoolId: school.id });
    await prisma.student.update({ where: { id: studentRow.id }, data: { userId: studentUser.id } });
    const klass = await createClassRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: studentRow.id, classId: klass.id, academicYear: '2026' } });
    await prisma.attendance.create({ data: { studentId: studentRow.id, classId: klass.id, date: new Date('2026-05-08T00:00:00.000Z'), status: 'PRESENT', recordedBy: studentUser.id } });

    const own = await agentFor(app).get(`/api/v1/attendance?studentId=${studentRow.id}`).set(authHeader(studentUser));
    expect(own.status).toBe(200);

    const other = await createStudentRow({ schoolId: school.id, studentNumber: 'NOPE' });
    const forbidden = await agentFor(app).get(`/api/v1/attendance?studentId=${other.id}`).set(authHeader(studentUser));
    expect(forbidden.status).toBe(403);
  });
});
