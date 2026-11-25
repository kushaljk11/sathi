import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import type { AuthUser } from '../../core/middleware/auth.middleware';
import { notify } from '../../helpers/notification.helper';
import { recordMilestone, relationshipFor, timeline } from '../support/support.service';
import { OPEN_TASK_STATUSES, PLAN_INCLUDE, PLAN_TRANSITIONS } from './plans.constants';
import type { GoalInput, PlanInput, PlanStatusInput, TaskInput, UpdateGoalInput, UpdateTaskInput } from './plans.types';

async function planFor(planId: string, user: AuthUser) {
  const plan = await prisma.supportPlan.findUnique({ where: { id: planId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (!plan) throw notFound('Plan');
  const access = await relationshipFor(plan.relationshipId, user);
  if (access.isYouth && plan.status === 'DRAFT') throw notFound('Plan');
  return { plan, ...access };
}

async function goalFor(goalId: string, user: AuthUser) {
  const g = await prisma.goal.findUnique({ where: { id: goalId }, include: { plan: true } });
  if (!g) throw notFound('Goal');
  return { goal: g, ...(await planFor(g.planId, user)) };
}

// ---------- support plans with versions ----------
export async function listPlans(relationshipId: string, user: AuthUser) {
  const { rel, isYouth } = await relationshipFor(relationshipId, user);
  return prisma.supportPlan.findMany({ where: { relationshipId: rel.id, ...(isYouth ? { status: { not: 'DRAFT' } } : {}) }, include: PLAN_INCLUDE, orderBy: { createdAt: 'desc' } });
}

export async function createPlan(relationshipId: string, user: AuthUser, input: PlanInput) {
  const { rel } = await relationshipFor(relationshipId, user, { counselorOnly: true, activeOnly: true });
  return prisma.supportPlan.create({ data: { relationshipId: rel.id, versions: { create: { version: 1, ...input } } }, include: PLAN_INCLUDE });
}

/** Edits never overwrite: each change creates a new version and returns the plan to DRAFT/PROPOSED. */
export async function updatePlan(planId: string, user: AuthUser, input: PlanInput) {
  const { plan, isCounselor } = await planFor(planId, user);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  if (['COMPLETED', 'ARCHIVED'].includes(plan.status)) throw new AppError(409, 'Plan is closed');
  const next = plan.currentVersion + 1;
  await prisma.$transaction([
    prisma.supportPlanVersion.create({ data: { planId: plan.id, version: next, ...input } }),
    prisma.supportPlan.update({ where: { id: plan.id }, data: { currentVersion: next, status: plan.status === 'ACTIVE' ? 'PROPOSED' : plan.status } }),
  ]);
  return prisma.supportPlan.findUnique({ where: { id: plan.id }, include: PLAN_INCLUDE });
}

export async function updatePlanStatus(planId: string, user: AuthUser, { status }: PlanStatusInput) {
  const { plan, isYouth, isCounselor, rel } = await planFor(planId, user);
  const rule = PLAN_TRANSITIONS[status];
  if (!rule.from.includes(plan.status) || (rule.by === 'youth' ? !isYouth : !isCounselor)) throw new AppError(409, `Cannot move plan from ${plan.status} to ${status}`);
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
    await notify(notifyUser, {
      type: 'PLAN',
      title: status === 'PROPOSED' ? 'Support plan proposed' : 'Support plan agreed',
      body: 'Open Sathi to view your support plan.',
      key: `plan:${plan.id}:${status}:${plan.currentVersion}`,
    });
  return { status };
}

// ---------- goals ----------
export async function createGoal(planId: string, user: AuthUser, input: GoalInput) {
  const { plan, isCounselor } = await planFor(planId, user);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  return prisma.goal.create({ data: { ...input, planId: plan.id } });
}

export async function updateGoal(goalId: string, user: AuthUser, input: UpdateGoalInput) {
  const { goal, isCounselor, rel } = await goalFor(goalId, user);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  const g = await prisma.goal.update({ where: { id: goal.id }, data: input });
  if (input.status === 'ACHIEVED' && goal.status !== 'ACHIEVED') {
    await recordMilestone(rel.youth.userId, 'GOAL_ACHIEVED', rel.id);
    await timeline(rel.id, 'GOAL', `Goal achieved: ${g.title}`);
  }
  return g;
}

// ---------- tasks ----------
export async function createTask(goalId: string, user: AuthUser, input: TaskInput) {
  const { goal, isCounselor, rel } = await goalFor(goalId, user);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  const t = await prisma.supportTask.create({ data: { ...input, goalId: goal.id, history: { create: { to: 'PENDING', changedBy: user.id } } } });
  await notify(rel.youth.userId, { type: 'TASK', title: 'New task added', body: 'Your counselor added a task to your support plan.', key: `task-new:${t.id}` });
  return t;
}

/** Youth self-reports progress (never auto-completed). Counselor can review or cancel. */
export async function updateTask(taskId: string, user: AuthUser, input: UpdateTaskInput) {
  const task = await prisma.supportTask.findUnique({ where: { id: taskId } });
  if (!task) throw notFound('Task');
  const { isYouth, isCounselor, rel } = await goalFor(task.goalId, user);
  if (isYouth && (input.status === 'CANCELLED' || input.reviewed)) throw new AppError(403, 'Only your counselor can cancel or review tasks');
  if (isCounselor && (input.youthUpdate || input.reflection || (input.status && input.status !== 'CANCELLED'))) throw new AppError(403, 'Task progress is self-reported by the youth');
  const data = {
    ...(input.status ? { status: input.status, completedAt: ['COMPLETED', 'PARTIALLY_COMPLETED'].includes(input.status) ? new Date() : null } : {}),
    ...(input.youthUpdate !== undefined ? { youthUpdate: input.youthUpdate } : {}),
    ...(input.reflection !== undefined ? { reflection: input.reflection } : {}),
    ...(input.reviewed ? { counselorReviewedAt: new Date() } : {}),
  };
  const t = await prisma.$transaction(async (tx) => {
    const u = await tx.supportTask.update({ where: { id: task.id }, data });
    if (input.status && input.status !== task.status) await tx.taskStatusHistory.create({ data: { taskId: task.id, from: task.status, to: input.status, changedBy: user.id } });
    return u;
  });
  if (isYouth && input.status) await notify(rel.counselor.userId, { type: 'TASK_UPDATE', title: 'Task update to review', body: 'A client updated a task.', key: `task-upd:${task.id}:${Date.now()}`, email: false });
  return t;
}

/** Open tasks for the youth dashboard. */
export function listMyTasks(userId: string) {
  return prisma.supportTask.findMany({
    where: { goal: { plan: { status: 'ACTIVE', relationship: { youth: { userId } } } }, status: { in: [...OPEN_TASK_STATUSES] } },
    include: { goal: { select: { title: true } } },
    orderBy: { dueDate: 'asc' },
  });
}
