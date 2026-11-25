import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './plans.controller';
import { goalIdParams, goalSchema, planIdParams, planSchema, planStatusSchema, relationshipIdParams, taskIdParams, taskSchema, updateGoalSchema, updateTaskSchema } from './plans.validation';

const router = Router();
router.use(authenticate, requireRole('YOUTH', 'COUNSELOR'));

// Support plans (versioned)
router.get('/relationships/:id/plans', validate({ params: relationshipIdParams }), controller.listPlans);
router.post('/relationships/:id/plans', requireRole('COUNSELOR'), validate({ params: relationshipIdParams, body: planSchema }), controller.createPlan);
router.put('/plans/:planId', requireRole('COUNSELOR'), validate({ params: planIdParams, body: planSchema }), controller.updatePlan);
router.post('/plans/:planId/status', validate({ params: planIdParams, body: planStatusSchema }), controller.updatePlanStatus);

// Goals
router.post('/plans/:planId/goals', requireRole('COUNSELOR'), validate({ params: planIdParams, body: goalSchema }), controller.createGoal);
router.patch('/goals/:goalId', requireRole('COUNSELOR'), validate({ params: goalIdParams, body: updateGoalSchema }), controller.updateGoal);

// Tasks
router.post('/goals/:goalId/tasks', requireRole('COUNSELOR'), validate({ params: goalIdParams, body: taskSchema }), controller.createTask);
router.patch('/tasks/:taskId', validate({ params: taskIdParams, body: updateTaskSchema }), controller.updateTask);

// Tasks list for the youth dashboard
router.get('/my-tasks', requireRole('YOUTH'), controller.listMyTasks);

export default router;
