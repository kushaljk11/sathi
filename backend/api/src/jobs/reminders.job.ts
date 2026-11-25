import { prisma } from '../config/database';
import { notify } from '../helpers/notification.helper';
import { DAY_MS } from '../utils/date.util';

/** Reminder before a confirmed session (24h / 1h / 15min). Stale reminders (cancelled or rescheduled) are skipped. */
export async function appointmentReminder(data: Record<string, unknown>) {
  const a = await prisma.appointment.findUnique({ where: { id: String(data.appointmentId) }, include: { youth: true, counselor: true, meeting: true } });
  if (!a || a.status !== 'CONFIRMED' || a.startsAt.toISOString() !== data.startsAt) return;
  const off = Number(data.offsetMin);
  const when = off >= 1440 ? 'tomorrow' : off >= 60 ? 'in 1 hour' : 'in 15 minutes';
  const online = a.mode === 'ONLINE' ? (a.meeting?.status === 'READY' ? ' Your online meeting link is ready in Sathi.' : ' The online meeting link will appear in Sathi.') : '';
  for (const uid of [a.youth.userId, a.counselor.userId])
    await notify(uid, { type: 'APPOINTMENT_REMINDER', title: `Session ${when}`, body: `You have a session ${when}.${online}`, key: `rem:${a.id}:${off}:${uid}:${data.startsAt}` });
}

/** Gentle check-in prompt after a completed session. */
export async function followUp(data: Record<string, unknown>) {
  const a = await prisma.appointment.findUnique({ where: { id: String(data.appointmentId) }, include: { youth: true } });
  if (a?.status === 'COMPLETED')
    await notify(a.youth.userId, { type: 'FOLLOW_UP', title: 'How are things since your session?', body: 'Take a moment for a quick check-in.', key: `followup:${a.id}` });
}

/** Daily: check-in, task and program reminders; moderation evidence retention. */
export async function daily() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  const youths = await prisma.youthProfile.findMany({ where: { user: { status: 'ACTIVE' } }, include: { checkIns: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  for (const y of youths) {
    const last = y.checkIns[0]?.createdAt;
    if (!last || now.getTime() - last.getTime() >= y.checkInFrequencyDays * DAY_MS)
      await notify(y.userId, { type: 'CHECKIN_REMINDER', title: 'Time for a check-in', body: 'A quick check-in helps you notice what is changing.', key: `checkin-rem:${y.userId}:${day}`, email: false });
  }

  const dueSoon = await prisma.supportTask.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { gte: now, lt: new Date(now.getTime() + DAY_MS) } },
    include: { goal: { include: { plan: { include: { relationship: { include: { youth: true } } } } } } },
  });
  for (const t of dueSoon)
    await notify(t.goal.plan.relationship.youth.userId, { type: 'TASK_DUE', title: 'A task is due soon', body: 'One of your support plan tasks is due within a day.', key: `task-due:${t.id}` });

  const programsSoon = await prisma.programBooking.findMany({
    where: { status: 'CONFIRMED', program: { startsAt: { gte: now, lt: new Date(now.getTime() + DAY_MS) } } },
    include: { youth: true },
  });
  for (const b of programsSoon) await notify(b.youth.userId, { type: 'PROGRAM_REMINDER', title: 'Program starts soon', body: 'A program you booked starts within a day.', key: `program-rem:${b.id}` });

  // Retention: purge stored evidence text after the retention window (decision metadata is kept).
  await prisma.moderationCase.updateMany({ where: { retainUntil: { lt: now }, originalText: { not: '[purged]' } }, data: { originalText: '[purged]' } });
}
