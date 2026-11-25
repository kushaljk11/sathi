import { taskCompletionRate, whatChanged } from '@sathi/shared';
import { prisma } from '../../config/database';
import type { AuthUser } from '../../core/middleware/auth.middleware';
import { notify } from '../../helpers/notification.helper';
import { youthOf } from '../../helpers/identity.helper';
import { recordMilestone, relationshipFor, requireConsent, timeline } from '../support/support.service';
import { PROGRESS_DISCLAIMER } from './progress.constants';
import type { CreateReviewInput, ProgressRangeQuery } from './progress.types';

async function progressData(youthId: string, youthUserId: string, q: ProgressRangeQuery, relationshipId?: string, includeCheckins = true) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - q.days * 864e5);
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const [current, previous] = includeCheckins
    ? await Promise.all([
        prisma.wellbeingCheckIn.findMany({ where: { youthId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' } }),
        prisma.wellbeingCheckIn.findMany({ where: { youthId, createdAt: { gte: prevFrom, lt: from } } }),
      ])
    : [[], []];
  const relFilter = relationshipId ? { relationshipId } : { relationship: { youthId } };
  const tasks = await prisma.supportTask.findMany({ where: { goal: { plan: relFilter } }, select: { status: true, dueDate: true, completedAt: true } });
  const goals = await prisma.goal.findMany({ where: { plan: relFilter }, select: { status: true, title: true } });
  const appts = await prisma.appointment.findMany({
    where: { youthId, ...(relationshipId ? { relationshipId } : {}), status: { in: ['COMPLETED', 'MISSED'] }, startsAt: { gte: from, lte: to } },
    select: { status: true },
  });
  return {
    from,
    to,
    checkIns: includeCheckins ? current : null,
    whatChanged: includeCheckins ? whatChanged(current, previous) : null,
    tasks: {
      total: tasks.length,
      completionRate: taskCompletionRate(tasks.map((t) => t.status)),
      byStatus: tasks.reduce<Record<string, number>>((m, t) => ({ ...m, [t.status]: (m[t.status] ?? 0) + 1 }), {}),
    },
    goals: { total: goals.length, achieved: goals.filter((g) => g.status === 'ACHIEVED').length },
    attendance: { attended: appts.filter((a) => a.status === 'COMPLETED').length, missed: appts.filter((a) => a.status === 'MISSED').length },
    milestones: await prisma.progressMilestone.findMany({ where: { youthUserId }, orderBy: { achievedAt: 'asc' } }),
    note: PROGRESS_DISCLAIMER,
  };
}

export async function getMyProgress(userId: string, q: ProgressRangeQuery) {
  const y = await youthOf(userId);
  return progressData(y.id, userId, q);
}

/** Counselor view: check-in trends only with active CHECKIN_TRENDS consent (logged). */
export async function getRelationshipProgress(relationshipId: string, user: AuthUser, q: ProgressRangeQuery) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true });
  const active = ['ACTIVE', 'PAUSED'].includes(rel.status);
  const allowed = await requireConsent(user, rel.youthId, rel.counselorId, 'CHECKIN_TRENDS', active);
  const data = await progressData(rel.youthId, rel.youth.userId, q, rel.id, allowed);
  return { ...data, checkInConsent: allowed };
}

export async function createReview(relationshipId: string, user: AuthUser, input: CreateReviewInput) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true, activeOnly: true });
  const review = await prisma.progressReview.create({ data: { ...input, relationshipId: rel.id } });
  await recordMilestone(rel.youth.userId, 'FIRST_REVIEW', rel.id);
  await timeline(rel.id, 'REVIEW', 'Progress review completed');
  await notify(rel.youth.userId, { type: 'REVIEW', title: 'Progress review shared', body: 'Your counselor completed a progress review.', key: `review:${review.id}` });
  return review;
}
