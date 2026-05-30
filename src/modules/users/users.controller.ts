import type { Request, Response } from 'express';
import { created } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './users.service';
import type { InviteUserInput } from './users.schemas';

function auditCtx(req: Request): AuditContext {
  return { actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function invite(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.inviteUser(auth, req.body as InviteUserInput, auditCtx(req));
  return created(res, result, 'Invitation sent');
}
