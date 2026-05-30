import { env } from '@/config/env';
import { ConsoleEmailAdapter } from './console.email';
import { ResendEmailAdapter } from './resend.email';
import { SendgridEmailAdapter } from './sendgrid.email';
import type { EmailAdapter } from './email.types';

let instance: EmailAdapter | null = null;

export function getEmail(): EmailAdapter {
  if (!instance) {
    switch (env.EMAIL_DRIVER) {
      case 'resend':
        instance = new ResendEmailAdapter();
        break;
      case 'sendgrid':
        instance = new SendgridEmailAdapter();
        break;
      default:
        instance = new ConsoleEmailAdapter();
    }
  }
  return instance;
}

export type { EmailAdapter, EmailMessage } from './email.types';
