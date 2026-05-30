import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './fees.controller';
import {
  createFeeStructureSchema,
  createInvoiceSchema,
  feeSummaryQuerySchema,
  invoiceIdParamSchema,
  listInvoicesQuerySchema,
  recordPaymentSchema,
  waiveInvoiceSchema,
} from './fees.schemas';

const router = Router();
router.use(authenticate);

// Fee structures
router.get('/structures', authorize('SUPER_ADMIN', 'ADMIN'), asyncHandler(controller.listStructures));
router.post(
  '/structures',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createFeeStructureSchema),
  asyncHandler(controller.createStructure),
);

// Invoices
router.get('/invoices', validate(listInvoicesQuerySchema, 'query'), asyncHandler(controller.listInvoices));
router.post(
  '/invoices',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createInvoiceSchema),
  asyncHandler(controller.createInvoice),
);
router.get(
  '/invoices/:id',
  validate(invoiceIdParamSchema, 'params'),
  asyncHandler(controller.getInvoice),
);
router.post(
  '/invoices/:id/waive',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(invoiceIdParamSchema, 'params'),
  validate(waiveInvoiceSchema),
  asyncHandler(controller.waiveInvoice),
);

// Payments
router.post(
  '/payments',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(recordPaymentSchema),
  asyncHandler(controller.recordPayment),
);

// Summary
router.get(
  '/summary',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(feeSummaryQuerySchema, 'query'),
  asyncHandler(controller.summary),
);

export default router;
