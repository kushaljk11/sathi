import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/app.error';

/** Storage abstraction. The local driver is for development; swap in an S3-compatible driver in production. */
export interface StorageDriver {
  put(buf: Buffer, ext: string): Promise<string>;
  get(key: string): Promise<Buffer>;
}

const root = resolve(env.UPLOAD_DIR);

export const localStorage: StorageDriver = {
  async put(buf, ext) {
    await mkdir(root, { recursive: true });
    const key = `${randomUUID()}.${ext}`;
    await writeFile(join(root, key), buf, { mode: 0o600 });
    return key;
  },
  async get(key) {
    if (!/^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(key)) throw new AppError(400, 'Invalid key');
    return readFile(join(root, key));
  },
};

export const storage: StorageDriver = localStorage;
