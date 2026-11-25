import type { SettingKey } from '../../constants/app.constants';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './admin.service';
import type {
  ApprovalDecisionInput,
  ApprovalParams,
  AssessmentQuestionInput,
  AuditLogsQuery,
  CompleteRefundInput,
  PaymentsQuery,
  ResourceCategoryInput,
  ResourceInput,
  SafetyResourceInput,
  UserRoleInput,
  UserStatusInput,
  UsersQuery,
  VerificationDecisionInput,
  VerificationParams,
  VerificationsQuery,
} from './admin.types';

// ---------- analytics ----------
export const analytics = asyncHandler(async (_req, res) => {
  ok(res, await service.getAnalytics());
});

// ---------- users ----------
export const listUsers = asyncHandler(async (req, res) => {
  ok(res, await service.listUsers(req.query as unknown as UsersQuery));
});

export const setUserStatus = asyncHandler(async (req, res) => {
  ok(res, await service.setUserStatus(req.user!.id, String(req.params.id), req.body as UserStatusInput));
});

export const setUserRole = asyncHandler(async (req, res) => {
  ok(res, await service.setUserRole(req.user!.id, String(req.params.id), req.body as UserRoleInput));
});

// ---------- verification ----------
export const listVerifications = asyncHandler(async (req, res) => {
  ok(res, await service.listVerifications(req.query as unknown as VerificationsQuery));
});

export const decideVerification = asyncHandler(async (req, res) => {
  ok(res, await service.decideVerification(req.user!.id, req.params as unknown as VerificationParams, req.body as VerificationDecisionInput));
});

// ---------- program/service approvals ----------
export const listApprovals = asyncHandler(async (_req, res) => {
  ok(res, await service.listApprovals());
});

export const decideApproval = asyncHandler(async (req, res) => {
  ok(res, await service.decideApproval(req.user!.id, req.params as unknown as ApprovalParams, req.body as ApprovalDecisionInput));
});

// ---------- settings ----------
export const listSettings = asyncHandler(async (_req, res) => {
  ok(res, await service.listSettings());
});

export const updateSetting = asyncHandler(async (req, res) => {
  ok(res, await service.updateSetting(req.user!.id, String(req.params.key) as SettingKey, req.body?.value));
});

// ---------- assessment configuration ----------
export const listAssessmentQuestions = asyncHandler(async (_req, res) => {
  ok(res, await service.listAssessmentQuestions());
});

export const updateAssessmentQuestion = asyncHandler(async (req, res) => {
  ok(res, await service.updateAssessmentQuestion(req.user!.id, String(req.params.id), req.body as AssessmentQuestionInput));
});

// ---------- payments & refunds ----------
export const listPayments = asyncHandler(async (req, res) => {
  ok(res, await service.listPayments(req.query as unknown as PaymentsQuery));
});

export const reconcilePayment = asyncHandler(async (req, res) => {
  ok(res, await service.reconcilePayment(req.user!.id, String(req.params.reference)));
});

export const listRefunds = asyncHandler(async (_req, res) => {
  ok(res, await service.listRefunds());
});

export const markRefundProcessing = asyncHandler(async (req, res) => {
  ok(res, await service.markRefundProcessing(req.user!.id, String(req.params.id)));
});

export const completeRefund = asyncHandler(async (req, res) => {
  ok(res, await service.recordRefundCompleted(req.user!.id, String(req.params.id), req.body as CompleteRefundInput));
});

export const markRefundFailed = asyncHandler(async (req, res) => {
  ok(res, await service.markRefundFailed(req.user!.id, String(req.params.id)));
});

// ---------- resources ----------
export const listResources = asyncHandler(async (_req, res) => {
  ok(res, await service.listResources());
});

export const createResource = asyncHandler(async (req, res) => {
  ok(res, await service.createResource(req.body as ResourceInput), 201);
});

export const updateResource = asyncHandler(async (req, res) => {
  ok(res, await service.updateResource(String(req.params.id), req.body as ResourceInput));
});

export const createResourceCategory = asyncHandler(async (req, res) => {
  ok(res, await service.createResourceCategory(req.body as ResourceCategoryInput), 201);
});

export const createSafetyResource = asyncHandler(async (req, res) => {
  ok(res, await service.createSafetyResource(req.user!.id, req.body as SafetyResourceInput), 201);
});

export const updateSafetyResource = asyncHandler(async (req, res) => {
  ok(res, await service.updateSafetyResource(req.user!.id, String(req.params.id), req.body as SafetyResourceInput));
});

export const safetySummary = asyncHandler(async (_req, res) => {
  ok(res, await service.getSafetySummary());
});

// ---------- audit logs ----------
export const listAuditLogs = asyncHandler(async (req, res) => {
  ok(res, await service.listAuditLogs(req.query as unknown as AuditLogsQuery));
});

// ---------- background jobs ----------
export const listJobs = asyncHandler(async (_req, res) => {
  ok(res, await service.listJobs());
});

export const retryJob = asyncHandler(async (req, res) => {
  ok(res, await service.retryJob(String(req.params.id)));
});
