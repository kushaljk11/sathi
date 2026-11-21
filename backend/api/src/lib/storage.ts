import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { env } from './env';
import { HttpError } from './core';

/** Storage abstraction. Local driver for development; swap for an S3-compatible driver in production. */
export interface StorageDriver { put(buf: Buffer, ext: string): Promise<string>; get(key: string): Promise<Buffer> }

const root = resolve(env.UPLOAD_DIR);
export const localStorage: StorageDriver = {
  async put(buf, ext) {
    await mkdir(root, { recursive: true });
    const key = `${randomUUID()}.${ext}`;
    await writeFile(join(root, key), buf, { mode: 0o600 });
    return key;
  },
  async get(key) {
    if (!/^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(key)) throw new HttpError(400, 'Invalid key');
    return readFile(join(root, key));
  },
};
export const storage = localStorage;

/** Validates by magic bytes (not client-supplied MIME). Only PDF/PNG/JPEG. */
export function sniff(buf: Buffer): { ext: 'pdf' | 'png' | 'jpg'; mime: string } | null {
  if (buf.subarray(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  return null;
}
export function assertSafePdf(buf: Buffer) {
  // Reject PDFs with active content. Full AV scanning (e.g. ClamAV) is a documented production step.
  const s = buf.toString('latin1');
  if (/\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile/.test(s)) throw new HttpError(400, 'PDF contains active content and was rejected');
}

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

export async function saveVerifiedFile(file: Express.Multer.File | undefined) {
  if (!file) throw new HttpError(400, 'File required');
  const kind = sniff(file.buffer);
  if (!kind) throw new HttpError(400, 'Only PDF, PNG or JPEG files are accepted');
  if (kind.ext === 'pdf') assertSafePdf(file.buffer);
  const key = await storage.put(file.buffer, kind.ext);
  return { key, mime: kind.mime, name: file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 120) };
}
