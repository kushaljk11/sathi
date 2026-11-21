import { needsOnlineMeeting } from '@sathi/shared';
import { prisma, HttpError, notFound } from '../../lib/core';
import { devManualMeetings, googleConfigured } from '../../lib/env';
import { notify } from '../../lib/notify';
import { enqueue } from '../../lib/queue';
import { providers, MeetingProviderError } from './providers';

/**
 * Idempotently ensures a meeting for a CONFIRMED ONLINE appointment.
 * A conditional status update ensures only one concurrent caller performs creation.
 */
export async function ensureMeeting(appointmentId: string) {
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { counselor: true, youth: true, meeting: true } });
  if (!a) throw notFound('Appointment');
  if (!needsOnlineMeeting(a.status, a.mode)) return null; // in-person or not confirmed: never create a link
  const organizerUserId = a.counselor.userId;
  const hasGoogle = googleConfigured && (await prisma.googleCredential.findUnique({ where: { userId: organizerUserId } }))?.status === 'CONNECTED';
  const provider = hasGoogle ? 'GOOGLE_MEET' : 'MANUAL_DEV';

  let m = a.meeting ?? (await prisma.meeting.upsert({
    where: { appointmentId }, update: {},
    create: { appointmentId, provider, organizerUserId, startTime: a.startsAt, endTime: a.endsAt, status: 'PENDING' },
  }));
  if (m.status === 'READY') return m;

  if (provider === 'MANUAL_DEV') {
    const code = googleConfigured ? 'GOOGLE_NOT_CONNECTED' : 'GOOGLE_NOT_CONFIGURED';
    m = await prisma.meeting.update({ where: { id: m.id }, data: { provider: 'MANUAL_DEV', status: 'FAILED', creationStatus: code } });
    await notify(organizerUserId, { type: 'MEETING_SETUP', title: 'Meeting setup needed', body: devManualMeetings ? 'Connect Google or add a development meeting link for an upcoming online session.' : 'Connect your Google account to create the meeting for an upcoming online session.', key: `meeting-setup:${m.id}:${code}` });
    return m;
  }

  const claimed = await prisma.meeting.updateMany({ where: { id: m.id, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'CREATING', provider: 'GOOGLE_MEET', attempts: { increment: 1 } } });
  if (!claimed.count) return prisma.meeting.findUniqueOrThrow({ where: { id: m.id } }); // another worker is creating it

  try {
    const d = await providers.GOOGLE_MEET.create({ organizerUserId, requestId: m.id, start: a.startsAt, end: a.endsAt, existingEventId: m.providerEventId });
    m = await prisma.meeting.update({ where: { id: m.id }, data: { ...d, status: 'READY', creationStatus: 'OK' } });
    for (const uid of [a.youth.userId, organizerUserId])
      await notify(uid, { type: 'MEETING_CREATED', title: 'Online session ready', body: 'The meeting link for your upcoming session is ready in Sathi.', key: `meeting-ready:${m.id}:${uid}` });
    return m;
  } catch (e) {
    const code = e instanceof MeetingProviderError ? e.code : 'PROVIDER_ERROR';
    m = await prisma.meeting.update({ where: { id: m.id }, data: { status: 'FAILED', creationStatus: code } });
    await notify(organizerUserId, { type: 'MEETING_FAILED', title: 'Meeting could not be created', body: 'Open your appointments to retry creating the online meeting.', key: `meeting-failed:${m.id}:${m.attempts}` });
    return m;
  }
}

export async function cancelMeeting(appointmentId: string) {
  const m = await prisma.meeting.findUnique({ where: { appointmentId } });
  if (!m || m.status === 'CANCELLED' || m.status === 'COMPLETED') return m;
  let cancellationStatus = 'OK';
  if (m.provider === 'GOOGLE_MEET' && m.providerEventId)
    await providers.GOOGLE_MEET.cancel({ organizerUserId: m.organizerUserId, eventId: m.providerEventId }).catch(() => { cancellationStatus = 'PROVIDER_ERROR'; });
  return prisma.meeting.update({ where: { id: m.id }, data: { status: 'CANCELLED', cancellationStatus } });
}

/** Reschedule: update the existing event when possible, else recreate after re-confirmation. */
export async function rescheduleMeeting(appointmentId: string, start: Date, end: Date) {
  const m = await prisma.meeting.findUnique({ where: { appointmentId } });
  if (!m || m.status === 'CANCELLED') return null;
  if (m.provider === 'GOOGLE_MEET' && m.providerEventId && m.status === 'READY') {
    try {
      await providers.GOOGLE_MEET.reschedule({ organizerUserId: m.organizerUserId, eventId: m.providerEventId, start, end });
      return prisma.meeting.update({ where: { id: m.id }, data: { startTime: start, endTime: end } });
    } catch {
      return prisma.meeting.update({ where: { id: m.id }, data: { startTime: start, endTime: end, status: 'FAILED', creationStatus: 'RESCHEDULE_FAILED' } });
    }
  }
  return prisma.meeting.update({ where: { id: m.id }, data: { startTime: start, endTime: end } });
}

export async function setManualDevLink(appointmentId: string, counselorUserId: string, url: string) {
  if (!devManualMeetings) throw new HttpError(403, 'Manual meeting links are disabled in this environment');
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { counselor: true, youth: true } });
  if (!a || a.counselor.userId !== counselorUserId) throw notFound('Appointment');
  if (!needsOnlineMeeting(a.status, a.mode)) throw new HttpError(409, 'Only confirmed online appointments have meetings');
  const m = await prisma.meeting.upsert({
    where: { appointmentId },
    update: { provider: 'MANUAL_DEV', meetingUrl: url, status: 'READY', creationStatus: 'MANUAL_DEV' },
    create: { appointmentId, provider: 'MANUAL_DEV', organizerUserId: counselorUserId, startTime: a.startsAt, endTime: a.endsAt, meetingUrl: url, status: 'READY', creationStatus: 'MANUAL_DEV' },
  });
  await notify(a.youth.userId, { type: 'MEETING_CREATED', title: 'Online session ready', body: 'The meeting link for your upcoming session is ready in Sathi.', key: `meeting-ready:${m.id}:manual` });
  return m;
}

/** Queue creation in the background (retries via BullMQ); also runs inline for immediate feedback. */
export async function scheduleMeetingCreation(appointmentId: string) {
  await enqueue('meeting-create', { appointmentId }, { jobId: `meeting-create:${appointmentId}`, attempts: 3 });
}
