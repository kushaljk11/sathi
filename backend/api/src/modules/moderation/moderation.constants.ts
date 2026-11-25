import type { Prisma } from '@prisma/client';

export const QUEUE_VIEWS = ['review', 'safety', 'appeals', 'spam', 'bullying', 'resolved'] as const;

export const MODERATION_ACTIONS = ['APPROVE', 'REMOVE', 'RESTORE', 'WARN', 'RESTRICT', 'SUSPEND', 'ESCALATE', 'DISMISS_REPORT', 'APPEAL_UPHELD', 'APPEAL_DENIED'] as const;

/** Days a user is blocked from posting when a RESTRICT action does not specify a duration. */
export const DEFAULT_RESTRICT_DAYS = 3;

export const PERSPECTIVE_ENDPOINT = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';
export const PERSPECTIVE_TIMEOUT_MS = 5000;

/** Prisma filter for each moderator queue tab. */
export const QUEUE_FILTERS: Record<(typeof QUEUE_VIEWS)[number], Prisma.ModerationCaseWhereInput> = {
  resolved: { resolvedAt: { not: null } },
  safety: { safetyEscalated: true, resolvedAt: null },
  appeals: { appeals: { some: { status: 'OPEN' } } },
  spam: { categories: { hasSome: ['spam', 'malicious_link'] }, resolvedAt: null },
  bullying: { categories: { hasSome: ['bullying', 'harassment', 'hate'] }, resolvedAt: null },
  review: { needsHumanReview: true, resolvedAt: null },
};
