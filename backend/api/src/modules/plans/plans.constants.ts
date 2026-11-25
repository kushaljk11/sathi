import type { PlanTransitionRule } from './plans.types';

export const PLAN_INCLUDE = {
  versions: { orderBy: { version: 'desc' as const } },
  goals: { include: { tasks: { include: { history: { orderBy: { changedAt: 'desc' as const }, take: 10 } } } }, orderBy: { startDate: 'asc' as const } },
};

export const PLAN_TRANSITIONS: Record<string, PlanTransitionRule> = {
  PROPOSED: { from: ['DRAFT', 'PAUSED'], by: 'counselor' },
  ACTIVE: { from: ['PROPOSED'], by: 'youth' }, // youth agreement activates the plan
  PAUSED: { from: ['ACTIVE'], by: 'counselor' },
  COMPLETED: { from: ['ACTIVE', 'PAUSED'], by: 'counselor' },
  ARCHIVED: { from: ['DRAFT', 'PROPOSED', 'PAUSED', 'COMPLETED'], by: 'counselor' },
};

export const OPEN_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'OVERDUE', 'PARTIALLY_COMPLETED'] as const;
