import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './plans.service';
import type { GoalInput, PlanInput, PlanStatusInput, TaskInput, UpdateGoalInput, UpdateTaskInput } from './plans.types';

export const listPlans = asyncHandler(async (req, res) => {
  ok(res, await service.listPlans(req.params.id as string, req.user!));
});

export const createPlan = asyncHandler(async (req, res) => {
  ok(res, await service.createPlan(req.params.id as string, req.user!, req.body as PlanInput), 201);
});

export const updatePlan = asyncHandler(async (req, res) => {
  ok(res, await service.updatePlan(req.params.planId as string, req.user!, req.body as PlanInput));
});

export const updatePlanStatus = asyncHandler(async (req, res) => {
  ok(res, await service.updatePlanStatus(req.params.planId as string, req.user!, req.body as PlanStatusInput));
});

export const createGoal = asyncHandler(async (req, res) => {
  ok(res, await service.createGoal(req.params.planId as string, req.user!, req.body as GoalInput), 201);
});

export const updateGoal = asyncHandler(async (req, res) => {
  ok(res, await service.updateGoal(req.params.goalId as string, req.user!, req.body as UpdateGoalInput));
});

export const createTask = asyncHandler(async (req, res) => {
  ok(res, await service.createTask(req.params.goalId as string, req.user!, req.body as TaskInput), 201);
});

export const updateTask = asyncHandler(async (req, res) => {
  ok(res, await service.updateTask(req.params.taskId as string, req.user!, req.body as UpdateTaskInput));
});

export const listMyTasks = asyncHandler(async (req, res) => {
  ok(res, await service.listMyTasks(req.user!.id));
});
