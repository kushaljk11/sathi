import { assertTransition, REMINDER_OFFSETS_MIN, SLOT_HOLD_MINUTES, supportsMode, type AppointmentStatus } from '@sathi/shared';
import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { youthOf } from '../../helpers/identity.helper';
import { notify } from '../../helpers/notification.helper';
import { getSetting } from '../../helpers/settings.helper';
import { enqueue, removeJobs } from '../../queues/queue';
import type { AuthUser } from '../../types/common.types';
import { MINUTE_MS } from '../../utils/date.util';
import { setConsents } from '../consents/consents.service';
import { ensureMeeting, cancelMeeting, rescheduleMeeting } from '../meetings/meetings.service';
import { requestAppointmentRefund } from '../payments/payments.service';
import { activateRelationship, recordMilestone, timeline } from '../support/support.service';
import { APPOINTMENT_INCLUDE } from './bookings.constants';
import type { CreateBookingInput, DecisionInput, ListBookingsQuery, OutcomeInput } from './bookings.types';

async function scheduleReminders(a: { id: string; startsAt: Date }) {
  for (const off of REMINDER_OFFSETS_MIN) {
    const delay = a.startsAt.getTime() - off * MINUTE_MS - Date.now();
    if (delay > 0) await enqueue('appointment-reminder', { appointmentId: a.id, offsetMin: off, startsAt: a.startsAt.toISOString() }, { delay, jobId: `reminder:${a.id}:${off}:${a.startsAt.getTime()}` });
  }
}

const reminderIds = (a: { id: string; startsAt: Date }) => REMINDER_OFFSETS_MIN.map((o) => `reminder:${a.id}:${o}:${a.startsAt.getTime()}`);

/** Loads an appointment for one of its two participants. Non-participants get a 404 so existence is not revealed. */
export async function loadAppointmentForActor(id: string, userId: string) {
  const a = await prisma.appointment.findUnique({ where: { id }, include: { counselor: true, youth: true, slot: true } });
  if (!a) throw notFound('Appointment');
  const isYouth = a.youth.userId === userId;
  const isCounselor = a.counselor.userId === userId;
  if (!isYouth && !isCounselor) throw notFound('Appointment');
  return { a, isYouth, isCounselor };
}

/** Place a 10-minute hold. Unique(slotId) on SlotHold makes concurrent holds fail safely. */
export async function holdSlot(userId: string, slotId: string) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.appointmentSlot.findUnique({ where: { id: slotId }, include: { hold: true, counselor: { include: { user: true } } } });
    if (!slot || slot.isBooked || slot.startsAt <= new Date()) throw new AppError(409, 'This time is no longer available', 'SLOT_UNAVAILABLE');
    if (slot.counselor.verificationStatus !== 'APPROVED' || !slot.counselor.acceptingBookings || slot.counselor.user.status !== 'ACTIVE')
      throw new AppError(409, 'This counselor is not accepting bookings');
    if (slot.hold) {
      if (slot.hold.expiresAt > new Date() && slot.hold.youthUserId !== userId) throw new AppError(409, 'Someone else is booking this time. Please pick another.', 'SLOT_HELD');
      await tx.slotHold.delete({ where: { id: slot.hold.id } });
    }
    await tx.slotHold.deleteMany({ where: { youthUserId: userId } }); // one active hold per youth
    return tx.slotHold.create({ data: { slotId, youthUserId: userId, expiresAt: new Date(Date.now() + SLOT_HOLD_MINUTES * MINUTE_MS) } });
  });
}

export async function releaseHold(userId: string, holdId: string) {
  await prisma.slotHold.deleteMany({ where: { id: holdId, youthUserId: userId } });
  return { released: true };
}

/** Convert a valid hold into an appointment. Consents are recorded at the same time. */
export async function createBooking(userId: string, input: CreateBookingInput) {
  const youth = await youthOf(userId);
  const appt = await prisma.$transaction(async (tx) => {
    const hold = await tx.slotHold.findUnique({ where: { id: input.holdId }, include: { slot: { include: { counselor: true } } } });
    if (!hold || hold.youthUserId !== userId) throw notFound('Hold');
    if (hold.expiresAt < new Date()) {
      await tx.slotHold.delete({ where: { id: hold.id } });
      throw new AppError(410, 'Your hold expired. Please choose the time again.', 'HOLD_EXPIRED');
    }
    const c = hold.slot.counselor;
    if (!supportsMode(c.mode, input.mode)) throw new AppError(400, 'This counselor does not offer that session format');
    // Compare-and-set prevents double booking even under concurrency (plus partial unique index in DB).
    const taken = await tx.appointmentSlot.updateMany({ where: { id: hold.slotId, isBooked: false }, data: { isBooked: true } });
    if (!taken.count) throw new AppError(409, 'This time is no longer available', 'SLOT_UNAVAILABLE');
    await tx.slotHold.delete({ where: { id: hold.id } });
    await setConsents(tx, youth.id, c.id, input.consents, 'Counseling appointment and support relationship');
    return tx.appointment.create({
      data: {
        youthId: youth.id,
        counselorId: c.id,
        slotId: hold.slotId,
        mode: input.mode,
        feePaisa: c.sessionFeePaisa,
        startsAt: hold.slot.startsAt,
        endsAt: hold.slot.endsAt,
        status: c.sessionFeePaisa > 0 ? 'PENDING_PAYMENT' : 'PENDING_COUNSELOR',
      },
    });
  });
  if (appt.status === 'PENDING_COUNSELOR') {
    const c = await prisma.counselorProfile.findUniqueOrThrow({ where: { id: appt.counselorId } });
    await notify(c.userId, { type: 'BOOKING_REQUEST', title: 'New booking request', body: 'A new session request is waiting for your response.', key: `booking-request:${appt.id}` });
  }
  return appt;
}

export async function listAppointments(user: AuthUser, query: ListBookingsQuery) {
  const owner = user.role === 'YOUTH' ? { youth: { userId: user.id } } : { counselor: { userId: user.id } };
  const time = query.scope === 'upcoming' ? { endsAt: { gte: new Date() } } : query.scope === 'past' ? { endsAt: { lt: new Date() } } : {};
  // Private counselor notes never live on appointments; session record summaries are shared by design.
  return prisma.appointment.findMany({
    where: { ...owner, ...time, ...(query.status ? { status: query.status as AppointmentStatus } : {}) },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startsAt: query.scope === 'past' ? 'desc' : 'asc' },
    take: 200,
  });
}

export async function decideBooking(actorId: string, appointmentId: string, input: DecisionInput) {
  const { a, isCounselor } = await loadAppointmentForActor(appointmentId, actorId);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  const to = input.decision === 'ACCEPT' ? 'CONFIRMED' : 'DECLINED';
  try {
    assertTransition(a.status, to);
  } catch {
    throw new AppError(409, `Cannot ${input.decision.toLowerCase()} an appointment that is ${a.status}`);
  }

  if (to === 'DECLINED') {
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: a.id }, data: { status: 'DECLINED', cancelReason: input.reason } }),
      prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } }),
    ]);
    await requestAppointmentRefund(a.id, 'COUNSELOR', actorId);
    await notify(a.youth.userId, { type: 'BOOKING_DECLINED', title: 'Booking not accepted', body: 'Your counselor could not accept this booking. Any payment will be fully refunded.', key: `declined:${a.id}` });
    return { status: 'DECLINED' };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const moved = await tx.appointment.updateMany({ where: { id: a.id, status: 'PENDING_COUNSELOR' }, data: { status: 'CONFIRMED' } });
    if (!moved.count) throw new AppError(409, 'Appointment changed, refresh and try again');
    const { rel, created } = await activateRelationship(tx, a.youthId, a.counselorId);
    await tx.appointment.update({ where: { id: a.id }, data: { relationshipId: rel.id } });
    await timeline(rel.id, 'APPOINTMENT', 'Session confirmed', tx);
    if (created) await recordMilestone(a.youth.userId, 'COUNSELOR_CONNECTED', rel.id, tx);
    return tx.appointment.findUniqueOrThrow({ where: { id: a.id } });
  });
  await notify(a.youth.userId, { type: 'APPOINTMENT_CONFIRMED', title: 'Session confirmed', body: 'Your counselor accepted your session request.', key: `confirmed:${a.id}` });
  await scheduleReminders(updated);
  const meeting = updated.mode === 'ONLINE' ? await ensureMeeting(updated.id) : null;
  await audit(actorId, 'APPOINTMENT_CONFIRMED', 'Appointment', a.id);
  return { status: 'CONFIRMED', relationshipId: updated.relationshipId, meeting: meeting && { status: meeting.status, creationStatus: meeting.creationStatus } };
}

export async function cancelBooking(actorId: string, appointmentId: string, reason?: string) {
  const { a, isYouth } = await loadAppointmentForActor(appointmentId, actorId);
  try {
    assertTransition(a.status, 'CANCELLED');
  } catch {
    throw new AppError(409, `Cannot cancel an appointment that is ${a.status}`);
  }
  await prisma.$transaction([
    prisma.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED', cancelReason: reason } }),
    prisma.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } }),
  ]);
  const refund = await requestAppointmentRefund(a.id, isYouth ? 'YOUTH' : 'COUNSELOR', actorId);
  await cancelMeeting(a.id);
  await removeJobs(reminderIds(a));
  const other = isYouth ? a.counselor.userId : a.youth.userId;
  await notify(other, { type: 'APPOINTMENT_CANCELLED', title: 'Session cancelled', body: 'A scheduled session was cancelled. Open Sathi for details.', key: `cancelled:${a.id}:${other}` });
  if (a.relationshipId) await timeline(a.relationshipId, 'APPOINTMENT', 'Session cancelled');
  return { status: 'CANCELLED', refund: refund && { amountPaisa: refund.amountPaisa, status: refund.status } };
}

/** Reschedule onto a new held slot. Requires counselor re-confirmation; the meeting event is moved. */
export async function rescheduleBooking(actorId: string, appointmentId: string, holdId: string) {
  const { a, isYouth } = await loadAppointmentForActor(appointmentId, actorId);
  if (!isYouth || !['PENDING_COUNSELOR', 'CONFIRMED'].includes(a.status)) throw new AppError(409, 'This appointment cannot be rescheduled');
  const updated = await prisma.$transaction(async (tx) => {
    const hold = await tx.slotHold.findUnique({ where: { id: holdId }, include: { slot: true } });
    if (!hold || hold.youthUserId !== actorId || hold.expiresAt < new Date()) throw new AppError(410, 'Hold expired', 'HOLD_EXPIRED');
    if (hold.slot.counselorId !== a.counselorId) throw new AppError(400, 'Choose a time with the same counselor');
    const taken = await tx.appointmentSlot.updateMany({ where: { id: hold.slotId, isBooked: false }, data: { isBooked: true } });
    if (!taken.count) throw new AppError(409, 'This time is no longer available');
    await tx.appointmentSlot.update({ where: { id: a.slotId }, data: { isBooked: false } });
    await tx.slotHold.delete({ where: { id: hold.id } });
    return tx.appointment.update({ where: { id: a.id }, data: { slotId: hold.slotId, startsAt: hold.slot.startsAt, endsAt: hold.slot.endsAt, status: 'PENDING_COUNSELOR' } });
  });
  await removeJobs(reminderIds(a));
  await rescheduleMeeting(a.id, updated.startsAt, updated.endsAt);
  await notify(a.counselor.userId, {
    type: 'APPOINTMENT_RESCHEDULED',
    title: 'Session rescheduled',
    body: 'A session was moved to a new time and needs your confirmation.',
    key: `rescheduled:${a.id}:${updated.startsAt.getTime()}`,
  });
  return updated;
}

/** Counselor marks attendance after the session ends; completion schedules the follow-up prompt. */
export async function recordOutcome(actorId: string, appointmentId: string, { outcome }: OutcomeInput) {
  const { a, isCounselor } = await loadAppointmentForActor(appointmentId, actorId);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  try {
    assertTransition(a.status, outcome);
  } catch {
    throw new AppError(409, `Appointment is ${a.status}`);
  }
  if (a.startsAt > new Date()) throw new AppError(409, 'The session has not started yet');
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
  return { status: outcome };
}
