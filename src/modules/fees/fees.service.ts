import { AuditAction, InvoiceStatus, NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { prisma } from '@/lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { buildPaginationMeta } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { getQueue } from '@/adapters/queue';
import { assertCanAccessStudent, studentScopeWhere } from '@/modules/shared/scope';
import { balanceDue, deriveInvoiceStatus, validatePaymentAmount } from './fee.calc';
import type { AuthContext } from '@/types/express';
import type {
  CreateFeeStructureInput,
  CreateInvoiceInput,
  FeeSummaryQuery,
  ListInvoicesQuery,
  RecordPaymentInput,
  WaiveInvoiceInput,
} from './fees.schemas';

const invoiceNo = customAlphabet('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function requireSchool(auth: AuthContext): string {
  if (!auth.schoolId) throw new ForbiddenError('User is not associated with a school');
  return auth.schoolId;
}

function isAdmin(auth: AuthContext): boolean {
  return auth.role === 'SUPER_ADMIN' || auth.role === 'ADMIN';
}

export async function createFeeStructure(
  auth: AuthContext,
  input: CreateFeeStructureInput,
  ctx: AuditContext,
): Promise<unknown> {
  const schoolId = requireSchool(auth);
  const structure = await prisma.feeStructure.create({
    data: {
      schoolId,
      name: input.name,
      amount: new Prisma.Decimal(input.amount),
      frequency: input.frequency,
      academicYear: input.academicYear,
    },
  });
  await writeAudit({
    ...ctx,
    action: AuditAction.CREATE,
    tableName: 'fee_structures',
    recordId: structure.id,
    after: structure,
  });
  return structure;
}

export async function listFeeStructures(auth: AuthContext): Promise<unknown[]> {
  const schoolId = requireSchool(auth);
  return prisma.feeStructure.findMany({
    where: { schoolId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createInvoice(
  auth: AuthContext,
  input: CreateInvoiceInput,
  ctx: AuditContext,
): Promise<unknown> {
  const schoolId = requireSchool(auth);
  await assertCanAccessStudent(auth, input.studentId);

  const structure = await prisma.feeStructure.findFirst({
    where: { id: input.feeStructureId, schoolId, deletedAt: null },
  });
  if (!structure) throw new BadRequestError('Fee structure not found in your school');

  const amount = new Prisma.Decimal(input.amount ?? structure.amount.toNumber());
  const dueDate = dateOnly(input.dueDate);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.feeInvoice.create({
      data: {
        studentId: input.studentId,
        feeStructureId: input.feeStructureId,
        dueDate,
        amount,
        amountPaid: new Prisma.Decimal(0),
        status: deriveInvoiceStatus({
          amount: amount.toNumber(),
          amountPaid: 0,
          dueDate,
          current: InvoiceStatus.PENDING,
        }),
        invoiceNumber: `INV-${invoiceNo()}`,
        notes: input.notes ?? null,
      },
    });
    await writeAudit(
      { ...ctx, action: AuditAction.CREATE, tableName: 'fee_invoices', recordId: created.id, after: created },
      tx,
    );
    return created;
  });

  return invoice;
}

export async function listInvoices(
  auth: AuthContext,
  query: ListInvoicesQuery,
): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  const studentScope = await studentScopeWhere(auth);

  if (query.studentId) await assertCanAccessStudent(auth, query.studentId);

  const where: Prisma.FeeInvoiceWhereInput = {
    AND: [
      { student: { ...studentScope, deletedAt: null } },
      query.studentId ? { studentId: query.studentId } : {},
      query.status ? { status: query.status } : {},
      query.from || query.to
        ? {
            dueDate: {
              ...(query.from && { gte: dateOnly(query.from) }),
              ...(query.to && { lte: dateOnly(query.to) }),
            },
          }
        : {},
    ],
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.feeInvoice.findMany({
      where,
      orderBy: { dueDate: 'desc' },
      skip,
      take: query.limit,
      include: {
        feeStructure: { select: { name: true, frequency: true } },
        student: { select: { firstName: true, lastName: true, studentNumber: true } },
      },
    }),
    prisma.feeInvoice.count({ where }),
  ]);

  const items = rows.map((r) => ({
    ...r,
    balance: balanceDue(r.amount.toNumber(), r.amountPaid.toNumber()),
  }));

  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getInvoice(auth: AuthContext, id: string): Promise<unknown> {
  const invoice = await prisma.feeInvoice.findUnique({
    where: { id },
    include: {
      feeStructure: true,
      payments: { orderBy: { paymentDate: 'desc' } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentNumber: true,
          school: { select: { name: true, logoUrl: true, address: true } },
        },
      },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice');
  await assertCanAccessStudent(auth, invoice.studentId);
  return { ...invoice, balance: balanceDue(invoice.amount.toNumber(), invoice.amountPaid.toNumber()) };
}

/** Record a payment. Recalculates amountPaid + status atomically; writes audit. */
export async function recordPayment(
  auth: AuthContext,
  input: RecordPaymentInput,
  ctx: AuditContext,
): Promise<unknown> {
  if (!isAdmin(auth)) throw new ForbiddenError('Only administrators can record payments');

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.feeInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new NotFoundError('Invoice');
    if (invoice.status === InvoiceStatus.WAIVED) {
      throw new BadRequestError('Cannot record a payment against a waived invoice');
    }

    const check = validatePaymentAmount({
      amount: invoice.amount.toNumber(),
      amountPaid: invoice.amountPaid.toNumber(),
      paymentAmount: input.amountPaid,
    });
    if (!check.ok) throw new BadRequestError(check.reason);

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountPaid: new Prisma.Decimal(input.amountPaid),
        paymentDate: dateOnly(input.paymentDate),
        method: input.method,
        reference: input.reference ?? null,
        recordedBy: auth.userId,
      },
    });

    const newPaid = invoice.amountPaid.add(new Prisma.Decimal(input.amountPaid));
    const newStatus = deriveInvoiceStatus({
      amount: invoice.amount.toNumber(),
      amountPaid: newPaid.toNumber(),
      dueDate: invoice.dueDate,
      current: invoice.status,
    });

    const updated = await tx.feeInvoice.update({
      where: { id: invoice.id },
      data: { amountPaid: newPaid, status: newStatus },
    });

    await writeAudit(
      {
        ...ctx,
        action: AuditAction.PAYMENT,
        tableName: 'fee_invoices',
        recordId: invoice.id,
        before: invoice,
        after: { invoice: updated, payment },
      },
      tx,
    );

    return { payment, invoice: { ...updated, balance: balanceDue(updated.amount.toNumber(), newPaid.toNumber()) } };
  });
}

/** Waive an invoice (typed-confirmation enforced at the UI; reason logged here). */
export async function waiveInvoice(
  auth: AuthContext,
  id: string,
  input: WaiveInvoiceInput,
  ctx: AuditContext,
): Promise<unknown> {
  if (!isAdmin(auth)) throw new ForbiddenError('Only administrators can waive invoices');

  return prisma.$transaction(async (tx) => {
    const before = await tx.feeInvoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Invoice');
    if (before.status === InvoiceStatus.PAID) throw new BadRequestError('Invoice is already fully paid');

    const updated = await tx.feeInvoice.update({
      where: { id },
      data: { status: InvoiceStatus.WAIVED, notes: `${before.notes ? before.notes + ' | ' : ''}WAIVED: ${input.reason}` },
    });
    await writeAudit(
      {
        ...ctx,
        action: AuditAction.WAIVE,
        tableName: 'fee_invoices',
        recordId: id,
        before,
        after: updated,
      },
      tx,
    );
    return updated;
  });
}

export interface FeeSummary {
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  totalWaived: number;
  invoiceCount: number;
  byStatus: Record<InvoiceStatus, number>;
}

export async function feeSummary(auth: AuthContext, query: FeeSummaryQuery): Promise<FeeSummary> {
  const studentScope = await studentScopeWhere(auth);
  const where: Prisma.FeeInvoiceWhereInput = {
    AND: [
      { student: { ...studentScope, deletedAt: null } },
      query.classId ? { student: { enrollments: { some: { classId: query.classId } } } } : {},
      query.academicYear ? { feeStructure: { academicYear: query.academicYear } } : {},
    ],
  };

  const invoices = await prisma.feeInvoice.findMany({
    where,
    select: { amount: true, amountPaid: true, status: true },
  });

  const summary: FeeSummary = {
    totalBilled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    totalWaived: 0,
    invoiceCount: invoices.length,
    byStatus: { PENDING: 0, PAID: 0, PARTIAL: 0, OVERDUE: 0, WAIVED: 0 },
  };

  for (const inv of invoices) {
    const amount = inv.amount.toNumber();
    const paid = inv.amountPaid.toNumber();
    summary.byStatus[inv.status] += 1;
    if (inv.status === InvoiceStatus.WAIVED) {
      summary.totalWaived += amount;
      continue;
    }
    summary.totalBilled += amount;
    summary.totalCollected += paid;
    summary.totalOutstanding += balanceDue(amount, paid);
  }

  summary.totalBilled = round2(summary.totalBilled);
  summary.totalCollected = round2(summary.totalCollected);
  summary.totalOutstanding = round2(summary.totalOutstanding);
  summary.totalWaived = round2(summary.totalWaived);
  return summary;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Mark overdue invoices and queue fee reminders. Intended to be run by a
 * scheduled job; exposed as a service for the worker / cron.
 */
export async function processOverdueAndRemind(now = new Date()): Promise<{ markedOverdue: number; remindersQueued: number }> {
  const due = await prisma.feeInvoice.findMany({
    where: {
      dueDate: { lt: now },
      status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] },
    },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          parents: { select: { phone: true, user: { select: { id: true, email: true } } } },
        },
      },
    },
  });

  const queue = getQueue();
  let remindersQueued = 0;

  for (const inv of due) {
    await prisma.feeInvoice.update({ where: { id: inv.id }, data: { status: InvoiceStatus.OVERDUE } });
    const balance = balanceDue(inv.amount.toNumber(), inv.amountPaid.toNumber());
    for (const parent of inv.student.parents) {
      await queue.enqueueNotification({
        userId: parent.user.id,
        type: NotificationType.FEE_REMINDER,
        title: 'Fee reminder',
        body: `Invoice ${inv.invoiceNumber} for ${inv.student.firstName} ${inv.student.lastName} is overdue. Outstanding balance: ${balance}.`,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.SMS],
        email: parent.user.email,
        phone: parent.phone,
      });
      remindersQueued += 1;
    }
  }

  return { markedOverdue: due.length, remindersQueued };
}
