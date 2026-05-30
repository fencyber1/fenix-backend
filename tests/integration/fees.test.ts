import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Application } from 'express';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../helpers/db';
import { createSchool, createStudentRow, createUser } from '../helpers/factories';
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

async function setup() {
  const school = await createSchool();
  const admin = await createUser({ email: 'admin@s.test', password: 'Str0ng!Pass99', role: 'ADMIN', schoolId: school.id });
  const student = await createStudentRow({ schoolId: school.id });
  return { school, admin, student, headers: authHeader(admin) };
}

describe('fees flow', () => {
  it('creates a structure, invoice, records a payment and updates status', async () => {
    const { headers, student } = await setup();

    const structure = await agentFor(app)
      .post('/api/v1/fees/structures')
      .set(headers)
      .send({ name: 'Term 1 Tuition', amount: 500, frequency: 'TERMLY', academicYear: '2026' });
    expect(structure.status).toBe(201);

    const invoice = await agentFor(app)
      .post('/api/v1/fees/invoices')
      .set(headers)
      .send({ studentId: student.id, feeStructureId: structure.body.data.id, dueDate: '2026-09-01' });
    expect(invoice.status).toBe(201);
    expect(invoice.body.data.status).toBe('PENDING');

    const pay1 = await agentFor(app)
      .post('/api/v1/fees/payments')
      .set(headers)
      .send({ invoiceId: invoice.body.data.id, amountPaid: 200, paymentDate: '2026-08-01', method: 'CASH' });
    expect(pay1.status).toBe(201);
    expect(pay1.body.data.invoice.status).toBe('PARTIAL');
    expect(pay1.body.data.invoice.balance).toBe(300);

    const pay2 = await agentFor(app)
      .post('/api/v1/fees/payments')
      .set(headers)
      .send({ invoiceId: invoice.body.data.id, amountPaid: 300, paymentDate: '2026-08-15', method: 'BANK_TRANSFER' });
    expect(pay2.body.data.invoice.status).toBe('PAID');
    expect(pay2.body.data.invoice.balance).toBe(0);
  });

  it('rejects overpayment', async () => {
    const { headers, student } = await setup();
    const structure = await agentFor(app)
      .post('/api/v1/fees/structures')
      .set(headers)
      .send({ name: 'Lab Fee', amount: 100, frequency: 'ONE_TIME', academicYear: '2026' });
    const invoice = await agentFor(app)
      .post('/api/v1/fees/invoices')
      .set(headers)
      .send({ studentId: student.id, feeStructureId: structure.body.data.id, dueDate: '2026-09-01' });
    const res = await agentFor(app)
      .post('/api/v1/fees/payments')
      .set(headers)
      .send({ invoiceId: invoice.body.data.id, amountPaid: 150, paymentDate: '2026-08-01', method: 'CASH' });
    expect(res.status).toBe(400);
  });

  it('waives an invoice and writes a WAIVE audit log', async () => {
    const { headers, student, admin } = await setup();
    const structure = await agentFor(app)
      .post('/api/v1/fees/structures')
      .set(headers)
      .send({ name: 'Sports Fee', amount: 80, frequency: 'ONE_TIME', academicYear: '2026' });
    const invoice = await agentFor(app)
      .post('/api/v1/fees/invoices')
      .set(headers)
      .send({ studentId: student.id, feeStructureId: structure.body.data.id, dueDate: '2026-09-01' });

    const waive = await agentFor(app)
      .post(`/api/v1/fees/invoices/${invoice.body.data.id}/waive`)
      .set(headers)
      .send({ reason: 'Scholarship awarded' });
    expect(waive.status).toBe(200);
    expect(waive.body.data.status).toBe('WAIVED');

    const log = await prisma.auditLog.findFirst({ where: { action: 'WAIVE', actorId: admin.id } });
    expect(log).not.toBeNull();

    // No payments allowed against a waived invoice.
    const pay = await agentFor(app)
      .post('/api/v1/fees/payments')
      .set(headers)
      .send({ invoiceId: invoice.body.data.id, amountPaid: 10, paymentDate: '2026-08-01', method: 'CASH' });
    expect(pay.status).toBe(400);
  });

  it('returns a fee summary with totals', async () => {
    const { headers, student } = await setup();
    const structure = await agentFor(app)
      .post('/api/v1/fees/structures')
      .set(headers)
      .send({ name: 'Tuition', amount: 1000, frequency: 'ANNUAL', academicYear: '2026' });
    const invoice = await agentFor(app)
      .post('/api/v1/fees/invoices')
      .set(headers)
      .send({ studentId: student.id, feeStructureId: structure.body.data.id, dueDate: '2026-09-01' });
    await agentFor(app)
      .post('/api/v1/fees/payments')
      .set(headers)
      .send({ invoiceId: invoice.body.data.id, amountPaid: 400, paymentDate: '2026-08-01', method: 'CASH' });

    const summary = await agentFor(app).get('/api/v1/fees/summary?academicYear=2026').set(headers);
    expect(summary.status).toBe(200);
    expect(summary.body.data.totalBilled).toBe(1000);
    expect(summary.body.data.totalCollected).toBe(400);
    expect(summary.body.data.totalOutstanding).toBe(600);
  });
});
