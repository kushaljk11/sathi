import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { MOD_MESSAGES } from '@sathi/shared';
import { asyncH, ok, prisma, validate, HttpError, notFound, pageQuery, paged, getSetting } from '../../lib/core';
import { authenticate } from '../../middleware/auth';
import { assertCanPost, evaluate, recordCase, setContentStatus } from './moderation/moderation.service';

const r = Router();
r.use(authenticate);
const uuid = (v: unknown) => z.string().uuid().parse(v);
const postLimiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => req.user!.id });

export const CATEGORIES = ['general', 'stress', 'study', 'relationships', 'family', 'wellbeing-tips', 'recovery'];
const pseudonymFor = (userId: string) => `Member-${userId.slice(0, 4).toUpperCase()}`;

async function blockedIds(userId: string) {
  return (await prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } })).map((b) => b.blockedId);
}
/** Public shape: never exposes authorId/email; marks own content. */
const shapePost = (p: { id: string; authorId: string; pseudonym: string; category: string; body: string; status: string; createdAt: Date }, me: string) => ({
  id: p.id, pseudonym: p.pseudonym, category: p.category, body: p.body, status: p.status, createdAt: p.createdAt, isMine: p.authorId === me,
});

r.get('/categories', (_req, res) => { ok(res, CATEGORIES); });

r.get('/posts', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ category: z.string().optional() }), req.query);
  const where = { status: 'APPROVED' as const, authorId: { notIn: await blockedIds(req.user!.id) }, ...(q.category ? { category: q.category } : {}) };
  const [items, total] = await Promise.all([
    prisma.communityPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { _count: { select: { comments: { where: { status: 'APPROVED' } }, reactions: true } } } }),
    prisma.communityPost.count({ where }),
  ]);
  ok(res, paged(items.map((p) => ({ ...shapePost(p, req.user!.id), commentCount: p._count.comments, reactionCount: p._count.reactions })), total, q.page, q.pageSize));
}));

r.post('/posts', postLimiter, asyncH(async (req, res) => {
  const b = validate(z.object({ category: z.enum(CATEGORIES as [string, ...string[]]), body: z.string().trim().min(3).max(4000), pseudonym: z.string().trim().min(2).max(30).optional() }), req.body);
  await assertCanPost(req.user!.id);
  const ev = await evaluate(req.user!.id, b.body);
  const post = await prisma.communityPost.create({ data: { authorId: req.user!.id, pseudonym: b.pseudonym ?? pseudonymFor(req.user!.id), category: b.category, body: b.body, contentHash: ev.hash, status: ev.decision.outcome } });
  const c = await recordCase('POST', post.id, req.user!.id, b.body, ev);
  ok(res, { post: shapePost(post, req.user!.id), status: post.status, message: ev.decision.userMessage, caseId: c.id }, 201);
}));

r.get('/posts/:id', asyncH(async (req, res) => {
  const post = await prisma.communityPost.findUnique({ where: { id: uuid(req.params.id) } });
  const blocked = await blockedIds(req.user!.id);
  if (!post || (post.status !== 'APPROVED' && post.authorId !== req.user!.id) || blocked.includes(post.authorId)) throw notFound('Post');
  const comments = await prisma.communityComment.findMany({
    where: { postId: post.id, authorId: { notIn: blocked }, OR: [{ status: 'APPROVED' }, { authorId: req.user!.id, status: { not: 'REMOVED' } }] }, orderBy: { createdAt: 'asc' },
  });
  const reactions = await prisma.communityReaction.groupBy({ by: ['kind'], where: { postId: post.id }, _count: true });
  ok(res, { post: shapePost(post, req.user!.id), comments: comments.map((c) => ({ ...shapePost({ ...c, category: '' }, req.user!.id), parentId: c.parentId })), reactions });
}));

r.post('/posts/:id/comments', postLimiter, asyncH(async (req, res) => {
  const b = validate(z.object({ body: z.string().trim().min(1).max(2000), parentId: z.string().uuid().optional() }), req.body);
  const post = await prisma.communityPost.findUnique({ where: { id: uuid(req.params.id) } });
  if (!post || post.status !== 'APPROVED') throw notFound('Post');
  if (b.parentId && !(await prisma.communityComment.findFirst({ where: { id: b.parentId, postId: post.id, status: 'APPROVED' } }))) throw notFound('Comment');
  if (await prisma.userBlock.findFirst({ where: { blockerId: post.authorId, blockedId: req.user!.id } })) throw new HttpError(403, 'You cannot reply to this post');
  await assertCanPost(req.user!.id);
  const ev = await evaluate(req.user!.id, b.body);
  const c = await prisma.communityComment.create({ data: { postId: post.id, parentId: b.parentId, authorId: req.user!.id, pseudonym: pseudonymFor(req.user!.id), body: b.body, contentHash: ev.hash, status: ev.decision.outcome } });
  const mc = await recordCase('COMMENT', c.id, req.user!.id, b.body, ev);
  ok(res, { comment: { id: c.id, body: c.body, status: c.status, parentId: c.parentId, createdAt: c.createdAt, pseudonym: c.pseudonym, isMine: true }, status: c.status, message: ev.decision.userMessage, caseId: mc.id }, 201);
}));

/** Author edits held/rejected content — re-moderated before publication. */
r.put('/content/:type/:id', postLimiter, asyncH(async (req, res) => {
  const type = z.enum(['POST', 'COMMENT']).parse(req.params.type);
  const { body } = validate(z.object({ body: z.string().trim().min(1).max(type === 'POST' ? 4000 : 2000) }), req.body);
  const id = uuid(req.params.id);
  const item = type === 'POST' ? await prisma.communityPost.findUnique({ where: { id } }) : await prisma.communityComment.findUnique({ where: { id } });
  if (!item || item.authorId !== req.user!.id) throw notFound('Content');
  if (item.status === 'REMOVED') throw new HttpError(409, 'Removed content cannot be edited');
  await assertCanPost(req.user!.id);
  const ev = await evaluate(req.user!.id, body, id);
  const data = { body, contentHash: ev.hash, status: ev.decision.outcome };
  if (type === 'POST') await prisma.communityPost.update({ where: { id }, data });
  else await prisma.communityComment.update({ where: { id }, data });
  const mc = await recordCase(type, id, req.user!.id, body, ev);
  ok(res, { status: ev.decision.outcome, message: ev.decision.userMessage, caseId: mc.id });
}));

r.delete('/content/:type/:id', asyncH(async (req, res) => {
  const type = z.enum(['POST', 'COMMENT']).parse(req.params.type);
  const id = uuid(req.params.id);
  const item = type === 'POST' ? await prisma.communityPost.findUnique({ where: { id } }) : await prisma.communityComment.findUnique({ where: { id } });
  if (!item || item.authorId !== req.user!.id) throw notFound('Content');
  await setContentStatus(type, id, 'REMOVED');
  ok(res, { removed: true });
}));

r.post('/posts/:id/reactions', asyncH(async (req, res) => {
  const { kind } = validate(z.object({ kind: z.enum(['SUPPORT', 'RELATE', 'THANKS']) }), req.body);
  const post = await prisma.communityPost.findFirst({ where: { id: uuid(req.params.id), status: 'APPROVED' } });
  if (!post) throw notFound('Post');
  const existing = await prisma.communityReaction.findUnique({ where: { postId_userId_kind: { postId: post.id, userId: req.user!.id, kind } } });
  if (existing) await prisma.communityReaction.delete({ where: { id: existing.id } });
  else await prisma.communityReaction.create({ data: { postId: post.id, userId: req.user!.id, kind } });
  ok(res, { reacted: !existing });
}));

/** Reports: repeated independent reports send content back to review. */
r.post('/reports', asyncH(async (req, res) => {
  const b = validate(z.object({ targetType: z.enum(['POST', 'COMMENT']), targetId: z.string().uuid(), reason: z.enum(['spam', 'bullying', 'harassment', 'hate', 'threat', 'personal-info', 'self-harm-concern', 'other']), details: z.string().max(1000).optional() }), req.body);
  const item = b.targetType === 'POST' ? await prisma.communityPost.findUnique({ where: { id: b.targetId } }) : await prisma.communityComment.findUnique({ where: { id: b.targetId } });
  if (!item || item.status !== 'APPROVED') throw notFound('Content');
  if (item.authorId === req.user!.id) throw new HttpError(400, 'You cannot report your own content');
  await prisma.contentReport.create({ data: { reporterId: req.user!.id, ...b } });
  const open = await prisma.contentReport.count({ where: { targetType: b.targetType, targetId: b.targetId, resolvedAt: null } });
  const threshold = await getSetting('moderation.reportsToFlag');
  if (open >= threshold || ['threat', 'self-harm-concern'].includes(b.reason)) {
    await setContentStatus(b.targetType, b.targetId, 'FLAGGED');
    await prisma.moderationCase.create({
      data: { targetType: b.targetType, targetId: b.targetId, authorId: item.authorId, originalText: item.body, provider: 'user-reports', categories: [b.reason], maxScore: 0, scores: {}, reasons: [`${open} community report(s)`], outcome: 'FLAGGED', needsHumanReview: true, safetyEscalated: ['threat', 'self-harm-concern'].includes(b.reason), retainUntil: new Date(Date.now() + (await getSetting('moderation.retentionDays')) * 864e5) },
    });
  }
  ok(res, { reported: true, message: 'Thank you. Our moderators will review this.' }, 201);
}));

r.get('/blocks', asyncH(async (req, res) => ok(res, (await prisma.userBlock.findMany({ where: { blockerId: req.user!.id }, select: { id: true, createdAt: true } })))));
r.post('/blocks', asyncH(async (req, res) => {
  const b = validate(z.object({ targetType: z.enum(['POST', 'COMMENT']), targetId: z.string().uuid() }), req.body);
  const item = b.targetType === 'POST' ? await prisma.communityPost.findUnique({ where: { id: b.targetId } }) : await prisma.communityComment.findUnique({ where: { id: b.targetId } });
  if (!item) throw notFound('Content');
  if (item.authorId === req.user!.id) throw new HttpError(400, 'You cannot block yourself');
  await prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: item.authorId } }, update: {}, create: { blockerId: req.user!.id, blockedId: item.authorId } });
  ok(res, { blocked: true }, 201);
}));
r.delete('/blocks/:id', asyncH(async (req, res) => {
  await prisma.userBlock.deleteMany({ where: { id: uuid(req.params.id), blockerId: req.user!.id } });
  ok(res, { unblocked: true });
}));

/** The author's own content with moderation status and appeal options (no internal rule details). */
r.get('/my-content', asyncH(async (req, res) => {
  const [posts, comments] = await Promise.all([
    prisma.communityPost.findMany({ where: { authorId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.communityComment.findMany({ where: { authorId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  const cases = await prisma.moderationCase.findMany({ where: { authorId: req.user!.id }, orderBy: { createdAt: 'desc' }, include: { appeals: { select: { status: true } } } });
  const latest = (id: string) => cases.find((c) => c.targetId === id);
  const msg = (s: string) => ({ FLAGGED: MOD_MESSAGES.held, HIDDEN: MOD_MESSAGES.hidden, REJECTED: MOD_MESSAGES.rejected, APPEALED: 'Your appeal is being reviewed.', REMOVED: 'This content was removed for breaking community guidelines.' } as Record<string, string>)[s];
  const shape = (type: 'POST' | 'COMMENT', i: { id: string; body: string; status: string; createdAt: Date }) => {
    const c = latest(i.id);
    return { type, id: i.id, body: i.body, status: i.status, createdAt: i.createdAt, message: msg(i.status), caseId: c?.id, canAppeal: !!c && ['HIDDEN', 'REJECTED', 'REMOVED'].includes(i.status) && !c.appeals.length, appealStatus: c?.appeals[0]?.status };
  };
  ok(res, [...posts.map((p) => shape('POST', p)), ...comments.map((c) => shape('COMMENT', c))].sort((a, b) => +b.createdAt - +a.createdAt));
}));

r.post('/appeals', asyncH(async (req, res) => {
  const b = validate(z.object({ caseId: z.string().uuid(), message: z.string().trim().min(5).max(1000) }), req.body);
  const c = await prisma.moderationCase.findUnique({ where: { id: b.caseId } });
  if (!c || c.authorId !== req.user!.id) throw notFound('Decision');
  const appeal = await prisma.moderationAppeal.create({ data: { caseId: c.id, authorId: req.user!.id, message: b.message } });
  await prisma.moderationCase.update({ where: { id: c.id }, data: { needsHumanReview: true, resolvedAt: null } });
  await setContentStatus(c.targetType, c.targetId, 'APPEALED');
  ok(res, { appealId: appeal.id, message: 'Your appeal has been submitted. A moderator will review it.' }, 201);
}));

export default r;
