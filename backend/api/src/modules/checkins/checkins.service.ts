import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/app.error';
import { DAY_MS } from '../../utils/date.util';
import type { CheckInInput, ListCheckInsQuery } from './checkins.types';

async function youthIdOf(userId: string) {
  const y = await prisma.youthProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!y) throw new AppError(404, 'Youth profile not found');
  return y.id;
}

// Append-only: history is never overwritten.
export async function createCheckIn(userId: string, data: CheckInInput) {
  return prisma.wellbeingCheckIn.create({ data: { ...data, youthId: await youthIdOf(userId) } });
}

export async function listCheckIns(userId: string, q: ListCheckInsQuery) {
  const from = q.from ?? new Date(Date.now() - q.days * DAY_MS);
  return prisma.wellbeingCheckIn.findMany({
    where: { youthId: await youthIdOf(userId), createdAt: { gte: from, ...(q.to ? { lte: q.to } : {}) } },
    orderBy: { createdAt: 'asc' },
  });
}
