import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { SETTING_DEFAULTS, type SettingKey } from '../../constants/app.constants';
import { AppError, notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { notify } from '../../helpers/notification.helper';
import { getQueue } from '../../queues/queue';
import { DAY_MS } from '../../utils/date.util';
import { paged } from '../../utils/pagination.util';
import { completeRefund, verifyAndSettle } from '../payments/payments.service';
import { FAILED_JOBS_LIMIT, JOBS_QUERY_TIMEOUT_MS, REFUND_LIST_LIMIT, SUMMARY_WINDOW_DAYS } from './admin.constants';
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
import { settingValidators } from './admin.validation';

// ---------- analytics (aggregates only — no individual wellbeing records) ----------

export async function getAnalytics() {
  const since = new Date(Date.now() - SUMMARY_WINDOW_DAYS * DAY_MS);
  const [users, byRole, counselors, orgs, appts, activeRels, programBookings, checkIns30, payments, openCases, pendingVerif] = await Promise.all([
    prisma.user.count({ where: { status: { not: 'DELETED' } } }),
    prisma.user.groupBy({ by: ['role'], _count: true, where: { status: { not: 'DELETED' } } }),
    prisma.counselorProfile.count({ where: { verificationStatus: 'APPROVED' } }),
    prisma.organization.count({ where: { verificationStatus: 'APPROVED' } }),
    prisma.appointment.groupBy({ by: ['status'], _count: true }),
    prisma.supportRelationship.count({ where: { status: 'ACTIVE' } }),
    prisma.programBooking.count({ where: { status: { in: ['CONFIRMED', 'ATTENDED', 'COMPLETED'] } } }),
    prisma.wellbeingCheckIn.count({ where: { createdAt: { gte: since } } }),
    prisma.payment.aggregate({ _sum: { amountPaisa: true }, _count: true, where: { status: 'SUCCESS' } }),
    prisma.moderationCase.count({ where: { needsHumanReview: true, resolvedAt: null } }),
    Promise.all([prisma.counselorProfile.count({ where: { verificationStatus: 'PENDING' } }), prisma.organization.count({ where: { verificationStatus: 'PENDING' } })]),
  ]);
  const signups = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, count(*) FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`;
  return {
    users,
    byRole: Object.fromEntries(byRole.map((x) => [x.role, x._count])),
    verifiedCounselors: counselors,
    verifiedOrganizations: orgs,
    appointments: Object.fromEntries(appts.map((x) => [x.status, x._count])),
    activeRelationships: activeRels,
    programBookings,
    checkInsLast30Days: checkIns30,
    payments: { count: payments._count, totalPaisa: payments._sum.amountPaisa ?? 0 },
    openModerationCases: openCases,
    pendingVerifications: { counselors: pendingVerif[0], organizations: pendingVerif[1] },
    signups: signups.map((s) => ({ day: s.day, count: Number(s.count) })),
  };
}

// ---------- users ----------

export async function listUsers(q: UsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { displayName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, email: true, displayName: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, postingRestrictedUntil: true, moderationWarnings: true },
    }),
    prisma.user.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

export async function setUserStatus(actorId: string, id: string, { status, reason }: UserStatusInput) {
  if (id === actorId) throw new AppError(400, 'You cannot change your own status');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.status === 'DELETED') throw notFound('User');
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { status } }),
    ...(status === 'SUSPENDED' ? [prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
  ]);
  await audit(actorId, status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED', 'User', id, { reason });
  return { status };
}

/** Role changes are limited: promotion to ADMIN only (other roles carry profile data). */
export async function setUserRole(actorId: string, id: string, { role }: UserRoleInput) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.role === 'YOUTH') throw new AppError(400, 'Youth accounts cannot be promoted');
  await prisma.user.update({ where: { id }, data: { role } });
  await audit(actorId, 'ROLE_CHANGED', 'User', id, { role });
  return { role };
}

// ---------- verification ----------

export async function listVerifications({ status }: VerificationsQuery) {
  const docSel = { select: { id: true, fileName: true, mimeType: true, uploadedAt: true } };
  return {
    counselors: await prisma.counselorProfile.findMany({
      where: { verificationStatus: status },
      include: { user: { select: { displayName: true, email: true, createdAt: true } }, documents: docSel },
    }),
    organizations: await prisma.organization.findMany({ where: { verificationStatus: status }, include: { documents: docSel } }),
  };
}

export async function decideVerification(actorId: string, { kind, id }: VerificationParams, b: VerificationDecisionInput) {
  const data = { verificationStatus: b.decision, rejectionReason: b.decision === 'REJECTED' ? b.reason : null };
  let userIds: string[];
  if (kind === 'counselor') {
    const c = await prisma.counselorProfile.update({ where: { id }, data });
    userIds = [c.userId];
  } else {
    await prisma.organization.update({ where: { id }, data });
    userIds = (await prisma.organizationStaff.findMany({ where: { organizationId: id } })).map((s) => s.userId);
  }
  await audit(actorId, `VERIFICATION_${b.decision}`, kind, id, { reason: b.reason ?? null });
  for (const uid of userIds) {
    await notify(uid, {
      type: 'VERIFICATION',
      title: b.decision === 'APPROVED' ? 'Verification approved' : 'Verification needs changes',
      body: b.decision === 'APPROVED' ? 'Your account has been verified.' : 'Your verification was not approved. Open Sathi to see the reason.',
      key: `verif:${id}:${Date.now()}`,
    });
  }
  return { status: b.decision };
}

// ---------- program/service approvals ----------

export async function listApprovals() {
  const include = { organization: { select: { name: true, verificationStatus: true } } };
  return {
    programs: await prisma.program.findMany({ where: { status: 'PENDING_APPROVAL' }, include }),
    services: await prisma.service.findMany({ where: { status: 'PENDING_APPROVAL' }, include }),
  };
}

export async function decideApproval(actorId: string, { kind, id }: ApprovalParams, b: ApprovalDecisionInput) {
  const item =
    kind === 'program'
      ? await prisma.program.update({ where: { id }, data: { status: b.decision, rejectionReason: b.reason ?? null }, include: { organization: { include: { staff: true } } } })
      : await prisma.service.update({ where: { id }, data: { status: b.decision }, include: { organization: { include: { staff: true } } } });
  await audit(actorId, `${kind.toUpperCase()}_${b.decision}`, kind, id, { reason: b.reason ?? null });
  for (const s of item.organization.staff) {
    await notify(s.userId, {
      type: 'APPROVAL',
      title: b.decision === 'PUBLISHED' ? 'Listing published' : 'Listing not approved',
      body: `"${item.title}" was ${b.decision === 'PUBLISHED' ? 'published' : 'not approved'}.`,
      key: `approval:${id}:${Date.now()}`,
    });
  }
  return { status: b.decision };
}

// ---------- settings (incl. moderation thresholds, refund policy) ----------

export async function listSettings() {
  const stored = await prisma.platformSetting.findMany();
  return Object.fromEntries(Object.keys(SETTING_DEFAULTS).map((k) => [k, stored.find((s) => s.key === k)?.value ?? SETTING_DEFAULTS[k as SettingKey]]));
}

export async function updateSetting(actorId: string, key: SettingKey, rawValue: unknown) {
  const value = (settingValidators[key] ?? z.unknown()).parse(rawValue) as Prisma.InputJsonValue;
  await prisma.platformSetting.upsert({ where: { key }, update: { value, updatedBy: actorId }, create: { key, value, updatedBy: actorId } });
  await audit(actorId, 'SETTING_UPDATED', 'PlatformSetting', key);
  return { key, value };
}

// ---------- assessment configuration ----------

export const listAssessmentQuestions = () => prisma.assessmentQuestion.findMany({ include: { options: { orderBy: { order: 'asc' } } }, orderBy: [{ isSafety: 'asc' }, { step: 'asc' }] });

export async function updateAssessmentQuestion(actorId: string, id: string, b: AssessmentQuestionInput) {
  const q = await prisma.assessmentQuestion.findUnique({ where: { id } });
  if (!q) throw notFound('Question');
  await prisma.$transaction(async (tx) => {
    await tx.assessmentQuestion.update({ where: { id: q.id }, data: { prompt: b.prompt, active: b.active, version: { increment: 1 } } });
    if (b.options) {
      await tx.assessmentOption.deleteMany({ where: { questionId: q.id } });
      await tx.assessmentOption.createMany({ data: b.options.map((o, i) => ({ ...o, order: i, questionId: q.id })) });
    }
  });
  await audit(actorId, 'ASSESSMENT_QUESTION_UPDATED', 'AssessmentQuestion', q.id);
  return { updated: true };
}

// ---------- payments & refunds ----------

export async function listPayments(q: PaymentsQuery) {
  const where = q.status ? { status: q.status as never } : {};
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { refunds: true }, omit: { rawVerification: true } }),
    prisma.payment.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

export async function reconcilePayment(actorId: string, reference: string) {
  const p = await verifyAndSettle(reference);
  await audit(actorId, 'PAYMENT_RECONCILED', 'Payment', p.id);
  return { status: p.status };
}

export const listRefunds = () =>
  prisma.refund.findMany({
    orderBy: { createdAt: 'desc' },
    include: { payment: { select: { reference: true, provider: true, transactionId: true, amountPaisa: true } } },
    take: REFUND_LIST_LIMIT,
  });

export async function markRefundProcessing(actorId: string, id: string) {
  await prisma.refund.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'PROCESSING', processedBy: actorId } });
  return { status: 'PROCESSING' };
}

export const recordRefundCompleted = (actorId: string, id: string, { gatewayRef }: CompleteRefundInput) => completeRefund(id, actorId, gatewayRef);

export async function markRefundFailed(actorId: string, id: string) {
  await prisma.refund.update({ where: { id }, data: { status: 'FAILED', processedBy: actorId } });
  await audit(actorId, 'REFUND_FAILED', 'Refund', id);
  return { status: 'FAILED' };
}

// ---------- resources ----------

export async function listResources() {
  return { resources: await prisma.resource.findMany({ include: { category: true }, orderBy: { createdAt: 'desc' } }), categories: await prisma.resourceCategory.findMany() };
}

export const createResource = (data: ResourceInput) => prisma.resource.create({ data });

export const updateResource = (id: string, data: ResourceInput) => prisma.resource.update({ where: { id }, data });

export const createResourceCategory = (data: ResourceCategoryInput) => prisma.resourceCategory.create({ data });

export async function createSafetyResource(actorId: string, data: SafetyResourceInput) {
  const s = await prisma.safetyResource.create({ data });
  await audit(actorId, 'SAFETY_RESOURCE_CREATED', 'SafetyResource', s.id);
  return s;
}

export async function updateSafetyResource(actorId: string, id: string, data: SafetyResourceInput) {
  const s = await prisma.safetyResource.update({ where: { id }, data });
  await audit(actorId, 'SAFETY_RESOURCE_UPDATED', 'SafetyResource', s.id);
  return s;
}

/** Aggregate only. */
export async function getSafetySummary() {
  const since = new Date(Date.now() - SUMMARY_WINDOW_DAYS * DAY_MS);
  return {
    screenings30d: await prisma.safetyScreening.count({ where: { createdAt: { gte: since } } }),
    escalated30d: await prisma.safetyScreening.count({ where: { escalated: true, createdAt: { gte: since } } }),
  };
}

// ---------- audit logs ----------

export async function listAuditLogs(q: AuditLogsQuery) {
  const where = q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { actor: { select: { displayName: true, role: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

// ---------- background jobs ----------

export async function listJobs() {
  try {
    const q = getQueue();
    const [counts, failed] = await Promise.race([
      Promise.all([q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'), q.getFailed(0, FAILED_JOBS_LIMIT)]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), JOBS_QUERY_TIMEOUT_MS)),
    ]);
    return { available: true, counts, failed: failed.map((j) => ({ id: j.id, name: j.name, attemptsMade: j.attemptsMade, failedReason: j.failedReason, timestamp: j.timestamp })) };
  } catch {
    return { available: false, counts: null, failed: [] };
  }
}

export async function retryJob(id: string) {
  const job = await getQueue().getJob(id);
  if (!job) throw notFound('Job');
  await job.retry();
  return { retried: true };
}
