import type { Request, Response } from 'express';
import { ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './schools.service';
import type { NotificationPrefInput, UpdateSchoolInput } from './schools.schemas';

function auditCtx(req: Request): AuditContext {
  return { actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function get(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.getSchool(auth), 'School retrieved');
}
export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.updateSchool(auth, req.body as UpdateSchoolInput, auditCtx(req)), 'School updated');
}
export async function getPrefs(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.getNotificationPreferences(auth), 'Preferences retrieved');
}
export async function setPrefs(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.setNotificationPreferences(auth, req.body as NotificationPrefInput), 'Preferences updated');
}
