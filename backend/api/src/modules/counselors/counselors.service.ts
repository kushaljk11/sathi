import { prisma } from '../../config/database';
import { notFound } from '../../core/errors/app.error';
import { DAY_MS } from '../../utils/date.util';
import { DIRECTORY_LIMIT, MIN_BOOKING_LEAD_MS, PUBLIC_COUNSELOR_SELECT } from './counselors.constants';
import type { DirectoryQuery, SlotsQuery } from './counselors.types';

/** Public directory: only verified, active counselors. */
export function listCounselors(q: DirectoryQuery) {
  return prisma.counselorProfile.findMany({
    where: {
      verificationStatus: 'APPROVED',
      user: { status: 'ACTIVE' },
      ...(q.concern ? { supportedConcerns: { has: q.concern } } : {}),
      ...(q.language ? { languages: { has: q.language } } : {}),
      ...(q.mode && q.mode !== 'BOTH' ? { mode: { in: [q.mode, 'BOTH'] } } : {}),
    },
    select: PUBLIC_COUNSELOR_SELECT,
    take: DIRECTORY_LIMIT,
  });
}

export async function getCounselor(id: string) {
  const c = await prisma.counselorProfile.findFirst({ where: { id, verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } }, select: PUBLIC_COUNSELOR_SELECT });
  if (!c) throw notFound('Counselor');
  return c;
}

/** Bookable slots: future, unbooked, not actively held. */
export function listBookableSlots(counselorId: string, q: SlotsQuery) {
  const from = q.from && q.from > new Date() ? q.from : new Date(Date.now() + MIN_BOOKING_LEAD_MS);
  return prisma.appointmentSlot.findMany({
    where: {
      counselorId,
      isBooked: false,
      startsAt: { gte: from, lte: new Date(from.getTime() + q.days * DAY_MS) },
      OR: [{ hold: null }, { hold: { expiresAt: { lt: new Date() } } }],
    },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true },
  });
}
