import { Router } from 'express';
import { z } from 'zod';
import { asyncH, ok, prisma, validate, orgOf, youthOf, counselorOf, HttpError, notFound, pageQuery, paged } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';
import { notify } from '../../lib/notify';
import { bookProgram, cancelProgramBooking, rankPrograms } from './programs.service';
import { relationshipFor } from '../support/support.service';

const r = Router();
r.use(authenticate);
const mode = z.enum(['ONLINE', 'IN_PERSON', 'BOTH']);
const uuid = (v: unknown) => z.string().uuid().parse(v);

// =============== ORGANIZATION SIDE ===============
const programBody = z.object({
  title: z.string().min(3).max(200), description: z.string().min(10).max(5000), category: z.string().min(2).max(60),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(), seats: z.number().int().min(1).max(10000),
  minAge: z.number().int().min(10).max(40).nullable().optional(), maxAge: z.number().int().min(10).max(40).nullable().optional(),
  eligibility: z.string().max(1000).nullable().optional(), locationArea: z.string().max(100).nullable().optional(), mode,
  costPaisa: z.number().int().min(0).max(100_000_00), requirements: z.string().max(1000).nullable().optional(),
}).refine((p) => p.endsAt > p.startsAt, 'End must be after start');
const serviceBody = z.object({
  title: z.string().min(3).max(200), description: z.string().min(10).max(5000), category: z.string().min(2).max(60),
  durationMin: z.number().int().min(15).max(600), capacity: z.number().int().min(1).max(10000), locationArea: z.string().max(100).nullable().optional(), mode, costPaisa: z.number().int().min(0),
});

async function verifiedOrg(userId: string) {
  const o = await orgOf(userId);
  return o;
}

r.get('/org/programs', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  ok(res, await prisma.program.findMany({ where: { organizationId: o.id }, orderBy: { startsAt: 'desc' }, include: { _count: { select: { waitlist: true, bookings: { where: { status: { in: ['CONFIRMED', 'ATTENDED', 'COMPLETED'] } } } } } } }));
}));
r.post('/org/programs', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  ok(res, await prisma.program.create({ data: { ...validate(programBody, req.body), organizationId: o.id } }), 201);
}));
r.put('/org/programs/:id', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  const b = validate(programBody, req.body);
  const p = await prisma.program.findFirst({ where: { id: uuid(req.params.id), organizationId: o.id } });
  if (!p) throw notFound('Program');
  if (b.seats < p.seatsTaken) throw new HttpError(400, `Seats cannot be below current bookings (${p.seatsTaken})`);
  // Editing published content requires re-approval.
  ok(res, await prisma.program.update({ where: { id: p.id }, data: { ...b, status: p.status === 'PUBLISHED' ? (o.verificationStatus === 'APPROVED' ? 'PENDING_APPROVAL' : 'DRAFT') : p.status === 'REJECTED' ? 'DRAFT' : p.status } }));
}));
r.post('/org/programs/:id/submit', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  if (o.verificationStatus !== 'APPROVED') throw new HttpError(403, 'Your organization must be verified before publishing');
  const u = await prisma.program.updateMany({ where: { id: uuid(req.params.id), organizationId: o.id, status: { in: ['DRAFT', 'REJECTED'] } }, data: { status: 'PENDING_APPROVAL', rejectionReason: null } });
  if (!u.count) throw new HttpError(409, 'Only draft or rejected programs can be submitted');
  ok(res, { status: 'PENDING_APPROVAL' });
}));
r.post('/org/programs/:id/archive', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  await prisma.program.updateMany({ where: { id: uuid(req.params.id), organizationId: o.id }, data: { status: 'ARCHIVED' } });
  ok(res, { status: 'ARCHIVED' });
}));

/** Organization sees only booking-management data. Never who recommended, never assessments/check-ins. */
r.get('/org/programs/:id/bookings', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  const p = await prisma.program.findFirst({ where: { id: uuid(req.params.id), organizationId: o.id } });
  if (!p) throw notFound('Program');
  const bookings = await prisma.programBooking.findMany({
    where: { programId: p.id }, orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, createdAt: true, youth: { select: { ageGroup: true, user: { select: { displayName: true } } } }, attendance: true, feedback: { select: { rating: true, comment: true } } },
  });
  const waitlist = await prisma.waitlistEntry.findMany({ where: { programId: p.id }, orderBy: { position: 'asc' }, select: { id: true, position: true, createdAt: true } });
  ok(res, { program: p, bookings, waitlist });
}));
r.post('/org/bookings/:id/attendance', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  const b = validate(z.object({ date: z.coerce.date(), present: z.boolean() }), req.body);
  const bk = await prisma.programBooking.findFirst({ where: { id: uuid(req.params.id), program: { organizationId: o.id } } });
  if (!bk || !['CONFIRMED', 'ATTENDED'].includes(bk.status)) throw notFound('Booking');
  await prisma.attendance.create({ data: { bookingId: bk.id, ...b } });
  if (b.present && bk.status === 'CONFIRMED') await prisma.programBooking.update({ where: { id: bk.id }, data: { status: 'ATTENDED' } });
  ok(res, { recorded: true });
}));
r.post('/org/bookings/:id/status', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  const { status } = validate(z.object({ status: z.enum(['COMPLETED', 'NO_SHOW', 'CANCELLED']) }), req.body);
  if (status === 'CANCELLED') return ok(res, await cancelProgramBooking(uuid(req.params.id), { userId: req.user!.id, asOrg: o.id }));
  const u = await prisma.programBooking.updateMany({ where: { id: uuid(req.params.id), program: { organizationId: o.id }, status: { in: ['CONFIRMED', 'ATTENDED'] } }, data: { status } });
  if (!u.count) throw new HttpError(409, 'Booking cannot be updated');
  ok(res, { status });
}));

r.get('/org/services', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  ok(res, await prisma.service.findMany({ where: { organizationId: o.id }, orderBy: { title: 'asc' } }));
}));
r.post('/org/services', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  ok(res, await prisma.service.create({ data: { ...validate(serviceBody, req.body), organizationId: o.id } }), 201);
}));
r.put('/org/services/:id', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  const s = await prisma.service.findFirst({ where: { id: uuid(req.params.id), organizationId: o.id } });
  if (!s) throw notFound('Service');
  ok(res, await prisma.service.update({ where: { id: s.id }, data: { ...validate(serviceBody, req.body), status: s.status === 'PUBLISHED' ? (o.verificationStatus === 'APPROVED' ? 'PENDING_APPROVAL' : 'DRAFT') : s.status === 'REJECTED' ? 'DRAFT' : s.status } }));
}));
r.post('/org/services/:id/submit', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  if (o.verificationStatus !== 'APPROVED') throw new HttpError(403, 'Your organization must be verified before publishing');
  const u = await prisma.service.updateMany({ where: { id: uuid(req.params.id), organizationId: o.id, status: { in: ['DRAFT', 'REJECTED'] } }, data: { status: 'PENDING_APPROVAL' } });
  if (!u.count) throw new HttpError(409, 'Only draft or rejected services can be submitted');
  ok(res, { status: 'PENDING_APPROVAL' });
}));
r.post('/org/services/:id/archive', requireRole('ORGANIZATION'), asyncH(async (req, res) => {
  const o = await verifiedOrg(req.user!.id);
  await prisma.service.updateMany({ where: { id: uuid(req.params.id), organizationId: o.id }, data: { status: 'ARCHIVED' } });
  ok(res, { status: 'ARCHIVED' });
}));

// =============== DISCOVERY (any signed-in user) ===============
const publicProgram = { id: true, title: true, description: true, category: true, startsAt: true, endsAt: true, seats: true, seatsTaken: true, minAge: true, maxAge: true, eligibility: true, locationArea: true, mode: true, costPaisa: true, requirements: true, organization: { select: { id: true, name: true, locationArea: true } } } as const;

r.get('/', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ category: z.string().optional(), mode: mode.optional(), free: z.enum(['true', 'false']).optional() }), req.query);
  const where = {
    status: 'PUBLISHED' as const, startsAt: { gt: new Date() },
    ...(q.category ? { category: q.category } : {}), ...(q.mode && q.mode !== 'BOTH' ? { mode: { in: [q.mode, 'BOTH' as const] } } : {}),
    ...(q.free === 'true' ? { costPaisa: 0 } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' as const } }, { description: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.program.findMany({ where, select: publicProgram, orderBy: { startsAt: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.program.count({ where }),
  ]);
  ok(res, paged(items, total, q.page, q.pageSize));
}));

r.get('/services', asyncH(async (_req, res) =>
  ok(res, await prisma.service.findMany({ where: { status: 'PUBLISHED' }, include: { organization: { select: { name: true, contactEmail: true, contactPhone: true, locationArea: true } } } }))));

r.get('/categories', asyncH(async (_req, res) =>
  ok(res, (await prisma.program.findMany({ where: { status: 'PUBLISHED' }, distinct: ['category'], select: { category: true } })).map((c) => c.category))));

// =============== YOUTH BOOKINGS ===============
r.get('/my/bookings', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  ok(res, {
    bookings: await prisma.programBooking.findMany({ where: { youthId: y.id }, include: { program: { select: publicProgram }, feedback: true }, orderBy: { createdAt: 'desc' } }),
    waitlist: await prisma.waitlistEntry.findMany({ where: { youthId: y.id }, include: { program: { select: publicProgram } } }),
    saved: await prisma.savedProgram.findMany({ where: { youthId: y.id } }),
  });
}));
r.get('/my/recommendations', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  const recs = await prisma.programRecommendation.findMany({ where: { youthId: y.id, status: { in: ['PENDING', 'SAVED', 'BOOKED'] } }, include: { program: { select: publicProgram } }, orderBy: { createdAt: 'desc' } });
  const names = await prisma.counselorProfile.findMany({ where: { id: { in: recs.map((r) => r.counselorId) } }, select: { id: true, user: { select: { displayName: true } } } });
  ok(res, recs.map((r) => ({ ...r, counselorName: names.find((n) => n.id === r.counselorId)?.user.displayName })));
}));
r.post('/my/recommendations/:id', requireRole('YOUTH'), asyncH(async (req, res) => {
  const { action } = validate(z.object({ action: z.enum(['SAVE', 'DISMISS']) }), req.body);
  const y = await youthOf(req.user!.id);
  const u = await prisma.programRecommendation.updateMany({ where: { id: uuid(req.params.id), youthId: y.id }, data: { status: action === 'SAVE' ? 'SAVED' : 'DISMISSED' } });
  if (!u.count) throw notFound('Recommendation');
  ok(res, { status: action === 'SAVE' ? 'SAVED' : 'DISMISSED' });
}));

r.get('/:id', asyncH(async (req, res) => {
  const p = await prisma.program.findFirst({ where: { id: uuid(req.params.id), status: 'PUBLISHED' }, select: publicProgram });
  if (!p) throw notFound('Program');
  ok(res, p);
}));
r.post('/:id/book', requireRole('YOUTH'), asyncH(async (req, res) => {
  const result = await bookProgram(req.user!.id, uuid(req.params.id));
  if (result.outcome === 'CONFIRMED')
    await notify(req.user!.id, { type: 'PROGRAM_BOOKING', title: 'Program booking confirmed', body: 'Your place in the program is confirmed.', key: `program-booked:${result.booking.id}:${result.booking.createdAt.getTime()}` });
  ok(res, result, 201);
}));
r.post('/:id/save', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  await prisma.savedProgram.upsert({ where: { youthId_programId: { youthId: y.id, programId: uuid(req.params.id) } }, update: {}, create: { youthId: y.id, programId: uuid(req.params.id) } });
  ok(res, { saved: true });
}));
r.delete('/:id/waitlist', requireRole('YOUTH'), asyncH(async (req, res) => {
  const y = await youthOf(req.user!.id);
  await prisma.waitlistEntry.deleteMany({ where: { programId: uuid(req.params.id), youthId: y.id } });
  ok(res, { left: true });
}));
r.post('/bookings/:id/cancel', requireRole('YOUTH'), asyncH(async (req, res) => ok(res, await cancelProgramBooking(uuid(req.params.id), { userId: req.user!.id }))));
r.post('/bookings/:id/feedback', requireRole('YOUTH'), asyncH(async (req, res) => {
  const b = validate(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() }), req.body);
  const y = await youthOf(req.user!.id);
  const bk = await prisma.programBooking.findFirst({ where: { id: uuid(req.params.id), youthId: y.id, status: { in: ['ATTENDED', 'COMPLETED'] } } });
  if (!bk) throw new HttpError(409, 'Feedback is available after attending');
  ok(res, await prisma.serviceFeedback.upsert({ where: { bookingId: bk.id }, update: b, create: { ...b, bookingId: bk.id } }), 201);
}));

// =============== COUNSELOR RECOMMENDATIONS ===============
r.get('/recommend/for/:relationshipId', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { rel } = await relationshipFor(uuid(req.params.relationshipId), req.user!, { counselorOnly: true, activeOnly: true });
  const q = validate(z.object({ q: z.string().max(100).optional() }), req.query);
  const programs = await prisma.program.findMany({
    where: { status: 'PUBLISHED', startsAt: { gt: new Date() }, ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { category: { contains: q.q, mode: 'insensitive' } }] } : {}) },
    select: publicProgram, take: 100,
  });
  // Ranking uses the need profile only if the youth consented to share it.
  const consent = await prisma.consentRecord.findUnique({ where: { youthId_recipientId_category: { youthId: rel.youthId, recipientId: rel.counselorId, category: 'SUPPORT_NEED_PROFILE' } } });
  const need = consent?.granted && !consent.withdrawnAt ? await prisma.supportNeedProfile.findFirst({ where: { youthId: rel.youthId }, orderBy: { createdAt: 'desc' } }) : null;
  ok(res, { ranked: rankPrograms(programs, need), usedNeedProfile: !!need });
}));
r.post('/recommend', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(z.object({ relationshipId: z.string().uuid(), programId: z.string().uuid(), note: z.string().max(500).optional() }), req.body);
  const { rel } = await relationshipFor(b.relationshipId, req.user!, { counselorOnly: true, activeOnly: true });
  const c = await counselorOf(req.user!.id);
  const p = await prisma.program.findFirst({ where: { id: b.programId, status: 'PUBLISHED' } });
  if (!p) throw notFound('Program');
  const rec = await prisma.programRecommendation.create({ data: { programId: p.id, youthId: rel.youthId, counselorId: c.id, note: b.note } });
  await notify(rel.youth.userId, { type: 'RECOMMENDATION', title: 'A program was recommended for you', body: 'See it under "Recommended for you". The choice is always yours.', key: `rec:${rec.id}` });
  ok(res, rec, 201);
}));
r.get('/recommend/sent/:relationshipId', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { rel } = await relationshipFor(uuid(req.params.relationshipId), req.user!, { counselorOnly: true });
  const c = await counselorOf(req.user!.id);
  ok(res, await prisma.programRecommendation.findMany({ where: { youthId: rel.youthId, counselorId: c.id }, include: { program: { select: { title: true, startsAt: true } } }, orderBy: { createdAt: 'desc' } }));
}));

export default r;
