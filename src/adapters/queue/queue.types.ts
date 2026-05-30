import type { NotificationChannel, NotificationType } from '@prisma/client';

/**
 * Payload for a queued notification job. The worker resolves the user's
 * channel preferences and dispatches IN_APP / EMAIL / SMS accordingly.
 */
export interface NotificationJob {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channels: NotificationChannel[];
  email?: string | null;
  phone?: string | null;
}

export interface QueueAdapter {
  readonly driver: 'bullmq' | 'inline';
  enqueueNotification(job: NotificationJob): Promise<void>;
  close(): Promise<void>;
}

export const NOTIFICATION_QUEUE = 'notifications';
