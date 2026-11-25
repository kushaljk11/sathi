import { prisma } from '../config/database';
import { enqueue } from '../queues/queue';

/**
 * Creates an idempotent in-app notification and schedules email/push per user preferences.
 * Text must stay neutral — never include assessment, check-in or wellbeing details.
 */
export async function notify(userId: string, n: { type: string; title: string; body: string; key: string; email?: boolean }) {
  const created = await prisma.notification
    .create({ data: { userId, type: n.type, title: n.title, body: n.body, idempotencyKey: n.key } })
    .catch((e) => {
      if (e?.code === 'P2002') return null;
      throw e;
    });
  if (!created) return null; // duplicate event

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { notificationPref: true } });
  if (!user || user.status !== 'ACTIVE') return created;
  const pref = user.notificationPref;
  if (n.email !== false && (pref?.email ?? true)) await enqueue('deliver', { notificationId: created.id, channel: 'email' }, { jobId: `email:${created.id}` });
  if (pref?.push && pref.fcmToken) await enqueue('deliver', { notificationId: created.id, channel: 'push' }, { jobId: `push:${created.id}` });
  return created;
}
