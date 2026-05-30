import { InvoiceStatus } from '@prisma/client';

/**
 * Pure fee-calculation helpers. No I/O — fully unit testable. All monetary
 * math is done in integer minor units (cents) to avoid floating point drift,
 * then converted back to a 2dp number for storage.
 */

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

/** Remaining balance on an invoice (never negative). */
export function balanceDue(amount: number, amountPaid: number): number {
  return fromMinor(Math.max(0, toMinor(amount) - toMinor(amountPaid)));
}

/**
 * Derive the correct invoice status from amounts and the due date.
 * WAIVED is a terminal state and is never overridden here.
 */
export function deriveInvoiceStatus(params: {
  amount: number;
  amountPaid: number;
  dueDate: Date;
  current: InvoiceStatus;
  now?: Date;
}): InvoiceStatus {
  if (params.current === InvoiceStatus.WAIVED) return InvoiceStatus.WAIVED;

  const amount = toMinor(params.amount);
  const paid = toMinor(params.amountPaid);
  const now = params.now ?? new Date();

  if (paid >= amount && amount > 0) return InvoiceStatus.PAID;
  if (paid > 0 && paid < amount) {
    return params.dueDate.getTime() < now.getTime() ? InvoiceStatus.OVERDUE : InvoiceStatus.PARTIAL;
  }
  // nothing paid
  return params.dueDate.getTime() < now.getTime() ? InvoiceStatus.OVERDUE : InvoiceStatus.PENDING;
}

/** Validate a payment amount against the outstanding balance. */
export function validatePaymentAmount(params: {
  amount: number;
  amountPaid: number;
  paymentAmount: number;
}): { ok: true } | { ok: false; reason: string } {
  if (params.paymentAmount <= 0) return { ok: false, reason: 'Payment amount must be positive' };
  const balance = toMinor(balanceDue(params.amount, params.amountPaid));
  if (toMinor(params.paymentAmount) > balance) {
    return { ok: false, reason: 'Payment exceeds the outstanding balance' };
  }
  return { ok: true };
}

/** Sum a list of payment amounts safely in minor units. */
export function sumPayments(amounts: number[]): number {
  return fromMinor(amounts.reduce((acc, a) => acc + toMinor(a), 0));
}
