import type { Request, Response } from 'express';
import { ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import { env } from '@/config/env';
import * as service from './invitations.service';
import type { InviteUserInput, RegisterWithTokenInput } from './invitations.schemas';

function auditCtx(req: Request) {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function invite(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.inviteUser(auth, req.body as InviteUserInput, auditCtx(req), env.APP_PUBLIC_URL);
  return ok(res, result, 'Invitation created');
}

export async function validateToken(req: Request, res: Response): Promise<Response> {
  const { token } = req.query as { token: string };
  const result = await service.validateToken(token);
  return ok(res, result, 'Token validated');
}

export async function register(req: Request, res: Response): Promise<Response> {
  const result = await service.registerWithToken(req.body as RegisterWithTokenInput, {
    userAgent: userAgent(req),
    ipAddress: clientIp(req),
  });
  return ok(res, result, 'Registration complete');
}

export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const { role, status, page, limit } = req.query as {
    role?: string;
    status?: string;
    page?: string;
    limit?: string;
  };
  const result = await service.listInvitations(auth, {
    role: role as any,
    status: status as any,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return ok(res, result, 'Invitations retrieved');
}

export async function revoke(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const id = req.params.id as string;
  await service.revokeInvitation(auth, id, auditCtx(req));
  return ok(res, null, 'Invitation revoked');
}
