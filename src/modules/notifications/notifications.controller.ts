import type { Request, Response } from 'express';
import { ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import * as service from './notifications.service';
import type { ListNotificationsQuery } from './notifications.schemas';

export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const { items, meta, unreadCount } = await service.listNotifications(auth, req.query as unknown as ListNotificationsQuery);
  return paginated(res, items, { ...meta }, `OK (${unreadCount} unread)`);
}
export async function markRead(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.markRead(auth, req.params.id as string), 'Notification marked read');
}
export async function markAllRead(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await service.markAllRead(auth), 'All notifications marked read');
}
