import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const invoiceStatusEnum = z.enum(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE', 'WAIVED']);
export const paymentMethodEnum = z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE']);
export const feeFrequencyEnum = z.enum(['ONE_TIME', 'MONTHLY', 'TERMLY', 'ANNUAL']);

export const createFeeStructureSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().gt(0).max(100_000_000),
  frequency: feeFrequencyEnum,
  academicYear: z.string().trim().min(1).max(20),
});

export const createInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  feeStructureId: z.string().uuid(),
  dueDate: dateString,
  amount: z.number().gt(0).max(100_000_000).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const listInvoicesQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  status: invoiceStatusEnum.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountPaid: z.number().gt(0).max(100_000_000),
  paymentDate: dateString,
  method: paymentMethodEnum,
  reference: z.string().trim().max(120).optional(),
});

export const waiveInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const feeSummaryQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  academicYear: z.string().trim().max(20).optional(),
});

export const invoiceIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type WaiveInvoiceInput = z.infer<typeof waiveInvoiceSchema>;
export type FeeSummaryQuery = z.infer<typeof feeSummaryQuerySchema>;
