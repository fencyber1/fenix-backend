import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, type FieldError } from '@/utils/errors';
import { zodToFieldErrors } from '@/middleware/validate';
import { logger } from '@/lib/logger';
import { isProd } from '@/config/env';
import { captureException } from '@/lib/observability';

interface ErrorBody {
  success: false;
  message: string;
  errors: FieldError[];
  code: string;
  requestId?: string;
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
    code: 'ROUTE_NOT_FOUND',
    requestId: req.requestId,
  } satisfies ErrorBody);
}

/**
 * Centralized error middleware. Maps AppError, ZodError, and known Prisma
 * errors to structured JSON: { success, message, errors[] }. Never leaks stack
 * traces or internal details in production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let status = 500;
  let message = 'Internal server error';
  let errors: FieldError[] = [];
  let code = 'INTERNAL_ERROR';

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    errors = err.errors;
    code = err.code;
  } else if (err instanceof ZodError) {
    status = 422;
    message = 'Validation failed';
    errors = zodToFieldErrors(err);
    code = 'VALIDATION_ERROR';
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    status = mapped.status;
    message = mapped.message;
    errors = mapped.errors;
    code = mapped.code;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    message = 'Invalid database query parameters';
    code = 'DB_VALIDATION_ERROR';
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.requestId, path: req.originalUrl }, 'Unhandled error');
    captureException(err);
    if (isProd) message = 'Internal server error';
  } else {
    logger.debug({ err: { message }, code, requestId: req.requestId }, 'Handled error');
  }

  res.status(status).json({ success: false, message, errors, code, requestId: req.requestId });
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
  errors: FieldError[];
  code: string;
} {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      return {
        status: 409,
        message: 'A record with this value already exists',
        errors: target.map(() => ({ field: 'value', message: 'Must be unique' })),
        code: 'UNIQUE_CONSTRAINT',
      };
    }
    case 'P2003':
      return {
        status: 409,
        message: 'Related record constraint failed',
        errors: [],
        code: 'FK_CONSTRAINT',
      };
    case 'P2025':
      return { status: 404, message: 'Record not found', errors: [], code: 'NOT_FOUND' };
    default:
      return {
        status: 400,
        message: 'Database request error',
        errors: [],
        code: `PRISMA_${err.code}`,
      };
  }
}
