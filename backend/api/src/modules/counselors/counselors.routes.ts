import { Router } from 'express';
import { z } from 'zod';
import { asyncH, ok, prisma, validate, counselorOf, HttpError, notFound } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';

const r = Router();
r.use(authenticate);

const publicSelect = {
  id: true, qualifications: true, experienceYears: true, bio: true, specializations: true, supportedConcerns: true, languages: true,
  ageGroups: true, locationArea: true, mode: true, sessionFeePaisa: true, acceptingBookings: true, user: { select: { displayName: true } },
} as const;

/** Public directory: only verified, active counselors. */
r.get('/', asyncH(async (req, res) => {
  const q = validate(z.object({ concern: z.string().optional(), language: z.string().optional(), mode: z.enum(['ONLINE', 'IN_PERSON', 'BOTH']).optional() }), req.query);
  ok(res, await prisma.counselorProfile.findMany({
    where: {
      verificationStatus: 'APPROVED', user: { status: 'ACTIVE' },
      ...(q.concern ? { supportedConcerns: { has: q.concern } } : {}), ...(q.language ? { languages: { has: q.language } } : {}),
      ...(q.mode && q.mode !== 'BOTH' ? { mode: { in: [q.mode, 'BOTH'] } } : {}),
    },
    select: publicSelect, take: 50,
  }));
}));

r.get('/:id', asyncH(async (req, res) => {
  const c = await prisma.counselorProfile.findFirst({ where: { id: String(req.params.id), verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } }, select: publicSelect });
  if (!c) throw notFound('Counselor');
  ok(res, c);
}));

/** Bookable slots: future, unbooked, not actively held. */
r.get('/:id/slots', asyncH(async (req, res) => {
  const q = validate(z.object({ from: z.coerce.date().optional(), days: z.coerce.number().int().min(1).max(60).default(14) }), req.query);
  const from = q.from && q.from > new Date() ? q.from : new Date(Date.now() + 30 * 60_000);
  const slots = await prisma.appointmentSlot.findMany({
    where: {
      counselorId: String(req.params.id), isBooked: false, startsAt: { gte: from, lte: new Date(from.getTime() + q.days * 864e5) },
      OR: [{ hold: null }, { hold: { expiresAt: { lt: new Date() } } }],
    },
    orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, endsAt: true },
  });
  ok(res, slots);
}));

// ---------- counselor self-management ----------
const avail = z.object({ dayOfWeek: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), slotMinutes: z.number().int().min(15).max(180) })
  .refine((a) => a.endMinute > a.startMinute, 'End must be after start');

r.get('/me/availability', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  ok(res, {
    weekly: await prisma.availability.findMany({ where: { counselorId: c.id }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] }),
    exceptions: await prisma.availabilityException.findMany({ where: { counselorId: c.id, endsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } }),
  });
}));

r.put('/me/availability', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  const weekly = validate(z.array(avail).max(50), req.body.weekly);
  await prisma.$transaction([prisma.availability.deleteMany({ where: { counselorId: c.id } }), prisma.availability.createMany({ data: weekly.map((w) => ({ ...w, counselorId: c.id })) })]);
  ok(res, { saved: weekly.length });
}));

r.post('/me/exceptions', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  const b = validate(z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().max(200).optional() }).refine((x) => x.endsAt > x.startsAt), req.body);
  // Remove free slots inside a blocked period (booked slots are kept and must be handled explicitly).
  await prisma.appointmentSlot.deleteMany({ where: { counselorId: c.id, isBooked: false, startsAt: { gte: b.startsAt, lt: b.endsAt }, hold: null } });
  ok(res, await prisma.availabilityException.create({ data: { ...b, counselorId: c.id } }), 201);
}));

r.delete('/me/exceptions/:id', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  await prisma.availabilityException.deleteMany({ where: { id: String(req.params.id), counselorId: c.id } });
  ok(res, { removed: true });
}));

/**
 * Generates concrete UTC slots for the next N days from weekly availability in the counselor's timezone,
 * skipping exceptions. Idempotent via unique(counselorId, startsAt).
 */
r.post('/me/slots/generate', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  const { days } = validate(z.object({ days: z.number().int().min(1).max(60).default(14) }), req.body ?? {});
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const weekly = await prisma.availability.findMany({ where: { counselorId: c.id } });
  if (!weekly.length) throw new HttpError(400, 'Set your weekly availability first');
  const exceptions = await prisma.availabilityException.findMany({ where: { counselorId: c.id, endsAt: { gte: new Date() } } });
  const slots = generateSlots(weekly, exceptions, user.timezone, days, new Date());
  const result = await prisma.appointmentSlot.createMany({ data: slots.map((s) => ({ ...s, counselorId: c.id })), skipDuplicates: true });
  ok(res, { created: result.count });
}));

r.get('/me/slots', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  ok(res, await prisma.appointmentSlot.findMany({ where: { counselorId: c.id, startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 200, include: { hold: { select: { expiresAt: true } } } }));
}));

r.delete('/me/slots/:id', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await counselorOf(req.user!.id);
  const d = await prisma.appointmentSlot.deleteMany({ where: { id: String(req.params.id), counselorId: c.id, isBooked: false } });
  if (!d.count) throw new HttpError(409, 'Slot is booked or not found');
  ok(res, { removed: true });
}));

/** Offset (minutes) of a timezone at a given instant, using Intl. */
export function tzOffsetMin(tz: string, at: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

export function generateSlots(
  weekly: { dayOfWeek: number; startMinute: number; endMinute: number; slotMinutes: number }[],
  exceptions: { startsAt: Date; endsAt: Date }[], tz: string, days: number, now: Date,
) {
  const out: { startsAt: Date; endsAt: Date }[] = [];
  for (let d = 1; d <= days; d++) {
    const probe = new Date(now.getTime() + d * 864e5);
    const off = tzOffsetMin(tz, probe);
    const local = new Date(probe.getTime() + off * 60000);
    const localMidnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - off * 60000;
    for (const w of weekly.filter((x) => x.dayOfWeek === local.getUTCDay())) {
      for (let m = w.startMinute; m + w.slotMinutes <= w.endMinute; m += w.slotMinutes) {
        const startsAt = new Date(localMidnightUtc + m * 60000);
        const endsAt = new Date(startsAt.getTime() + w.slotMinutes * 60000);
        if (startsAt <= now || exceptions.some((e) => startsAt < e.endsAt && endsAt > e.startsAt)) continue;
        out.push({ startsAt, endsAt });
      }
    }
  }
  return out;
}

export default r;
