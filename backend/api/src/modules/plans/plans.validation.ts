import { z } from 'zod';

const uuid = z.string().uuid();

export const relationshipIdParams = z.object({ id: uuid });
export const planIdParams = z.object({ planId: uuid });
export const goalIdParams = z.object({ goalId: uuid });
export const taskIdParams = z.object({ taskId: uuid });

export const planSchema = z
  .object({ title: z.string().min(2).max(200), description: z.string().min(1).max(5000), startDate: z.coerce.date(), reviewDate: z.coerce.date() })
  .refine((p) => p.reviewDate > p.startDate, 'Review date must be after start date');

export const planStatusSchema = z.object({ status: z.enum(['PROPOSED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']) });

export const goalSchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional(), startDate: z.coerce.date(), targetDate: z.coerce.date().optional() });
export const updateGoalSchema = goalSchema.partial().extend({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED']).optional() });

export const taskSchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional(), dueDate: z.coerce.date().optional() });
export const updateTaskSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'SKIPPED', 'CANCELLED']).optional(),
  youthUpdate: z.string().max(2000).optional(),
  reflection: z.string().max(2000).optional(),
  reviewed: z.boolean().optional(),
});
