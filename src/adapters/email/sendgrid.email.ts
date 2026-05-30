import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { AdapterHealth, EmailAdapter, EmailMessage } from './email.types';

/** SendGrid transactional email driver (HTTP API). */
export class SendgridEmailAdapter implements EmailAdapter {
  public readonly driver = 'sendgrid' as const;
  constructor() {
    if (!env.SENDGRID_API_KEY) throw new Error('EMAIL_DRIVER=sendgrid requires SENDGRID_API_KEY');
  }
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: parseFrom(env.EMAIL_FROM) },
        subject: message.subject,
        content: [
          { type: 'text/plain', value: message.text ?? '' },
          { type: 'text/html', value: message.html },
        ].filter((c) => c.value),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.error({ status: res.status, detail }, 'SendGrid send failed');
      throw new Error(`SendGrid send failed: ${res.status}`);
    }
  }

  /** Validates the API key via the scopes endpoint. */
  async verify(): Promise<AdapterHealth> {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/scopes', {
        headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}` },
      });
      if (res.ok) return { ok: true, driver: this.driver };
      return { ok: false, driver: this.driver, detail: `HTTP ${res.status}` };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, driver: this.driver, detail };
    }
  }
}

function parseFrom(from: string): string {
  const match = from.match(/<(.+)>/);
  return match?.[1] ?? from;
}
