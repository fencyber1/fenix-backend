import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildPaginationMeta } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import type { ListAuditQuery } from './audit.schemas';

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function listAuditLogs(query: ListAuditQuery): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.actor && { actorId: query.actor }),
    ...(query.table && { tableName: query.table }),
    ...(query.recordId && { recordId: query.recordId }),
    ...((query.from || query.to) && {
      createdAt: {
        ...(query.from && { gte: dateOnly(query.from) }),
        ...(query.to && { lte: dateOnly(query.to) }),
      },
    }),
  };
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: { actor: { select: { email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}
