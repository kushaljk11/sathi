import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { validateThresholds } from '@sathi/shared';
import { asyncH, ok, prisma, validate, audit, HttpError, notFound, pageQuery, paged, SETTING_DEFAULTS, type SettingKey } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';
import { notify } from '../../lib/notify';
import { getQueue } from '../../lib/queue';
import { completeRefund, verifyAndSettle } from '../payments/payments.service';
import { setContentStatus } from '../community/moderation/moderation.service';

const r = Router();
r.use(authenticate, requireRole('ADMIN'));
const uuid = (v: unknown) => z.string().uuid().parse(v);

// ---------- analytics (aggregates only — no individual wellbeing records) ----------
r.get('/analytics', asyncH(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 864e5);
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
  ok(res, {
    users, byRole: Object.fromEntries(byRole.map((x) => [x.role, x._count])), verifiedCounselors: counselors, verifiedOrganizations: orgs,
    appointments: Object.fromEntries(appts.map((x) => [x.status, x._count])), activeRelationships: activeRels, programBookings, checkInsLast30Days: checkIns30,
    payments: { count: payments._count, totalPaisa: payments._sum.amountPaisa ?? 0 }, openModerationCases: openCases,
    pendingVerifications: { counselors: pendingVerif[0], organizations: pendingVerif[1] },
    signups: signups.map((s) => ({ day: s.day, count: Number(s.count) })),
  });
}));

// ---------- users ----------
r.get('/users', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ role: z.enum(['YOUTH', 'COUNSELOR', 'ORGANIZATION', 'ADMIN']).optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional() }), req.query);
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}), ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { displayName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, email: true, displayName: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, postingRestrictedUntil: true, moderationWarnings: true } }),
    prisma.user.count({ where }),
  ]);
  ok(res, paged(items, total, q.page, q.pageSize));
}));

r.post('/users/:id/status', asyncH(async (req, res) => {
  const { status, reason } = validate(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().min(3).max(500) }), req.body);
  const id = uuid(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, 'You cannot change your own status');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.status === 'DELETED') throw notFound('User');
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { status } }),
    ...(status === 'SUSPENDED' ? [prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
  ]);
  await audit(req.user!.id, status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED', 'User', id, { reason });
  ok(res, { status });
}));

/** Role changes are limited: promotion to ADMIN only (other roles carry profile data). */
r.post('/users/:id/role', asyncH(async (req, res) => {
  const { role } = validate(z.object({ role: z.enum(['ADMIN']) }), req.body);
  const id = uuid(req.params.id);
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.role === 'YOUTH') throw new HttpError(400, 'Youth accounts cannot be promoted');
  await prisma.user.update({ where: { id }, data: { role } });
  await audit(req.user!.id, 'ROLE_CHANGED', 'User', id, { role });
  ok(res, { role });
}));

// ---------- verification ----------
r.get('/verifications', asyncH(async (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'DRAFT']).default('PENDING') }), req.query);
  const docSel = { select: { id: true, fileName: true, mimeType: true, uploadedAt: true } };
  ok(res, {
    counselors: await prisma.counselorProfile.findMany({ where: { verificationStatus: status }, include: { user: { select: { displayName: true, email: true, createdAt: true } }, documents: docSel } }),
    organizations: await prisma.organization.findMany({ where: { verificationStatus: status }, include: { documents: docSel } }),
  });
}));

r.post('/verifications/:kind/:id', asyncH(async (req, res) => {
  const kind = z.enum(['counselor', 'organization']).parse(req.params.kind);
  const b = validate(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(500).optional() }).refine((x) => x.decision === 'APPROVED' || !!x.reason, 'Rejection reason required'), req.body);
  const id = uuid(req.params.id);
  const data = { verificationStatus: b.decision, rejectionReason: b.decision === 'REJECTED' ? b.reason : null };
  let userIds: string[];
  if (kind === 'counselor') {
    const c = await prisma.counselorProfile.update({ where: { id }, data });
    userIds = [c.userId];
  } else {
    await prisma.organization.update({ where: { id }, data });
    userIds = (await prisma.organizationStaff.findMany({ where: { organizationId: id } })).map((s) => s.userId);
  }
  await audit(req.user!.id, `VERIFICATION_${b.decision}`, kind, id, { reason: b.reason ?? null });
  for (const uid of userIds) await notify(uid, { type: 'VERIFICATION', title: b.decision === 'APPROVED' ? 'Verification approved' : 'Verification needs changes', body: b.decision === 'APPROVED' ? 'Your account has been verified.' : 'Your verification was not approved. Open Sathi to see the reason.', key: `verif:${id}:${Date.now()}` });
  ok(res, { status: b.decision });
}));

// ---------- program/service approvals ----------
r.get('/approvals', asyncH(async (_req, res) => ok(res, {
  programs: await prisma.program.findMany({ where: { status: 'PENDING_APPROVAL' }, include: { organization: { select: { name: true, verificationStatus: true } } } }),
  services: await prisma.service.findMany({ where: { status: 'PENDING_APPROVAL' }, include: { organization: { select: { name: true, verificationStatus: true } } } }),
})));
r.post('/approvals/:kind/:id', asyncH(async (req, res) => {
  const kind = z.enum(['program', 'service']).parse(req.params.kind);
  const b = validate(z.object({ decision: z.enum(['PUBLISHED', 'REJECTED']), reason: z.string().max(500).optional() }), req.body);
  const id = uuid(req.params.id);
  const item = kind === 'program'
    ? await prisma.program.update({ where: { id }, data: { status: b.decision, rejectionReason: b.reason ?? null }, include: { organization: { include: { staff: true } } } })
    : await prisma.service.update({ where: { id }, data: { status: b.decision }, include: { organization: { include: { staff: true } } } });
  await audit(req.user!.id, `${kind.toUpperCase()}_${b.decision}`, kind, id, { reason: b.reason ?? null });
  for (const s of item.organization.staff) await notify(s.userId, { type: 'APPROVAL', title: b.decision === 'PUBLISHED' ? 'Listing published' : 'Listing not approved', body: `"${item.title}" was ${b.decision === 'PUBLISHED' ? 'published' : 'not approved'}.`, key: `approval:${id}:${Date.now()}` });
  ok(res, { status: b.decision });
}));

// ---------- moderation workspace ----------
r.get('/moderation/queue', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ view: z.enum(['review', 'safety', 'appeals', 'spam', 'bullying', 'resolved']).default('review') }), req.query);
  const where: Prisma.ModerationCaseWhereInput =
    q.view === 'resolved' ? { resolvedAt: { not: null } }
    : q.view === 'safety' ? { safetyEscalated: true, resolvedAt: null }
    : q.view === 'appeals' ? { appeals: { some: { status: 'OPEN' } } }
    : q.view === 'spam' ? { categories: { hasSome: ['spam', 'malicious_link'] }, resolvedAt: null }
    : q.view === 'bullying' ? { categories: { hasSome: ['bullying', 'harassment', 'hate'] }, resolvedAt: null }
    : { needsHumanReview: true, resolvedAt: null };
  const [items, total] = await Promise.all([
    prisma.moderationCase.findMany({ where, orderBy: [{ safetyEscalated: 'desc' }, { maxScore: 'desc' }, { createdAt: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { appeals: true } }),
    prisma.moderationCase.count({ where }),
  ]);
  const reportCounts = await prisma.contentReport.groupBy({ by: ['targetId'], where: { targetId: { in: items.map((i) => i.targetId) }, resolvedAt: null }, _count: true });
  ok(res, paged(items.map((i) => ({ ...i, authorId: undefined, openReports: reportCounts.find((x) => x.targetId === i.targetId)?._count ?? 0 })), total, q.page, q.pageSize));
}));

/** Case detail: content + evidence + minimal author history (pseudonymous; no email or wellbeing data). */
r.get('/moderation/cases/:id', asyncH(async (req, res) => {
  const c = await prisma.moderationCase.findUnique({ where: { id: uuid(req.params.id) }, include: { actions: { orderBy: { createdAt: 'desc' } }, appeals: true } });
  if (!c) throw notFound('Case');
  const content = c.targetType === 'POST' ? await prisma.communityPost.findUnique({ where: { id: c.targetId } }) : await prisma.communityComment.findUnique({ where: { id: c.targetId } });
  const author = await prisma.user.findUnique({ where: { id: c.authorId }, select: { status: true, moderationWarnings: true, postingRestrictedUntil: true, createdAt: true } });
  const priorCases = await prisma.moderationCase.groupBy({ by: ['outcome'], where: { authorId: c.authorId, id: { not: c.id } }, _count: true });
  const reports = await prisma.contentReport.findMany({ where: { targetType: c.targetType, targetId: c.targetId }, select: { reason: true, details: true, createdAt: true, resolution: true } });
  ok(res, { case: { ...c, authorId: undefined }, content: content && { status: content.status, body: content.body, pseudonym: content.pseudonym }, author: { ...author, priorCases }, reports });
}));

r.post('/moderation/cases/:id/action', asyncH(async (req, res) => {
  const b = validate(z.object({
    action: z.enum(['APPROVE', 'REMOVE', 'RESTORE', 'WARN', 'RESTRICT', 'SUSPEND', 'ESCALATE', 'DISMISS_REPORT', 'APPEAL_UPHELD', 'APPEAL_DENIED']),
    note: z.string().max(1000).optional(), restrictDays: z.number().int().min(1).max(90).optional(),
  }), req.body);
  const c = await prisma.moderationCase.findUnique({ where: { id: uuid(req.params.id) }, include: { appeals: { where: { status: 'OPEN' } } } });
  if (!c) throw notFound('Case');
  const resolve = () => prisma.moderationCase.update({ where: { id: c.id }, data: { resolvedAt: new Date(), needsHumanReview: false } });
  const closeReports = (resolution: string) => prisma.contentReport.updateMany({ where: { targetType: c.targetType, targetId: c.targetId, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedBy: req.user!.id, resolution } });
  switch (b.action) {
    case 'APPROVE': case 'RESTORE': await setContentStatus(c.targetType, c.targetId, 'APPROVED'); await closeReports('DISMISSED'); await resolve(); break;
    case 'REMOVE': await setContentStatus(c.targetType, c.targetId, 'REMOVED'); await closeReports('ACTIONED'); await resolve(); break;
    case 'DISMISS_REPORT': await closeReports('DISMISSED'); await setContentStatus(c.targetType, c.targetId, 'APPROVED'); await resolve(); break;
    case 'WARN':
      await prisma.user.update({ where: { id: c.authorId }, data: { moderationWarnings: { increment: 1 } } });
      await notify(c.authorId, { type: 'MODERATION', title: 'Community guidelines reminder', body: 'One of your posts did not follow our community guidelines. Please review them before posting again.', key: `warn:${c.id}` });
      break;
    case 'RESTRICT': {
      const until = new Date(Date.now() + (b.restrictDays ?? 3) * 864e5);
      await prisma.user.update({ where: { id: c.authorId }, data: { postingRestrictedUntil: until } });
      await notify(c.authorId, { type: 'MODERATION', title: 'Posting temporarily paused', body: 'Your ability to post in the community is temporarily paused. You can still use all other Sathi features.', key: `restrict:${c.id}` });
      break;
    }
    case 'SUSPEND': // Human decision only; requires a note.
      if (!b.note) throw new HttpError(400, 'A note is required to suspend an account');
      await prisma.user.update({ where: { id: c.authorId }, data: { status: 'SUSPENDED' } });
      await prisma.refreshToken.updateMany({ where: { userId: c.authorId, revokedAt: null }, data: { revokedAt: new Date() } });
      break;
    case 'ESCALATE': await prisma.moderationCase.update({ where: { id: c.id }, data: { safetyEscalated: true, needsHumanReview: true } }); await audit(req.user!.id, 'SAFETY_REVIEW_ESCALATION', 'ModerationCase', c.id); break;
    case 'APPEAL_UPHELD': case 'APPEAL_DENIED': {
      if (!c.appeals.length) throw new HttpError(409, 'No open appeal');
      const upheld = b.action === 'APPEAL_UPHELD';
      await prisma.moderationAppeal.update({ where: { id: c.appeals[0].id }, data: { status: upheld ? 'UPHELD' : 'DENIED', decidedAt: new Date() } });
      await setContentStatus(c.targetType, c.targetId, upheld ? 'APPROVED' : c.outcome === 'REJECTED' ? 'REJECTED' : 'REMOVED');
      await resolve();
      await notify(c.authorId, { type: 'MODERATION', title: 'Appeal decision', body: upheld ? 'Your appeal was accepted and your content is visible again.' : 'Your appeal was reviewed and the original decision was kept.', key: `appeal:${c.appeals[0].id}` });
      break;
    }
  }
  await prisma.moderationAction.create({ data: { caseId: c.id, moderatorId: req.user!.id, targetUserId: c.authorId, action: b.action, note: b.note } });
  await audit(req.user!.id, `MODERATION_${b.action}`, 'ModerationCase', c.id);
  ok(res, { done: true });
}));

// ---------- settings (incl. moderation thresholds, refund policy) ----------
r.get('/settings', asyncH(async (_req, res) => {
  const stored = await prisma.platformSetting.findMany();
  ok(res, Object.fromEntries(Object.keys(SETTING_DEFAULTS).map((k) => [k, stored.find((s) => s.key === k)?.value ?? SETTING_DEFAULTS[k as SettingKey]])));
}));
const settingValidators: Partial<Record<SettingKey, z.ZodTypeAny>> = {
  'moderation.thresholds': z.object({ hold: z.number(), hide: z.number(), reject: z.number() }).refine(validateThresholds, 'Thresholds must satisfy 0 < hold < hide ≤ reject ≤ 1'),
  'moderation.extraTerms': z.array(z.string().min(2).max(60)).max(500),
  'moderation.retentionDays': z.number().int().min(30).max(3650),
  'moderation.reportsToFlag': z.number().int().min(1).max(50),
  'refund.policy': z.object({ fullHours: z.number().min(0), partialHours: z.number().min(0), partialPercent: z.number().min(0).max(100) }).refine((p) => p.fullHours >= p.partialHours),
  'followup.hoursAfterSession': z.number().int().min(1).max(336),
  'safety.rules': z.object({ escalateOnAnyYes: z.array(z.string()), ruleVersion: z.number().int().min(1) }),
  'platform.supportEmail': z.string().email(),
};
r.put('/settings/:key', asyncH(async (req, res) => {
  const key = z.enum(Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]]).parse(req.params.key);
  const value = validate(settingValidators[key] ?? z.unknown(), req.body.value) as Prisma.InputJsonValue;
  await prisma.platformSetting.upsert({ where: { key }, update: { value, updatedBy: req.user!.id }, create: { key, value, updatedBy: req.user!.id } });
  await audit(req.user!.id, 'SETTING_UPDATED', 'PlatformSetting', key);
  ok(res, { key, value });
}));

// ---------- assessment configuration ----------
r.get('/assessment-questions', asyncH(async (_req, res) => ok(res, await prisma.assessmentQuestion.findMany({ include: { options: { orderBy: { order: 'asc' } } }, orderBy: [{ isSafety: 'asc' }, { step: 'asc' }] }))));
r.put('/assessment-questions/:id', asyncH(async (req, res) => {
  const b = validate(z.object({ prompt: z.string().min(3).max(300), active: z.boolean(), options: z.array(z.object({ value: z.string().min(1).max(60), label: z.string().min(1).max(120) })).max(30).optional() }), req.body);
  const q = await prisma.assessmentQuestion.findUnique({ where: { id: uuid(req.params.id) } });
  if (!q) throw notFound('Question');
  await prisma.$transaction(async (tx) => {
    await tx.assessmentQuestion.update({ where: { id: q.id }, data: { prompt: b.prompt, active: b.active, version: { increment: 1 } } });
    if (b.options) {
      await tx.assessmentOption.deleteMany({ where: { questionId: q.id } });
      await tx.assessmentOption.createMany({ data: b.options.map((o, i) => ({ ...o, order: i, questionId: q.id })) });
    }
  });
  await audit(req.user!.id, 'ASSESSMENT_QUESTION_UPDATED', 'AssessmentQuestion', q.id);
  ok(res, { updated: true });
}));

// ---------- payments & refunds ----------
r.get('/payments', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ status: z.string().optional() }), req.query);
  const where = q.status ? { status: q.status as never } : {};
  const [items, total] = await Promise.all([prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { refunds: true }, omit: { rawVerification: true } }), prisma.payment.count({ where })]);
  ok(res, paged(items, total, q.page, q.pageSize));
}));
r.post('/payments/:reference/reconcile', asyncH(async (req, res) => {
  const p = await verifyAndSettle(String(req.params.reference));
  await audit(req.user!.id, 'PAYMENT_RECONCILED', 'Payment', p.id);
  ok(res, { status: p.status });
}));
r.get('/refunds', asyncH(async (_req, res) => ok(res, await prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, include: { payment: { select: { reference: true, provider: true, transactionId: true, amountPaisa: true } } }, take: 200 }))));
r.post('/refunds/:id/processing', asyncH(async (req, res) => {
  await prisma.refund.updateMany({ where: { id: uuid(req.params.id), status: 'REQUESTED' }, data: { status: 'PROCESSING', processedBy: req.user!.id } });
  ok(res, { status: 'PROCESSING' });
}));
r.post('/refunds/:id/complete', asyncH(async (req, res) => {
  const { gatewayRef } = validate(z.object({ gatewayRef: z.string().min(3).max(120) }), req.body);
  ok(res, await completeRefund(uuid(req.params.id), req.user!.id, gatewayRef));
}));
r.post('/refunds/:id/fail', asyncH(async (req, res) => {
  await prisma.refund.update({ where: { id: uuid(req.params.id) }, data: { status: 'FAILED', processedBy: req.user!.id } });
  await audit(req.user!.id, 'REFUND_FAILED', 'Refund', String(req.params.id));
  ok(res, { status: 'FAILED' });
}));

// ---------- resources ----------
const resourceBody = z.object({ categoryId: z.string().uuid(), title: z.string().min(3).max(200), body: z.string().min(1).max(20000), contentType: z.enum(['ARTICLE', 'GUIDE', 'VIDEO', 'AWARENESS', 'SUPPORT', 'SAFETY']), url: z.string().url().startsWith('https://').nullable().optional(), language: z.enum(['en', 'ne']), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) });
r.get('/resources', asyncH(async (_req, res) => ok(res, { resources: await prisma.resource.findMany({ include: { category: true }, orderBy: { createdAt: 'desc' } }), categories: await prisma.resourceCategory.findMany() })));
r.post('/resources', asyncH(async (req, res) => ok(res, await prisma.resource.create({ data: validate(resourceBody, req.body) }), 201)));
r.put('/resources/:id', asyncH(async (req, res) => ok(res, await prisma.resource.update({ where: { id: uuid(req.params.id) }, data: validate(resourceBody, req.body) }))));
r.post('/resource-categories', asyncH(async (req, res) => ok(res, await prisma.resourceCategory.create({ data: validate(z.object({ name: z.string().min(2).max(60) }), req.body) }), 201)));
const safetyBody = z.object({ title: z.string().min(2).max(200), phone: z.string().max(40).nullable().optional(), url: z.string().url().nullable().optional(), details: z.string().min(1).max(2000), language: z.enum(['en', 'ne']), approved: z.boolean(), order: z.number().int() });
r.post('/safety-resources', asyncH(async (req, res) => {
  const s = await prisma.safetyResource.create({ data: validate(safetyBody, req.body) });
  await audit(req.user!.id, 'SAFETY_RESOURCE_CREATED', 'SafetyResource', s.id);
  ok(res, s, 201);
}));
r.put('/safety-resources/:id', asyncH(async (req, res) => {
  const s = await prisma.safetyResource.update({ where: { id: uuid(req.params.id) }, data: validate(safetyBody, req.body) });
  await audit(req.user!.id, 'SAFETY_RESOURCE_UPDATED', 'SafetyResource', s.id);
  ok(res, s);
}));
r.get('/safety/summary', asyncH(async (_req, res) => ok(res, { // aggregate only
  screenings30d: await prisma.safetyScreening.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 864e5) } } }),
  escalated30d: await prisma.safetyScreening.count({ where: { escalated: true, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } } }),
})));

// ---------- audit logs ----------
r.get('/audit-logs', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ action: z.string().optional() }), req.query);
  const where = q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {};
  const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { actor: { select: { displayName: true, role: true } } } }), prisma.auditLog.count({ where })]);
  ok(res, paged(items, total, q.page, q.pageSize));
}));

// ---------- background jobs ----------
r.get('/jobs', asyncH(async (_req, res) => {
  try {
    const q = getQueue();
    const [counts, failed] = await Promise.race([
      Promise.all([q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'), q.getFailed(0, 50)]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
    ]);
    ok(res, { available: true, counts, failed: failed.map((j) => ({ id: j.id, name: j.name, attemptsMade: j.attemptsMade, failedReason: j.failedReason, timestamp: j.timestamp })) });
  } catch {
    ok(res, { available: false, counts: null, failed: [] });
  }
}));
r.post('/jobs/:id/retry', asyncH(async (req, res) => {
  const job = await getQueue().getJob(String(req.params.id));
  if (!job) throw notFound('Job');
  await job.retry();
  ok(res, { retried: true });
}));

export default r;
