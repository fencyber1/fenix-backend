import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface AuditContext {
  tenantId: string;
  actorId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface WriteAuditInput extends AuditContext {
  action: AuditAction;
  tableName: string;
  recordId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Persist an audit log entry. Audit writes must never break the primary
 * operation, so failures are logged but not rethrown. When a transaction
 * client is supplied the audit row is written inside that transaction.
 */
export async function writeAudit(
  input: WriteAuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        tableName: input.tableName,
        recordId: input.recordId,
        beforeJson: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
        afterJson: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, audit: { table: input.tableName, recordId: input.recordId } }, 'Failed to write audit log');
  }
}
