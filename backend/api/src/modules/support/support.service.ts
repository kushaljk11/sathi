import { evaluateConsent, type ConsentCategory } from '@sathi/shared';
import { prisma, HttpError, notFound, type Tx } from '../../lib/core';
import type { AuthUser } from '../../middleware/auth';

export const MILESTONES = {
  ASSESSMENT_COMPLETED: 'Assessment completed',
  COUNSELOR_CONNECTED: 'Counselor connected',
  FIRST_SESSION: 'First session completed',
  PLAN_AGREED: 'Support plan agreed',
  FIRST_REVIEW: 'First progress review completed',
  GOAL_ACHIEVED: 'Goal achieved',
} as const;

/** Idempotent milestone recording (unique on youth+kind+relationship). */
export async function recordMilestone(youthUserId: string, kind: keyof typeof MILESTONES, relationshipId: string | null, db: Tx | typeof prisma = prisma) {
  const exists = await db.progressMilestone.findFirst({ where: { youthUserId, kind, relationshipId } });
  if (exists) return exists;
  const m = await db.progressMilestone.create({ data: { youthUserId, kind, relationshipId } });
  if (relationshipId) await db.timelineEvent.create({ data: { relationshipId, type: 'MILESTONE', title: MILESTONES[kind] } });
  return m;
}

export const timeline = (relationshipId: string, type: string, title: string, db: Tx | typeof prisma = prisma) =>
  db.timelineEvent.create({ data: { relationshipId, type, title } });

/**
 * Relationship-based authorization: only the youth or the assigned counselor. Admins are NOT granted access.
 */
export async function relationshipFor(id: string, user: AuthUser, opts: { activeOnly?: boolean; counselorOnly?: boolean } = {}) {
  const rel = await prisma.supportRelationship.findUnique({
    where: { id },
    include: { youth: { include: { user: { select: { id: true, displayName: true } } } }, counselor: { include: { user: { select: { id: true, displayName: true } } } } },
  });
  if (!rel) throw notFound('Support relationship');
  const isYouth = user.role === 'YOUTH' && rel.youth.userId === user.id;
  const isCounselor = user.role === 'COUNSELOR' && rel.counselor.userId === user.id;
  if (!(isYouth || isCounselor) || (opts.counselorOnly && !isCounselor)) throw new HttpError(403, 'Forbidden', 'FORBIDDEN');
  if (opts.activeOnly && !['ACTIVE', 'PAUSED'].includes(rel.status)) throw new HttpError(409, 'This support relationship is closed');
  return { rel, isYouth, isCounselor };
}

/** Consent-gated sensitive read with access logging. Throws 403 when consent is missing or withdrawn. */
export async function requireConsent(user: AuthUser, youthId: string, counselorProfileId: string, category: ConsentCategory, relationshipActive: boolean) {
  const consent = await prisma.consentRecord.findUnique({ where: { youthId_recipientId_category: { youthId, recipientId: counselorProfileId, category } } });
  const result = evaluateConsent({ accessorRole: user.role, recipientId: counselorProfileId, relationshipActive, category, consent });
  await prisma.sensitiveDataAccessLog.create({ data: { accessorId: user.id, youthId, category, allowed: result.allowed, reason: result.reason } });
  return result.allowed;
}

/** Creates or re-activates the single youth↔counselor relationship; never duplicates an open one. */
export async function activateRelationship(tx: Tx, youthId: string, counselorId: string) {
  const open = await tx.supportRelationship.findFirst({ where: { youthId, counselorId, status: { in: ['ACTIVE', 'PAUSED'] } } });
  if (open) {
    if (open.status === 'PAUSED') await tx.supportRelationship.update({ where: { id: open.id }, data: { status: 'ACTIVE' } });
    return { rel: open, created: false };
  }
  const rel = await tx.supportRelationship.create({ data: { youthId, counselorId, conversation: { create: {} } } });
  await tx.timelineEvent.create({ data: { relationshipId: rel.id, type: 'RELATIONSHIP', title: 'Support relationship started' } });
  return { rel, created: true };
}
