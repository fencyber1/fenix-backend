import { Worker } from 'bullmq';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { redisConnectionOptions } from '@/lib/redis';
import { connectDatabase, disconnectDatabase } from '@/lib/prisma';
import { NOTIFICATION_QUEUE, type NotificationJob } from '@/adapters/queue';
import { processNotificationJob } from '@/adapters/queue/notification.processor';
import { processOverdueAndRemind } from '@/modules/fees/fees.service';

/**
 * Background worker process. Consumes the notification queue and runs scheduled
 * maintenance (overdue invoices + fee reminders). Run separately from the API:
 *   npm run worker
 */
async function bootstrap(): Promise<void> {
  if (env.QUEUE_DRIVER !== 'bullmq') {
    logger.warn('QUEUE_DRIVER is not bullmq; worker has nothing to consume. Exiting.');
    return;
  }
  await connectDatabase();

  const worker = new Worker<NotificationJob>(
    NOTIFICATION_QUEUE,
    async (job) => {
      await processNotificationJob(job.data);
    },
    { connection: redisConnectionOptions(), concurrency: 5 },
  );

  worker.on('completed', (job) => logger.debug({ jobId: job.id }, 'Notification job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Notification job failed'));

  logger.info('Notification worker started');

  // Hourly maintenance: mark overdue invoices and queue reminders.
  const maintenance = setInterval(
    () => {
      processOverdueAndRemind()
        .then((r) => logger.info({ ...r }, 'Overdue/reminder sweep complete'))
        .catch((err) => logger.error({ err }, 'Overdue/reminder sweep failed'));
    },
    60 * 60 * 1000,
  );

  const shutdown = async (): Promise<void> => {
    clearInterval(maintenance);
    await worker.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
