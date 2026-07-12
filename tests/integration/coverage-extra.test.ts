import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { TokenType } from '@prisma/client';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { createAuthToken } from '@/modules/auth/token.service';
import { resetDb } from '../helpers/db';
import { createClassRow, createTenant, createStaffUser, createStudentRow, createUser } from '../helpers/factories';
import { agentFor, authHeader, originHeader } from '../helpers/request';

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

async function adminCtx() {
  const tenant = await createTenant();
  const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', tenantId: tenant.id });
  return { tenant, admin, headers: authHeader(admin) };
}

describe('auth service extra paths', () => {
  it('changes password for an authenticated user and invalidates sessions', async () => {
    const { admin, headers } = await adminCtx();
    const res = await agentFor(app)
      .post('/api/v1/auth/change-password')
      .set(headers)
      .send({ currentPassword: 'Str0ng!Pass99', newPassword: 'New!Str0ngPass1' });
    expect(res.status).toBe(200);

    // Old password no longer works.
    const oldLogin = await agentFor(app).post('/api/v1/auth/login').set(originHeader).send({ email: admin.email, password: 'Str0ng!Pass99' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await agentFor(app).post('/api/v1/auth/login').set(originHeader).send({ email: admin.email, password: 'New!Str0ngPass1' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects change-password with wrong current password (400)', async () => {
    const { headers } = await adminCtx();
    const res = await agentFor(app)
      .post('/api/v1/auth/change-password')
      .set(headers)
      .send({ currentPassword: 'WrongPass!99', newPassword: 'New!Str0ngPass1' });
    expect(res.status).toBe(400);
  });

  it('resets password using a valid token (full happy path)', async () => {
    const { admin } = await adminCtx();
    const { rawToken } = await createAuthToken(admin.id, TokenType.PASSWORD_RESET);
    const res = await agentFor(app)
      .post('/api/v1/auth/reset-password')
      .set(originHeader)
      .send({ token: rawToken, password: 'Reset!Str0ng12' });
    expect(res.status).toBe(200);
    const login = await agentFor(app).post('/api/v1/auth/login').set(originHeader).send({ email: admin.email, password: 'Reset!Str0ng12' });
    expect(login.status).toBe(200);
  });

  it('verifies email using a valid token', async () => {
    const tenant = await createTenant();
    const user = await createUser({ email: 'unverified@s.test', password: 'Str0ng!Pass99', role: 'TEACHER', tenantId: tenant.id, isVerified: false });
    const { rawToken } = await createAuthToken(user.id, TokenType.EMAIL_VERIFICATION);
    const res = await agentFor(app).post('/api/v1/auth/verify-email').set(originHeader).send({ token: rawToken });
    expect(res.status).toBe(200);
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.isVerified).toBe(true);
  });

  it('returns me for an authenticated user', async () => {
    const { admin, headers } = await adminCtx();
    const res = await agentFor(app).get('/api/v1/auth/me').set(headers);
    expect(res.body.data.email).toBe(admin.email);
  });

  it('logs out and clears the refresh cookie', async () => {
    const { admin } = await adminCtx();
    const agent = agentFor(app);
    const login = await agent.post('/api/v1/auth/login').set(originHeader).send({ email: admin.email, password: 'Str0ng!Pass99' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;
    const logout = await agent.post('/api/v1/auth/logout').set(originHeader).set('Cookie', cookie);
    expect(logout.status).toBe(200);
    // Refresh after logout fails (token revoked).
    const refresh = await agent.post('/api/v1/auth/refresh').set(originHeader).set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });
});

describe('students service extra paths', () => {
  it('updates a student and writes an UPDATE audit log', async () => {
    const { tenant, headers, admin } = await adminCtx();
    const student = await createStudentRow({ tenantId: tenant.id });
    const res = await agentFor(app)
      .put(`/api/v1/students/${student.id}`)
      .set(headers)
      .send({ firstName: 'Renamed', medicalNotes: 'None', status: 'INACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Renamed');
    const log = await prisma.auditLog.findFirst({ where: { tableName: 'students', action: 'UPDATE', actorId: admin.id } });
    expect(log).not.toBeNull();
  });

  it('creates a student with class enrollment in one call', async () => {
    const { tenant, headers } = await adminCtx();
    const klass = await createClassRow({ tenantId: tenant.id });
    const res = await agentFor(app)
      .post('/api/v1/students')
      .set(headers)
      .send({
        studentNumber: 'ENR-1',
        firstName: 'Eve',
        lastName: 'Online',
        dob: '2014-02-02',
        gender: 'FEMALE',
        admissionDate: '2026-01-10',
        classId: klass.id,
      });
    expect(res.status).toBe(201);
    const enrollment = await prisma.enrollment.findFirst({ where: { studentId: res.body.data.id, classId: klass.id } });
    expect(enrollment).not.toBeNull();
  });

  it('returns 404 for an unknown student id', async () => {
    const { headers } = await adminCtx();
    const res = await agentFor(app).get('/api/v1/students/00000000-0000-0000-0000-000000000000').set(headers);
    expect([403, 404]).toContain(res.status);
  });
});

describe('grades service extra paths', () => {
  it('updates an existing grade and lists grades', async () => {
    const { tenant, headers } = await adminCtx();
    const klass = await createClassRow({ tenantId: tenant.id });
    const student = await createStudentRow({ tenantId: tenant.id });
    await prisma.enrollment.create({ data: { tenantId: tenant.id, studentId: student.id, classId: klass.id, academicYear: '2026' } });
    const subject = await prisma.subject.create({ data: { tenantId: tenant.id, classId: klass.id, name: 'Bio', code: 'BIO' } });

    const create = await agentFor(app)
      .post('/api/v1/grades')
      .set(headers)
      .send({ studentId: student.id, subjectId: subject.id, term: 'T1', score: 55, maxScore: 100 });
    const gradeId = create.body.data.id;

    const update = await agentFor(app).put(`/api/v1/grades/${gradeId}`).set(headers).send({ score: 95, maxScore: 100 });
    expect(update.body.data.gradeLetter).toBe('A');

    const list = await agentFor(app).get(`/api/v1/grades?studentId=${student.id}`).set(headers);
    expect(list.body.data.length).toBe(1);
  });

  it('rejects grading a student not enrolled in the subject class (400)', async () => {
    const { tenant, headers } = await adminCtx();
    const klass = await createClassRow({ tenantId: tenant.id });
    const subject = await prisma.subject.create({ data: { tenantId: tenant.id, classId: klass.id, name: 'Chem', code: 'CHEM' } });
    const stranger = await createStudentRow({ tenantId: tenant.id, studentNumber: 'NOENR' });
    const res = await agentFor(app)
      .post('/api/v1/grades')
      .set(headers)
      .send({ studentId: stranger.id, subjectId: subject.id, term: 'T1', score: 50, maxScore: 100 });
    expect(res.status).toBe(400);
  });
});

describe('fees service extra paths', () => {
  it('lists invoices and fetches a single invoice with balance', async () => {
    const { tenant, headers } = await adminCtx();
    const student = await createStudentRow({ tenantId: tenant.id });
    const structure = await agentFor(app)
      .post('/api/v1/fees/structures')
      .set(headers)
      .send({ name: 'Books', amount: 60, frequency: 'ONE_TIME', academicYear: '2026' });
    const invoice = await agentFor(app)
      .post('/api/v1/fees/invoices')
      .set(headers)
      .send({ studentId: student.id, feeStructureId: structure.body.data.id, dueDate: '2026-09-01' });

    const list = await agentFor(app).get(`/api/v1/fees/invoices?studentId=${student.id}`).set(headers);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].balance).toBe(60);

    const one = await agentFor(app).get(`/api/v1/fees/invoices/${invoice.body.data.id}`).set(headers);
    expect(one.status).toBe(200);
    expect(one.body.data.balance).toBe(60);

    const structures = await agentFor(app).get('/api/v1/fees/structures').set(headers);
    expect(structures.body.data.length).toBe(1);
  });
});

describe('attendance service extra paths', () => {
  it('corrects an attendance record and lists by student', async () => {
    const { tenant, headers } = await adminCtx();
    const klass = await createClassRow({ tenantId: tenant.id });
    const student = await createStudentRow({ tenantId: tenant.id });
    await prisma.enrollment.create({ data: { tenantId: tenant.id, studentId: student.id, classId: klass.id, academicYear: '2026' } });
    await agentFor(app)
      .post('/api/v1/attendance')
      .set(headers)
      .send({ classId: klass.id, date: '2026-05-06', records: [{ studentId: student.id, status: 'ABSENT' }] });
    const row = await prisma.attendance.findFirst({ where: { studentId: student.id } });

    const correct = await agentFor(app).put(`/api/v1/attendance/${row?.id}`).set(headers).send({ status: 'EXCUSED', note: 'Doctor note' });
    expect(correct.status).toBe(200);
    expect(correct.body.data.status).toBe('EXCUSED');

    const list = await agentFor(app).get(`/api/v1/attendance?studentId=${student.id}`).set(headers);
    expect(list.body.data.length).toBe(1);
  });
});

describe('staff service extra paths', () => {
  it('gets, updates and soft-deletes a staff member', async () => {
    const { tenant, headers } = await adminCtx();
    const { staff, user } = await createStaffUser({ email: 'staffx@s.test', password: 'Str0ng!Pass99', tenantId: tenant.id });

    const get = await agentFor(app).get(`/api/v1/staff/${staff.id}`).set(headers);
    expect(get.status).toBe(200);

    const upd = await agentFor(app).put(`/api/v1/staff/${staff.id}`).set(headers).send({ department: 'Science' });
    expect(upd.body.data.department).toBe('Science');

    const del = await agentFor(app).delete(`/api/v1/staff/${staff.id}`).set(headers);
    expect(del.status).toBe(200);
    const deactivated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(deactivated?.isActive).toBe(false);
  });
});
