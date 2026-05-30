export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Result of a provider connectivity / configuration check. */
export interface AdapterHealth {
  ok: boolean;
  driver: string;
  detail?: string;
}

export interface EmailAdapter {
  readonly driver: 'console' | 'resend' | 'sendgrid';
  send(message: EmailMessage): Promise<void>;
  /** Lightweight check that the provider is reachable / configured. */
  verify(): Promise<AdapterHealth>;
}
