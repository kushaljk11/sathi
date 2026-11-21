import { Router } from 'express';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { canJoin } from '@sathi/shared';
import { asyncH, ok, prisma, validate, encrypt, decrypt, audit, HttpError, notFound } from '../../lib/core';
import { env, googleConfigured, devManualMeetings } from '../../lib/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { oauthClient, GOOGLE_SCOPES } from './providers';
import { ensureMeeting, cancelMeeting, setManualDevLink } from './meetings.service';

const r = Router();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------- Google OAuth (counselors) ----------
r.get('/google/status', authenticate, requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await prisma.googleCredential.findUnique({ where: { userId: req.user!.id }, select: { status: true, connectedAt: true, scope: true, lastError: true } });
  ok(res, { configured: googleConfigured, devManualMeetings, connection: c });
}));

r.post('/google/connect', authenticate, requireRole('COUNSELOR'), asyncH(async (req, res) => {
  if (!googleConfigured) throw new HttpError(503, 'Google integration is not configured on this server', 'NOT_CONFIGURED');
  const state = randomBytes(24).toString('base64url');
  await prisma.oAuthState.create({ data: { stateHash: sha(state), userId: req.user!.id, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const url = oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES, state, include_granted_scopes: false });
  ok(res, { url });
}));

r.get('/google/callback', asyncH(async (req, res) => {
  const back = (s: string) => res.redirect(`${env.FRONTEND_URL}/counselor/settings?google=${s}`);
  const q = z.object({ code: z.string().optional(), state: z.string(), error: z.string().optional() }).safeParse(req.query);
  if (!q.success) return back('error');
  const st = await prisma.oAuthState.findUnique({ where: { stateHash: sha(q.data.state) } });
  if (!st || st.expiresAt < new Date()) return back('expired');
  await prisma.oAuthState.delete({ where: { id: st.id } });
  if (q.data.error || !q.data.code) return back('denied');
  try {
    const { tokens } = await oauthClient().getToken(q.data.code);
    if (!tokens.refresh_token) return back('no_refresh_token');
    if (!GOOGLE_SCOPES.every((s) => tokens.scope?.includes(s))) return back('scope_missing');
    const data = { encryptedRefresh: encrypt(tokens.refresh_token), scope: tokens.scope ?? '', status: 'CONNECTED', lastError: null };
    await prisma.googleCredential.upsert({ where: { userId: st.userId }, update: data, create: { userId: st.userId, ...data } });
    await audit(st.userId, 'GOOGLE_CONNECTED', 'GoogleCredential', st.userId);
    back('connected');
  } catch {
    back('error');
  }
}));

r.delete('/google', authenticate, requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const c = await prisma.googleCredential.findUnique({ where: { userId: req.user!.id } });
  if (c) {
    await oauthClient().revokeToken(decrypt(c.encryptedRefresh)).catch(() => {});
    await prisma.googleCredential.delete({ where: { id: c.id } });
    await audit(req.user!.id, 'GOOGLE_DISCONNECTED', 'GoogleCredential', c.id);
  }
  ok(res, { disconnected: true });
}));

// ---------- Meeting access (participants only) ----------
async function participantAppointment(appointmentId: string, userId: string) {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { meeting: true, youth: true, counselor: { include: { user: { select: { displayName: true } } } } },
  });
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
    appointmentId: a.id, counselorName: a.counselor.user.displayName, startsAt: a.startsAt, endsAt: a.endsAt,
    durationMin: Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000), appointmentStatus: a.status, mode: a.mode,
    meeting: m && {
      status: m.status, provider: m.provider, creationStatus: isCounselor ? m.creationStatus : undefined,
      isDevManual: m.provider === 'MANUAL_DEV',
      // Link only exposed to participants, when ready (counselor sees it as soon as ready; youth within the join window).
      meetingUrl: m.status === 'READY' && (isCounselor || joinable) ? m.meetingUrl : null,
      joinable,
    },
  };
};

r.get('/upcoming', authenticate, requireRole('YOUTH', 'COUNSELOR'), asyncH(async (req, res) => {
  const where = req.user!.role === 'YOUTH' ? { youth: { userId: req.user!.id } } : { counselor: { userId: req.user!.id } };
  const list = await prisma.appointment.findMany({
    where: { ...where, mode: 'ONLINE', status: { in: ['CONFIRMED', 'PENDING_COUNSELOR'] }, endsAt: { gte: new Date() } },
    include: { meeting: true, youth: true, counselor: { include: { user: { select: { displayName: true } } } } }, orderBy: { startsAt: 'asc' },
  });
  ok(res, list.map((a) => view(a, req.user!.role === 'COUNSELOR')));
}));

r.get('/appointment/:id', authenticate, asyncH(async (req, res) => {
  const { a, isCounselor } = await participantAppointment(String(req.params.id), req.user!.id);
  ok(res, view(a, isCounselor));
}));

r.post('/appointment/:id/retry', authenticate, requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { a, isCounselor } = await participantAppointment(String(req.params.id), req.user!.id);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  if (a.status !== 'CONFIRMED' || a.mode !== 'ONLINE') throw new HttpError(409, 'Only confirmed online appointments have meetings');
  ok(res, await ensureMeeting(a.id));
}));

r.post('/appointment/:id/cancel', authenticate, requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { isCounselor } = await participantAppointment(String(req.params.id), req.user!.id);
  if (!isCounselor) throw new HttpError(403, 'Forbidden');
  ok(res, await cancelMeeting(String(req.params.id)));
}));

r.put('/appointment/:id/manual-link', authenticate, requireRole('COUNSELOR'), asyncH(async (req, res) => {
  const { url } = validate(z.object({ url: z.string().url().startsWith('https://') }), req.body);
  ok(res, await setManualDevLink(String(req.params.id), req.user!.id, url));
}));

export default r;
