import { createHash } from 'node:crypto';
import { classifyText, decideModeration, normalizeForDuplicate, type ModCategory } from '@sathi/shared';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError, notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { getSetting } from '../../helpers/settings.helper';
import { notify } from '../../helpers/notification.helper';
import { DAY_MS } from '../../utils/date.util';
import { paged } from '../../utils/pagination.util';
import { DEFAULT_RESTRICT_DAYS, PERSPECTIVE_ENDPOINT, PERSPECTIVE_TIMEOUT_MS, QUEUE_FILTERS } from './moderation.constants';
import type { CaseActionInput, ContentStatus, ModerationProvider, QueueQuery } from './moderation.types';

export type { ModerationProvider } from './moderation.types';

export const contentHash = (text: string) => createHash('sha256').update(normalizeForDuplicate(text)).digest('hex');

export const localProvider: ModerationProvider = { name: 'local-rules-v1', classify: async (_t, base) => base };

export const perspectiveProvider: ModerationProvider = {
  name: 'perspective+local',
  async classify(text, base) {
    if (!env.PERSPECTIVE_API_KEY || base.language !== 'en') return base; // unsupported → local rules + human review path
    try {
      const res = await fetch(`${PERSPECTIVE_ENDPOINT}?key=${env.PERSPECTIVE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(PERSPECTIVE_TIMEOUT_MS),
        body: JSON.stringify({ comment: { text }, languages: ['en'], doNotStore: true, requestedAttributes: { TOXICITY: {}, INSULT: {}, IDENTITY_ATTACK: {}, THREAT: {} } }),
      });
      const j = (await res.json()) as { attributeScores?: Record<string, { summaryScore: { value: number } }> };
      const v = (k: string) => j.attributeScores?.[k]?.summaryScore.value ?? 0;
      const scores = { ...base.scores };
      const merge = (c: ModCategory, x: number) => {
        scores[c] = Math.max(scores[c], x);
      };
      merge('bullying', v('INSULT'));
      merge('hate', v('IDENTITY_ATTACK'));
      merge('threat', v('THREAT'));
      merge('harassment', v('TOXICITY') * 0.9);
      const maxScore = Math.max(...Object.values(scores));
      return { ...base, scores, maxScore, categories: (Object.keys(scores) as ModCategory[]).filter((c) => scores[c] >= 0.5), reasons: [...base.reasons, 'External classifier'] };
    } catch {
      return { ...base, uncertain: true }; // provider failure → human review rather than silent approval
    }
  },
};
const provider = () => (env.MODERATION_PROVIDER === 'perspective' ? perspectiveProvider : localProvider);

export async function assertCanPost(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.status !== 'ACTIVE') throw new AppError(403, 'Your account cannot post right now');
  if (u.postingRestrictedUntil && u.postingRestrictedUntil > new Date())
    throw new AppError(403, `Posting is temporarily restricted until ${u.postingRestrictedUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC`, 'POSTING_RESTRICTED');
}

/** Runs layered moderation for new or edited text. Returns the status to store plus a case to persist. */
export async function evaluate(authorId: string, text: string, excludeId?: string) {
  const hash = contentHash(text);
  const since = new Date(Date.now() - 3600_000);
  const [dupPosts, dupComments, postsLastHour, commentsLastHour] = await Promise.all([
    prisma.communityPost.count({ where: { contentHash: hash, createdAt: { gte: new Date(Date.now() - DAY_MS) }, NOT: { id: excludeId } } }),
    prisma.communityComment.count({ where: { contentHash: hash, createdAt: { gte: new Date(Date.now() - DAY_MS) }, NOT: { id: excludeId } } }),
    prisma.communityPost.count({ where: { authorId, createdAt: { gte: since } } }),
    prisma.communityComment.count({ where: { authorId, createdAt: { gte: since } } }),
  ]);
  const extraTerms = await getSetting('moderation.extraTerms');
  const base = classifyText(text, { duplicateOfRecent: dupPosts + dupComments > 0 && text.trim().length > 15, postsLastHour: postsLastHour + commentsLastHour, extraBlockedTerms: [...extraTerms] });
  const p = provider();
  const result = await p.classify(text, base);
  const decision = decideModeration(result, await getSetting('moderation.thresholds'));
  return { hash, result, decision, providerName: p.name };
}

export async function recordCase(targetType: 'POST' | 'COMMENT', targetId: string, authorId: string, text: string, ev: Awaited<ReturnType<typeof evaluate>>) {
  const days = await getSetting('moderation.retentionDays');
  const c = await prisma.moderationCase.create({
    data: {
      targetType,
      targetId,
      authorId,
      originalText: text,
      provider: ev.providerName,
      categories: ev.result.categories,
      maxScore: ev.result.maxScore,
      scores: ev.result.scores,
      reasons: ev.result.reasons,
      outcome: ev.decision.outcome,
      needsHumanReview: ev.decision.needsHumanReview,
      safetyEscalated: ev.decision.safetyEscalated,
      retainUntil: new Date(Date.now() + days * DAY_MS),
    },
  });
  if (ev.decision.safetyEscalated) {
    await audit(null, 'SAFETY_REVIEW_ESCALATION', 'ModerationCase', c.id);
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
    for (const a of admins) await notify(a.id, { type: 'SAFETY_REVIEW', title: 'Safety review needed', body: 'A community item needs priority safety review.', key: `safety-review:${c.id}:${a.id}` });
  }
  return c;
}

/** Applies a status to the underlying content. */
export async function setContentStatus(targetType: string, targetId: string, status: ContentStatus) {
  const data = { status, removedAt: status === 'REMOVED' ? new Date() : null };
  if (targetType === 'POST') return prisma.communityPost.update({ where: { id: targetId }, data });
  return prisma.communityComment.update({ where: { id: targetId }, data });
}

// ---------- moderation workspace (admin) ----------

export async function listQueue(q: QueueQuery) {
  const where = QUEUE_FILTERS[q.view];
  const [items, total] = await Promise.all([
    prisma.moderationCase.findMany({
      where,
      orderBy: [{ safetyEscalated: 'desc' }, { maxScore: 'desc' }, { createdAt: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { appeals: true },
    }),
    prisma.moderationCase.count({ where }),
  ]);
  const reportCounts = await prisma.contentReport.groupBy({ by: ['targetId'], where: { targetId: { in: items.map((i) => i.targetId) }, resolvedAt: null }, _count: true });
  return paged(
    items.map((i) => ({ ...i, authorId: undefined, openReports: reportCounts.find((x) => x.targetId === i.targetId)?._count ?? 0 })),
    total,
    q.page,
    q.pageSize,
  );
}

/** Case detail: content + evidence + minimal author history (pseudonymous; no email or wellbeing data). */
export async function getCase(id: string) {
  const c = await prisma.moderationCase.findUnique({ where: { id }, include: { actions: { orderBy: { createdAt: 'desc' } }, appeals: true } });
  if (!c) throw notFound('Case');
  const content = c.targetType === 'POST' ? await prisma.communityPost.findUnique({ where: { id: c.targetId } }) : await prisma.communityComment.findUnique({ where: { id: c.targetId } });
  const author = await prisma.user.findUnique({ where: { id: c.authorId }, select: { status: true, moderationWarnings: true, postingRestrictedUntil: true, createdAt: true } });
  const priorCases = await prisma.moderationCase.groupBy({ by: ['outcome'], where: { authorId: c.authorId, id: { not: c.id } }, _count: true });
  const reports = await prisma.contentReport.findMany({ where: { targetType: c.targetType, targetId: c.targetId }, select: { reason: true, details: true, createdAt: true, resolution: true } });
  return { case: { ...c, authorId: undefined }, content: content && { status: content.status, body: content.body, pseudonym: content.pseudonym }, author: { ...author, priorCases }, reports };
}

export async function applyAction(moderatorId: string, caseId: string, input: CaseActionInput) {
  const c = await prisma.moderationCase.findUnique({ where: { id: caseId }, include: { appeals: { where: { status: 'OPEN' } } } });
  if (!c) throw notFound('Case');
  const resolve = () => prisma.moderationCase.update({ where: { id: c.id }, data: { resolvedAt: new Date(), needsHumanReview: false } });
  const closeReports = (resolution: string) =>
    prisma.contentReport.updateMany({ where: { targetType: c.targetType, targetId: c.targetId, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedBy: moderatorId, resolution } });

  switch (input.action) {
    case 'APPROVE':
    case 'RESTORE':
      await setContentStatus(c.targetType, c.targetId, 'APPROVED');
      await closeReports('DISMISSED');
      await resolve();
      break;
    case 'REMOVE':
      await setContentStatus(c.targetType, c.targetId, 'REMOVED');
      await closeReports('ACTIONED');
      await resolve();
      break;
    case 'DISMISS_REPORT':
      await closeReports('DISMISSED');
      await setContentStatus(c.targetType, c.targetId, 'APPROVED');
      await resolve();
      break;
    case 'WARN':
      await prisma.user.update({ where: { id: c.authorId }, data: { moderationWarnings: { increment: 1 } } });
      await notify(c.authorId, {
        type: 'MODERATION',
        title: 'Community guidelines reminder',
        body: 'One of your posts did not follow our community guidelines. Please review them before posting again.',
        key: `warn:${c.id}`,
      });
      break;
    case 'RESTRICT': {
      const until = new Date(Date.now() + (input.restrictDays ?? DEFAULT_RESTRICT_DAYS) * DAY_MS);
      await prisma.user.update({ where: { id: c.authorId }, data: { postingRestrictedUntil: until } });
      await notify(c.authorId, {
        type: 'MODERATION',
        title: 'Posting temporarily paused',
        body: 'Your ability to post in the community is temporarily paused. You can still use all other Sathi features.',
        key: `restrict:${c.id}`,
      });
      break;
    }
    case 'SUSPEND': // Human decision only; requires a note.
      if (!input.note) throw new AppError(400, 'A note is required to suspend an account');
      await prisma.user.update({ where: { id: c.authorId }, data: { status: 'SUSPENDED' } });
      await prisma.refreshToken.updateMany({ where: { userId: c.authorId, revokedAt: null }, data: { revokedAt: new Date() } });
      break;
    case 'ESCALATE':
      await prisma.moderationCase.update({ where: { id: c.id }, data: { safetyEscalated: true, needsHumanReview: true } });
      await audit(moderatorId, 'SAFETY_REVIEW_ESCALATION', 'ModerationCase', c.id);
      break;
    case 'APPEAL_UPHELD':
    case 'APPEAL_DENIED': {
      if (!c.appeals.length) throw new AppError(409, 'No open appeal');
      const upheld = input.action === 'APPEAL_UPHELD';
      await prisma.moderationAppeal.update({ where: { id: c.appeals[0].id }, data: { status: upheld ? 'UPHELD' : 'DENIED', decidedAt: new Date() } });
      await setContentStatus(c.targetType, c.targetId, upheld ? 'APPROVED' : c.outcome === 'REJECTED' ? 'REJECTED' : 'REMOVED');
      await resolve();
      await notify(c.authorId, {
        type: 'MODERATION',
        title: 'Appeal decision',
        body: upheld ? 'Your appeal was accepted and your content is visible again.' : 'Your appeal was reviewed and the original decision was kept.',
        key: `appeal:${c.appeals[0].id}`,
      });
      break;
    }
  }
  await prisma.moderationAction.create({ data: { caseId: c.id, moderatorId, targetUserId: c.authorId, action: input.action, note: input.note } });
  await audit(moderatorId, `MODERATION_${input.action}`, 'ModerationCase', c.id);
  return { done: true };
}
