import { prisma } from '../config/database';
import { env } from '../config/env';
import { sendEmail } from '../integrations/email/email.client';
import { sendPush } from '../integrations/push/fcm.client';
import { quietDelayMs } from '../utils/date.util';

/** Thrown to ask the worker to re-schedule a job (e.g. respect quiet hours). */
export class DelayError extends Error {
  constructor(public ms: number) {
    super('delay');
  }
}

/** Delivers one notification over one channel, honouring quiet hours (safety notifications are never delayed). */
export async function deliverNotification(data: Record<string, unknown>) {
  const n = await prisma.notification.findUnique({ where: { id: String(data.notificationId) }, include: { user: { include: { notificationPref: true } } } });
  if (!n || n.user.status !== 'ACTIVE') return;
  const wait = quietDelayMs(n.user.notificationPref, n.user.timezone);
  if (wait > 0 && n.type !== 'SAFETY_REVIEW') throw new DelayError(wait);
  if (data.channel === 'email') return sendEmail(n.user.email, `Sathi: ${n.title}`, `${n.body}\n\nOpen Sathi: ${env.FRONTEND_URL}`);
  if (data.channel === 'push' && n.user.notificationPref?.fcmToken) return sendPush(n.user.notificationPref.fcmToken, n.title);
}
