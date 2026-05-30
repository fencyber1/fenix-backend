import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import { buildPaginationMeta } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import type { AuthContext } from '@/types/express';
import type { ListNotificationsQuery } from './notifications.schemas';

export async function listNotifications(
  auth: AuthContext,
  query: ListNotificationsQuery,
): Promise<{ items: unknown[]; meta: PaginationMeta; unreadCount: number }> {
  const where: Prisma.NotificationWhereInput = {
    userId: auth.userId,
    ...(query.isRead !== undefined && { isRead: query.isRead }),
  };
  const skip = (query.page - 1) * query.limit;
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { sentAt: 'desc' }, skip, take: query.limit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: auth.userId, isRead: false } }),
  ]);
  return { items: rows, meta: buildPaginationMeta(query.page, query.limit, total), unreadCount };
}

export async function markRead(auth: AuthContext, id: string): Promise<unknown> {
  const existing = await prisma.notification.findFirst({ where: { id, userId: auth.userId } });
  if (!existing) throw new NotFoundError('Notification');
  return prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
}

export async function markAllRead(auth: AuthContext): Promise<{ updated: number }> {
  const res = await prisma.notification.updateMany({
    where: { userId: auth.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: res.count };
}
