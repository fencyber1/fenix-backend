import type { Request, Response } from 'express';
import { created, ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './fees.service';
import type {
  CreateFeeStructureInput,
  CreateInvoiceInput,
  FeeSummaryQuery,
  ListInvoicesQuery,
  RecordPaymentInput,
  WaiveInvoiceInput,
} from './fees.schemas';

function auditCtx(req: Request): AuditContext {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function createStructure(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.createFeeStructure(auth, req.body as CreateFeeStructureInput, auditCtx(req));
  return created(res, result, 'Fee structure created');
}

export async function listStructures(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.listFeeStructures(auth);
  return ok(res, result, 'Fee structures retrieved');
}

export async function createInvoice(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.createInvoice(auth, req.body as CreateInvoiceInput, auditCtx(req));
  return created(res, result, 'Invoice created');
}

export async function listInvoices(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const { items, meta } = await service.listInvoices(auth, req.query as unknown as ListInvoicesQuery);
  return paginated(res, items, meta, 'Invoices retrieved');
}

export async function getInvoice(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.getInvoice(auth, req.params.id as string);
  return ok(res, result, 'Invoice retrieved');
}

export async function recordPayment(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.recordPayment(auth, req.body as RecordPaymentInput, auditCtx(req));
  return created(res, result, 'Payment recorded');
}

export async function waiveInvoice(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.waiveInvoice(
    auth,
    req.params.id as string,
    req.body as WaiveInvoiceInput,
    auditCtx(req),
  );
  return ok(res, result, 'Invoice waived');
}

export async function summary(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.feeSummary(auth, req.query as unknown as FeeSummaryQuery);
  return ok(res, result, 'Fee summary generated');
}
