import { Router } from 'express';
import { z } from 'zod';
import { rankProviders, validateWeights, DEFAULT_WEIGHTS, type Provider, type TimeWindow, type Weights } from '@sathi/shared';
import { asyncH, ok, prisma, HttpError, validate, audit } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';

const r = Router();
r.use(authenticate);

async function activeConfig() {
  const c = await prisma.matchingConfiguration.findFirst({ where: { active: true }, orderBy: { version: 'desc' } });
  return c ?? prisma.matchingConfiguration.create({ data: { version: 1, weights: DEFAULT_WEIGHTS, active: true } });
}

/** Run matching against the youth's latest Support Need Profile and persist an auditable run. */
r.post('/run', requireRole('YOUTH'), asyncH(async (req, res) => {
  const youth = await prisma.youthProfile.findUnique({ where: { userId: req.user!.id } });
  const need = youth && (await prisma.supportNeedProfile.findFirst({ where: { youthId: youth.id }, orderBy: { createdAt: 'desc' } }));
  if (!youth || !need) throw new HttpError(400, 'Complete the support assessment first');
  const config = await activeConfig();
  const now = new Date();
  const counselors = await prisma.counselorProfile.findMany({
    include: { user: true, availability: true, _count: { select: { slots: { where: { isBooked: false, startsAt: { gt: now } } } } } },
  });
  const providers: Provider[] = counselors.map((c) => ({
    id: c.id, name: c.user.displayName, verified: c.verificationStatus === 'APPROVED', suspended: c.user.status !== 'ACTIVE',
    acceptingBookings: c.acceptingBookings, supportedConcerns: c.supportedConcerns, specializations: c.specializations,
    languages: c.languages, ageGroups: c.ageGroups, mode: c.mode, lat: c.latitude ?? undefined, lng: c.longitude ?? undefined,
    availability: c.availability.map((a) => ({ day: a.dayOfWeek, startMin: a.startMinute, endMin: a.endMinute })),
    hasOpenSlots: c._count.slots > 0,
  }));
  const { results, excluded } = rankProviders({
    concerns: need.concerns, desiredSupport: need.desiredSupport, languages: need.languages, mode: need.mode,
    ageGroup: youth.ageGroup ?? undefined, lat: need.latitude ?? undefined, lng: need.longitude ?? undefined,
    maxTravelKm: need.maxTravelKm ?? undefined, availability: need.availability as unknown as TimeWindow[],
  }, providers, config.weights as Weights);

  const run = await prisma.matchingRun.create({
    data: {
      needProfileId: need.id, configId: config.id,
      recommendations: {
        create: results.map((m, i) => ({
          counselorId: m.providerId, rank: i + 1, totalScore: m.total, explanation: m.explanations, gaps: m.gaps,
          factors: { create: m.factors.map((f) => ({ factor: f.factor, rawScore: f.score, weight: f.weight, weighted: f.weighted })) },
        })),
      },
    },
  });
  const info = Object.fromEntries(counselors.map((c) => [c.id, { fee: c.sessionFeePaisa, mode: c.mode, languages: c.languages, locationArea: c.locationArea, experienceYears: c.experienceYears, qualifications: c.qualifications, bio: c.bio, specializations: c.specializations }]));
  ok(res, { runId: run.id, configVersion: config.version, results: results.map((m) => ({ ...m, counselor: info[m.providerId] })), excludedCount: excluded.length,
    disclaimer: 'Compatibility reflects practical fit (concerns, language, availability, location, format). It does not predict treatment outcomes.' });
}));

/** Latest persisted run (auditable: stored factor scores + config version). */
r.get('/runs/latest', requireRole('YOUTH'), asyncH(async (req, res) => {
  const youth = await prisma.youthProfile.findUnique({ where: { userId: req.user!.id } });
  const run = youth && (await prisma.matchingRun.findFirst({ where: { needProfile: { youthId: youth.id } }, orderBy: { createdAt: 'desc' }, include: { config: true, recommendations: { orderBy: { rank: 'asc' }, include: { factors: true } } } }));
  if (!run) return ok(res, null);
  const cs = await prisma.counselorProfile.findMany({ where: { id: { in: run.recommendations.map((r) => r.counselorId) } }, include: { user: { select: { displayName: true } } } });
  ok(res, { runId: run.id, createdAt: run.createdAt, configVersion: run.config.version, results: run.recommendations.map((r) => {
    const c = cs.find((x) => x.id === r.counselorId);
    return { providerId: r.counselorId, name: c?.user.displayName ?? 'Counselor', total: r.totalScore, explanations: r.explanation, gaps: r.gaps,
      factors: r.factors.map((f) => ({ factor: f.factor, score: f.rawScore, weight: f.weight, weighted: f.weighted })),
      counselor: c && { fee: c.sessionFeePaisa, mode: c.mode, languages: c.languages, locationArea: c.locationArea, experienceYears: c.experienceYears, qualifications: c.qualifications, bio: c.bio, specializations: c.specializations } };
  }) });
}));

r.get('/config', requireRole('ADMIN'), asyncH(async (_req, res) => ok(res, await prisma.matchingConfiguration.findMany({ orderBy: { version: 'desc' } }))));

r.post('/config', requireRole('ADMIN'), asyncH(async (req, res) => {
  const n = z.number().min(0).max(100);
  const w = validate(z.object({ concern: n, specialization: n, language: n, availability: n, location: n, mode: n }), req.body);
  if (!validateWeights(w)) throw new HttpError(400, 'Weights must total exactly 100');
  const last = await prisma.matchingConfiguration.findFirst({ orderBy: { version: 'desc' } });
  const cfg = await prisma.$transaction(async (tx) => {
    await tx.matchingConfiguration.updateMany({ data: { active: false } });
    return tx.matchingConfiguration.create({ data: { version: (last?.version ?? 0) + 1, weights: w, active: true, createdBy: req.user!.id } });
  });
  await audit(req.user!.id, 'MATCHING_CONFIG_UPDATE', 'MatchingConfiguration', cfg.id);
  ok(res, cfg, 201);
}));

export default r;
