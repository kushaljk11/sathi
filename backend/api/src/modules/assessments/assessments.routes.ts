import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncH, ok, prisma, validate, youthOf, HttpError, notFound, getSetting, audit } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';
import { recordMilestone } from '../support/support.service';

const r = Router();
r.use(authenticate);

const window = z.object({ day: z.number().int().min(0).max(6), startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440) })
  .refine((w) => w.endMin > w.startMin, 'End must be after start');
export const assessmentAnswers = z.object({
  concerns: z.array(z.string().max(60)).min(1).max(10),
  impact: z.number().int().min(1).max(5),
  duration: z.enum(['<2 weeks', '2-4 weeks', '1-3 months', '3-12 months', '>1 year']),
  desiredSupport: z.array(z.string().max(60)).min(1).max(6),
  languages: z.array(z.string().max(20)).min(1).max(5),
  locationArea: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  maxTravelKm: z.number().int().min(0).max(500).optional(),
  mode: z.enum(['ONLINE', 'IN_PERSON', 'BOTH']),
  availability: z.array(window).min(1).max(21),
  accessibility: z.array(z.string().max(60)).max(10).default([]),
});

/** Configurable question bank (active only). */
r.get('/questions', asyncH(async (_req, res) =>
  ok(res, await prisma.assessmentQuestion.findMany({ where: { active: true, isSafety: false }, include: { options: { orderBy: { order: 'asc' } } }, orderBy: { step: 'asc' } }))));

/** Start or resume the in-progress assessment (save & resume). */
r.post('/', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const existing = await prisma.assessment.findFirst({ where: { youthId: y.id, status: 'IN_PROGRESS' }, orderBy: { createdAt: 'desc' } });
  ok(res, existing ?? (await prisma.assessment.create({ data: { youthId: y.id } })));
}));

r.put('/:id/draft', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const { draft } = validate(z.object({ draft: z.record(z.unknown()) }), req.body);
  if (JSON.stringify(draft).length > 20_000) throw new HttpError(413, 'Draft too large');
  const a = await prisma.assessment.updateMany({ where: { id: String(req.params.id), youthId: y.id, status: 'IN_PROGRESS' }, data: { draft: draft as Prisma.InputJsonValue } });
  if (!a.count) throw notFound('Assessment');
  ok(res, { saved: true });
}));

r.post('/:id/submit', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const a = await prisma.assessment.findFirst({ where: { id: String(req.params.id), youthId: y.id } });
  if (!a) throw notFound('Assessment');
  if (a.status !== 'IN_PROGRESS') throw new HttpError(409, 'Already submitted');
  const v = validate(assessmentAnswers, req.body);
  const profile = await prisma.$transaction(async (tx) => {
    await tx.assessment.update({ where: { id: a.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), draft: undefined } });
    await tx.assessmentResponse.createMany({ data: Object.entries(v).map(([questionKey, value]) => ({ assessmentId: a.id, questionKey, value: value as Prisma.InputJsonValue })) });
    return tx.supportNeedProfile.create({
      data: {
        youthId: y.id, assessmentId: a.id, concerns: v.concerns, impactLevel: v.impact, durationBucket: v.duration, desiredSupport: v.desiredSupport,
        languages: v.languages, mode: v.mode, locationArea: v.locationArea, latitude: v.latitude, longitude: v.longitude,
        maxTravelKm: v.maxTravelKm, availability: v.availability, accessibility: v.accessibility,
      },
    });
  });
  await recordMilestone(req.user!.id, 'ASSESSMENT_COMPLETED', null);
  ok(res, profile, 201);
}));

r.get('/history', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  ok(res, await prisma.assessment.findMany({ where: { youthId: y.id }, orderBy: { createdAt: 'desc' }, include: { needProfile: true } }));
}));

r.get('/need-profile', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  ok(res, await prisma.supportNeedProfile.findFirst({ where: { youthId: y.id }, orderBy: { createdAt: 'desc' } }));
}));

/** Update the Support Need Profile directly (creates a new version; history kept). */
r.put('/need-profile', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const v = validate(assessmentAnswers, req.body);
  ok(res, await prisma.supportNeedProfile.create({
    data: {
      youthId: y.id, concerns: v.concerns, impactLevel: v.impact, durationBucket: v.duration, desiredSupport: v.desiredSupport, languages: v.languages,
      mode: v.mode, locationArea: v.locationArea, latitude: v.latitude, longitude: v.longitude, maxTravelKm: v.maxTravelKm, availability: v.availability, accessibility: v.accessibility,
    },
  }), 201);
}));

// ---------- Safety pathway (independent of matching) ----------
export const safety = Router();
safety.use(authenticate);
safety.get('/questions', asyncH(async (_req, res) =>
  ok(res, await prisma.assessmentQuestion.findMany({ where: { active: true, isSafety: true }, orderBy: { step: 'asc' } }))));
safety.get('/resources', asyncH(async (_req, res) =>
  ok(res, await prisma.safetyResource.findMany({ orderBy: { order: 'asc' }, select: { id: true, title: true, phone: true, url: true, details: true, language: true, approved: true, order: true } }))));
safety.post('/screenings', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const answers = validate(z.record(z.enum(['yes', 'no', 'unsure'])), req.body.answers ?? {});
  const rules = await getSetting('safety.rules');
  const escalated = rules.escalateOnAnyYes.some((k) => answers[k] === 'yes');
  const s = await prisma.safetyScreening.create({ data: { youthId: y.id, answers, escalated, ruleVersion: rules.ruleVersion } });
  if (escalated) await audit(null, 'SAFETY_ESCALATION', 'SafetyScreening', s.id); // no answer content in logs
  const resources = await prisma.safetyResource.findMany({ orderBy: { order: 'asc' } });
  ok(res, {
    escalated, resources,
    message: escalated
      ? 'Your safety matters. Sathi cannot contact emergency services for you. If you are in immediate danger, contact local emergency services now or go to the nearest hospital, and reach out to someone you trust.'
      : 'Thank you. You can return to this page anytime from the "Urgent help" link.',
  }, 201);
}));

export default r;
