import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type {
  AdapterHealth,
  PresignUploadInput,
  PresignUploadResult,
  StorageAdapter,
} from './storage.types';

/**
 * Local filesystem storage driver for development.
 *
 * It mimics presigned uploads by issuing a short-lived, HMAC-signed token that
 * the local upload route (`PUT /files/upload/:token`) verifies before writing
 * the bytes to disk. This keeps the *frontend contract identical* to S3: the
 * client always uploads to a presigned URL — never embedding credentials.
 */
export class LocalStorageAdapter implements StorageAdapter {
  public readonly driver = 'local' as const;
  private readonly baseDir: string;
  private readonly publicBase: string;
  private readonly signingKey: string;

  constructor() {
    this.baseDir = path.resolve(env.STORAGE_LOCAL_DIR);
    this.publicBase = env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '');
    // Derive a stable signing key from the JWT secret so tokens survive restarts.
    this.signingKey = crypto.createHash('sha256').update(env.JWT_ACCESS_SECRET).digest('hex');
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha256', this.signingKey).update(payload).digest('base64url');
  }

  /** Build and verify the local upload token. Exposed for the upload route. */
  public createUploadToken(key: string, contentType: string, maxBytes: number): string {
    const exp = Date.now() + 5 * 60 * 1000;
    const payload = JSON.stringify({ key, contentType, maxBytes, exp });
    const data = Buffer.from(payload).toString('base64url');
    return `${data}.${this.sign(data)}`;
  }

  public verifyUploadToken(
    token: string,
  ): { key: string; contentType: string; maxBytes: number } {
    const [data, sig] = token.split('.');
    if (!data || !sig || this.sign(data) !== sig) {
      throw new Error('Invalid upload token');
    }
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      key: string;
      contentType: string;
      maxBytes: number;
      exp: number;
    };
    if (Date.now() > parsed.exp) throw new Error('Upload token expired');
    return { key: parsed.key, contentType: parsed.contentType, maxBytes: parsed.maxBytes };
  }

  async presignUpload(input: PresignUploadInput): Promise<PresignUploadResult> {
    const token = this.createUploadToken(input.key, input.contentType, input.maxBytes);
    return {
      uploadUrl: `${this.publicBase.replace(/\/files$/, '')}/files/upload/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      key: input.key,
      publicUrl: this.getPublicUrl(input.key),
      expiresIn: 300,
    };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async writeFile(key: string, buffer: Buffer): Promise<void> {
    const target = path.join(this.baseDir, key);
    if (!target.startsWith(this.baseDir)) throw new Error('Path traversal detected');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    logger.debug({ key, bytes: buffer.length }, 'Local file written');
  }

  async readFile(key: string): Promise<Buffer> {
    const target = path.join(this.baseDir, key);
    if (!target.startsWith(this.baseDir)) throw new Error('Path traversal detected');
    return fs.readFile(target);
  }

  async delete(key: string): Promise<void> {
    const target = path.join(this.baseDir, key);
    if (!target.startsWith(this.baseDir)) throw new Error('Path traversal detected');
    await fs.rm(target, { force: true });
  }
  /** Confirms the storage directory is writable. */
  async verify(): Promise<AdapterHealth> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      const probe = path.join(this.baseDir, '.healthcheck');
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe, { force: true });
      return { ok: true, driver: this.driver };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Local storage verify failed');
      return { ok: false, driver: this.driver, detail };
    }
  }
}
