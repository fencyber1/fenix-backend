/**
 * Application error hierarchy. Every thrown AppError maps to a structured
 * JSON response: { success: false, message, errors[] }.
 */
export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors: FieldError[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; errors?: FieldError[]; isOperational?: boolean },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = options?.code ?? 'APP_ERROR';
    this.errors = options?.errors ?? [];
    this.isOperational = options?.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', errors: FieldError[] = []) {
    super(400, message, { code: 'BAD_REQUEST', errors });
  }
}

export class ValidationError extends AppError {
  constructor(errors: FieldError[], message = 'Validation failed') {
    super(422, message, { code: 'VALIDATION_ERROR', errors });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, { code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, message, { code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, { code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', errors: FieldError[] = []) {
    super(409, message, { code: 'CONFLICT', errors });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(429, message, { code: 'RATE_LIMITED' });
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(500, message, { code: 'INTERNAL_ERROR', isOperational: false });
  }
}
