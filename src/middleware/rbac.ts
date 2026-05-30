import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '@/utils/errors';

/**
 * Role guard. Enforced server-side on every protected route — the frontend's
 * role checks are never trusted alone.
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

export const isAdminRole = (role: Role): boolean => role === 'SUPER_ADMIN' || role === 'ADMIN';
export const isStaffRole = (role: Role): boolean => isAdminRole(role) || role === 'TEACHER';
