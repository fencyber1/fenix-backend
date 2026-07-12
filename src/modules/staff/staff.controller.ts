import type { Request, Response } from 'express';
import { created, ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './staff.service';
import type { CreateStaffInput, ListStaffQuery, UpdateStaffInput } from './staff.schemas';

function auditCtx(req: Request): AuditContext {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function create(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.createStaff(auth, req.body as CreateStaffInput, auditCtx(req));
  return created(res, result, 'Staff created and invited');
}
export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const { items, meta } = await service.listStaff(auth, req.query as unknown as ListStaffQuery);
  return paginated(res, items, meta, 'Staff retrieved');
}
export async function getOne(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.getStaff(auth, req.params.id as string);
  return ok(res, result, 'Staff retrieved');
}
export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.updateStaff(auth, req.params.id as string, req.body as UpdateStaffInput, auditCtx(req));
  return ok(res, result, 'Staff updated');
}
export async function remove(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  await service.softDeleteStaff(auth, req.params.id as string, auditCtx(req));
  return ok(res, null, 'Staff deleted');
}
