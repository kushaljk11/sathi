import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './admin.controller';
import {
  approvalDecisionSchema,
  approvalParamsSchema,
  assessmentQuestionSchema,
  auditLogsQuerySchema,
  completeRefundSchema,
  idParamsSchema,
  paymentsQuerySchema,
  resourceBodySchema,
  resourceCategorySchema,
  safetyResourceSchema,
  settingKeyParamsSchema,
  userRoleSchema,
  userStatusSchema,
  usersQuerySchema,
  verificationDecisionSchema,
  verificationParamsSchema,
  verificationsQuerySchema,
} from './admin.validation';

/** Mounted at /admin after /admin/cms and /admin/moderation. */
const router = Router();
router.use(authenticate, requireRole('ADMIN'));

// ---------- analytics ----------
router.get('/analytics', controller.analytics);

// ---------- users ----------
router.get('/users', validate({ query: usersQuerySchema }), controller.listUsers);
router.post('/users/:id/status', validate({ params: idParamsSchema, body: userStatusSchema }), controller.setUserStatus);
router.post('/users/:id/role', validate({ params: idParamsSchema, body: userRoleSchema }), controller.setUserRole);

// ---------- verification ----------
router.get('/verifications', validate({ query: verificationsQuerySchema }), controller.listVerifications);
router.post('/verifications/:kind/:id', validate({ params: verificationParamsSchema, body: verificationDecisionSchema }), controller.decideVerification);

// ---------- program/service approvals ----------
router.get('/approvals', controller.listApprovals);
router.post('/approvals/:kind/:id', validate({ params: approvalParamsSchema, body: approvalDecisionSchema }), controller.decideApproval);

// ---------- settings ----------
router.get('/settings', controller.listSettings);
router.put('/settings/:key', validate({ params: settingKeyParamsSchema }), controller.updateSetting);

// ---------- assessment configuration ----------
router.get('/assessment-questions', controller.listAssessmentQuestions);
router.put('/assessment-questions/:id', validate({ params: idParamsSchema, body: assessmentQuestionSchema }), controller.updateAssessmentQuestion);

// ---------- payments & refunds ----------
router.get('/payments', validate({ query: paymentsQuerySchema }), controller.listPayments);
router.post('/payments/:reference/reconcile', controller.reconcilePayment);
router.get('/refunds', controller.listRefunds);
router.post('/refunds/:id/processing', validate({ params: idParamsSchema }), controller.markRefundProcessing);
router.post('/refunds/:id/complete', validate({ params: idParamsSchema, body: completeRefundSchema }), controller.completeRefund);
router.post('/refunds/:id/fail', validate({ params: idParamsSchema }), controller.markRefundFailed);

// ---------- resources ----------
router.get('/resources', controller.listResources);
router.post('/resources', validate({ body: resourceBodySchema }), controller.createResource);
router.put('/resources/:id', validate({ params: idParamsSchema, body: resourceBodySchema }), controller.updateResource);
router.post('/resource-categories', validate({ body: resourceCategorySchema }), controller.createResourceCategory);
router.post('/safety-resources', validate({ body: safetyResourceSchema }), controller.createSafetyResource);
router.put('/safety-resources/:id', validate({ params: idParamsSchema, body: safetyResourceSchema }), controller.updateSafetyResource);
router.get('/safety/summary', controller.safetySummary);

// ---------- audit logs ----------
router.get('/audit-logs', validate({ query: auditLogsQuerySchema }), controller.listAuditLogs);

// ---------- background jobs ----------
router.get('/jobs', controller.listJobs);
router.post('/jobs/:id/retry', controller.retryJob);

export default router;
