import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import { notify } from '../../helpers/notification.helper';
import { youthOf } from '../../helpers/identity.helper';
import { paged } from '../../utils/pagination.util';
import { PUBLIC_PROGRAM_SELECT } from './programs.constants';
import type { FeedbackInput, ListProgramsQuery } from './programs.types';

const ageFrom = (ageGroup: string | null) => (ageGroup ? Number(ageGroup.split('-')[0]) : null);

export async function listPrograms(q: ListProgramsQuery) {
  const where = {
    status: 'PUBLISHED' as const,
    startsAt: { gt: new Date() },
    ...(q.category ? { category: q.category } : {}),
    ...(q.mode && q.mode !== 'BOTH' ? { mode: { in: [q.mode, 'BOTH' as const] } } : {}),
    ...(q.free === 'true' ? { costPaisa: 0 } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' as const } }, { description: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.program.findMany({ where, select: PUBLIC_PROGRAM_SELECT, orderBy: { startsAt: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.program.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

export const listServices = () =>
  prisma.service.findMany({
    where: { status: 'PUBLISHED' },
    include: { organization: { select: { name: true, contactEmail: true, contactPhone: true, locationArea: true } } },
  });

export async function listCategories() {
  const rows = await prisma.program.findMany({ where: { status: 'PUBLISHED' }, distinct: ['category'], select: { category: true } });
  return rows.map((c) => c.category);
}

export async function myBookings(userId: string) {
  const y = await youthOf(userId);
  return {
    bookings: await prisma.programBooking.findMany({ where: { youthId: y.id }, include: { program: { select: PUBLIC_PROGRAM_SELECT }, feedback: true }, orderBy: { createdAt: 'desc' } }),
    waitlist: await prisma.waitlistEntry.findMany({ where: { youthId: y.id }, include: { program: { select: PUBLIC_PROGRAM_SELECT } } }),
    saved: await prisma.savedProgram.findMany({ where: { youthId: y.id } }),
  };
}

export async function getProgram(id: string) {
  const p = await prisma.program.findFirst({ where: { id, status: 'PUBLISHED' }, select: PUBLIC_PROGRAM_SELECT });
  if (!p) throw notFound('Program');
  return p;
}

export async function bookProgramAndNotify(userId: string, programId: string) {
  const result = await bookProgram(userId, programId);
  if (result.outcome === 'CONFIRMED') {
    await notify(userId, {
      type: 'PROGRAM_BOOKING',
      title: 'Program booking confirmed',
      body: 'Your place in the program is confirmed.',
      key: `program-booked:${result.booking.id}:${result.booking.createdAt.getTime()}`,
    });
  }
  return result;
}

export async function saveProgram(userId: string, programId: string) {
  const y = await youthOf(userId);
  await prisma.savedProgram.upsert({ where: { youthId_programId: { youthId: y.id, programId } }, update: {}, create: { youthId: y.id, programId } });
  return { saved: true };
}

export async function leaveWaitlist(userId: string, programId: string) {
  const y = await youthOf(userId);
  await prisma.waitlistEntry.deleteMany({ where: { programId, youthId: y.id } });
  return { left: true };
}

export async function submitFeedback(userId: string, bookingId: string, b: FeedbackInput) {
  const y = await youthOf(userId);
  const bk = await prisma.programBooking.findFirst({ where: { id: bookingId, youthId: y.id, status: { in: ['ATTENDED', 'COMPLETED'] } } });
  if (!bk) throw new AppError(409, 'Feedback is available after attending');
  return prisma.serviceFeedback.upsert({ where: { bookingId: bk.id }, update: b, create: { ...b, bookingId: bk.id } });
}

/**
 * Books a seat atomically. The conditional increment (seatsTaken < seats) plus a CHECK constraint makes
 * overbooking impossible; when full, the youth joins the waitlist.
 */
export async function bookProgram(userId: string, programId: string) {
  const youth = await prisma.youthProfile.findUnique({ where: { userId } });
  if (!youth) throw notFound('Youth profile');
  return prisma.$transaction(async (tx) => {
    const p = await tx.program.findUnique({ where: { id: programId } });
    if (!p || p.status !== 'PUBLISHED') throw notFound('Program');
    if (p.startsAt <= new Date()) throw new AppError(409, 'This program has already started');
    const age = ageFrom(youth.ageGroup);
    if ((p.minAge != null || p.maxAge != null) && age == null) throw new AppError(400, 'Add your age group to your profile to check eligibility');
    if (age != null && ((p.minAge != null && age < p.minAge) || (p.maxAge != null && age > p.maxAge))) throw new AppError(403, 'You are not eligible for this program (age requirement)');
    const existing = await tx.programBooking.findUnique({ where: { programId_youthId: { programId, youthId: youth.id } } });
    if (existing && existing.status !== 'CANCELLED') throw new AppError(409, 'You already have a booking for this program');
    if (await tx.waitlistEntry.findUnique({ where: { programId_youthId: { programId, youthId: youth.id } } })) throw new AppError(409, 'You are already on the waitlist');

    const seat = await tx.program.updateMany({ where: { id: programId, seatsTaken: { lt: p.seats } }, data: { seatsTaken: { increment: 1 } } });
    if (!seat.count) {
      const last = await tx.waitlistEntry.findFirst({ where: { programId }, orderBy: { position: 'desc' } });
      const w = await tx.waitlistEntry.create({ data: { programId, youthId: youth.id, position: (last?.position ?? 0) + 1 } });
      return { outcome: 'WAITLISTED' as const, waitlistPosition: w.position };
    }
    const status = p.costPaisa > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED';
    const booking = existing
      ? await tx.programBooking.update({ where: { id: existing.id }, data: { status, createdAt: new Date() } })
      : await tx.programBooking.create({ data: { programId, youthId: youth.id, status } });
    await tx.programRecommendation.updateMany({ where: { programId, youthId: youth.id }, data: { status: 'BOOKED' } });
    return { outcome: status, booking };
  });
}

/** Cancels a booking and safely promotes the next waitlisted youth in the same transaction. */
export async function cancelProgramBooking(bookingId: string, actor: { userId: string; asOrg?: string }) {
  const promoted = await prisma.$transaction(async (tx) => {
    const b = await tx.programBooking.findUnique({ where: { id: bookingId }, include: { youth: true, program: true } });
    if (!b) throw notFound('Booking');
    if (actor.asOrg ? b.program.organizationId !== actor.asOrg : b.youth.userId !== actor.userId) throw notFound('Booking');
    if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(b.status)) throw new AppError(409, 'Booking cannot be cancelled');
    await tx.programBooking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    await tx.program.updateMany({ where: { id: b.programId, seatsTaken: { gt: 0 } }, data: { seatsTaken: { decrement: 1 } } });
    if (b.program.startsAt <= new Date()) return null;
    const next = await tx.waitlistEntry.findFirst({ where: { programId: b.programId }, orderBy: { position: 'asc' } });
    if (!next) return null;
    const seat = await tx.program.updateMany({ where: { id: b.programId, seatsTaken: { lt: b.program.seats } }, data: { seatsTaken: { increment: 1 } } });
    if (!seat.count) return null;
    await tx.waitlistEntry.delete({ where: { id: next.id } });
    const status = b.program.costPaisa > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED';
    const prev = await tx.programBooking.findUnique({ where: { programId_youthId: { programId: b.programId, youthId: next.youthId } } });
    const nb = prev
      ? await tx.programBooking.update({ where: { id: prev.id }, data: { status } })
      : await tx.programBooking.create({ data: { programId: b.programId, youthId: next.youthId, status } });
    const y = await tx.youthProfile.findUniqueOrThrow({ where: { id: next.youthId } });
    return { booking: nb, userId: y.userId, title: b.program.title, paid: status === 'PENDING_PAYMENT' };
  });
  // Refund a paid booking cancelled before the program starts (full refund; org cancellation always full).
  const paid = await prisma.payment.findFirst({ where: { programBookingId: bookingId, status: 'SUCCESS' }, include: { programBooking: { include: { program: true } } } });
  if (paid && (actor.asOrg || paid.programBooking!.program.startsAt > new Date()) && !(await prisma.refund.findFirst({ where: { paymentId: paid.id } }))) {
    await prisma.refund.create({
      data: { paymentId: paid.id, amountPaisa: paid.amountPaisa, reason: actor.asOrg ? 'Cancelled by organization' : 'Program booking cancelled before start', requestedBy: actor.userId },
    });
  }
  if (promoted) {
    await notify(promoted.userId, {
      type: 'WAITLIST_PROMOTED',
      title: 'A place opened up',
      body: promoted.paid ? 'A place opened up in a program you waitlisted for. Complete payment to confirm it.' : 'You have been moved from the waitlist to a confirmed place.',
      key: `waitlist-promoted:${promoted.booking.id}`,
    });
  }
  return { cancelled: true, promoted: !!promoted };
}

/** Simple, transparent ranking of programs for a youth (used by counselors when recommending). */
export function rankPrograms<T extends { category: string; mode: string; locationArea: string | null; title: string; description: string }>(
  programs: T[],
  need: { concerns: string[]; mode: string; locationArea?: string | null } | null,
) {
  return programs
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];
      const text = `${p.category} ${p.title} ${p.description}`.toLowerCase();
      const matched = need?.concerns.filter((c) => text.includes(c.toLowerCase().replace('-', ' ')) || text.includes(c.toLowerCase())) ?? [];
      if (matched.length) {
        score += 50;
        reasons.push(`Relates to: ${matched.join(', ')}`);
      }
      if (need && (p.mode === 'BOTH' || need.mode === 'BOTH' || p.mode === need.mode)) {
        score += 30;
        reasons.push('Preferred format');
      }
      if (need?.locationArea && p.locationArea && p.locationArea.toLowerCase() === need.locationArea.toLowerCase()) {
        score += 20;
        reasons.push('Same area');
      }
      return { ...p, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
