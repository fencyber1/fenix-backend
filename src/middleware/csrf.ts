import type { NextFunction, Request, Response } from 'express';
import { env } from '@/config/env';
import { ForbiddenError } from '@/utils/errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection for mutation endpoints.
 *
 * The API authenticates with a Bearer access token (not auto-attached by the
 * browser), but the refresh token lives in an HTTP-only, SameSite=Strict cookie.
 * To defend cookie-bearing mutation requests we additionally verify the request
 * Origin/Referer against the configured allow-list. Non-browser clients that
 * send no Origin/Referer (e.g. server-to-server, tests) and carry a Bearer
 * token are permitted, since those are not subject to CSRF.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const hasBearer = (req.headers.authorization ?? '').startsWith('Bearer ');

  // No Origin and no Referer: only allowed for token-authenticated (non-cookie) calls.
  if (!origin && !referer) {
    if (hasBearer || env.NODE_ENV === 'test') {
      next();
      return;
    }
    next(new ForbiddenError('Missing Origin header on state-changing request'));
    return;
  }

  const candidate = origin ?? referer ?? '';
  const allowed = env.CORS_ORIGINS.some((o) => candidate === o || candidate.startsWith(`${o}/`));
  if (!allowed) {
    next(new ForbiddenError('Cross-site request blocked'));
    return;
  }
  next();
}
