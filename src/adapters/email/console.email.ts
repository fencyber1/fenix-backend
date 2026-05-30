import { logger } from '@/lib/logger';
import type { AdapterHealth, EmailAdapter, EmailMessage } from './email.types';

/** Dev email driver: logs the message instead of sending. No external calls. */
export class ConsoleEmailAdapter implements EmailAdapter {
  public readonly driver = 'console' as const;
  async send(message: EmailMessage): Promise<void> {
    logger.info(
      {
        email: {
          to: message.to,
          subject: message.subject,
          text: message.text ?? stripHtml(message.html),
        },
      },
      '[email:console] message dispatched',
    );
  }

  async verify(): Promise<AdapterHealth> {
    return { ok: true, driver: this.driver };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
