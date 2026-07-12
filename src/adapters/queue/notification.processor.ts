import { NotificationChannel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getEmail } from '@/adapters/email';
import { getSms } from '@/adapters/sms';
import type { NotificationJob } from './queue.types';

/**
 * Shared notification processing logic used by BOTH the BullMQ worker and the
 * inline (synchronous) driver. Writes IN_APP notifications to the DB and
 * dispatches EMAIL / SMS through the configured adapters, honoring the user's
 * per-channel preferences captured at enqueue time.
 */
export async function processNotificationJob(job: NotificationJob): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (job.channels.includes(NotificationChannel.IN_APP)) {
    tasks.push(
      prisma.notification.create({
        data: {
          tenantId: job.tenantId,
          userId: job.userId,
          type: job.type,
          channel: NotificationChannel.IN_APP,
          title: job.title,
          body: job.body,
        },
      }),
    );
  }

  if (job.channels.includes(NotificationChannel.EMAIL) && job.email) {
    tasks.push(
      getEmail()
        .send({ to: job.email, subject: job.title, html: `<p>${escapeHtml(job.body)}</p>`, text: job.body })
        .then(() =>
          prisma.notification.create({
            data: {
              tenantId: job.tenantId,
              userId: job.userId,
              type: job.type,
              channel: NotificationChannel.EMAIL,
              title: job.title,
              body: job.body,
            },
          }),
        ),
    );
  }

  if (job.channels.includes(NotificationChannel.SMS) && job.phone) {
    tasks.push(
      getSms()
        .send({ to: job.phone, body: `${job.title}: ${job.body}` })
        .then(() =>
          prisma.notification.create({
            data: {
              tenantId: job.tenantId,
              userId: job.userId,
              type: job.type,
              channel: NotificationChannel.SMS,
              title: job.title,
              body: job.body,
            },
          }),
        ),
    );
  }

  await Promise.all(tasks);
  logger.debug({ userId: job.userId, type: job.type, channels: job.channels }, 'Notification processed');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
