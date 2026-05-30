import { logger } from '@/lib/logger';
import type { AdapterHealth, SmsAdapter, SmsMessage } from './sms.types';

/** Dev SMS driver: logs the message instead of sending. */
export class ConsoleSmsAdapter implements SmsAdapter {
  public readonly driver = 'console' as const;
  async send(message: SmsMessage): Promise<void> {
    logger.info({ sms: { to: message.to, body: message.body } }, '[sms:console] message dispatched');
  }

  async verify(): Promise<AdapterHealth> {
    return { ok: true, driver: this.driver };
  }
}
