import type { Request, Response } from 'express';
import { ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './tenants.service';
import type { NotificationPrefInput, UpdateTenantInput } from './tenants.schemas';

function auditCtx(req: Request): AuditContext {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function get(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.getTenant(auth), 'Tenant retrieved');
}
export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.updateTenant(auth, req.body as UpdateTenantInput, auditCtx(req)), 'Tenant updated');
}
export async function getPrefs(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.getNotificationPreferences(auth), 'Preferences retrieved');
}
export async function setPrefs(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.setNotificationPreferences(auth, req.body as NotificationPrefInput), 'Preferences updated');
}
