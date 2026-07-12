import type { Request, Response } from 'express';
import { created, ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './classes.service';
import type {
  CreateClassInput,
  EnrollStudentInput,
  ListClassesQuery,
  UpdateClassInput,
} from './classes.schemas';

function auditCtx(req: Request): AuditContext {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function create(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.createClass(auth, req.body as CreateClassInput, auditCtx(req));
  return created(res, result, 'Class created');
}

export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const { items, meta } = await service.listClasses(auth, req.query as unknown as ListClassesQuery);
  return paginated(res, items, meta, 'Classes retrieved');
}

export async function getOne(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.getClass(auth, req.params.id as string);
  return ok(res, result, 'Class retrieved');
}

export async function roster(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.getRoster(auth, req.params.id as string);
  return ok(res, result, 'Roster retrieved');
}

export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.updateClass(auth, req.params.id as string, req.body as UpdateClassInput, auditCtx(req));
  return ok(res, result, 'Class updated');
}

export async function remove(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  await service.softDeleteClass(auth, req.params.id as string, auditCtx(req));
  return ok(res, null, 'Class deleted');
}

export async function enroll(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.enrollStudent(auth, req.params.id as string, req.body as EnrollStudentInput, auditCtx(req));
  return created(res, result, 'Student enrolled');
}
