import { canJoin, needsOnlineMeeting } from '@sathi/shared';
import { prisma } from '../../config/database';
import { devManualMeetings, googleConfigured } from '../../config/env';
import { AppError, notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { notify } from '../../helpers/notification.helper';
import { providers, oauthClient, GOOGLE_SCOPES, MeetingProviderError } from '../../integrations/google-calendar/google-calendar.provider';
import { enqueue } from '../../queues/queue';
import type { AuthUser } from '../../types/common.types';
import { decrypt, encrypt, randomToken, sha256 } from '../../utils/hash.util';
import { OAUTH_STATE_TTL_MS } from './meetings.constants';
import type { GoogleCallbackQuery, GoogleCallbackResult } from './meetings.types';

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

  let m =
    a.meeting ??
    (await prisma.meeting.upsert({
      where: { appointmentId },
      update: {},
      create: { appointmentId, provider, organizerUserId, startTime: a.startsAt, endTime: a.endsAt, status: 'PENDING' },
    }));
  if (m.status === 'READY') return m;

  if (provider === 'MANUAL_DEV') {
    const code = googleConfigured ? 'GOOGLE_NOT_CONNECTED' : 'GOOGLE_NOT_CONFIGURED';
    m = await prisma.meeting.update({ where: { id: m.id }, data: { provider: 'MANUAL_DEV', status: 'FAILED', creationStatus: code } });
    await notify(organizerUserId, {
      type: 'MEETING_SETUP',
      title: 'Meeting setup needed',
      body: devManualMeetings
        ? 'Connect Google or add a development meeting link for an upcoming online session.'
        : 'Connect your Google account to create the meeting for an upcoming online session.',
      key: `meeting-setup:${m.id}:${code}`,
    });
    return m;
  }

  const claimed = await prisma.meeting.updateMany({
    where: { id: m.id, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'CREATING', provider: 'GOOGLE_MEET', attempts: { increment: 1 } },
  });
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
    await notify(organizerUserId, {
      type: 'MEETING_FAILED',
      title: 'Meeting could not be created',
      body: 'Open your appointments to retry creating the online meeting.',
      key: `meeting-failed:${m.id}:${m.attempts}`,
    });
    return m;
  }
}

export async function cancelMeeting(appointmentId: string) {
  const m = await prisma.meeting.findUnique({ where: { appointmentId } });
  if (!m || m.status === 'CANCELLED' || m.status === 'COMPLETED') return m;
  let cancellationStatus = 'OK';
  if (m.provider === 'GOOGLE_MEET' && m.providerEventId)
    await providers.GOOGLE_MEET.cancel({ organizerUserId: m.organizerUserId, eventId: m.providerEventId }).catch(() => {
      cancellationStatus = 'PROVIDER_ERROR';
    });
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
  if (!devManualMeetings) throw new AppError(403, 'Manual meeting links are disabled in this environment');
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { counselor: true, youth: true } });
  if (!a || a.counselor.userId !== counselorUserId) throw notFound('Appointment');
  if (!needsOnlineMeeting(a.status, a.mode)) throw new AppError(409, 'Only confirmed online appointments have meetings');
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

// ---------- Google OAuth (counselors) ----------
export async function googleStatus(userId: string) {
  const connection = await prisma.googleCredential.findUnique({ where: { userId }, select: { status: true, connectedAt: true, scope: true, lastError: true } });
  return { configured: googleConfigured, devManualMeetings, connection };
}

export async function startGoogleConnect(userId: string) {
  if (!googleConfigured) throw new AppError(503, 'Google integration is not configured on this server', 'NOT_CONFIGURED');
  const state = randomToken(24);
  await prisma.oAuthState.create({ data: { stateHash: sha256(state), userId, expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) } });
  const url = oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES, state, include_granted_scopes: false });
  return { url };
}

/** Completes the OAuth round-trip. Never throws: every outcome is reported back to the frontend as a result code. */
export async function completeGoogleConnect(query: GoogleCallbackQuery): Promise<GoogleCallbackResult> {
  const st = await prisma.oAuthState.findUnique({ where: { stateHash: sha256(query.state) } });
  if (!st || st.expiresAt < new Date()) return 'expired';
  await prisma.oAuthState.delete({ where: { id: st.id } });
  if (query.error || !query.code) return 'denied';
  try {
    const { tokens } = await oauthClient().getToken(query.code);
    if (!tokens.refresh_token) return 'no_refresh_token';
    if (!GOOGLE_SCOPES.every((s) => tokens.scope?.includes(s))) return 'scope_missing';
    const data = { encryptedRefresh: encrypt(tokens.refresh_token), scope: tokens.scope ?? '', status: 'CONNECTED', lastError: null };
    await prisma.googleCredential.upsert({ where: { userId: st.userId }, update: data, create: { userId: st.userId, ...data } });
    await audit(st.userId, 'GOOGLE_CONNECTED', 'GoogleCredential', st.userId);
    return 'connected';
  } catch {
    return 'error';
  }
}

export async function disconnectGoogle(userId: string) {
  const c = await prisma.googleCredential.findUnique({ where: { userId } });
  if (c) {
    await oauthClient()
      .revokeToken(decrypt(c.encryptedRefresh))
      .catch(() => {});
    await prisma.googleCredential.delete({ where: { id: c.id } });
    await audit(userId, 'GOOGLE_DISCONNECTED', 'GoogleCredential', c.id);
  }
  return { disconnected: true };
}

// ---------- Meeting access (participants only) ----------
const participantInclude = { meeting: true, youth: true, counselor: { include: { user: { select: { displayName: true } } } } } as const;

async function participantAppointment(appointmentId: string, userId: string) {
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: participantInclude });
  if (!a) throw notFound('Appointment');
  const isYouth = a.youth.userId === userId;
  const isCounselor = a.counselor.userId === userId;
  if (!isYouth && !isCounselor) throw notFound('Appointment'); // do not reveal existence
  return { a, isYouth, isCounselor };
}

const view = (a: Awaited<ReturnType<typeof participantAppointment>>['a'], isCounselor: boolean) => {
  const m = a.meeting;
  const joinable = !!m && canJoin({ isParticipant: true, status: m.status, startTime: m.startTime, endTime: m.endTime });
  return {
    appointmentId: a.id,
    counselorName: a.counselor.user.displayName,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    durationMin: Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000),
    appointmentStatus: a.status,
    mode: a.mode,
    meeting: m && {
      status: m.status,
      provider: m.provider,
      creationStatus: isCounselor ? m.creationStatus : undefined,
      isDevManual: m.provider === 'MANUAL_DEV',
      // Link only exposed to participants, when ready (counselor sees it as soon as ready; youth within the join window).
      meetingUrl: m.status === 'READY' && (isCounselor || joinable) ? m.meetingUrl : null,
      joinable,
    },
  };
};

export async function upcomingMeetings(user: AuthUser) {
  const where = user.role === 'YOUTH' ? { youth: { userId: user.id } } : { counselor: { userId: user.id } };
  const list = await prisma.appointment.findMany({
    where: { ...where, mode: 'ONLINE', status: { in: ['CONFIRMED', 'PENDING_COUNSELOR'] }, endsAt: { gte: new Date() } },
    include: participantInclude,
    orderBy: { startsAt: 'asc' },
  });
  return list.map((a) => view(a, user.role === 'COUNSELOR'));
}

export async function meetingForAppointment(appointmentId: string, userId: string) {
  const { a, isCounselor } = await participantAppointment(appointmentId, userId);
  return view(a, isCounselor);
}

export async function retryMeeting(appointmentId: string, userId: string) {
  const { a, isCounselor } = await participantAppointment(appointmentId, userId);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  if (a.status !== 'CONFIRMED' || a.mode !== 'ONLINE') throw new AppError(409, 'Only confirmed online appointments have meetings');
  return ensureMeeting(a.id);
}

export async function cancelMeetingAsCounselor(appointmentId: string, userId: string) {
  const { isCounselor } = await participantAppointment(appointmentId, userId);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  return cancelMeeting(appointmentId);
}
