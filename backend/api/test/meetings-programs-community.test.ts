import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { api, auth, makeUser, truncateAll, confirmedAppointment } from './helpers';
import { prisma, encrypt } from '../src/lib/core';
import { providers, MeetingProviderError } from '../src/modules/meetings/providers';
import { ensureMeeting } from '../src/modules/meetings/meetings.service';

beforeAll(truncateAll);
afterEach(() => vi.restoreAllMocks());

const connectGoogle = (userId: string) => prisma.googleCredential.create({ data: { userId, encryptedRefresh: encrypt('refresh-token'), scope: 'https://www.googleapis.com/auth/calendar.events' } });

describe('Google Meet integration (provider mocked — not a live Google call)', () => {
  it('creates exactly one meeting for a confirmed online appointment, even with concurrent retries', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    await connectGoogle(c.user.id);
    const create = vi.spyOn(providers.GOOGLE_MEET, 'create').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { meetingUrl: 'https://meet.google.com/abc-defg-hij', providerEventId: 'evt1', providerMeetingId: 'abc-defg-hij' };
    });
    const { appointmentId, decision } = await confirmedAppointment(y, c, 'ONLINE');
    expect(decision.meeting.status).toBe('READY');
    await Promise.all([ensureMeeting(appointmentId), ensureMeeting(appointmentId), ensureMeeting(appointmentId)]);
    expect(create).toHaveBeenCalledTimes(1);
    const m = await prisma.meeting.findUniqueOrThrow({ where: { appointmentId } });
    expect(m).toMatchObject({ status: 'READY', provider: 'GOOGLE_MEET', providerEventId: 'evt1' });
    expect(await prisma.notification.count({ where: { type: 'MEETING_CREATED' } })).toBe(2);
  });

  it('meeting links are only visible to participants', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH'), stranger = await makeUser('YOUTH');
    await connectGoogle(c.user.id);
    vi.spyOn(providers.GOOGLE_MEET, 'create').mockResolvedValue({ meetingUrl: 'https://meet.google.com/xyz', providerEventId: 'e2' });
    const { appointmentId } = await confirmedAppointment(y, c, 'ONLINE');
    expect((await api().get(`/api/v1/meetings/appointment/${appointmentId}`).set(auth(stranger.token))).status).toBe(404);
    const own = await api().get(`/api/v1/meetings/appointment/${appointmentId}`).set(auth(c.token));
    expect(own.body.data.meeting.meetingUrl).toBe('https://meet.google.com/xyz');
  });

  it('revoked Google authorization fails safely, keeps appointment confirmed, and can be retried', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    await connectGoogle(c.user.id);
    vi.spyOn(providers.GOOGLE_MEET, 'create').mockRejectedValueOnce(new MeetingProviderError('REVOKED', 'revoked'));
    const { appointmentId } = await confirmedAppointment(y, c, 'ONLINE');
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe('CONFIRMED');
    expect(await prisma.meeting.findUniqueOrThrow({ where: { appointmentId } })).toMatchObject({ status: 'FAILED', creationStatus: 'REVOKED' });
    vi.spyOn(providers.GOOGLE_MEET, 'create').mockResolvedValue({ meetingUrl: 'https://meet.google.com/ok', providerEventId: 'e3' });
    const retry = await api().post(`/api/v1/meetings/appointment/${appointmentId}/retry`).set(auth(c.token));
    expect(retry.body.data.status).toBe('READY');
    expect((await api().post(`/api/v1/meetings/appointment/${appointmentId}/retry`).set(auth(y.token))).status).toBe(403);
  });

  it('without a Google connection no fake link is created', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    const spy = vi.spyOn(providers.GOOGLE_MEET, 'create');
    const { appointmentId } = await confirmedAppointment(y, c, 'ONLINE');
    const m = await prisma.meeting.findUniqueOrThrow({ where: { appointmentId } });
    expect(m.meetingUrl).toBeNull();
    expect(m.creationStatus).toBe('GOOGLE_NOT_CONNECTED');
    expect(spy).not.toHaveBeenCalled();
    // Dev manual links are disabled in this environment.
    expect((await api().put(`/api/v1/meetings/appointment/${appointmentId}/manual-link`).set(auth(c.token)).send({ url: 'https://example.com/x' })).status).toBe(403);
  });

  it('cancelling the appointment cancels the Google event', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    await connectGoogle(c.user.id);
    vi.spyOn(providers.GOOGLE_MEET, 'create').mockResolvedValue({ meetingUrl: 'https://meet.google.com/c', providerEventId: 'e4' });
    const cancel = vi.spyOn(providers.GOOGLE_MEET, 'cancel').mockResolvedValue();
    const { appointmentId } = await confirmedAppointment(y, c, 'ONLINE');
    await api().post(`/api/v1/appointments/${appointmentId}/cancel`).set(auth(y.token)).send({});
    expect(cancel).toHaveBeenCalledWith({ organizerUserId: c.user.id, eventId: 'e4' });
    expect((await prisma.meeting.findUniqueOrThrow({ where: { appointmentId } })).status).toBe('CANCELLED');
  });
});

describe('organization programs, capacity and waitlist', () => {
  it('publishes after admin approval, prevents overbooking, promotes waitlist on cancellation', async () => {
    const org = await makeUser('ORGANIZATION'), admin = await makeUser('ADMIN');
    const p = await api().post('/api/v1/programs/org/programs').set(auth(org.token)).send({ title: 'Workshop', description: 'A wellbeing workshop', category: 'wellbeing', startsAt: new Date(Date.now() + 5 * 864e5), endsAt: new Date(Date.now() + 5 * 864e5 + 7200e3), seats: 1, mode: 'IN_PERSON', costPaisa: 0 });
    const id = p.body.data.id;
    const y1 = await makeUser('YOUTH'), y2 = await makeUser('YOUTH'), y3 = await makeUser('YOUTH');
    expect((await api().post(`/api/v1/programs/${id}/book`).set(auth(y1.token))).status).toBe(404); // not published
    await api().post(`/api/v1/programs/org/programs/${id}/submit`).set(auth(org.token));
    await api().post(`/api/v1/admin/approvals/program/${id}`).set(auth(admin.token)).send({ decision: 'PUBLISHED' });
    const results = await Promise.all([y1, y2, y3].map((y) => api().post(`/api/v1/programs/${id}/book`).set(auth(y.token))));
    const outcomes = results.map((r) => r.body.data.outcome).sort();
    expect(outcomes).toEqual(['CONFIRMED', 'WAITLISTED', 'WAITLISTED']);
    expect((await prisma.program.findUniqueOrThrow({ where: { id } })).seatsTaken).toBe(1);
    const confirmedIdx = results.findIndex((r) => r.body.data.outcome === 'CONFIRMED');
    const confirmedUser = [y1, y2, y3][confirmedIdx];
    const cancel = await api().post(`/api/v1/programs/bookings/${results[confirmedIdx].body.data.booking.id}/cancel`).set(auth(confirmedUser.token));
    expect(cancel.body.data.promoted).toBe(true);
    expect((await prisma.program.findUniqueOrThrow({ where: { id } })).seatsTaken).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'WAITLIST_PROMOTED' } })).toBe(1);
    // Organization booking view never exposes the recommending counselor or wellbeing data.
    const view = await api().get(`/api/v1/programs/org/programs/${id}/bookings`).set(auth(org.token));
    expect(JSON.stringify(view.body.data)).not.toMatch(/counselorId|checkIn|assessment/i);
  });
});

describe('community moderation', () => {
  it('auto-approves safe posts, holds/hides harmful ones, and supports reports, appeals and moderator reversal', async () => {
    const y = await makeUser('YOUTH'), other = await makeUser('YOUTH'), admin = await makeUser('ADMIN');
    const safe = await api().post('/api/v1/community/posts').set(auth(y.token)).send({ category: 'study', body: 'I disagree with cramming, spacing study out works better for me.' });
    expect(safe.body.data.status).toBe('APPROVED');
    const bully = await api().post(`/api/v1/community/posts/${safe.body.data.post.id}/comments`).set(auth(other.token)).send({ body: 'You are a worthless loser' });
    expect(bully.body.data.status).toBe('HIDDEN');
    const ne = await api().post(`/api/v1/community/posts/${safe.body.data.post.id}/comments`).set(auth(other.token)).send({ body: 'तिमी एकदम मुर्ख हौ' });
    expect(['FLAGGED', 'HIDDEN']).toContain(ne.body.data.status);
    const sh = await api().post('/api/v1/community/posts').set(auth(other.token)).send({ category: 'general', body: 'I want to die, there is no reason to live' });
    expect(sh.body.data.status).toBe('FLAGGED');
    expect(sh.body.data.message).toMatch(/urgent help/);
    // Hidden content is not public.
    const thread = await api().get(`/api/v1/community/posts/${safe.body.data.post.id}`).set(auth(y.token));
    expect(thread.body.data.comments).toHaveLength(0);
    // Moderator queue + appeal + reversal.
    const queue = await api().get('/api/v1/admin/moderation/queue?view=review').set(auth(admin.token));
    expect(queue.body.data.total).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(queue.body.data.items)).not.toMatch(/@test\.dev/);
    const appeal = await api().post('/api/v1/community/appeals').set(auth(other.token)).send({ caseId: bully.body.data.caseId, message: 'It was a joke between friends' });
    expect(appeal.status).toBe(201);
    await api().post(`/api/v1/admin/moderation/cases/${bully.body.data.caseId}/action`).set(auth(admin.token)).send({ action: 'APPEAL_UPHELD' });
    expect((await prisma.communityComment.findUniqueOrThrow({ where: { id: bully.body.data.comment.id } })).status).toBe('APPROVED');
    expect(await prisma.moderationAction.count()).toBe(1);
    // Suspension requires a human note and never happens automatically.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).status).toBe('ACTIVE');
  });

  it('rejects spam and duplicate floods; restricted users cannot post', async () => {
    const y = await makeUser('YOUTH'), admin = await makeUser('ADMIN');
    const spam = await api().post('/api/v1/community/posts').set(auth(y.token)).send({ category: 'general', body: 'BUY NOW cheap followers http://a.xyz http://b.xyz http://c.xyz' });
    expect(spam.body.data.status).toBe('REJECTED');
    const text = 'Hello everyone, join my study group tonight please';
    await api().post('/api/v1/community/posts').set(auth(y.token)).send({ category: 'general', body: text });
    const dup = await api().post('/api/v1/community/posts').set(auth(y.token)).send({ category: 'general', body: text });
    expect(dup.body.data.status).toBe('REJECTED');
    await api().post(`/api/v1/admin/moderation/cases/${spam.body.data.caseId}/action`).set(auth(admin.token)).send({ action: 'RESTRICT', restrictDays: 1 });
    const blocked = await api().post('/api/v1/community/posts').set(auth(y.token)).send({ category: 'general', body: 'A normal post' });
    expect(blocked.body.error.code).toBe('POSTING_RESTRICTED');
  });

  it('reports flag content for review after threshold', async () => {
    const author = await makeUser('YOUTH');
    const post = await api().post('/api/v1/community/posts').set(auth(author.token)).send({ category: 'general', body: 'A perfectly ordinary post about my week' });
    const reporters = await Promise.all([1, 2, 3].map(() => makeUser('YOUTH')));
    for (const r of reporters) await api().post('/api/v1/community/reports').set(auth(r.token)).send({ targetType: 'POST', targetId: post.body.data.post.id, reason: 'spam' });
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id: post.body.data.post.id } })).status).toBe('FLAGGED');
  });
});
