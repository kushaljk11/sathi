import { Router } from 'express';
import { z } from 'zod';
import { asyncH, ok, prisma, validate, youthOf, notFound, audit, type Tx } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';

export const CONSENT_VERSION = 1;
export const consentCategory = z.enum(['ASSESSMENT_SUMMARY', 'SUPPORT_NEED_PROFILE', 'CHECKIN_TRENDS', 'SUPPORT_HISTORY']);
export const consentInput = z.array(z.object({ category: consentCategory, granted: z.boolean() })).max(4);

export const CONSENT_DESCRIPTIONS = {
  ASSESSMENT_SUMMARY: 'A summary of your most recent support assessment answers',
  SUPPORT_NEED_PROFILE: 'Your Support Need Profile (concerns, preferences, availability)',
  CHECKIN_TRENDS: 'Trends from your wellbeing check-ins',
  SUPPORT_HISTORY: 'Your previous support history on Sathi',
};

/** Upserts consents with full history. Used by booking and the privacy center. */
export async function setConsents(db: Tx | typeof import('../../lib/core').prisma, youthId: string, counselorProfileId: string, items: z.infer<typeof consentInput>, purpose: string) {
  for (const it of items) {
    const existing = await db.consentRecord.findUnique({ where: { youthId_recipientId_category: { youthId, recipientId: counselorProfileId, category: it.category } } });
    const rec = existing
      ? await db.consentRecord.update({
          where: { id: existing.id },
          data: { granted: it.granted, withdrawnAt: it.granted ? null : new Date(), grantedAt: it.granted && !existing.granted ? new Date() : existing.grantedAt, consentVersion: CONSENT_VERSION, purpose },
        })
      : await db.consentRecord.create({ data: { youthId, recipientId: counselorProfileId, recipientType: 'COUNSELOR', category: it.category, granted: it.granted, purpose, consentVersion: CONSENT_VERSION, withdrawnAt: it.granted ? null : new Date() } });
    if (!existing || existing.granted !== it.granted) await db.consentHistory.create({ data: { consentId: rec.id, granted: it.granted } });
  }
}

const r = Router();
r.use(authenticate, requireRole('YOUTH'));

r.get('/descriptions', (_req, res) => { ok(res, CONSENT_DESCRIPTIONS); });

r.get('/', asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const records = await prisma.consentRecord.findMany({ where: { youthId: y.id }, include: { history: { orderBy: { changedAt: 'desc' } } }, orderBy: { grantedAt: 'desc' } });
  const names = await prisma.counselorProfile.findMany({ where: { id: { in: [...new Set(records.map((r) => r.recipientId))] } }, select: { id: true, user: { select: { displayName: true } } } });
  const nameOf = Object.fromEntries(names.map((n) => [n.id, n.user.displayName]));
  ok(res, records.map((r) => ({ ...r, recipientName: nameOf[r.recipientId] ?? 'Unknown' })));
}));

r.put('/', asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const b = validate(z.object({ counselorId: z.string().uuid(), items: consentInput }), req.body);
  if (!(await prisma.counselorProfile.findUnique({ where: { id: b.counselorId } }))) throw notFound('Counselor');
  await setConsents(prisma, y.id, b.counselorId, b.items, 'Support relationship');
  await audit(req.user!.id, 'CONSENT_UPDATED', 'ConsentRecord', b.counselorId, { categories: b.items.map((i) => `${i.category}:${i.granted}`) });
  ok(res, { updated: true });
}));

/** Who accessed my data (transparency). */
r.get('/access-log', asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  ok(res, await prisma.sensitiveDataAccessLog.findMany({ where: { youthId: y.id }, orderBy: { createdAt: 'desc' }, take: 100, select: { category: true, allowed: true, reason: true, createdAt: true } }));
}));

export default r;
