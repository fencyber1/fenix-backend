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

describe('attendance flow', () => {
  it('bulk-marks attendance for enrolled students and reports stats', async () => {
    const school = await createSchool();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
    const headers = authHeader(admin);
    const klass = await createClassRow({ schoolId: school.id });
    const s1 = await createStudentRow({ schoolId: school.id, studentNumber: 'A1' });
    const s2 = await createStudentRow({ schoolId: school.id, studentNumber: 'A2' });
    await prisma.enrollment.createMany({
      data: [
        { studentId: s1.id, classId: klass.id, academicYear: '2026' },
        { studentId: s2.id, classId: klass.id, academicYear: '2026' },
      ],
    });

    const mark = await agentFor(app)
      .post('/api/v1/attendance')
      .set(headers)
      .send({
        classId: klass.id,
        date: '2026-05-04',
        records: [
          { studentId: s1.id, status: 'PRESENT' },
          { studentId: s2.id, status: 'ABSENT' },
        ],
      });
    expect(mark.status).toBe(201);
    expect(mark.body.data.upserted).toBe(2);

    // Re-marking the same date overwrites (idempotent via unique constraint).
    const remark = await agentFor(app)
      .post('/api/v1/attendance')
      .set(headers)
      .send({ classId: klass.id, date: '2026-05-04', records: [{ studentId: s2.id, status: 'LATE' }] });
    expect(remark.status).toBe(201);
    const row = await prisma.attendance.findUnique({ where: { studentId_date: { studentId: s2.id, date: new Date('2026-05-04T00:00:00.000Z') } } });
    expect(row?.status).toBe('LATE');

    const report = await agentFor(app)
      .get(`/api/v1/attendance/report?classId=${klass.id}&month=2026-05`)
      .set(headers);
    expect(report.status).toBe(200);
    expect(report.body.data.totals.PRESENT).toBe(1);
    expect(report.body.data.totals.LATE).toBe(1);
    expect(report.body.data.perStudent.length).toBe(2);
  });

  it('rejects marking a student not enrolled in the class (400)', async () => {
    const school = await createSchool();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
    const klass = await createClassRow({ schoolId: school.id });
    const stranger = await createStudentRow({ schoolId: school.id, studentNumber: 'Z9' });
    const res = await agentFor(app)
      .post('/api/v1/attendance')
      .set(authHeader(admin))
      .send({ classId: klass.id, date: '2026-05-04', records: [{ studentId: stranger.id, status: 'PRESENT' }] });
    expect(res.status).toBe(400);
  });

  it('forbids a teacher from marking a class they do not teach (403)', async () => {
    const school = await createSchool();
    const { user: teacher } = await createStaffUser({ email: 't@s.test', password: 'Str0ng!Pass99', schoolId: school.id, role: 'TEACHER' });
    const klass = await createClassRow({ schoolId: school.id }); // no teacher assigned
    const s1 = await createStudentRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: s1.id, classId: klass.id, academicYear: '2026' } });

    const res = await agentFor(app)
      .post('/api/v1/attendance')
      .set(authHeader(teacher))
      .send({ classId: klass.id, date: '2026-05-04', records: [{ studentId: s1.id, status: 'PRESENT' }] });
    expect(res.status).toBe(403);
  });

  it('queues attendance alert notifications for absentees to parents', async () => {
    const school = await createSchool();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
    const klass = await createClassRow({ schoolId: school.id });
    const child = await createStudentRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: child.id, classId: klass.id, academicYear: '2026' } });
    const parentUser = await createUser({ email: 'parent@s.test', password: 'Str0ng!Pass99', role: 'PARENT', schoolId: school.id });
    await prisma.parent.create({ data: { userId: parentUser.id, studentId: child.id, relationship: 'Mother', phone: '+10000000', isPrimary: true } });

    await agentFor(app)
      .post('/api/v1/attendance')
      .set(authHeader(admin))
      .send({ classId: klass.id, date: '2026-05-05', records: [{ studentId: child.id, status: 'ABSENT' }] });

    // Inline queue driver (test env) processes on next tick; wait briefly.
    await new Promise((r) => setTimeout(r, 200));
    const notes = await prisma.notification.findMany({ where: { userId: parentUser.id, type: 'ATTENDANCE_ALERT' } });
    expect(notes.length).toBeGreaterThan(0);
  });
});
