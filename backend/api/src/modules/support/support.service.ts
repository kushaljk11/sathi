import { evaluateConsent, type ConsentCategory } from '@sathi/shared';
import { prisma, type Tx } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import type { AuthUser } from '../../core/middleware/auth.middleware';
import { MILESTONES } from './support.constants';
import type { MilestoneKind, RelationshipAccessOptions, UpdateRelationshipStatusInput } from './support.types';

export { MILESTONES };

/** Idempotent milestone recording (unique on youth+kind+relationship). */
export async function recordMilestone(youthUserId: string, kind: MilestoneKind, relationshipId: string | null, db: Tx | typeof prisma = prisma) {
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
export async function relationshipFor(id: string, user: AuthUser, opts: RelationshipAccessOptions = {}) {
  const rel = await prisma.supportRelationship.findUnique({
    where: { id },
    include: { youth: { include: { user: { select: { id: true, displayName: true } } } }, counselor: { include: { user: { select: { id: true, displayName: true } } } } },
  });
  if (!rel) throw notFound('Support relationship');
  const isYouth = user.role === 'YOUTH' && rel.youth.userId === user.id;
  const isCounselor = user.role === 'COUNSELOR' && rel.counselor.userId === user.id;
  if (!(isYouth || isCounselor) || (opts.counselorOnly && !isCounselor)) throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  if (opts.activeOnly && !['ACTIVE', 'PAUSED'].includes(rel.status)) throw new AppError(409, 'This support relationship is closed');
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

export function listRelationships(user: AuthUser) {
  const where = user.role === 'YOUTH' ? { youth: { userId: user.id } } : { counselor: { userId: user.id } };
  return prisma.supportRelationship.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    include: {
      youth: { select: { id: true, ageGroup: true, user: { select: { displayName: true } } } },
      counselor: { select: { id: true, user: { select: { displayName: true } } } },
      appointments: {
        where: { startsAt: { gte: new Date() }, status: { in: ['CONFIRMED', 'PENDING_COUNSELOR'] } },
        orderBy: { startsAt: 'asc' },
        take: 1,
        select: { id: true, startsAt: true, mode: true, status: true },
      },
      plans: { where: { status: { in: ['ACTIVE', 'PROPOSED'] } }, select: { id: true, status: true } },
    },
  });
}

export async function getRelationship(relationshipId: string, user: AuthUser) {
  const { rel, isCounselor } = await relationshipFor(relationshipId, user);
  const sessions = await prisma.appointment.findMany({
    where: { relationshipId: rel.id },
    orderBy: { startsAt: 'desc' },
    include: { sessionRecord: true, meeting: { select: { status: true } } },
  });
  return {
    id: rel.id,
    status: rel.status,
    startedAt: rel.startedAt,
    endedAt: rel.endedAt,
    youth: { id: rel.youth.id, name: rel.youth.user.displayName, ageGroup: isCounselor ? rel.youth.ageGroup : undefined },
    counselor: { id: rel.counselor.id, name: rel.counselor.user.displayName },
    sessions,
    timeline: await prisma.timelineEvent.findMany({ where: { relationshipId: rel.id }, orderBy: { occurredAt: 'desc' }, take: 100 }),
    milestones: await prisma.progressMilestone.findMany({
      where: { OR: [{ relationshipId: rel.id }, { youthUserId: rel.youth.userId, relationshipId: null }] },
      orderBy: { achievedAt: 'asc' },
    }),
    reviews: await prisma.progressReview.findMany({ where: { relationshipId: rel.id }, orderBy: { createdAt: 'desc' } }),
  };
}

export async function updateRelationshipStatus(relationshipId: string, user: AuthUser, { status }: UpdateRelationshipStatusInput) {
  const { rel, isYouth } = await relationshipFor(relationshipId, user);
  if (['COMPLETED', 'CLOSED'].includes(rel.status)) throw new AppError(409, 'This relationship has ended');
  if (isYouth && status !== 'CLOSED') throw new AppError(403, 'Youth can only end a relationship');
  await prisma.supportRelationship.update({ where: { id: rel.id }, data: { status, endedAt: ['COMPLETED', 'CLOSED'].includes(status) ? new Date() : null } });
  await timeline(rel.id, 'RELATIONSHIP', `Relationship ${status.toLowerCase()}`);
  return { status };
}

// ---------- private counselor notes (counselor only; never shown to youth or admins) ----------
export async function listNotes(relationshipId: string, user: AuthUser) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true });
  return prisma.privateCounselorNote.findMany({ where: { relationshipId: rel.id }, orderBy: { createdAt: 'desc' } });
}

export async function createNote(relationshipId: string, user: AuthUser, body: string) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true });
  return prisma.privateCounselorNote.create({ data: { relationshipId: rel.id, body } });
}

/** Consent-gated access to the youth's Support Need Profile / assessment summary. */
export async function getSharedProfile(relationshipId: string, user: AuthUser) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true });
  const active = ['ACTIVE', 'PAUSED'].includes(rel.status);
  const needOk = await requireConsent(user, rel.youthId, rel.counselorId, 'SUPPORT_NEED_PROFILE', active);
  const assessOk = await requireConsent(user, rel.youthId, rel.counselorId, 'ASSESSMENT_SUMMARY', active);
  const historyOk = await requireConsent(user, rel.youthId, rel.counselorId, 'SUPPORT_HISTORY', active);
  return {
    needProfile: needOk
      ? await prisma.supportNeedProfile.findFirst({
          where: { youthId: rel.youthId },
          orderBy: { createdAt: 'desc' },
          select: { concerns: true, impactLevel: true, durationBucket: true, desiredSupport: true, languages: true, mode: true, accessibility: true, createdAt: true },
        })
      : null,
    assessment: assessOk
      ? await prisma.assessment.findFirst({
          where: { youthId: rel.youthId, status: 'SUBMITTED' },
          orderBy: { submittedAt: 'desc' },
          select: { submittedAt: true, responses: { select: { questionKey: true, value: true } } },
        })
      : null,
    history: historyOk ? await prisma.supportRelationship.findMany({ where: { youthId: rel.youthId, id: { not: rel.id } }, select: { status: true, startedAt: true, endedAt: true } }) : null,
    consent: { needProfile: needOk, assessment: assessOk, history: historyOk },
  };
}
