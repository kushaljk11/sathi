import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/app.error';
import { counselorOf } from '../../helpers/identity.helper';
import { DAY_MS, MINUTE_MS, tzOffsetMin } from '../../utils/date.util';
import type { ExceptionInput, ReplaceAvailabilityInput, TimeRange, WeeklyRule } from './availability.types';

export async function getAvailability(userId: string) {
  const c = await counselorOf(userId);
  return {
    weekly: await prisma.availability.findMany({ where: { counselorId: c.id }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] }),
    exceptions: await prisma.availabilityException.findMany({ where: { counselorId: c.id, endsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } }),
  };
}

export async function replaceAvailability(userId: string, { weekly }: ReplaceAvailabilityInput) {
  const c = await counselorOf(userId);
  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { counselorId: c.id } }),
    prisma.availability.createMany({ data: weekly.map((w) => ({ ...w, counselorId: c.id })) }),
  ]);
  return { saved: weekly.length };
}

export async function addException(userId: string, input: ExceptionInput) {
  const c = await counselorOf(userId);
  // Remove free slots inside a blocked period (booked slots are kept and must be handled explicitly).
  await prisma.appointmentSlot.deleteMany({ where: { counselorId: c.id, isBooked: false, startsAt: { gte: input.startsAt, lt: input.endsAt }, hold: null } });
  return prisma.availabilityException.create({ data: { ...input, counselorId: c.id } });
}

export async function removeException(userId: string, exceptionId: string) {
  const c = await counselorOf(userId);
  await prisma.availabilityException.deleteMany({ where: { id: exceptionId, counselorId: c.id } });
  return { removed: true };
}

/**
 * Generates concrete UTC slots for the next N days from weekly availability in the counselor's timezone,
 * skipping exceptions. Idempotent via unique(counselorId, startsAt).
 */
export async function generateMySlots(userId: string, days: number) {
  const c = await counselorOf(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const weekly = await prisma.availability.findMany({ where: { counselorId: c.id } });
  if (!weekly.length) throw new AppError(400, 'Set your weekly availability first');
  const exceptions = await prisma.availabilityException.findMany({ where: { counselorId: c.id, endsAt: { gte: new Date() } } });
  const slots = generateSlots(weekly, exceptions, user.timezone, days, new Date());
  const result = await prisma.appointmentSlot.createMany({ data: slots.map((s) => ({ ...s, counselorId: c.id })), skipDuplicates: true });
  return { created: result.count };
}

export async function listMySlots(userId: string) {
  const c = await counselorOf(userId);
  return prisma.appointmentSlot.findMany({
    where: { counselorId: c.id, startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 200,
    include: { hold: { select: { expiresAt: true } } },
  });
}

export async function removeSlot(userId: string, slotId: string) {
  const c = await counselorOf(userId);
  const d = await prisma.appointmentSlot.deleteMany({ where: { id: slotId, counselorId: c.id, isBooked: false } });
  if (!d.count) throw new AppError(409, 'Slot is booked or not found');
  return { removed: true };
}

/** Expands weekly rules into concrete slots (in UTC) for the next `days` days, honouring the counselor's timezone and skipping exceptions. */
export function generateSlots(weekly: WeeklyRule[], exceptions: TimeRange[], tz: string, days: number, now: Date) {
  const out: TimeRange[] = [];
  for (let d = 1; d <= days; d++) {
    const probe = new Date(now.getTime() + d * DAY_MS);
    const off = tzOffsetMin(tz, probe);
    const local = new Date(probe.getTime() + off * MINUTE_MS);
    const localMidnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - off * MINUTE_MS;
    for (const w of weekly.filter((x) => x.dayOfWeek === local.getUTCDay())) {
      for (let m = w.startMinute; m + w.slotMinutes <= w.endMinute; m += w.slotMinutes) {
        const startsAt = new Date(localMidnightUtc + m * MINUTE_MS);
        const endsAt = new Date(startsAt.getTime() + w.slotMinutes * MINUTE_MS);
        if (startsAt <= now || exceptions.some((e) => startsAt < e.endsAt && endsAt > e.startsAt)) continue;
        out.push({ startsAt, endsAt });
      }
    }
  }
  return out;
}
