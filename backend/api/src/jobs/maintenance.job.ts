import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../core/logger/logger';
import { verifyAndSettle } from '../modules/payments/payments.service';
import { cancelProgramBooking } from '../modules/programs/programs.service';
import { MINUTE_MS } from '../utils/date.util';

/** Every minute: expire holds and unpaid bookings, reconcile pending payments, mark overdue tasks. */
export async function sweep() {
  const now = new Date();
  await prisma.slotHold.deleteMany({ where: { expiresAt: { lt: now } } });

  const stale = await prisma.appointment.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(now.getTime() - 15 * MINUTE_MS) } }, include: { payments: true } });
  for (const a of stale) {
    for (const p of a.payments.filter((x) => ['INITIATED', 'PENDING'].includes(x.status))) await verifyAndSettle(p.reference).catch(() => null);
    const expired = await prisma.appointment.updateMany({ where: { id: a.id, status: 'PENDING_PAYMENT' }, data: { status: 'EXPIRED' } });
    if (expired.count) await prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } });
  }

  // Unpaid program seats are released after 30 minutes.
  const unpaid = await prisma.programBooking.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(now.getTime() - 30 * MINUTE_MS) } } });
  for (const b of unpaid) {
    const y = await prisma.youthProfile.findUniqueOrThrow({ where: { id: b.youthId } });
    await cancelProgramBooking(b.id, { userId: y.userId }).catch(() => null);
  }

  await prisma.supportTask.updateMany({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } }, data: { status: 'OVERDUE' } });
  await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
}

/** Dev fallback when Redis/worker is not running: run sweeps in-process so holds/expiry still work. */
export function startDevMaintenance() {
  if (env.NODE_ENV !== 'development' || env.DISABLE_DEV_MAINTENANCE === 'true') return;
  setInterval(() => sweep().catch((e) => logger.error('[dev-maintenance] sweep failed', { error: e.message })), MINUTE_MS).unref();
}
