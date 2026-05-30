import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { AdapterHealth, SmsAdapter, SmsMessage } from './sms.types';

/** Twilio SMS driver via the Messages REST API (no SDK dependency). */
export class TwilioSmsAdapter implements SmsAdapter {
  public readonly driver = 'twilio' as const;
  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
      throw new Error('SMS_DRIVER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM');
    }
  }

  private authHeader(): string {
    const sid = env.TWILIO_ACCOUNT_SID as string;
    return 'Basic ' + Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  }

  async send(message: SmsMessage): Promise<void> {
    const sid = env.TWILIO_ACCOUNT_SID as string;
    const body = new URLSearchParams({
      To: message.to,
      From: env.TWILIO_FROM as string,
      Body: message.body,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.error({ status: res.status, detail }, 'Twilio send failed');
      throw new Error(`Twilio send failed: ${res.status}`);
    }
  }

  /** Validates credentials by fetching the account resource. */
  async verify(): Promise<AdapterHealth> {
    try {
      const sid = env.TWILIO_ACCOUNT_SID as string;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: this.authHeader() },
      });
      if (res.ok) return { ok: true, driver: this.driver };
      return { ok: false, driver: this.driver, detail: `HTTP ${res.status}` };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, driver: this.driver, detail };
    }
  }
}
