import type { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';

/** Attaches a request id and exposes the client IP/user-agent for audit logs. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? nanoid();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]?.trim() ?? null;
  return req.ip ?? req.socket.remoteAddress ?? null;
}

export function userAgent(req: Request): string | null {
  return (req.headers['user-agent'] as string | undefined) ?? null;
}
