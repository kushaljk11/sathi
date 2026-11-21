import { PrismaClient, type Prisma } from '@prisma/client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, z, type ZodTypeAny } from 'zod';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env, isProd } from './env';

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR') {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`, 'NOT_FOUND');
export const forbidden = () => new HttpError(403, 'Forbidden', 'FORBIDDEN');

export const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
export const validate = <T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> => schema.parse(body);

export const asyncH =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => fn(req, res, next).catch(next);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError)
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Invalid input', fields: err.flatten().fieldErrors } });
  if (err instanceof HttpError)
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
  const code = (err as { code?: string })?.code;
  if (code === 'P2002') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'This already exists' } });
  if (code === 'P2025') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
  if (code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: { code: 'TOO_LARGE', message: 'File too large' } });
  console.error('[unhandled]', err instanceof Error ? err.message : err); // never send stack traces
  return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong' } });
}

export async function audit(actorId: string | null, action: string, entityType: string, entityId?: string, metadata?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
}

// ---- pagination ----
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
});
export const paged = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });

// ---- identity lookups (resource ownership) ----
export async function youthOf(userId: string) {
  const y = await prisma.youthProfile.findUnique({ where: { userId } });
  if (!y) throw notFound('Youth profile');
  return y;
}
export async function counselorOf(userId: string) {
  const c = await prisma.counselorProfile.findUnique({ where: { userId } });
  if (!c) throw notFound('Counselor profile');
  return c;
}
export async function orgOf(userId: string) {
  const s = await prisma.organizationStaff.findFirst({ where: { userId }, include: { organization: true } });
  if (!s) throw notFound('Organization');
  return { ...s.organization, isOwner: s.isOwner };
}

// ---- AES-256-GCM encryption for secrets at rest (OAuth refresh tokens) ----
function key() {
  if (env.ENCRYPTION_KEY) return Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (isProd) throw new Error('ENCRYPTION_KEY required');
  return createHash('sha256').update('dev-only:' + env.JWT_REFRESH_SECRET).digest();
}
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// ---- platform settings with defaults ----
export const SETTING_DEFAULTS = {
  'moderation.thresholds': { hold: 0.5, hide: 0.85, reject: 0.9 },
  'moderation.extraTerms': [] as string[],
  'moderation.retentionDays': 365,
  'moderation.reportsToFlag': 3,
  'refund.policy': { fullHours: 24, partialHours: 2, partialPercent: 50 },
  'followup.hoursAfterSession': 48,
  'safety.rules': { escalateOnAnyYes: ['harm_self_now', 'harm_others_now', 'unsafe_now'], ruleVersion: 1 },
  'platform.supportEmail': 'support@sathi.local',
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;
export async function getSetting<K extends SettingKey>(k: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const s = await prisma.platformSetting.findUnique({ where: { key: k } });
  return (s?.value as (typeof SETTING_DEFAULTS)[K]) ?? SETTING_DEFAULTS[k];
}
