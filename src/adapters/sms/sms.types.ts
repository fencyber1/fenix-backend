export interface SmsMessage {
  to: string;
  body: string;
}

/** Result of a provider connectivity / configuration check. */
export interface AdapterHealth {
  ok: boolean;
  driver: string;
  detail?: string;
}

export interface SmsAdapter {
  readonly driver: 'console' | 'twilio' | 'africastalking';
  send(message: SmsMessage): Promise<void>;
  /** Lightweight check that the provider is reachable / configured. */
  verify(): Promise<AdapterHealth>;
}
