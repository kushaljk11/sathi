import { prisma } from '../config/database';
import { notFound } from '../core/errors/app.error';

/** Resolve the role-specific profile that belongs to a user id (resource ownership checks). */
export async function youthOf(userId: string) {
  const y = await prisma.youthProfile.findUnique({ where: { userId } });
  if (!y) throw notFound('Youth profile');
  return y;
}

export async function counselorOf(userId: string) {
  const c = await prisma.counselorProfile.findUnique({ where: { userId } });
  if (!c) throw notFound('Counselor profile');
  return c;
}

export async function orgOf(userId: string) {
  const s = await prisma.organizationStaff.findFirst({ where: { userId }, include: { organization: true } });
  if (!s) throw notFound('Organization');
  return { ...s.organization, isOwner: s.isOwner };
}
