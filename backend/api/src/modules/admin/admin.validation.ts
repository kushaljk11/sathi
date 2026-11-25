import { z } from 'zod';
import { validateThresholds } from '@sathi/shared';
import { SETTING_DEFAULTS, type SettingKey } from '../../constants/app.constants';
import { pageQuery } from '../../utils/pagination.util';

const uuid = z.string().uuid();

export const idParamsSchema = z.object({ id: uuid });

// ---- users ----
export const usersQuerySchema = pageQuery.extend({
  role: z.enum(['YOUTH', 'COUNSELOR', 'ORGANIZATION', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
});
export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().min(3).max(500) });
export const userRoleSchema = z.object({ role: z.enum(['ADMIN']) });

// ---- verification ----
export const verificationsQuerySchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'DRAFT']).default('PENDING') });
export const verificationParamsSchema = z.object({ kind: z.enum(['counselor', 'organization']), id: uuid });
export const verificationDecisionSchema = z
  .object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(500).optional() })
  .refine((x) => x.decision === 'APPROVED' || !!x.reason, 'Rejection reason required');

// ---- program/service approvals ----
export const approvalParamsSchema = z.object({ kind: z.enum(['program', 'service']), id: uuid });
export const approvalDecisionSchema = z.object({ decision: z.enum(['PUBLISHED', 'REJECTED']), reason: z.string().max(500).optional() });

// ---- settings ----
export const settingKeyParamsSchema = z.object({ key: z.enum(Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]]) });

export const settingValidators: Partial<Record<SettingKey, z.ZodTypeAny>> = {
  'moderation.thresholds': z.object({ hold: z.number(), hide: z.number(), reject: z.number() }).refine(validateThresholds, 'Thresholds must satisfy 0 < hold < hide ≤ reject ≤ 1'),
  'moderation.extraTerms': z.array(z.string().min(2).max(60)).max(500),
  'moderation.retentionDays': z.number().int().min(30).max(3650),
  'moderation.reportsToFlag': z.number().int().min(1).max(50),
  'refund.policy': z.object({ fullHours: z.number().min(0), partialHours: z.number().min(0), partialPercent: z.number().min(0).max(100) }).refine((p) => p.fullHours >= p.partialHours),
  'followup.hoursAfterSession': z.number().int().min(1).max(336),
  'safety.rules': z.object({ escalateOnAnyYes: z.array(z.string()), ruleVersion: z.number().int().min(1) }),
  'platform.supportEmail': z.string().email(),
};

// ---- assessment configuration ----
export const assessmentQuestionSchema = z.object({
  prompt: z.string().min(3).max(300),
  active: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1).max(60), label: z.string().min(1).max(120) })).max(30).optional(),
});

// ---- payments & refunds ----
export const paymentsQuerySchema = pageQuery.extend({ status: z.string().optional() });
export const completeRefundSchema = z.object({ gatewayRef: z.string().min(3).max(120) });

// ---- resources ----
export const resourceBodySchema = z.object({
  categoryId: uuid,
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(20000),
  contentType: z.enum(['ARTICLE', 'GUIDE', 'VIDEO', 'AWARENESS', 'SUPPORT', 'SAFETY']),
  url: z.string().url().startsWith('https://').nullable().optional(),
  language: z.enum(['en', 'ne']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
});
export const resourceCategorySchema = z.object({ name: z.string().min(2).max(60) });

export const safetyResourceSchema = z.object({
  title: z.string().min(2).max(200),
  phone: z.string().max(40).nullable().optional(),
  url: z.string().url().nullable().optional(),
  details: z.string().min(1).max(2000),
  language: z.enum(['en', 'ne']),
  approved: z.boolean(),
  order: z.number().int(),
});

// ---- audit logs ----
export const auditLogsQuerySchema = pageQuery.extend({ action: z.string().optional() });
