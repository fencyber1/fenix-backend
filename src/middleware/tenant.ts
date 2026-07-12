import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from '@/middleware/auth';
import { ForbiddenError } from '@/utils/errors';

/**
 * Tenant isolation middleware. Extracts tenantId from the authenticated user's
 * JWT and attaches it to the request. All downstream queries MUST use this
 * tenantId to filter data.
 *
 * Also validates that the requested resource belongs to the same tenant when
 * a tenantId param is present in the URL.
 */
export function extractTenantId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const auth = requireAuth(req);
    if (!auth.tenantId) {
      throw new ForbiddenError('User is not associated with a tenant');
    }
    // Attach tenantId to request for easy access in controllers/services
    (req as unknown as Record<string, string>).tenantId = auth.tenantId;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware that validates the tenantId in the URL param matches the
 * authenticated user's tenantId. Use on routes like /api/v1/tenants/:tenantId/...
 */
export function validateTenantParam(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const auth = requireAuth(req);
    const paramTenantId = req.params.tenantId;
    if (paramTenantId && paramTenantId !== auth.tenantId) {
      throw new ForbiddenError('You do not have access to this tenant');
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to get the tenantId from the authenticated request.
 * Throws if not present.
 */
export function getTenantId(req: Request): string {
  const auth = requireAuth(req);
  if (!auth.tenantId) throw new ForbiddenError('No tenant context');
  return auth.tenantId;
}
