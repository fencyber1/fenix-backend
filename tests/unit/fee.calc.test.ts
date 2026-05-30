import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from '@prisma/client';
import {
  balanceDue,
  deriveInvoiceStatus,
  fromMinor,
  sumPayments,
  toMinor,
  validatePaymentAmount,
} from '@/modules/fees/fee.calc';

describe('fee.calc', () => {
  describe('minor unit conversion', () => {
    it('round-trips without floating point drift', () => {
      expect(toMinor(19.99)).toBe(1999);
      expect(fromMinor(1999)).toBe(19.99);
      expect(toMinor(0.1) + toMinor(0.2)).toBe(30);
      expect(fromMinor(toMinor(0.1) + toMinor(0.2))).toBe(0.3);
    });
  });

  describe('balanceDue', () => {
    it('computes remaining balance', () => {
      expect(balanceDue(100, 40)).toBe(60);
    });
    it('never returns a negative balance', () => {
      expect(balanceDue(100, 150)).toBe(0);
    });
  });

  describe('deriveInvoiceStatus', () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    it('is PAID when fully paid', () => {
      expect(
        deriveInvoiceStatus({ amount: 100, amountPaid: 100, dueDate: future, current: InvoiceStatus.PENDING }),
      ).toBe(InvoiceStatus.PAID);
    });
    it('is PARTIAL when partly paid and not overdue', () => {
      expect(
        deriveInvoiceStatus({ amount: 100, amountPaid: 50, dueDate: future, current: InvoiceStatus.PENDING }),
      ).toBe(InvoiceStatus.PARTIAL);
    });
    it('is OVERDUE when partly paid and past due', () => {
      expect(
        deriveInvoiceStatus({ amount: 100, amountPaid: 50, dueDate: past, current: InvoiceStatus.PARTIAL }),
      ).toBe(InvoiceStatus.OVERDUE);
    });
    it('is PENDING when unpaid and not due', () => {
      expect(
        deriveInvoiceStatus({ amount: 100, amountPaid: 0, dueDate: future, current: InvoiceStatus.PENDING }),
      ).toBe(InvoiceStatus.PENDING);
    });
    it('is OVERDUE when unpaid and past due', () => {
      expect(
        deriveInvoiceStatus({ amount: 100, amountPaid: 0, dueDate: past, current: InvoiceStatus.PENDING }),
      ).toBe(InvoiceStatus.OVERDUE);
    });
    it('keeps WAIVED terminal', () => {
      expect(
        deriveInvoiceStatus({ amount: 100, amountPaid: 0, dueDate: past, current: InvoiceStatus.WAIVED }),
      ).toBe(InvoiceStatus.WAIVED);
    });
  });

  describe('validatePaymentAmount', () => {
    it('rejects non-positive amounts', () => {
      expect(validatePaymentAmount({ amount: 100, amountPaid: 0, paymentAmount: 0 }).ok).toBe(false);
    });
    it('rejects overpayment', () => {
      const r = validatePaymentAmount({ amount: 100, amountPaid: 80, paymentAmount: 30 });
      expect(r.ok).toBe(false);
    });
    it('accepts a valid payment', () => {
      expect(validatePaymentAmount({ amount: 100, amountPaid: 80, paymentAmount: 20 }).ok).toBe(true);
    });
  });

  describe('sumPayments', () => {
    it('sums precisely', () => {
      expect(sumPayments([10.1, 20.2, 5.05])).toBe(35.35);
    });
  });
});
