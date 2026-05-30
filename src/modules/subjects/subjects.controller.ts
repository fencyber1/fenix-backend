import type { Request, Response } from 'express';
import { created, ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './subjects.service';
import type { CreateSubjectInput, ListSubjectsQuery, UpdateSubjectInput } from './subjects.schemas';

function auditCtx(req: Request): AuditContext {
  return { actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function create(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.createSubject(auth, req.body as CreateSubjectInput, auditCtx(req));
  return created(res, result, 'Subject created');
}
export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.listSubjects(auth, req.query as unknown as ListSubjectsQuery);
  return ok(res, result, 'Subjects retrieved');
}
export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.updateSubject(auth, req.params.id as string, req.body as UpdateSubjectInput, auditCtx(req));
  return ok(res, result, 'Subject updated');
}
export async function remove(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  await service.deleteSubject(auth, req.params.id as string, auditCtx(req));
  return ok(res, null, 'Subject deleted');
}
