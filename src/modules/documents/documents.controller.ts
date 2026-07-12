import type { Request, Response } from 'express';
import { created, ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './documents.service';
import type { ConfirmDocumentInput, ListDocumentsQuery, PresignInput } from './documents.schemas';

function auditCtx(req: Request): AuditContext {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function presign(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.presignUpload(auth, req.body as PresignInput), 'Presigned upload URL generated');
}
export async function confirm(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return created(res, await service.confirmUpload(auth, req.body as ConfirmDocumentInput, auditCtx(req)), 'Document saved');
}
export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.listDocuments(auth, req.query as unknown as ListDocumentsQuery), 'Documents retrieved');
}
export async function remove(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  await service.deleteDocument(auth, req.params.id as string, auditCtx(req));
  return ok(res, null, 'Document deleted');
}
