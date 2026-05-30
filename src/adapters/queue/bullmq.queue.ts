import { Queue } from 'bullmq';
import { redisConnectionOptions } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { NOTIFICATION_QUEUE, type NotificationJob, type QueueAdapter } from './queue.types';

/**
 * BullMQ-backed queue driver. API requests enqueue jobs and return immediately;
 * the separate worker process (src/worker.ts) consumes and processes them.
 */
export class BullMqQueueAdapter implements QueueAdapter {
  public readonly driver = 'bullmq' as const;
  private readonly queue: Queue<NotificationJob>;

  constructor() {
    this.queue = new Queue<NotificationJob>(NOTIFICATION_QUEUE, {
      connection: redisConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueNotification(job: NotificationJob): Promise<void> {
    await this.queue.add('notify', job);
    logger.debug({ userId: job.userId, type: job.type }, 'Notification enqueued (bullmq)');
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
