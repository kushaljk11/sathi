import argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env, isProd } from '../config/env';

/** SHA-256 hex digest. Used for opaque tokens (only the hash is stored). */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Cryptographically random URL-safe token. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);

// ---- AES-256-GCM encryption for secrets at rest (e.g. Google OAuth refresh tokens) ----
function encryptionKey() {
  if (env.ENCRYPTION_KEY) return Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (isProd) throw new Error('ENCRYPTION_KEY required');
  return createHash('sha256').update('dev-only:' + env.JWT_REFRESH_SECRET).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
