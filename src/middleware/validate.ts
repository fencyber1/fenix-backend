import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { ValidationError, type FieldError } from '@/utils/errors';

type Source = 'body' | 'query' | 'params';

/**
 * Validates a request part against a Zod schema and replaces it with the parsed
 * (typed, coerced) value. Every endpoint validates server-side — the frontend's
 * Zod schemas are duplicated here as the source of truth.
 */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ValidationError(zodToFieldErrors(result.error)));
      return;
    }
    // Reassign the validated, typed payload back onto the request.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export function zodToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Helper to read a validated query payload with its inferred type. */
export function validated<S extends ZodTypeAny>(req: Request, source: Source): ZodInfer<S> {
  return req[source] as ZodInfer<S>;
}
