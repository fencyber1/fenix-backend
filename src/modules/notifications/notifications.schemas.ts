import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  isRead: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationIdParamSchema = z.object({ id: z.string().uuid() });

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
