import type { Role } from '@prisma/client';

/**
 * Authenticated request context attached by the auth middleware.
 */
export interface AuthContext {
  userId: string;
  role: Role;
  tenantId: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

export {};
