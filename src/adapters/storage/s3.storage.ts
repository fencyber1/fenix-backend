import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type {
  AdapterHealth,
  PresignUploadInput,
  PresignUploadResult,
  StorageAdapter,
} from './storage.types';

/**
 * S3 / Cloudflare R2 storage driver. Generates true presigned PUT URLs so the
 * frontend uploads directly to object storage and never holds AWS credentials.
 */
export class S3StorageAdapter implements StorageAdapter {
  public readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor() {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
      );
    }
    this.bucket = env.S3_BUCKET;
    this.publicBase = (env.S3_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
    this.client = new S3Client({
      region: env.S3_REGION ?? 'auto',
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async presignUpload(input: PresignUploadInput): Promise<PresignUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.maxBytes,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
    return {
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      key: input.key,
      publicUrl: this.getPublicUrl(input.key),
      expiresIn: 300,
    };
  }

  getPublicUrl(key: string): string {
    return this.publicBase ? `${this.publicBase}/${key}` : `s3://${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Confirms the bucket exists and credentials are valid via HeadBucket. */
  async verify(): Promise<AdapterHealth> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true, driver: this.driver };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'S3 storage verify failed');
      return { ok: false, driver: this.driver, detail };
    }
  }
}
