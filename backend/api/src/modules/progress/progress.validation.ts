import { z } from 'zod';

export const relationshipIdParams = z.object({ id: z.string().uuid() });

export const progressRangeQuery = z.object({ days: z.coerce.number().int().min(1).max(730).default(30), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export const createReviewSchema = z.object({
  outcome: z.string().min(1).max(3000),
  nextSteps: z.string().max(2000).optional(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});
