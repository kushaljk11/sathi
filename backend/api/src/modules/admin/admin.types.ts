import type { z } from 'zod';
import type {
  approvalDecisionSchema,
  approvalParamsSchema,
  assessmentQuestionSchema,
  auditLogsQuerySchema,
  completeRefundSchema,
  paymentsQuerySchema,
  resourceBodySchema,
  resourceCategorySchema,
  safetyResourceSchema,
  userRoleSchema,
  userStatusSchema,
  usersQuerySchema,
  verificationDecisionSchema,
  verificationParamsSchema,
  verificationsQuerySchema,
} from './admin.validation';

export type UsersQuery = z.infer<typeof usersQuerySchema>;
export type UserStatusInput = z.infer<typeof userStatusSchema>;
export type UserRoleInput = z.infer<typeof userRoleSchema>;
export type VerificationsQuery = z.infer<typeof verificationsQuerySchema>;
export type VerificationParams = z.infer<typeof verificationParamsSchema>;
export type VerificationDecisionInput = z.infer<typeof verificationDecisionSchema>;
export type ApprovalParams = z.infer<typeof approvalParamsSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type AssessmentQuestionInput = z.infer<typeof assessmentQuestionSchema>;
export type PaymentsQuery = z.infer<typeof paymentsQuerySchema>;
export type CompleteRefundInput = z.infer<typeof completeRefundSchema>;
export type ResourceInput = z.infer<typeof resourceBodySchema>;
export type ResourceCategoryInput = z.infer<typeof resourceCategorySchema>;
export type SafetyResourceInput = z.infer<typeof safetyResourceSchema>;
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
