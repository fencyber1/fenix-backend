import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { AdapterHealth, EmailAdapter, EmailMessage } from './email.types';

/** Resend transactional email driver (HTTP API, no SDK dependency required). */
export class ResendEmailAdapter implements EmailAdapter {
  public readonly driver = 'resend' as const;
  constructor() {
    if (!env.RESEND_API_KEY) throw new Error('EMAIL_DRIVER=resend requires RESEND_API_KEY');
  }
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.error({ status: res.status, detail }, 'Resend send failed');
      throw new Error(`Resend send failed: ${res.status}`);
    }
  }

  /** Validates the API key via an authenticated endpoint. */
  async verify(): Promise<AdapterHealth> {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      if (res.ok) return { ok: true, driver: this.driver };
      return { ok: false, driver: this.driver, detail: `HTTP ${res.status}` };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, driver: this.driver, detail };
    }
  }
}
