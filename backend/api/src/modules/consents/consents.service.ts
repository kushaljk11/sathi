import { prisma, type Tx } from '../../config/database';
import { notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { youthOf } from '../../helpers/identity.helper';
import { ACCESS_LOG_LIMIT, CONSENT_VERSION } from './consents.constants';
import type { ConsentItemsInput, UpdateConsentsInput } from './consents.types';

export { CONSENT_VERSION, CONSENT_DESCRIPTIONS } from './consents.constants';

/** Upserts consents with full history. Used by booking and the privacy center. */
export async function setConsents(db: Tx | typeof prisma, youthId: string, counselorProfileId: string, items: ConsentItemsInput, purpose: string) {
  for (const it of items) {
    const existing = await db.consentRecord.findUnique({ where: { youthId_recipientId_category: { youthId, recipientId: counselorProfileId, category: it.category } } });
    const rec = existing
      ? await db.consentRecord.update({
          where: { id: existing.id },
          data: {
            granted: it.granted,
            withdrawnAt: it.granted ? null : new Date(),
            grantedAt: it.granted && !existing.granted ? new Date() : existing.grantedAt,
            consentVersion: CONSENT_VERSION,
            purpose,
          },
        })
      : await db.consentRecord.create({
          data: {
            youthId,
            recipientId: counselorProfileId,
            recipientType: 'COUNSELOR',
            category: it.category,
            granted: it.granted,
            purpose,
            consentVersion: CONSENT_VERSION,
            withdrawnAt: it.granted ? null : new Date(),
          },
        });
    if (!existing || existing.granted !== it.granted) await db.consentHistory.create({ data: { consentId: rec.id, granted: it.granted } });
  }
}

export async function listConsents(userId: string) {
  const y = await youthOf(userId);
  const records = await prisma.consentRecord.findMany({ where: { youthId: y.id }, include: { history: { orderBy: { changedAt: 'desc' } } }, orderBy: { grantedAt: 'desc' } });
  const names = await prisma.counselorProfile.findMany({
    where: { id: { in: [...new Set(records.map((r) => r.recipientId))] } },
    select: { id: true, user: { select: { displayName: true } } },
  });
  const nameOf = Object.fromEntries(names.map((n) => [n.id, n.user.displayName]));
  return records.map((r) => ({ ...r, recipientName: nameOf[r.recipientId] ?? 'Unknown' }));
}

export async function updateConsents(userId: string, input: UpdateConsentsInput) {
  const y = await youthOf(userId);
  if (!(await prisma.counselorProfile.findUnique({ where: { id: input.counselorId } }))) throw notFound('Counselor');
  await setConsents(prisma, y.id, input.counselorId, input.items, 'Support relationship');
  await audit(userId, 'CONSENT_UPDATED', 'ConsentRecord', input.counselorId, { categories: input.items.map((i) => `${i.category}:${i.granted}`) });
  return { updated: true };
}

/** Who accessed my data (transparency). */
export async function accessLog(userId: string) {
  const y = await youthOf(userId);
  return prisma.sensitiveDataAccessLog.findMany({
    where: { youthId: y.id },
    orderBy: { createdAt: 'desc' },
    take: ACCESS_LOG_LIMIT,
    select: { category: true, allowed: true, reason: true, createdAt: true },
  });
}
