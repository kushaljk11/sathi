import type { z } from 'zod';
import type { planSchema, planStatusSchema, goalSchema, updateGoalSchema, taskSchema, updateTaskSchema } from './plans.validation';

export type PlanInput = z.infer<typeof planSchema>;
export type PlanStatusInput = z.infer<typeof planStatusSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export interface PlanTransitionRule {
  from: string[];
  by: 'youth' | 'counselor';
}
