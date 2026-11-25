import { MOD_MESSAGES } from '@sathi/shared';
import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import { getSetting } from '../../helpers/settings.helper';
import { DAY_MS } from '../../utils/date.util';
import { paged } from '../../utils/pagination.util';
import { assertCanPost, evaluate, recordCase, setContentStatus } from '../moderation/moderation.service';
import { ESCALATING_REPORT_REASONS } from './community.constants';
import type { AppealInput, BlockInput, ContentType, CreateCommentInput, CreatePostInput, ListPostsQuery, ReactionInput, ReportInput } from './community.types';

const pseudonymFor = (userId: string) => `Member-${userId.slice(0, 4).toUpperCase()}`;

async function blockedIds(userId: string) {
  return (await prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } })).map((b) => b.blockedId);
}

const findContent = async (type: ContentType, id: string) => (type === 'POST' ? prisma.communityPost.findUnique({ where: { id } }) : prisma.communityComment.findUnique({ where: { id } }));

/** Public shape: never exposes authorId/email; marks own content. */
const shapePost = (p: { id: string; authorId: string; pseudonym: string; category: string; body: string; status: string; createdAt: Date }, me: string) => ({
  id: p.id,
  pseudonym: p.pseudonym,
  category: p.category,
  body: p.body,
  status: p.status,
  createdAt: p.createdAt,
  isMine: p.authorId === me,
});

export async function listPosts(userId: string, q: ListPostsQuery) {
  const where = { status: 'APPROVED' as const, authorId: { notIn: await blockedIds(userId) }, ...(q.category ? { category: q.category } : {}) };
  const [items, total] = await Promise.all([
    prisma.communityPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { _count: { select: { comments: { where: { status: 'APPROVED' } }, reactions: true } } },
    }),
    prisma.communityPost.count({ where }),
  ]);
  return paged(
    items.map((p) => ({ ...shapePost(p, userId), commentCount: p._count.comments, reactionCount: p._count.reactions })),
    total,
    q.page,
    q.pageSize,
  );
}

export async function createPost(userId: string, input: CreatePostInput) {
  await assertCanPost(userId);
  const ev = await evaluate(userId, input.body);
  const post = await prisma.communityPost.create({
    data: { authorId: userId, pseudonym: input.pseudonym ?? pseudonymFor(userId), category: input.category, body: input.body, contentHash: ev.hash, status: ev.decision.outcome },
  });
  const c = await recordCase('POST', post.id, userId, input.body, ev);
  return { post: shapePost(post, userId), status: post.status, message: ev.decision.userMessage, caseId: c.id };
}

export async function getPost(userId: string, postId: string) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  const blocked = await blockedIds(userId);
  if (!post || (post.status !== 'APPROVED' && post.authorId !== userId) || blocked.includes(post.authorId)) throw notFound('Post');
  const comments = await prisma.communityComment.findMany({
    where: { postId: post.id, authorId: { notIn: blocked }, OR: [{ status: 'APPROVED' }, { authorId: userId, status: { not: 'REMOVED' } }] },
    orderBy: { createdAt: 'asc' },
  });
  const reactions = await prisma.communityReaction.groupBy({ by: ['kind'], where: { postId: post.id }, _count: true });
  return { post: shapePost(post, userId), comments: comments.map((c) => ({ ...shapePost({ ...c, category: '' }, userId), parentId: c.parentId })), reactions };
}

export async function createComment(userId: string, postId: string, input: CreateCommentInput) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post || post.status !== 'APPROVED') throw notFound('Post');
  if (input.parentId && !(await prisma.communityComment.findFirst({ where: { id: input.parentId, postId: post.id, status: 'APPROVED' } }))) throw notFound('Comment');
  if (await prisma.userBlock.findFirst({ where: { blockerId: post.authorId, blockedId: userId } })) throw new AppError(403, 'You cannot reply to this post');
  await assertCanPost(userId);
  const ev = await evaluate(userId, input.body);
  const c = await prisma.communityComment.create({
    data: { postId: post.id, parentId: input.parentId, authorId: userId, pseudonym: pseudonymFor(userId), body: input.body, contentHash: ev.hash, status: ev.decision.outcome },
  });
  const mc = await recordCase('COMMENT', c.id, userId, input.body, ev);
  return {
    comment: { id: c.id, body: c.body, status: c.status, parentId: c.parentId, createdAt: c.createdAt, pseudonym: c.pseudonym, isMine: true },
    status: c.status,
    message: ev.decision.userMessage,
    caseId: mc.id,
  };
}

/** Author edits held/rejected content — re-moderated before publication. */
export async function editContent(userId: string, type: ContentType, id: string, body: string) {
  const item = await findContent(type, id);
  if (!item || item.authorId !== userId) throw notFound('Content');
  if (item.status === 'REMOVED') throw new AppError(409, 'Removed content cannot be edited');
  await assertCanPost(userId);
  const ev = await evaluate(userId, body, id);
  const data = { body, contentHash: ev.hash, status: ev.decision.outcome };
  if (type === 'POST') await prisma.communityPost.update({ where: { id }, data });
  else await prisma.communityComment.update({ where: { id }, data });
  const mc = await recordCase(type, id, userId, body, ev);
  return { status: ev.decision.outcome, message: ev.decision.userMessage, caseId: mc.id };
}

export async function removeContent(userId: string, type: ContentType, id: string) {
  const item = await findContent(type, id);
  if (!item || item.authorId !== userId) throw notFound('Content');
  await setContentStatus(type, id, 'REMOVED');
  return { removed: true };
}

export async function toggleReaction(userId: string, postId: string, { kind }: ReactionInput) {
  const post = await prisma.communityPost.findFirst({ where: { id: postId, status: 'APPROVED' } });
  if (!post) throw notFound('Post');
  const existing = await prisma.communityReaction.findUnique({ where: { postId_userId_kind: { postId: post.id, userId, kind } } });
  if (existing) await prisma.communityReaction.delete({ where: { id: existing.id } });
  else await prisma.communityReaction.create({ data: { postId: post.id, userId, kind } });
  return { reacted: !existing };
}

/** Reports: repeated independent reports send content back to review. */
export async function reportContent(userId: string, input: ReportInput) {
  const item = await findContent(input.targetType, input.targetId);
  if (!item || item.status !== 'APPROVED') throw notFound('Content');
  if (item.authorId === userId) throw new AppError(400, 'You cannot report your own content');
  await prisma.contentReport.create({ data: { reporterId: userId, ...input } });
  const open = await prisma.contentReport.count({ where: { targetType: input.targetType, targetId: input.targetId, resolvedAt: null } });
  const threshold = await getSetting('moderation.reportsToFlag');
  const escalating = ESCALATING_REPORT_REASONS.includes(input.reason);
  if (open >= threshold || escalating) {
    await setContentStatus(input.targetType, input.targetId, 'FLAGGED');
    await prisma.moderationCase.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        authorId: item.authorId,
        originalText: item.body,
        provider: 'user-reports',
        categories: [input.reason],
        maxScore: 0,
        scores: {},
        reasons: [`${open} community report(s)`],
        outcome: 'FLAGGED',
        needsHumanReview: true,
        safetyEscalated: escalating,
        retainUntil: new Date(Date.now() + (await getSetting('moderation.retentionDays')) * DAY_MS),
      },
    });
  }
  return { reported: true, message: 'Thank you. Our moderators will review this.' };
}

export const listBlocks = (userId: string) => prisma.userBlock.findMany({ where: { blockerId: userId }, select: { id: true, createdAt: true } });

export async function blockAuthor(userId: string, input: BlockInput) {
  const item = await findContent(input.targetType, input.targetId);
  if (!item) throw notFound('Content');
  if (item.authorId === userId) throw new AppError(400, 'You cannot block yourself');
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: item.authorId } },
    update: {},
    create: { blockerId: userId, blockedId: item.authorId },
  });
  return { blocked: true };
}

export async function unblock(userId: string, id: string) {
  await prisma.userBlock.deleteMany({ where: { id, blockerId: userId } });
  return { unblocked: true };
}

/** The author's own content with moderation status and appeal options (no internal rule details). */
export async function myContent(userId: string) {
  const [posts, comments] = await Promise.all([
    prisma.communityPost.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.communityComment.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  const cases = await prisma.moderationCase.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' }, include: { appeals: { select: { status: true } } } });
  const latest = (id: string) => cases.find((c) => c.targetId === id);
  const msg = (s: string) =>
    (
      ({
        FLAGGED: MOD_MESSAGES.held,
        HIDDEN: MOD_MESSAGES.hidden,
        REJECTED: MOD_MESSAGES.rejected,
        APPEALED: 'Your appeal is being reviewed.',
        REMOVED: 'This content was removed for breaking community guidelines.',
      }) as Record<string, string>
    )[s];
  const shape = (type: ContentType, i: { id: string; body: string; status: string; createdAt: Date }) => {
    const c = latest(i.id);
    return {
      type,
      id: i.id,
      body: i.body,
      status: i.status,
      createdAt: i.createdAt,
      message: msg(i.status),
      caseId: c?.id,
      canAppeal: !!c && ['HIDDEN', 'REJECTED', 'REMOVED'].includes(i.status) && !c.appeals.length,
      appealStatus: c?.appeals[0]?.status,
    };
  };
  return [...posts.map((p) => shape('POST', p)), ...comments.map((c) => shape('COMMENT', c))].sort((a, b) => +b.createdAt - +a.createdAt);
}

export async function submitAppeal(userId: string, input: AppealInput) {
  const c = await prisma.moderationCase.findUnique({ where: { id: input.caseId } });
  if (!c || c.authorId !== userId) throw notFound('Decision');
  const appeal = await prisma.moderationAppeal.create({ data: { caseId: c.id, authorId: userId, message: input.message } });
  await prisma.moderationCase.update({ where: { id: c.id }, data: { needsHumanReview: true, resolvedAt: null } });
  await setContentStatus(c.targetType, c.targetId, 'APPEALED');
  return { appealId: appeal.id, message: 'Your appeal has been submitted. A moderator will review it.' };
}
