import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../helpers/db';
import { createTenant, createStaffUser, createStudentRow, createUser } from '../helpers/factories';
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

async function adminCtx() {
  const tenant = await createTenant();
  const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', tenantId: tenant.id });
  return { tenant, admin, headers: authHeader(admin) };
}

describe('classes module', () => {
  it('creates, lists, updates, gets roster and soft-deletes a class', async () => {
    const { tenant, headers } = await adminCtx();
    const { staff } = await createStaffUser({ email: 't@s.test', password: 'Str0ng!Pass99', tenantId: tenant.id });

    const create = await agentFor(app)
      .post('/api/v1/classes')
      .set(headers)
      .send({ name: 'Grade 6', section: 'B', academicYear: '2026', classTeacherId: staff.id, capacity: 2 });
    expect(create.status).toBe(201);
    const classId = create.body.data.id;

    const list = await agentFor(app).get('/api/v1/classes?page=1&limit=10').set(headers);
    expect(list.body.meta.total).toBe(1);

    const update = await agentFor(app).put(`/api/v1/classes/${classId}`).set(headers).send({ section: 'C' });
    expect(update.body.data.section).toBe('C');

    // enroll students up to capacity
    const s1 = await createStudentRow({ tenantId: tenant.id, studentNumber: 'R1' });
    const s2 = await createStudentRow({ tenantId: tenant.id, studentNumber: 'R2' });
    const s3 = await createStudentRow({ tenantId: tenant.id, studentNumber: 'R3' });
    expect((await agentFor(app).post(`/api/v1/classes/${classId}/enroll`).set(headers).send({ studentId: s1.id })).status).toBe(201);
    expect((await agentFor(app).post(`/api/v1/classes/${classId}/enroll`).set(headers).send({ studentId: s2.id })).status).toBe(201);
    // capacity 2 reached
    expect((await agentFor(app).post(`/api/v1/classes/${classId}/enroll`).set(headers).send({ studentId: s3.id })).status).toBe(400);

    const roster = await agentFor(app).get(`/api/v1/classes/${classId}/roster`).set(headers);
    expect(roster.body.data.length).toBe(2);

    const del = await agentFor(app).delete(`/api/v1/classes/${classId}`).set(headers);
    expect(del.status).toBe(200);
    const row = await prisma.class.findUnique({ where: { id: classId } });
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe('subjects module', () => {
  it('creates, lists, updates and deletes subjects', async () => {
    const { tenant, headers } = await adminCtx();
    const klass = await prisma.class.create({ data: { tenantId: tenant.id, name: 'G7', section: 'A', academicYear: '2026' } });
    const create = await agentFor(app).post('/api/v1/subjects').set(headers).send({ classId: klass.id, name: 'Physics', code: 'PHY' });
    expect(create.status).toBe(201);
    const subjectId = create.body.data.id;

    const list = await agentFor(app).get(`/api/v1/subjects?classId=${klass.id}`).set(headers);
    expect(list.body.data.length).toBe(1);

    const update = await agentFor(app).put(`/api/v1/subjects/${subjectId}`).set(headers).send({ name: 'Physics II' });
    expect(update.body.data.name).toBe('Physics II');

    const del = await agentFor(app).delete(`/api/v1/subjects/${subjectId}`).set(headers);
    expect(del.status).toBe(200);
  });
});

describe('staff + users invite', () => {
  it('creates a staff member (and user account)', async () => {
    const { tenant, headers } = await adminCtx();
    const res = await agentFor(app)
      .post('/api/v1/staff')
      .set(headers)
      .send({
        email: 'newteacher@s.test',
        employeeNumber: 'E-100',
        firstName: 'New',
        lastName: 'Teacher',
        role: 'Teacher',
        systemRole: 'TEACHER',
        joinDate: '2026-01-15',
      });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: 'newteacher@s.test' } } });
    expect(user).not.toBeNull();
    expect(user?.isVerified).toBe(false);

    const list = await agentFor(app).get('/api/v1/staff').set(headers);
    expect(list.body.meta.total).toBe(1);
  });

  it('rejects duplicate staff email (409)', async () => {
    const { headers } = await adminCtx();
    const payload = {
      email: 'dup@s.test',
      employeeNumber: 'E-1',
      firstName: 'A',
      lastName: 'B',
      role: 'Teacher',
      joinDate: '2026-01-15',
    };
    await agentFor(app).post('/api/v1/staff').set(headers).send(payload);
    const res = await agentFor(app).post('/api/v1/staff').set(headers).send({ ...payload, employeeNumber: 'E-2' });
    expect(res.status).toBe(409);
  });

  it('invites a parent linked to a student', async () => {
    const { tenant, headers } = await adminCtx();
    const student = await createStudentRow({ tenantId: tenant.id });
    const res = await agentFor(app)
      .post('/api/v1/users/invite')
      .set(headers)
      .send({ email: 'mum@s.test', role: 'PARENT', studentId: student.id, relationship: 'Mother', phone: '+100' });
    expect(res.status).toBe(201);
    const parent = await prisma.parent.findFirst({ where: { studentId: student.id } });
    expect(parent).not.toBeNull();
  });

  it('requires studentId when inviting a PARENT (400)', async () => {
    const { headers } = await adminCtx();
    const res = await agentFor(app).post('/api/v1/users/invite').set(headers).send({ email: 'x@s.test', role: 'PARENT' });
    expect(res.status).toBe(400);
  });
});

describe('schools + notification preferences', () => {
  it('reads and updates the school profile', async () => {
    const { headers } = await adminCtx();
    const get = await agentFor(app).get('/api/v1/schools/me').set(headers);
    expect(get.status).toBe(200);
    const upd = await agentFor(app).put('/api/v1/schools/me').set(headers).send({ phone: '+1 555 0100', timezone: 'Africa/Accra' });
    expect(upd.body.data.timezone).toBe('Africa/Accra');
  });

  it('sets and reads notification preferences', async () => {
    const { headers } = await adminCtx();
    const set = await agentFor(app)
      .put('/api/v1/schools/me/notification-preferences')
      .set(headers)
      .send({ preferences: [{ type: 'FEE_REMINDER', channel: 'EMAIL', enabled: false }] });
    expect(set.status).toBe(200);
    const get = await agentFor(app).get('/api/v1/schools/me/notification-preferences').set(headers);
    expect(get.body.data.length).toBe(1);
    expect(get.body.data[0].enabled).toBe(false);
  });
});

describe('notifications module', () => {
  it('lists notifications and marks them read', async () => {
    const { tenant, admin, headers } = await adminCtx();
    await prisma.notification.create({ data: { tenantId: tenant.id, userId: admin.id, type: 'GENERAL', title: 'Hi', body: 'Welcome' } });
    const list = await agentFor(app).get('/api/v1/notifications').set(headers);
    expect(list.body.data.length).toBe(1);
    const id = list.body.data[0].id;
    const read = await agentFor(app).patch(`/api/v1/notifications/${id}/read`).set(headers);
    expect(read.body.data.isRead).toBe(true);
    const all = await agentFor(app).patch('/api/v1/notifications/read-all').set(headers);
    expect(all.status).toBe(200);
  });
});

describe('dashboard module', () => {
  it('returns KPIs and chart data from real queries', async () => {
    const { tenant, headers } = await adminCtx();
    await createStudentRow({ tenantId: tenant.id, studentNumber: 'D1' });
    const res = await agentFor(app).get('/api/v1/dashboard').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.totalStudents).toBe(1);
    expect(Array.isArray(res.body.data.charts.attendanceTrend)).toBe(true);
    expect(res.body.data.charts.attendanceTrend.length).toBe(7);
  });
});

describe('audit-logs module', () => {
  it('lists audit logs for admins with filters', async () => {
    const { headers, tenant } = await adminCtx();
    // generate an auditable action
    await agentFor(app)
      .post('/api/v1/students')
      .set(headers)
      .send({ studentNumber: 'AUD-1', firstName: 'A', lastName: 'B', dob: '2015-01-01', gender: 'MALE', admissionDate: '2026-01-01' });
    void tenant;
    const res = await agentFor(app).get('/api/v1/audit-logs?table=students').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('documents module (presigned uploads)', () => {
  it('presigns, confirms and lists a document', async () => {
    const { tenant, headers } = await adminCtx();
    const student = await createStudentRow({ tenantId: tenant.id });

    const presign = await agentFor(app)
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({ studentId: student.id, fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1024, type: 'REPORT_CARD' });
    expect(presign.status).toBe(200);
    expect(presign.body.data.uploadUrl).toContain('/files/upload/');
    expect(presign.body.data.key).toContain(`students/${student.id}/`);

    const confirm = await agentFor(app)
      .post('/api/v1/documents/confirm')
      .set(headers)
      .send({
        studentId: student.id,
        key: presign.body.data.key,
        name: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        type: 'REPORT_CARD',
      });
    expect(confirm.status).toBe(201);

    const list = await agentFor(app).get(`/api/v1/documents?studentId=${student.id}`).set(headers);
    expect(list.body.data.length).toBe(1);
  });

  it('rejects a disallowed mime type (400)', async () => {
    const { tenant, headers } = await adminCtx();
    const student = await createStudentRow({ tenantId: tenant.id });
    const res = await agentFor(app)
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({ studentId: student.id, fileName: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 10, type: 'OTHER' });
    expect(res.status).toBe(400);
  });

  it('rejects a file over the size limit (400)', async () => {
    const { tenant, headers } = await adminCtx();
    const student = await createStudentRow({ tenantId: tenant.id });
    const res = await agentFor(app)
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({ studentId: student.id, fileName: 'big.pdf', mimeType: 'application/pdf', sizeBytes: 99_000_000, type: 'OTHER' });
    expect(res.status).toBe(400);
  });
});
