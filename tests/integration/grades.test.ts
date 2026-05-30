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

describe('grades flow', () => {
  it('records a grade with computed letter and produces a report card', async () => {
    const school = await createSchool();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
    const headers = authHeader(admin);
    const klass = await createClassRow({ schoolId: school.id });
    const student = await createStudentRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: klass.id, academicYear: '2026' } });
    const subject = await prisma.subject.create({ data: { classId: klass.id, name: 'Mathematics', code: 'MATH' } });

    const grade = await agentFor(app)
      .post('/api/v1/grades')
      .set(headers)
      .send({ studentId: student.id, subjectId: subject.id, term: 'Term 1', score: 85, maxScore: 100 });
    expect(grade.status).toBe(201);
    expect(grade.body.data.gradeLetter).toBe('A');

    const card = await agentFor(app)
      .get(`/api/v1/grades/report-card?studentId=${student.id}&term=Term 1`)
      .set(headers);
    expect(card.status).toBe(200);
    expect(card.body.data.summary.totalSubjects).toBe(1);
    expect(card.body.data.summary.average).toBe(85);
    expect(card.body.data.subjects[0].letter).toBe('A');
  });

  it('rejects score greater than maxScore (422)', async () => {
    const school = await createSchool();
    const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
    const klass = await createClassRow({ schoolId: school.id });
    const student = await createStudentRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: klass.id, academicYear: '2026' } });
    const subject = await prisma.subject.create({ data: { classId: klass.id, name: 'Science', code: 'SCI' } });

    const res = await agentFor(app)
      .post('/api/v1/grades')
      .set(authHeader(admin))
      .send({ studentId: student.id, subjectId: subject.id, term: 'Term 1', score: 120, maxScore: 100 });
    expect(res.status).toBe(422);
  });

  it('forbids a teacher from grading a class they do not teach', async () => {
    const school = await createSchool();
    const { user: teacher } = await createStaffUser({ email: 't@s.test', password: 'Str0ng!Pass99', schoolId: school.id, role: 'TEACHER' });
    const klass = await createClassRow({ schoolId: school.id });
    const student = await createStudentRow({ schoolId: school.id });
    await prisma.enrollment.create({ data: { studentId: student.id, classId: klass.id, academicYear: '2026' } });
    const subject = await prisma.subject.create({ data: { classId: klass.id, name: 'History', code: 'HIST' } });

    const res = await agentFor(app)
      .post('/api/v1/grades')
      .set(authHeader(teacher))
      .send({ studentId: student.id, subjectId: subject.id, term: 'Term 1', score: 50, maxScore: 100 });
    expect(res.status).toBe(403);
  });
});
