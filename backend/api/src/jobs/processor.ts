import nodemailer from 'nodemailer';
import { prisma } from '../lib/core';
import { env } from '../lib/env';
import { notify } from '../lib/notify';
import { ensureMeeting } from '../modules/meetings/meetings.service';
import { verifyAndSettle } from '../modules/payments/payments.service';

const transport = env.EMAIL_HOST
  ? nodemailer.createTransport({ host: env.EMAIL_HOST, port: env.EMAIL_PORT ?? 587, secure: env.EMAIL_PORT === 465, auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD } : undefined })
  : null;

export async function sendEmail(to: string, subject: string, text: string) {
  if (!transport) return console.log(`[DEV EMAIL ADAPTER] to=${to} subject="${subject}"\n${text}`);
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text });
}

/** Push via FCM HTTP v1 when configured. Payload is neutral and never contains wellbeing details. */
async function sendPush(token: string, title: string) {
  const projectId = process.env.FCM_PROJECT_ID, clientEmail = process.env.FCM_CLIENT_EMAIL, key = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !key) return console.log('[DEV PUSH ADAPTER] FCM not configured; push skipped');
  const { JWT } = await import('google-auth-library');
  const client = new JWT({ email: clientEmail, key: key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  const { token: access } = await client.getAccessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: 'Sathi', body: title } } }),
  });
  if (!res.ok) throw new Error(`FCM ${res.status}`);
}

/** Quiet hours in the user's timezone; returns ms to wait (0 if allowed now). */
export function quietDelayMs(pref: { quietStartMin: number | null; quietEndMin: number | null } | null, tz: string, now = new Date()) {
  if (!pref || pref.quietStartMin == null || pref.quietEndMin == null) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const cur = Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
  const { quietStartMin: s, quietEndMin: e } = pref;
  const inQuiet = s < e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inQuiet) return 0;
  return (((e - cur) + 1440) % 1440) * 60_000;
}

export class DelayError extends Error { constructor(public ms: number) { super('delay'); } }

export async function processJob(name: string, data: Record<string, unknown>) {
  switch (name) {
    case 'email':
      return sendEmail(String(data.to), String(data.subject), String(data.text));
    case 'deliver': {
      const n = await prisma.notification.findUnique({ where: { id: String(data.notificationId) }, include: { user: { include: { notificationPref: true } } } });
      if (!n || n.user.status !== 'ACTIVE') return;
      const wait = quietDelayMs(n.user.notificationPref, n.user.timezone);
      if (wait > 0 && !['SAFETY_REVIEW'].includes(n.type)) throw new DelayError(wait);
      if (data.channel === 'email') return sendEmail(n.user.email, `Sathi: ${n.title}`, `${n.body}\n\nOpen Sathi: ${env.FRONTEND_URL}`);
      if (data.channel === 'push' && n.user.notificationPref?.fcmToken) return sendPush(n.user.notificationPref.fcmToken, n.title);
      return;
    }
    case 'appointment-reminder': {
      const a = await prisma.appointment.findUnique({ where: { id: String(data.appointmentId) }, include: { youth: true, counselor: true, meeting: true } });
      // Skip stale reminders (cancelled or rescheduled).
      if (!a || a.status !== 'CONFIRMED' || a.startsAt.toISOString() !== data.startsAt) return;
      const off = Number(data.offsetMin);
      const when = off >= 1440 ? 'tomorrow' : off >= 60 ? 'in 1 hour' : 'in 15 minutes';
      const online = a.mode === 'ONLINE' ? (a.meeting?.status === 'READY' ? ' Your online meeting link is ready in Sathi.' : ' The online meeting link will appear in Sathi.') : '';
      for (const uid of [a.youth.userId, a.counselor.userId])
        await notify(uid, { type: 'APPOINTMENT_REMINDER', title: `Session ${when}`, body: `You have a session ${when}.${online}`, key: `rem:${a.id}:${off}:${uid}:${data.startsAt}` });
      return;
    }
    case 'followup': {
      const a = await prisma.appointment.findUnique({ where: { id: String(data.appointmentId) }, include: { youth: true } });
      if (a?.status === 'COMPLETED') await notify(a.youth.userId, { type: 'FOLLOW_UP', title: 'How are things since your session?', body: 'Take a moment for a quick check-in.', key: `followup:${a.id}` });
      return;
    }
    case 'meeting-create':
      await ensureMeeting(String(data.appointmentId));
      return;
    case 'sweep':
      return sweep();
    case 'daily':
      return daily();
  }
}

/** Every minute: expire holds and unpaid appointments, reconcile pending payments. */
export async function sweep() {
  const now = new Date();
  await prisma.slotHold.deleteMany({ where: { expiresAt: { lt: now } } });
  const stale = await prisma.appointment.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(now.getTime() - 15 * 60_000) } }, include: { payments: true } });
  for (const a of stale) {
    for (const p of a.payments.filter((x) => ['INITIATED', 'PENDING'].includes(x.status))) await verifyAndSettle(p.reference).catch(() => null);
    const expired = await prisma.appointment.updateMany({ where: { id: a.id, status: 'PENDING_PAYMENT' }, data: { status: 'EXPIRED' } });
    if (expired.count) await prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } });
  }
  // Unpaid program seats are released after 30 minutes.
  const unpaid = await prisma.programBooking.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(now.getTime() - 30 * 60_000) } } });
  for (const b of unpaid) {
    const { cancelProgramBooking } = await import('../modules/programs/programs.service');
    const y = await prisma.youthProfile.findUniqueOrThrow({ where: { id: b.youthId } });
    await cancelProgramBooking(b.id, { userId: y.userId }).catch(() => null);
  }
  await prisma.supportTask.updateMany({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } }, data: { status: 'OVERDUE' } });
  await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
}

/** Daily: check-in, task and program reminders; moderation evidence retention. */
export async function daily() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const youths = await prisma.youthProfile.findMany({ where: { user: { status: 'ACTIVE' } }, include: { checkIns: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  for (const y of youths) {
    const last = y.checkIns[0]?.createdAt;
    if (!last || now.getTime() - last.getTime() >= y.checkInFrequencyDays * 864e5)
      await notify(y.userId, { type: 'CHECKIN_REMINDER', title: 'Time for a check-in', body: 'A quick check-in helps you notice what is changing.', key: `checkin-rem:${y.userId}:${day}`, email: false });
  }
  const dueSoon = await prisma.supportTask.findMany({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { gte: now, lt: new Date(now.getTime() + 864e5) } }, include: { goal: { include: { plan: { include: { relationship: { include: { youth: true } } } } } } } });
  for (const t of dueSoon) await notify(t.goal.plan.relationship.youth.userId, { type: 'TASK_DUE', title: 'A task is due soon', body: 'One of your support plan tasks is due within a day.', key: `task-due:${t.id}` });
  const programsSoon = await prisma.programBooking.findMany({ where: { status: 'CONFIRMED', program: { startsAt: { gte: now, lt: new Date(now.getTime() + 864e5) } } }, include: { youth: true } });
  for (const b of programsSoon) await notify(b.youth.userId, { type: 'PROGRAM_REMINDER', title: 'Program starts soon', body: 'A program you booked starts within a day.', key: `program-rem:${b.id}` });
  // Retention: purge stored evidence text after the retention window (decision metadata is kept).
  await prisma.moderationCase.updateMany({ where: { retainUntil: { lt: now }, originalText: { not: '[purged]' } }, data: { originalText: '[purged]' } });
}

/** Dev fallback when Redis/worker is not running: run sweeps in-process so holds/expiry still work. */
export function startDevMaintenance() {
  if (env.NODE_ENV !== 'development' || process.env.DISABLE_DEV_MAINTENANCE === 'true') return;
  setInterval(() => sweep().catch((e) => console.error('[dev-maintenance]', e.message)), 60_000).unref();
}
