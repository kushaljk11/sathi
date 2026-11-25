import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { verifyPassword } from '../../utils/hash.util';
import { cancelProgramBooking } from '../programs/programs.service';
import { DELETED_DISPLAY_NAME, DELETED_EMAIL_DOMAIN } from './users.constants';
import type { NotificationPreferencesInput, UpdateMeInput } from './users.types';

export function updateMe(userId: string, input: UpdateMeInput) {
  return prisma.user.update({ where: { id: userId }, data: input, select: { id: true, displayName: true, timezone: true } });
}

export function getNotificationPreferences(userId: string) {
  return prisma.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } });
}

export function updateNotificationPreferences(userId: string, input: NotificationPreferencesInput) {
  return prisma.notificationPreference.upsert({ where: { userId }, update: input, create: { userId, ...input } });
}

/** Data export (privacy right). Excludes counselor private notes, which are professional records. */
export async function exportData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, role: true, displayName: true, createdAt: true, timezone: true } });
  const youth = await prisma.youthProfile.findUnique({
    where: { userId },
    include: {
      checkIns: true,
      assessments: { include: { responses: true } },
      needProfiles: true,
      safetyScreenings: true,
      consents: { include: { history: true } },
      appointments: true,
      programBookings: true,
    },
  });
  const notifications = await prisma.notification.findMany({ where: { userId } });
  const posts = await prisma.communityPost.findMany({ where: { authorId: userId } });
  const comments = await prisma.communityComment.findMany({ where: { authorId: userId } });
  await audit(userId, 'DATA_EXPORT', 'User', userId);
  return { exportedAt: new Date(), user, youth, notifications, posts, comments };
}

/** Account deletion: anonymise identity, revoke sessions. Records needed for payments/safety follow the retention policy. */
export async function deleteAccount(userId: string, password: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(u.passwordHash, password))) throw new AppError(400, 'Password is incorrect');
  if (u.role === 'ADMIN') throw new AppError(400, 'Admin accounts must be removed by another administrator');
  await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: { status: 'DELETED', deletedAt: new Date(), email: `deleted+${u.id}@${DELETED_EMAIL_DOMAIN}`, displayName: DELETED_DISPLAY_NAME, passwordHash: 'x' },
    }),
    prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.communityPost.updateMany({ where: { authorId: u.id }, data: { pseudonym: DELETED_DISPLAY_NAME } }),
    prisma.communityComment.updateMany({ where: { authorId: u.id }, data: { pseudonym: DELETED_DISPLAY_NAME } }),
    prisma.googleCredential.deleteMany({ where: { userId: u.id } }),
  ]);
  await closeOpenCommitments(u.id);
  await audit(u.id, 'ACCOUNT_DELETED', 'User', u.id);
}

/** Closes open commitments so counterparts are not left waiting. */
async function closeOpenCommitments(userId: string) {
  const y = await prisma.youthProfile.findUnique({ where: { userId } });
  if (!y) return;
  const appts = await prisma.appointment.findMany({
    where: { youthId: y.id, status: { in: ['PENDING_PAYMENT', 'PENDING_COUNSELOR', 'CONFIRMED'] }, startsAt: { gt: new Date() } },
  });
  for (const a of appts) {
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED', cancelReason: 'Account deleted' } }),
      prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } }),
    ]);
  }
  await prisma.supportRelationship.updateMany({ where: { youthId: y.id, status: { in: ['ACTIVE', 'PAUSED'] } }, data: { status: 'CLOSED', endedAt: new Date() } });
  await prisma.waitlistEntry.deleteMany({ where: { youthId: y.id } });
  const bookings = await prisma.programBooking.findMany({ where: { youthId: y.id, status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } } });
  for (const b of bookings) await cancelProgramBooking(b.id, { userId }).catch(() => null);
}
