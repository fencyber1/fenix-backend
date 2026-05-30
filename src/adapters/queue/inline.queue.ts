import { logger } from '@/lib/logger';
import { processNotificationJob } from './notification.processor';
import type { NotificationJob, QueueAdapter } from './queue.types';

/**
 * Inline queue driver for tests / single-process dev. Processes the job in the
 * same process but still asynchronously (never blocking the API response path
 * synchronously) and swallows errors after logging so a failed notification
 * never breaks the originating request.
 */
export class InlineQueueAdapter implements QueueAdapter {
  public readonly driver = 'inline' as const;

  async enqueueNotification(job: NotificationJob): Promise<void> {
    // Fire-and-forget on the next tick; errors are logged, never thrown.
    setImmediate(() => {
      processNotificationJob(job).catch((err) =>
        logger.error({ err, userId: job.userId }, 'Inline notification processing failed'),
      );
    });
  }

  async close(): Promise<void> {
    // nothing to close
  }
}
