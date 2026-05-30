import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { AdapterHealth, SmsAdapter, SmsMessage } from './sms.types';

/** Africa's Talking SMS driver via REST API. */
export class AfricasTalkingSmsAdapter implements SmsAdapter {
  public readonly driver = 'africastalking' as const;
  constructor() {
    if (!env.AT_USERNAME || !env.AT_API_KEY) {
      throw new Error('SMS_DRIVER=africastalking requires AT_USERNAME, AT_API_KEY');
    }
  }
  async send(message: SmsMessage): Promise<void> {
    const params = new URLSearchParams({
      username: env.AT_USERNAME as string,
      to: message.to,
      message: message.body,
    });
    if (env.AT_FROM) params.set('from', env.AT_FROM);
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: env.AT_API_KEY as string,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params,
    });
    if (!res.ok) {
      const detail = await res.text();
      logger.error({ status: res.status, detail }, "Africa's Talking send failed");
      throw new Error(`Africa's Talking send failed: ${res.status}`);
    }
  }

  /** Validates credentials via the user endpoint. */
  async verify(): Promise<AdapterHealth> {
    try {
      const url = `https://api.africastalking.com/version1/user?username=${encodeURIComponent(
        env.AT_USERNAME as string,
      )}`;
      const res = await fetch(url, {
        headers: { apiKey: env.AT_API_KEY as string, Accept: 'application/json' },
      });
      if (res.ok) return { ok: true, driver: this.driver };
      return { ok: false, driver: this.driver, detail: `HTTP ${res.status}` };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, driver: this.driver, detail };
    }
  }
}
