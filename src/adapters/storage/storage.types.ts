/**
 * Storage adapter contract. Both the local filesystem driver and the S3/R2
 * driver implement this interface so the rest of the app is provider-agnostic.
 */
export interface PresignUploadInput {
  key: string;
  contentType: string;
  maxBytes: number;
}

export interface PresignUploadResult {
  /** URL the client PUTs the file to. */
  uploadUrl: string;
  /** Method the client must use for the upload. */
  method: 'PUT' | 'POST';
  /** Headers the client must include in the upload request. */
  headers: Record<string, string>;
  /** Storage key the file will live under. */
  key: string;
  /** Public (or app-proxied) URL to read the file once uploaded. */
  publicUrl: string;
  /** Seconds until the upload URL expires. */
  expiresIn: number;
}

/** Result of a provider connectivity / configuration check. */
export interface AdapterHealth {
  ok: boolean;
  driver: string;
  detail?: string;
}

export interface StorageAdapter {
  readonly driver: 'local' | 's3';
  presignUpload(input: PresignUploadInput): Promise<PresignUploadResult>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
  /** Lightweight check that the backing store is reachable / configured. */
  verify(): Promise<AdapterHealth>;
}
