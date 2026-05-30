import { env } from '@/config/env';
import { LocalStorageAdapter } from './local.storage';
import { S3StorageAdapter } from './s3.storage';
import type { StorageAdapter } from './storage.types';

let instance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!instance) {
    instance = env.STORAGE_DRIVER === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter();
  }
  return instance;
}

/** Type guard: the local driver exposes extra read/write helpers for the dev route. */
export function asLocalStorage(adapter: StorageAdapter): LocalStorageAdapter | null {
  return adapter instanceof LocalStorageAdapter ? adapter : null;
}

export type { StorageAdapter } from './storage.types';
export { LocalStorageAdapter } from './local.storage';
