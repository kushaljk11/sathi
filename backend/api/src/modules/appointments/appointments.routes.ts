import { Router } from 'express';
import { z } from 'zod';
import { assertTransition, SLOT_HOLD_MINUTES, REMINDER_OFFSETS_MIN, supportsMode, type AppointmentStatus } from '@sathi/shared';
import { asyncH, ok, prisma, validate, youthOf, counselorOf, HttpError, notFound, audit, getSetting } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';
import { notify } from '../../lib/notify';
import { enqueue, removeJobs } from '../../lib/queue';
import { consentInput, setConsents } from '../consents/consents.routes';
import { activateRelationship, recordMilestone, timeline } from '../support/support.service';
import { requestAppointmentRefund } from '../payments/payments.service';
import { ensureMeeting, cancelMeeting, rescheduleMeeting } from '../meetings/meetings.service';

const r = Router();
r.use(authenticate);

const ACTIVE: AppointmentStatus[] = ['PENDING_PAYMENT', 'PENDING_COUNSELOR', 'CONFIRMED'];

/** Place a 10-minute hold. Unique(slotId) on SlotHold makes concurrent holds fail safely. */
export async function holdSlot(userId: string, slotId: string) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.appointmentSlot.findUnique({ where: { id: slotId }, include: { hold: true, counselor: { include: { user: true } } } });
    if (!slot || slot.isBooked || slot.startsAt <= new Date()) throw new HttpError(409, 'This time is no longer available', 'SLOT_UNAVAILABLE');
    if (slot.counselor.verificationStatus !== 'APPROVED' || !slot.counselor.acceptingBookings || slot.counselor.user.status !== 'ACTIVE')
      throw new HttpError(409, 'This counselor is not accepting bookings');
    if (slot.hold) {
      if (slot.hold.expiresAt > new Date() && slot.hold.youthUserId !== userId) throw new HttpError(409, 'Someone else is booking this time. Please pick another.', 'SLOT_HELD');
      await tx.slotHold.delete({ where: { id: slot.hold.id } });
    }
    await tx.slotHold.deleteMany({ where: { youthUserId: userId } }); // one active hold per youth
    return tx.slotHold.create({ data: { slotId, youthUserId: userId, expiresAt: new Date(Date.now() + SLOT_HOLD_MINUTES * 60_000) } });
  });
}

r.post('/holds', requireRole('YOUTH'), asyncH(async (req, res) => {
  const { slotId } = validate(z.object({ slotId: z.string().uuid() }), req.body);
  ok(res, await holdSlot(req.user!.id, slotId), 201);
}));

r.delete('/holds/:id', requireRole('YOUTH'), asyncH(async (req, res) => {
  await prisma.slotHold.deleteMany({ where: { id: String(req.params.id), youthUserId: req.user!.id } });
  ok(res, { released: true });
}));

/** Convert a valid hold into an appointment. Consents are recorded at the same time. */
r.post('/', requireRole('YOUTH'), asyncH(async (req, res) => {
  const b = validate(z.object({ holdId: z.string().uuid(), mode: z.enum(['ONLINE', 'IN_PERSON']), consents: consentInput }), req.body);
  const y = await youthOf(req.user!.id);
  const appt = await prisma.$transaction(async (tx) => {
    const hold = await tx.slotHold.findUnique({ where: { id: b.holdId }, include: { slot: { include: { counselor: true } } } });
    if (!hold || hold.youthUserId !== req.user!.id) throw notFound('Hold');
    if (hold.expiresAt < new Date()) { await tx.slotHold.delete({ where: { id: hold.id } }); throw new HttpError(410, 'Your hold expired. Please choose the time again.', 'HOLD_EXPIRED'); }
    const c = hold.slot.counselor;
    if (!supportsMode(c.mode, b.mode)) throw new HttpError(400, 'This counselor does not offer that session format');
    // Compare-and-set prevents double booking even under concurrency (plus partial unique index in DB).
    const taken = await tx.appointmentSlot.updateMany({ where: { id: hold.slotId, isBooked: false }, data: { isBooked: true } });
    if (!taken.count) throw new HttpError(409, 'This time is no longer available', 'SLOT_UNAVAILABLE');
    await tx.slotHold.delete({ where: { id: hold.id } });
    await setConsents(tx, y.id, c.id, b.consents, 'Counseling appointment and support relationship');
    return tx.appointment.create({
      data: { youthId: y.id, counselorId: c.id, slotId: hold.slotId, mode: b.mode, feePaisa: c.sessionFeePaisa, startsAt: hold.slot.startsAt, endsAt: hold.slot.endsAt, status: c.sessionFeePaisa > 0 ? 'PENDING_PAYMENT' : 'PENDING_COUNSELOR' },
    });
  });
  if (appt.status === 'PENDING_COUNSELOR') {
    const c = await prisma.counselorProfile.findUniqueOrThrow({ where: { id: appt.counselorId } });
    await notify(c.userId, { type: 'BOOKING_REQUEST', title: 'New booking request', body: 'A new session request is waiting for your response.', key: `booking-request:${appt.id}` });
  }
  ok(res, appt, 201);
}));

const include = {
  counselor: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
  youth: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
  meeting: { select: { status: true, provider: true, creationStatus: true } },
  payments: { select: { status: true, provider: true, amountPaisa: true, reference: true }, orderBy: { createdAt: 'desc' as const } },
  sessionRecord: true,
} as const;

r.get('/', requireRole('YOUTH', 'COUNSELOR'), asyncH(async (req, res) => {
  const q = validate(z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('all'), status: z.string().optional() }), req.query);
  const owner = req.user!.role === 'YOUTH' ? { youth: { userId: req.user!.id } } : { counselor: { userId: req.user!.id } };
  const time = q.scope === 'upcoming' ? { endsAt: { gte: new Date() } } : q.scope === 'past' ? { endsAt: { lt: new Date() } } : {};
  const list = await prisma.appointment.findMany({ where: { ...owner, ...time, ...(q.status ? { status: q.status as AppointmentStatus } : {}) }, include, orderBy: { startsAt: q.scope === 'past' ? 'desc' : 'asc' }, take: 200 });
  // Private counselor notes never live on appointments; session record summaries are shared by design.
  ok(res, list);
}));

async function loadForActor(id: string, userId: string) {
  const a = await prisma.appointment.findUnique({ where: { id }, include: { counselor: true, youth: true, slot: true } });
  if (!a) throw notFound('Appointment');
  const isYouth = a.youth.userId === userId, isCounselor = a.counselor.userId === userId;
  if (!isYouth && !isCounselor) throw notFound('Appointment');
  return { a, isYouth, isCounselor };
}

async function scheduleReminders(a: { id: string; startsAt: Date }) {
  for (const off of REMINDER_OFFSETS_MIN) {
    const delay = a.startsAt.getTime() - off * 60_000 - Date.now();
    if (delay > 0) await enqueue('appointment-reminder', { appointmentId: a.id, offsetMin: off, startsAt: a.startsAt.toISOString() }, { delay, jobId: `reminder:${a.id}:${off}:${a.startsAt.getTime()}` });
  }
}
const reminderIds = (a: { id: string; startsAt: Date }) => REMINDER_OFFSETS_MIN.map((o) => `reminder:${a.id}:${o}:${a.startsAt.getTime()}`);

r.post('/:id/decision', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(z.object({ decision: z.enum(['ACCEPT', 'DECLINE']), reason: z.string().max(300).optional() }), req.body);
  const { a, isCounselor } = await loadForActor(String(req.params.id), req.user!.id);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  const to = b.decision === 'ACCEPT' ? 'CONFIRMED' : 'DECLINED';
  try { assertTransition(a.status, to); } catch { throw new HttpError(409, `Cannot ${b.decision.toLowerCase()} an appointment that is ${a.status}`); }

  if (to === 'DECLINED') {
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: a.id }, data: { status: 'DECLINED', cancelReason: b.reason } }),
      prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } }),
    ]);
    await requestAppointmentRefund(a.id, 'COUNSELOR', req.user!.id);
    await notify(a.youth.userId, { type: 'BOOKING_DECLINED', title: 'Booking not accepted', body: 'Your counselor could not accept this booking. Any payment will be fully refunded.', key: `declined:${a.id}` });
    return ok(res, { status: 'DECLINED' });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const moved = await tx.appointment.updateMany({ where: { id: a.id, status: 'PENDING_COUNSELOR' }, data: { status: 'CONFIRMED' } });
    if (!moved.count) throw new HttpError(409, 'Appointment changed, refresh and try again');
    const { rel, created } = await activateRelationship(tx, a.youthId, a.counselorId);
    await tx.appointment.update({ where: { id: a.id }, data: { relationshipId: rel.id } });
    await timeline(rel.id, 'APPOINTMENT', 'Session confirmed', tx);
    if (created) await recordMilestone(a.youth.userId, 'COUNSELOR_CONNECTED', rel.id, tx);
    return tx.appointment.findUniqueOrThrow({ where: { id: a.id } });
  });
  await notify(a.youth.userId, { type: 'APPOINTMENT_CONFIRMED', title: 'Session confirmed', body: 'Your counselor accepted your session request.', key: `confirmed:${a.id}` });
  await scheduleReminders(updated);
  const meeting = updated.mode === 'ONLINE' ? await ensureMeeting(updated.id) : null;
  await audit(req.user!.id, 'APPOINTMENT_CONFIRMED', 'Appointment', a.id);
  ok(res, { status: 'CONFIRMED', relationshipId: updated.relationshipId, meeting: meeting && { status: meeting.status, creationStatus: meeting.creationStatus } });
}));

r.post('/:id/cancel', requireRole('YOUTH', 'COUNSELOR'), asyncH(async (req, res) => {
  const { reason } = validate(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
  const { a, isYouth } = await loadForActor(String(req.params.id), req.user!.id);
  try { assertTransition(a.status, 'CANCELLED'); } catch { throw new HttpError(409, `Cannot cancel an appointment that is ${a.status}`); }
  await prisma.$transaction([
    prisma.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED', cancelReason: reason } }),
    prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } }),
  ]);
  const refund = await requestAppointmentRefund(a.id, isYouth ? 'YOUTH' : 'COUNSELOR', req.user!.id);
  await cancelMeeting(a.id);
  await removeJobs(reminderIds(a));
  const other = isYouth ? a.counselor.userId : a.youth.userId;
  await notify(other, { type: 'APPOINTMENT_CANCELLED', title: 'Session cancelled', body: 'A scheduled session was cancelled. Open Sathi for details.', key: `cancelled:${a.id}:${other}` });
  if (a.relationshipId) await timeline(a.relationshipId, 'APPOINTMENT', 'Session cancelled');
  ok(res, { status: 'CANCELLED', refund: refund && { amountPaisa: refund.amountPaisa, status: refund.status } });
}));

/** Reschedule onto a new held slot. Requires counselor re-confirmation; the meeting event is moved. */
r.post('/:id/reschedule', requireRole('YOUTH'), asyncH(async (req, res) => {
  const { holdId } = validate(z.object({ holdId: z.string().uuid() }), req.body);
  const { a, isYouth } = await loadForActor(String(req.params.id), req.user!.id);
  if (!isYouth || !['PENDING_COUNSELOR', 'CONFIRMED'].includes(a.status)) throw new HttpError(409, 'This appointment cannot be rescheduled');
  const updated = await prisma.$transaction(async (tx) => {
    const hold = await tx.slotHold.findUnique({ where: { id: holdId }, include: { slot: true } });
    if (!hold || hold.youthUserId !== req.user!.id || hold.expiresAt < new Date()) throw new HttpError(410, 'Hold expired', 'HOLD_EXPIRED');
    if (hold.slot.counselorId !== a.counselorId) throw new HttpError(400, 'Choose a time with the same counselor');
    const taken = await tx.appointmentSlot.updateMany({ where: { id: hold.slotId, isBooked: false }, data: { isBooked: true } });
    if (!taken.count) throw new HttpError(409, 'This time is no longer available');
    await tx.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } });
    await tx.slotHold.delete({ where: { id: hold.id } });
    return tx.appointment.update({ where: { id: a.id }, data: { slotId: hold.slotId, startsAt: hold.slot.startsAt, endsAt: hold.slot.endsAt, status: 'PENDING_COUNSELOR' } });
  });
  await removeJobs(reminderIds(a));
  await rescheduleMeeting(a.id, updated.startsAt, updated.endsAt);
  await notify(a.counselor.userId, { type: 'APPOINTMENT_RESCHEDULED', title: 'Session rescheduled', body: 'A session was moved to a new time and needs your confirmation.', key: `rescheduled:${a.id}:${updated.startsAt.getTime()}` });
  ok(res, updated);
}));

/** Counselor marks attendance after the session ends; completion schedules the follow-up prompt. */
r.post('/:id/outcome', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { outcome } = validate(z.object({ outcome: z.enum(['COMPLETED', 'MISSED']) }), req.body);
  const { a, isCounselor } = await loadForActor(String(req.params.id), req.user!.id);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  try { assertTransition(a.status, outcome); } catch { throw new HttpError(409, `Appointment is ${a.status}`); }
  if (a.startsAt > new Date()) throw new HttpError(409, 'The session has not started yet');
  await prisma.appointment.update({ where: { id: a.id }, data: { status: outcome } });
  await prisma.meeting.updateMany({ where: { appointmentId: a.id, status: 'READY' }, data: { status: 'COMPLETED' } });
  if (a.relationshipId) {
    await timeline(a.relationshipId, 'APPOINTMENT', outcome === 'COMPLETED' ? 'Session completed' : 'Session missed');
    if (outcome === 'COMPLETED') {
      await recordMilestone(a.youth.userId, 'FIRST_SESSION', a.relationshipId);
      const hours = await getSetting('followup.hoursAfterSession');
      await enqueue('followup', { appointmentId: a.id }, { delay: hours * 3600_000, jobId: `followup:${a.id}` });
    }
  }
  ok(res, { status: outcome });
}));

/** Session record (shared with youth). Private notes are a separate endpoint/model. */
r.put('/:id/session-record', requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const b = validate(z.object({ summary: z.string().min(1).max(5000), topics: z.array(z.string().max(80)).max(20), nextSteps: z.string().max(2000).optional(), followUpDate: z.coerce.date().optional() }), req.body);
  const { a, isCounselor } = await loadForActor(String(req.params.id), req.user!.id);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  if (!['CONFIRMED', 'COMPLETED'].includes(a.status)) throw new HttpError(409, 'Session records are for confirmed or completed sessions');
  const rec = await prisma.sessionRecord.upsert({ where: { appointmentId: a.id }, update: b, create: { ...b, appointmentId: a.id } });
  await notify(a.youth.userId, { type: 'SESSION_RECORD', title: 'Session summary available', body: 'Your counselor shared a session summary.', key: `session-record:${rec.id}` });
  ok(res, rec);
}));

export default r;
