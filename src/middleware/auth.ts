import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '@/utils/jwt';
import { UnauthorizedError } from '@/utils/errors';
import { prisma } from '@/lib/prisma';

/**
 * Authentication middleware. Requires a valid Bearer access token, verifies the
 * signature, and confirms the user still exists, is active, and is not soft
 * deleted. Attaches the auth context to the request.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing Bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: { id: true, role: true, schoolId: true, email: true, isVerified: true },
    });
    if (!user) throw new UnauthorizedError('User no longer active');

    req.auth = {
      userId: user.id,
      role: user.role,
      schoolId: user.schoolId,
      email: user.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Convenience accessor that asserts the request is authenticated. */
export function requireAuth(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
