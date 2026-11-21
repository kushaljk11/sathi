import { Router } from 'express';
import { z } from 'zod';
import { taskCompletionRate, whatChanged } from '@sathi/shared';
import { asyncH, ok, prisma, validate, HttpError, notFound, youthOf } from '../../lib/core';
import { authenticate, requireRole, type AuthUser } from '../../middleware/auth';
import { notify } from '../../lib/notify';
import { relationshipFor, requireConsent, recordMilestone, timeline } from './support.service';

const r = Router();
r.use(authenticate, requireRole('YOUTH', 'COUNSELOR'));
const id = (v: unknown) => z.string().uuid().parse(v);

// ---------- relationships ----------
r.get('/relationships', asyncH(async (req, res) => {
  const where = req.user!.role === 'YOUTH' ? { youth: { userId: req.user!.id } } : { counselor: { userId: req.user!.id } };
  ok(res, await prisma.supportRelationship.findMany({
    where, orderBy: { startedAt: 'desc' },
    include: {
      youth: { select: { id: true, ageGroup: true, user: { select: { displayName: true } } } },
      counselor: { select: { id: true, user: { select: { displayName: true } } } },
      appointments: { where: { startsAt: { gte: new Date() }, status: { in: ['CONFIRMED', 'PENDING_COUNSELOR'] } }, orderBy: { startsAt: 'asc' }, take: 1, select: { id: true, startsAt: true, mode: true, status: true } },
      plans: { where: { status: { in: ['ACTIVE', 'PROPOSED'] } }, select: { id: true, status: true } },
    },
  }));
}));

r.get('/relationships/:id', asyncH(async (req, res) => {
  const { rel, isCounselor } = await relationshipFor(id(req.params.id), req.user!);
  const sessions = await prisma.appointment.findMany({ where: { relationshipId: rel.id }, orderBy: { startsAt: 'desc' }, include: { sessionRecord: true, meeting: { select: { status: true } } } });
  ok(res, {
    id: rel.id, status: rel.status, startedAt: rel.startedAt, endedAt: rel.endedAt,
    youth: { id: rel.youth.id, name: rel.youth.user.displayName, ageGroup: isCounselor ? rel.youth.ageGroup : undefined },
    counselor: { id: rel.counselor.id, name: rel.counselor.user.displayName },
    sessions,
    timeline: await prisma.timelineEvent.findMany({ where: { relationshipId: rel.id }, orderBy: { occurredAt: 'desc' }, take: 100 }),
    milestones: await prisma.progressMilestone.findMany({ where: { OR: [{ relationshipId: rel.id }, { youthUserId: rel.youth.userId, relationshipId: null }] }, orderBy: { achievedAt: 'asc' } }),
    reviews: await prisma.progressReview.findMany({ where: { relationshipId: rel.id }, orderBy: { createdAt: 'desc' } }),
  });
}));

r.patch('/relationships/:id/status', requireRole('COUNSELOR', 'YOUTH'), asyncH(async (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CLOSED']) }), req.body);
  const { rel, isYouth } = await relationshipFor(id(req.params.id), req.user!);
  if (['COMPLETED', 'CLOSED'].includes(rel.status)) throw new HttpError(409, 'This relationship has ended');
  if (isYouth && status !== 'CLOSED') throw new HttpError(403, 'Youth can only end a relationship');
  await prisma.supportRelationship.update({ where: { id: rel.id }, data: { status, endedAt: ['COMPLETED', 'CLOSED'].includes(status) ? new Date() : null } });
  await timeline(rel.id, 'RELATIONSHIP', `Relationship ${status.toLowerCase()}`);
  ok(res, { status });
}));

// ---------- private counselor notes (counselor only; never shown to youth or admins) ----------
r.get('/relationships/:id/notes', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { rel } = await relationshipFor(id(req.params.id), req.user!, { counselorOnly: true });
  ok(res, await prisma.privateCounselorNote.findMany({ where: { relationshipId: rel.id }, orderBy: { createdAt: 'desc' } }));
}));
r.post('/relationships/:id/notes', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { body } = validate(z.object({ body: z.string().min(1).max(10000) }), req.body);
  const { rel } = await relationshipFor(id(req.params.id), req.user!, { counselorOnly: true });
  ok(res, await prisma.privateCounselorNote.create({ data: { relationshipId: rel.id, body } }), 201);
}));

// ---------- support plans with versions ----------
const planBody = z.object({ title: z.string().min(2).max(200), description: z.string().min(1).max(5000), startDate: z.coerce.date(), reviewDate: z.coerce.date() })
  .refine((p) => p.reviewDate > p.startDate, 'Review date must be after start date');

const planInclude = { versions: { orderBy: { version: 'desc' as const } }, goals: { include: { tasks: { include: { history: { orderBy: { changedAt: 'desc' as const }, take: 10 } } } }, orderBy: { startDate: 'asc' as const } } };

r.get('/relationships/:id/plans', asyncH(async (req, res) => {
  const { rel, isYouth } = await relationshipFor(id(req.params.id), req.user!);
  ok(res, await prisma.supportPlan.findMany({ where: { relationshipId: rel.id, ...(isYouth ? { status: { not: 'DRAFT' } } : {}) }, include: planInclude, orderBy: { createdAt: 'desc' } }));
}));

r.post('/relationships/:id/plans', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(planBody, req.body);
  const { rel } = await relationshipFor(id(req.params.id), req.user!, { counselorOnly: true, activeOnly: true });
  ok(res, await prisma.supportPlan.create({ data: { relationshipId: rel.id, versions: { create: { version: 1, ...b } } }, include: planInclude }), 201);
}));

async function planFor(planId: string, user: AuthUser | undefined) {
  const plan = await prisma.supportPlan.findUnique({ where: { id: planId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (!plan) throw notFound('Plan');
  const access = await relationshipFor(plan.relationshipId, user!);
  if (access.isYouth && plan.status === 'DRAFT') throw notFound('Plan');
  return { plan, ...access };
}

/** Edits never overwrite: each change creates a new version and returns the plan to DRAFT/PROPOSED. */
r.put('/plans/:planId', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(planBody, req.body);
  const { plan, isCounselor } = await planFor(id(req.params.planId), req.user);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  if (['COMPLETED', 'ARCHIVED'].includes(plan.status)) throw new HttpError(409, 'Plan is closed');
  const next = plan.currentVersion + 1;
  await prisma.$transaction([
    prisma.supportPlanVersion.create({ data: { planId: plan.id, version: next, ...b } }),
    prisma.supportPlan.update({ where: { id: plan.id }, data: { currentVersion: next, status: plan.status === 'ACTIVE' ? 'PROPOSED' : plan.status } }),
  ]);
  ok(res, await prisma.supportPlan.findUnique({ where: { id: plan.id }, include: planInclude }));
}));

r.post('/plans/:planId/status', asyncH(async (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['PROPOSED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']) }), req.body);
  const { plan, isYouth, isCounselor, rel } = await planFor(id(req.params.planId), req.user);
  const allowed: Record<string, { from: string[]; by: 'youth' | 'counselor' }> = {
    PROPOSED: { from: ['DRAFT', 'PAUSED'], by: 'counselor' },
    ACTIVE: { from: ['PROPOSED'], by: 'youth' }, // youth agreement activates the plan
    PAUSED: { from: ['ACTIVE'], by: 'counselor' },
    COMPLETED: { from: ['ACTIVE', 'PAUSED'], by: 'counselor' },
    ARCHIVED: { from: ['DRAFT', 'PROPOSED', 'PAUSED', 'COMPLETED'], by: 'counselor' },
  };
  const rule = allowed[status];
  if (!rule.from.includes(plan.status) || (rule.by === 'youth' ? !isYouth : !isCounselor)) throw new HttpError(409, `Cannot move plan from ${plan.status} to ${status}`);
  await prisma.$transaction(async (tx) => {
    await tx.supportPlan.update({ where: { id: plan.id }, data: { status } });
    if (status === 'ACTIVE') {
      await tx.supportPlanVersion.update({ where: { planId_version: { planId: plan.id, version: plan.currentVersion } }, data: { agreedAt: new Date() } });
      await recordMilestone(rel.youth.userId, 'PLAN_AGREED', rel.id, tx);
    }
    await timeline(rel.id, 'PLAN', `Support plan ${status.toLowerCase()}`, tx);
  });
  const notifyUser = isYouth ? rel.counselor.userId : rel.youth.userId;
  if (['PROPOSED', 'ACTIVE'].includes(status))
    await notify(notifyUser, { type: 'PLAN', title: status === 'PROPOSED' ? 'Support plan proposed' : 'Support plan agreed', body: 'Open Sathi to view your support plan.', key: `plan:${plan.id}:${status}:${plan.currentVersion}` });
  ok(res, { status });
}));

// ---------- goals ----------
const goalBody = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional(), startDate: z.coerce.date(), targetDate: z.coerce.date().optional() });
r.post('/plans/:planId/goals', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(goalBody, req.body);
  const { plan, isCounselor } = await planFor(id(req.params.planId), req.user);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  ok(res, await prisma.goal.create({ data: { ...b, planId: plan.id } }), 201);
}));

async function goalFor(goalId: string, user: AuthUser | undefined) {
  const g = await prisma.goal.findUnique({ where: { id: goalId }, include: { plan: true } });
  if (!g) throw notFound('Goal');
  return { goal: g, ...(await planFor(g.planId, user)) };
}

r.patch('/goals/:goalId', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(goalBody.partial().extend({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED']).optional() }), req.body);
  const { goal, isCounselor, rel } = await goalFor(id(req.params.goalId), req.user);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  const g = await prisma.goal.update({ where: { id: goal.id }, data: b });
  if (b.status === 'ACHIEVED' && goal.status !== 'ACHIEVED') {
    await recordMilestone(rel.youth.userId, 'GOAL_ACHIEVED', rel.id);
    await timeline(rel.id, 'GOAL', `Goal achieved: ${g.title}`);
  }
  ok(res, g);
}));

// ---------- tasks ----------
r.post('/goals/:goalId/tasks', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional(), dueDate: z.coerce.date().optional() }), req.body);
  const { goal, isCounselor, rel } = await goalFor(id(req.params.goalId), req.user);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  const t = await prisma.supportTask.create({ data: { ...b, goalId: goal.id, history: { create: { to: 'PENDING', changedBy: req.user!.id } } } });
  await notify(rel.youth.userId, { type: 'TASK', title: 'New task added', body: 'Your counselor added a task to your support plan.', key: `task-new:${t.id}` });
  ok(res, t, 201);
}));

/** Youth self-reports progress (never auto-completed). Counselor can review or cancel. */
r.patch('/tasks/:taskId', asyncH(async (req, res) => {
  const b = validate(z.object({
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'SKIPPED', 'CANCELLED']).optional(),
    youthUpdate: z.string().max(2000).optional(), reflection: z.string().max(2000).optional(), reviewed: z.boolean().optional(),
  }), req.body);
  const task = await prisma.supportTask.findUnique({ where: { id: id(req.params.taskId) } });
  if (!task) throw notFound('Task');
  const { isYouth, isCounselor, rel } = await goalFor(task.goalId, req.user);
  if (isYouth && (b.status === 'CANCELLED' || b.reviewed)) throw new HttpError(403, 'Only your counselor can cancel or review tasks');
  if (isCounselor && (b.youthUpdate || b.reflection || (b.status && b.status !== 'CANCELLED'))) throw new HttpError(403, 'Task progress is self-reported by the youth');
  const data = {
    ...(b.status ? { status: b.status, completedAt: ['COMPLETED', 'PARTIALLY_COMPLETED'].includes(b.status) ? new Date() : null } : {}),
    ...(b.youthUpdate !== undefined ? { youthUpdate: b.youthUpdate } : {}), ...(b.reflection !== undefined ? { reflection: b.reflection } : {}),
    ...(b.reviewed ? { counselorReviewedAt: new Date() } : {}),
  };
  const t = await prisma.$transaction(async (tx) => {
    const u = await tx.supportTask.update({ where: { id: task.id }, data });
    if (b.status && b.status !== task.status) await tx.taskStatusHistory.create({ data: { taskId: task.id, from: task.status, to: b.status, changedBy: req.user!.id } });
    return u;
  });
  if (isYouth && b.status) await notify(rel.counselor.userId, { type: 'TASK_UPDATE', title: 'Task update to review', body: 'A client updated a task.', key: `task-upd:${task.id}:${Date.now()}`, email: false });
  ok(res, t);
}));

// ---------- tasks list for youth dashboard ----------
r.get('/my-tasks', requireRole('YOUTH'), asyncH(async (req, res) => {
  ok(res, await prisma.supportTask.findMany({
    where: { goal: { plan: { status: 'ACTIVE', relationship: { youth: { userId: req.user!.id } } } }, status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE', 'PARTIALLY_COMPLETED'] } },
    include: { goal: { select: { title: true } } }, orderBy: { dueDate: 'asc' },
  }));
}));

// ---------- progress ----------
const range = z.object({ days: z.coerce.number().int().min(1).max(730).default(30), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

async function progressData(youthId: string, youthUserId: string, q: z.infer<typeof range>, relationshipId?: string, includeCheckins = true) {
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
  const appts = await prisma.appointment.findMany({ where: { youthId, ...(relationshipId ? { relationshipId } : {}), status: { in: ['COMPLETED', 'MISSED'] }, startsAt: { gte: from, lte: to } }, select: { status: true } });
  return {
    from, to,
    checkIns: includeCheckins ? current : null,
    whatChanged: includeCheckins ? whatChanged(current, previous) : null,
    tasks: { total: tasks.length, completionRate: taskCompletionRate(tasks.map((t) => t.status)), byStatus: tasks.reduce<Record<string, number>>((m, t) => ({ ...m, [t.status]: (m[t.status] ?? 0) + 1 }), {}) },
    goals: { total: goals.length, achieved: goals.filter((g) => g.status === 'ACHIEVED').length },
    attendance: { attended: appts.filter((a) => a.status === 'COMPLETED').length, missed: appts.filter((a) => a.status === 'MISSED').length },
    milestones: await prisma.progressMilestone.findMany({ where: { youthUserId }, orderBy: { achievedAt: 'asc' } }),
    note: 'Self-reported measures support reflection and conversation; they do not indicate clinical recovery. Missing check-ins are shown as gaps, not low scores.',
  };
}

r.get('/progress/me', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  ok(res, await progressData(y.id, req.user!.id, validate(range, req.query)));
}));

/** Counselor view: check-in trends only with active CHECKIN_TRENDS consent (logged). */
r.get('/relationships/:id/progress', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { rel } = await relationshipFor(id(req.params.id), req.user!, { counselorOnly: true });
  const active = ['ACTIVE', 'PAUSED'].includes(rel.status);
  const allowed = await requireConsent(req.user!, rel.youthId, rel.counselorId, 'CHECKIN_TRENDS', active);
  const data = await progressData(rel.youthId, rel.youth.userId, validate(range, req.query), rel.id, allowed);
  ok(res, { ...data, checkInConsent: allowed });
}));

/** Consent-gated access to the youth's Support Need Profile / assessment summary. */
r.get('/relationships/:id/shared-profile', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { rel } = await relationshipFor(id(req.params.id), req.user!, { counselorOnly: true });
  const active = ['ACTIVE', 'PAUSED'].includes(rel.status);
  const needOk = await requireConsent(req.user!, rel.youthId, rel.counselorId, 'SUPPORT_NEED_PROFILE', active);
  const assessOk = await requireConsent(req.user!, rel.youthId, rel.counselorId, 'ASSESSMENT_SUMMARY', active);
  const historyOk = await requireConsent(req.user!, rel.youthId, rel.counselorId, 'SUPPORT_HISTORY', active);
  ok(res, {
    needProfile: needOk ? await prisma.supportNeedProfile.findFirst({ where: { youthId: rel.youthId }, orderBy: { createdAt: 'desc' }, select: { concerns: true, impactLevel: true, durationBucket: true, desiredSupport: true, languages: true, mode: true, accessibility: true, createdAt: true } }) : null,
    assessment: assessOk ? await prisma.assessment.findFirst({ where: { youthId: rel.youthId, status: 'SUBMITTED' }, orderBy: { submittedAt: 'desc' }, select: { submittedAt: true, responses: { select: { questionKey: true, value: true } } } }) : null,
    history: historyOk ? await prisma.supportRelationship.findMany({ where: { youthId: rel.youthId, id: { not: rel.id } }, select: { status: true, startedAt: true, endedAt: true } }) : null,
    consent: { needProfile: needOk, assessment: assessOk, history: historyOk },
  });
}));

r.post('/relationships/:id/reviews', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(z.object({ outcome: z.string().min(1).max(3000), nextSteps: z.string().max(2000).optional(), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }), req.body);
  const { rel } = await relationshipFor(id(req.params.id), req.user!, { counselorOnly: true, activeOnly: true });
  const review = await prisma.progressReview.create({ data: { ...b, relationshipId: rel.id } });
  await recordMilestone(rel.youth.userId, 'FIRST_REVIEW', rel.id);
  await timeline(rel.id, 'REVIEW', 'Progress review completed');
  await notify(rel.youth.userId, { type: 'REVIEW', title: 'Progress review shared', body: 'Your counselor completed a progress review.', key: `review:${review.id}` });
  ok(res, review, 201);
}));

export default r;
