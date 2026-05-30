import { env } from '@/config/env';
import { BullMqQueueAdapter } from './bullmq.queue';
import { InlineQueueAdapter } from './inline.queue';
import type { QueueAdapter } from './queue.types';

let instance: QueueAdapter | null = null;

export function getQueue(): QueueAdapter {
  if (!instance) {
    instance = env.QUEUE_DRIVER === 'bullmq' ? new BullMqQueueAdapter() : new InlineQueueAdapter();
  }
  return instance;
}

export async function closeQueue(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

export type { QueueAdapter, NotificationJob } from './queue.types';
export { NOTIFICATION_QUEUE } from './queue.types';
