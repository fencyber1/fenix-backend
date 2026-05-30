import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../helpers/db';
import { createSchool, createStaffUser, createStudentRow, createUser } from '../helpers/factories';
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
  const school = await createSchool();
  const user = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
  return { school, user, headers: authHeader(user) };
}

describe('students CRUD', () => {
  it('requires auth', async () => {
    const res = await agentFor(app).get('/api/v1/students');
    expect(res.status).toBe(401);
  });

  it('creates a student and writes a CREATE audit log', async () => {
    const { user, headers } = await adminCtx();
    const res = await agentFor(app)
      .post('/api/v1/students')
      .set(headers)
      .send({
        studentNumber: 'S-001',
        firstName: 'Ada',
        lastName: 'Lovelace',
        dob: '2014-12-10',
        gender: 'FEMALE',
        admissionDate: '2026-01-10',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('Ada');
    // DOB visible to admins.
    expect(res.body.data.dob).toBe('2014-12-10');

    const log = await prisma.auditLog.findFirst({ where: { tableName: 'students', action: 'CREATE', actorId: user.id } });
    expect(log).not.toBeNull();
  });

  it('lists with server-side pagination and search', async () => {
    const { school, headers } = await adminCtx();
    for (let i = 0; i < 25; i += 1) {
      await createStudentRow({ schoolId: school.id, studentNumber: `N-${i}`, firstName: `Kid${i}`, lastName: 'Smith' });
    }
    const page1 = await agentFor(app).get('/api/v1/students?page=1&limit=10').set(headers);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(10);
    expect(page1.body.meta.total).toBe(25);
    expect(page1.body.meta.totalPages).toBe(3);

    const search = await agentFor(app).get('/api/v1/students?search=Kid1').set(headers);
    expect(search.body.data.length).toBeGreaterThan(0);
  });

  it('soft-deletes (never hard delete) and excludes from list', async () => {
    const { school, headers } = await adminCtx();
    const student = await createStudentRow({ schoolId: school.id });
    const del = await agentFor(app).delete(`/api/v1/students/${student.id}`).set(headers);
    expect(del.status).toBe(200);

    const row = await prisma.student.findUnique({ where: { id: student.id } });
    expect(row).not.toBeNull(); // still in DB
    expect(row?.deletedAt).not.toBeNull(); // soft deleted

    const list = await agentFor(app).get('/api/v1/students').set(headers);
    expect(list.body.data.find((s: { id: string }) => s.id === student.id)).toBeUndefined();
  });

  it('blocks TEACHER from creating students (RBAC, 403)', async () => {
    const school = await createSchool();
    const { user } = await createStaffUser({ email: 't@s.test', password: 'Str0ng!Pass99', schoolId: school.id, role: 'TEACHER' });
    const res = await agentFor(app)
      .post('/api/v1/students')
      .set(authHeader(user))
      .send({ studentNumber: 'X1', firstName: 'A', lastName: 'B', dob: '2015-01-01', gender: 'MALE', admissionDate: '2026-01-01' });
    expect(res.status).toBe(403);
  });

  it('hides sensitive fields (DOB, medical notes) from non-admin roles', async () => {
    const school = await createSchool();
    const student = await createStudentRow({ schoolId: school.id });
    await prisma.student.update({ where: { id: student.id }, data: { medicalNotes: 'Allergic to peanuts' } });
    // Link a parent to this student.
    const parentUser = await createUser({ email: 'parent@s.test', password: 'Str0ng!Pass99', role: 'PARENT', schoolId: school.id });
    await prisma.parent.create({ data: { userId: parentUser.id, studentId: student.id, relationship: 'Mother', phone: '123', isPrimary: true } });

    const res = await agentFor(app).get(`/api/v1/students/${student.id}`).set(authHeader(parentUser));
    expect(res.status).toBe(200);
    expect(res.body.data.dob).toBeNull();
    expect(res.body.data.medicalNotes).toBeNull();
  });

  it('prevents a parent from accessing another child (row-level security, 403)', async () => {
    const school = await createSchool();
    const mine = await createStudentRow({ schoolId: school.id });
    const other = await createStudentRow({ schoolId: school.id, studentNumber: 'OTHER-1' });
    const parentUser = await createUser({ email: 'p2@s.test', password: 'Str0ng!Pass99', role: 'PARENT', schoolId: school.id });
    await prisma.parent.create({ data: { userId: parentUser.id, studentId: mine.id, relationship: 'Father', phone: '1', isPrimary: true } });

    const ok = await agentFor(app).get(`/api/v1/students/${mine.id}`).set(authHeader(parentUser));
    expect(ok.status).toBe(200);
    const forbidden = await agentFor(app).get(`/api/v1/students/${other.id}`).set(authHeader(parentUser));
    expect(forbidden.status).toBe(403);
  });

  it('imports students from CSV', async () => {
    const { school, headers } = await adminCtx();
    void school;
    const csv = [
      'studentNumber,firstName,lastName,dob,gender,admissionDate',
      'I-1,Grace,Hopper,2013-12-09,FEMALE,2026-01-10',
      'I-2,Alan,Turing,2013-06-23,MALE,2026-01-10',
      'BAD,,,,,', // invalid row
    ].join('\n');
    const res = await agentFor(app).post('/api/v1/students/import').set(headers).send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.errors.length).toBe(1);
  });
});
