import { env } from '@/config/env';
import { ConsoleSmsAdapter } from './console.sms';
import { TwilioSmsAdapter } from './twilio.sms';
import { AfricasTalkingSmsAdapter } from './africastalking.sms';
import type { SmsAdapter } from './sms.types';

let instance: SmsAdapter | null = null;

export function getSms(): SmsAdapter {
  if (!instance) {
    switch (env.SMS_DRIVER) {
      case 'twilio':
        instance = new TwilioSmsAdapter();
        break;
      case 'africastalking':
        instance = new AfricasTalkingSmsAdapter();
        break;
      default:
        instance = new ConsoleSmsAdapter();
    }
  }
  return instance;
}

export type { SmsAdapter, SmsMessage } from './sms.types';
