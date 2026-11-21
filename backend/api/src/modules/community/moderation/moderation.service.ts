import { createHash } from 'node:crypto';
import { classifyText, decideModeration, normalizeForDuplicate, type ModResult, type ModCategory } from '@sathi/shared';
import { prisma, HttpError, getSetting, audit } from '../../../lib/core';
import { env } from '../../../lib/env';
import { notify } from '../../../lib/notify';

export const contentHash = (text: string) => createHash('sha256').update(normalizeForDuplicate(text)).digest('hex');

/** Provider abstraction: local rules always run; an external provider (Perspective) may add signal for supported languages. */
export interface ModerationProvider { name: string; classify(text: string, base: ModResult): Promise<ModResult> }

export const localProvider: ModerationProvider = { name: 'local-rules-v1', classify: async (_t, base) => base };

export const perspectiveProvider: ModerationProvider = {
  name: 'perspective+local',
  async classify(text, base) {
    if (!env.PERSPECTIVE_API_KEY || base.language !== 'en') return base; // unsupported → local rules + human review path
    try {
      const res = await fetch(`https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${env.PERSPECTIVE_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ comment: { text }, languages: ['en'], doNotStore: true, requestedAttributes: { TOXICITY: {}, INSULT: {}, IDENTITY_ATTACK: {}, THREAT: {} } }),
      });
      const j = (await res.json()) as { attributeScores?: Record<string, { summaryScore: { value: number } }> };
      const v = (k: string) => j.attributeScores?.[k]?.summaryScore.value ?? 0;
      const scores = { ...base.scores };
      const merge = (c: ModCategory, x: number) => { scores[c] = Math.max(scores[c], x); };
      merge('bullying', v('INSULT')); merge('hate', v('IDENTITY_ATTACK')); merge('threat', v('THREAT')); merge('harassment', v('TOXICITY') * 0.9);
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
  if (u.status !== 'ACTIVE') throw new HttpError(403, 'Your account cannot post right now');
  if (u.postingRestrictedUntil && u.postingRestrictedUntil > new Date())
    throw new HttpError(403, `Posting is temporarily restricted until ${u.postingRestrictedUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC`, 'POSTING_RESTRICTED');
}

/** Runs layered moderation for new or edited text. Returns the status to store plus a case to persist. */
export async function evaluate(authorId: string, text: string, excludeId?: string) {
  const hash = contentHash(text);
  const since = new Date(Date.now() - 3600_000);
  const [dupPosts, dupComments, postsLastHour, commentsLastHour] = await Promise.all([
    prisma.communityPost.count({ where: { contentHash: hash, createdAt: { gte: new Date(Date.now() - 864e5) }, NOT: { id: excludeId } } }),
    prisma.communityComment.count({ where: { contentHash: hash, createdAt: { gte: new Date(Date.now() - 864e5) }, NOT: { id: excludeId } } }),
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
      targetType, targetId, authorId, originalText: text, provider: ev.providerName, categories: ev.result.categories, maxScore: ev.result.maxScore,
      scores: ev.result.scores, reasons: ev.result.reasons, outcome: ev.decision.outcome, needsHumanReview: ev.decision.needsHumanReview,
      safetyEscalated: ev.decision.safetyEscalated, retainUntil: new Date(Date.now() + days * 864e5),
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
export async function setContentStatus(targetType: string, targetId: string, status: 'APPROVED' | 'FLAGGED' | 'HIDDEN' | 'REMOVED' | 'REJECTED' | 'APPEALED') {
  const data = { status, removedAt: status === 'REMOVED' ? new Date() : null };
  if (targetType === 'POST') return prisma.communityPost.update({ where: { id: targetId }, data });
  return prisma.communityComment.update({ where: { id: targetId }, data });
}
