import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { api, auth, makeUser, makeSlot, truncateAll, allConsents, confirmedAppointment } from './helpers';
import { prisma } from '../src/lib/core';
import { esewaSign } from '../src/modules/payments/gateways';

beforeAll(truncateAll);
afterEach(() => vi.restoreAllMocks());

const answers = {
  concerns: ['anxiety'], impact: 3, duration: '1-3 months', desiredSupport: ['counseling'], languages: ['ne'], mode: 'ONLINE',
  availability: [{ day: 1, startMin: 600, endMin: 900 }], accessibility: [],
};

describe('assessment → matching', () => {
  it('builds a Support Need Profile and returns explainable, persisted matches', async () => {
    const youth = await makeUser('YOUTH');
    const c = await makeUser('COUNSELOR');
    await makeUser('COUNSELOR', { verificationStatus: 'PENDING' }); // must be filtered out
    await makeSlot(c.user.id);
    expect((await api().post('/api/v1/matching/run').set(auth(youth.token))).status).toBe(400); // assessment first
    const a = await api().post('/api/v1/assessments').set(auth(youth.token));
    expect((await api().put(`/api/v1/assessments/${a.body.data.id}/draft`).set(auth(youth.token)).send({ draft: { concerns: ['anxiety'] } })).status).toBe(200);
    const resumed = await api().post('/api/v1/assessments').set(auth(youth.token));
    expect(resumed.body.data.id).toBe(a.body.data.id); // save & resume
    const sub = await api().post(`/api/v1/assessments/${a.body.data.id}/submit`).set(auth(youth.token)).send(answers);
    expect(sub.status).toBe(201);
    const m = await api().post('/api/v1/matching/run').set(auth(youth.token));
    expect(m.status).toBe(200);
    expect(m.body.data.results).toHaveLength(1);
    expect(m.body.data.results[0].factors.reduce((s: number, f: { weight: number }) => s + f.weight, 0)).toBe(100);
    expect(await prisma.matchingFactorScore.count()).toBe(6);
    const latest = await api().get('/api/v1/matching/runs/latest').set(auth(youth.token));
    expect(latest.body.data.results[0].providerId).toBe(m.body.data.results[0].providerId);
  });

  it('safety pathway escalates independently and returns resources', async () => {
    const youth = await makeUser('YOUTH');
    const r = await api().post('/api/v1/safety/screenings').set(auth(youth.token)).send({ answers: { harm_self_now: 'yes' } });
    expect(r.body.data.escalated).toBe(true);
    expect(r.body.data.message).toMatch(/cannot contact emergency services/);
  });
});

describe('booking', () => {
  it('prevents concurrent double booking of one slot', async () => {
    const c = await makeUser('COUNSELOR');
    const slot = await makeSlot(c.user.id);
    const [y1, y2] = await Promise.all([makeUser('YOUTH'), makeUser('YOUTH')]);
    const holds = await Promise.all([y1, y2].map((y) => api().post('/api/v1/appointments/holds').set(auth(y.token)).send({ slotId: slot.id })));
    expect(holds.map((h) => h.status).sort()).toEqual([201, 409]);
  });

  it('enforces hold expiry on the backend', async () => {
    const c = await makeUser('COUNSELOR');
    const y = await makeUser('YOUTH');
    const slot = await makeSlot(c.user.id);
    const hold = await api().post('/api/v1/appointments/holds').set(auth(y.token)).send({ slotId: slot.id });
    await prisma.slotHold.update({ where: { id: hold.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await api().post('/api/v1/appointments').set(auth(y.token)).send({ holdId: hold.body.data.id, mode: 'ONLINE', consents: allConsents });
    expect(r.status).toBe(410);
  });

  it('DB partial unique index blocks two active appointments on one slot', async () => {
    const c = await makeUser('COUNSELOR');
    const y = await makeUser('YOUTH');
    const slot = await makeSlot(c.user.id);
    const yp = await prisma.youthProfile.findUniqueOrThrow({ where: { userId: y.user.id } });
    const base = { youthId: yp.id, counselorId: slot.counselorId, slotId: slot.id, mode: 'ONLINE' as const, feePaisa: 0, startsAt: slot.startsAt, endsAt: slot.endsAt, status: 'CONFIRMED' as const };
    await prisma.appointment.create({ data: base });
    await expect(prisma.appointment.create({ data: base })).rejects.toThrow();
  });

  it('confirms, creates one relationship, never duplicates it, and IN_PERSON gets no meeting', async () => {
    const c = await makeUser('COUNSELOR');
    const y = await makeUser('YOUTH');
    const first = await confirmedAppointment(y, c, 'IN_PERSON');
    expect(first.decision.status).toBe('CONFIRMED');
    expect(first.decision.meeting).toBeNull();
    const second = await confirmedAppointment(y, c, 'IN_PERSON');
    expect(second.relationshipId).toBe(first.relationshipId);
    expect(await prisma.meeting.count({ where: { appointmentId: first.appointmentId } })).toBe(0);
  });

  it('unrelated users cannot see or act on appointments', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH'), other = await makeUser('COUNSELOR');
    const { appointmentId } = await confirmedAppointment(y, c, 'IN_PERSON');
    expect((await api().post(`/api/v1/appointments/${appointmentId}/cancel`).set(auth(other.token)).send({})).status).toBe(404);
  });
});

describe('payments (eSewa sandbox contract, server-side verification)', () => {
  it('signs with HMAC-SHA256/base64 over signed_field_names and verifies round-trip', () => {
    const sig = esewaSign('total_amount=100,transaction_uuid=abc,product_code=EPAYTEST', 'test-esewa-signing-key');
    expect(sig).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(sig).not.toBe(esewaSign('total_amount=101,transaction_uuid=abc,product_code=EPAYTEST', 'test-esewa-signing-key'));
  });

  async function paidSetup() {
    const c = await makeUser('COUNSELOR', { sessionFeePaisa: 150000 });
    const y = await makeUser('YOUTH');
    const slot = await makeSlot(c.user.id);
    const hold = await api().post('/api/v1/appointments/holds').set(auth(y.token)).send({ slotId: slot.id });
    const appt = await api().post('/api/v1/appointments').set(auth(y.token)).send({ holdId: hold.body.data.id, mode: 'ONLINE', consents: allConsents });
    expect(appt.body.data.status).toBe('PENDING_PAYMENT');
    const init = await api().post('/api/v1/payments/initiate').set(auth(y.token)).send({ provider: 'ESEWA', appointmentId: appt.body.data.id });
    expect(init.body.data.redirect.fields.signature).toBeTruthy();
    return { y, c, appointmentId: appt.body.data.id, reference: init.body.data.reference as string };
  }
  const callback = (reference: string, total = '1500', secret = 'test-esewa-signing-key') => {
    const d: Record<string, string> = { transaction_code: 'X1', status: 'COMPLETE', total_amount: total, transaction_uuid: reference, product_code: 'EPAYTEST', signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names' };
    d.signature = esewaSign(d.signed_field_names.split(',').map((f) => `${f}=${d[f]}`).join(','), secret);
    return Buffer.from(JSON.stringify(d)).toString('base64');
  };

  it('rejects tampered callbacks without changing state', async () => {
    const { reference } = await paidSetup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await api().get(`/api/v1/payments/esewa/return/${reference}?data=${callback(reference, '1500', 'wrong-secret')}`);
    expect(r.headers.location).toMatch(/status=invalid/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference } })).status).toBe('INITIATED');
  });

  it('does not trust a valid-looking callback when the gateway says not complete', async () => {
    const { reference } = await paidSetup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'NOT_FOUND' })));
    await api().get(`/api/v1/payments/esewa/return/${reference}?data=${callback(reference)}`);
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference } })).status).toBe('FAILED');
  });

  it('settles once (idempotent) after gateway verification and moves appointment to PENDING_COUNSELOR', async () => {
    const { reference, appointmentId } = await paidSetup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'COMPLETE', ref_id: 'ESEWA-REF-1', total_amount: 1500 })));
    await Promise.all([1, 2, 3].map(() => api().get(`/api/v1/payments/esewa/return/${reference}?data=${callback(reference)}`)));
    const p = await prisma.payment.findUniqueOrThrow({ where: { reference } });
    expect(p.status).toBe('SUCCESS');
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe('PENDING_COUNSELOR');
    expect(await prisma.notification.count({ where: { type: 'BOOKING_REQUEST' } })).toBeGreaterThanOrEqual(1);
  });

  it('flags amount mismatch as failure', async () => {
    const { reference } = await paidSetup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'COMPLETE', ref_id: 'R', total_amount: 1 })));
    await api().get(`/api/v1/payments/esewa/return/${reference}?data=${callback(reference)}`);
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference } })).failureReason).toBe('AMOUNT_MISMATCH');
  });

  it('counselor decline after payment creates a full refund request (not auto-completed)', async () => {
    const { reference, appointmentId, c } = await paidSetup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'COMPLETE', ref_id: 'R2', total_amount: 1500 })));
    await api().get(`/api/v1/payments/esewa/return/${reference}?data=${callback(reference)}`);
    await api().post(`/api/v1/appointments/${appointmentId}/decision`).set(auth(c.token)).send({ decision: 'DECLINE', reason: 'unavailable' });
    const rf = await prisma.refund.findFirstOrThrow({ where: { payment: { reference } } });
    expect(rf).toMatchObject({ amountPaisa: 150000, status: 'REQUESTED' });
  });
});

describe('consent enforcement', () => {
  it('counselor sees check-in trends only with active consent; withdrawal stops access', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    const { relationshipId } = await confirmedAppointment(y, c, 'IN_PERSON');
    await api().post('/api/v1/check-ins').set(auth(y.token)).send({ mood: 4, stress: 3, sleep: 4, energy: 4, social: 4, functioning: 4 });
    const p1 = await api().get(`/api/v1/support/relationships/${relationshipId}/progress`).set(auth(c.token));
    expect(p1.body.data.checkInConsent).toBe(true);
    expect(p1.body.data.checkIns).toHaveLength(1);
    const cp = await prisma.counselorProfile.findUniqueOrThrow({ where: { userId: c.user.id } });
    await api().put('/api/v1/consents').set(auth(y.token)).send({ counselorId: cp.id, items: [{ category: 'CHECKIN_TRENDS', granted: false }] });
    const p2 = await api().get(`/api/v1/support/relationships/${relationshipId}/progress`).set(auth(c.token));
    expect(p2.body.data.checkInConsent).toBe(false);
    expect(p2.body.data.checkIns).toBeNull();
    const shared = await api().get(`/api/v1/support/relationships/${relationshipId}/shared-profile`).set(auth(c.token));
    expect(shared.body.data.assessment).toBeNull(); // never granted
    expect(await prisma.sensitiveDataAccessLog.count({ where: { allowed: false } })).toBeGreaterThan(0);
  });

  it('another counselor cannot access the relationship', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH'), other = await makeUser('COUNSELOR');
    const { relationshipId } = await confirmedAppointment(y, c, 'IN_PERSON');
    expect((await api().get(`/api/v1/support/relationships/${relationshipId}`).set(auth(other.token))).status).toBe(403);
  });
});

describe('support plans, tasks, progress', () => {
  it('collaborative plan: counselor proposes, youth agrees, youth self-reports tasks with history', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    const { relationshipId } = await confirmedAppointment(y, c, 'IN_PERSON');
    const plan = await api().post(`/api/v1/support/relationships/${relationshipId}/plans`).set(auth(c.token)).send({ title: 'Plan', description: 'desc', startDate: new Date(), reviewDate: new Date(Date.now() + 864e5 * 14) });
    const planId = plan.body.data.id;
    expect((await api().get(`/api/v1/support/relationships/${relationshipId}/plans`).set(auth(y.token))).body.data).toHaveLength(0); // drafts hidden
    expect((await api().post(`/api/v1/support/plans/${planId}/status`).set(auth(y.token)).send({ status: 'ACTIVE' })).status).toBe(404); // drafts are invisible to youth
    await api().post(`/api/v1/support/plans/${planId}/status`).set(auth(c.token)).send({ status: 'PROPOSED' });
    expect((await api().post(`/api/v1/support/plans/${planId}/status`).set(auth(y.token)).send({ status: 'ACTIVE' })).status).toBe(200);
    await api().put(`/api/v1/support/plans/${planId}`).set(auth(c.token)).send({ title: 'Plan v2', description: 'd2', startDate: new Date(), reviewDate: new Date(Date.now() + 864e5 * 20) });
    expect(await prisma.supportPlanVersion.count({ where: { planId } })).toBe(2); // never overwritten
    const goal = await api().post(`/api/v1/support/plans/${planId}/goals`).set(auth(c.token)).send({ title: 'Sleep', startDate: new Date() });
    const task = await api().post(`/api/v1/support/goals/${goal.body.data.id}/tasks`).set(auth(c.token)).send({ title: 'Wind down' });
    expect((await api().patch(`/api/v1/support/tasks/${task.body.data.id}`).set(auth(c.token)).send({ status: 'COMPLETED' })).status).toBe(403); // never completed for the youth
    expect((await api().patch(`/api/v1/support/tasks/${task.body.data.id}`).set(auth(y.token)).send({ status: 'COMPLETED', reflection: 'helped' })).status).toBe(200);
    expect(await prisma.taskStatusHistory.count({ where: { taskId: task.body.data.id } })).toBe(2);
    const prog = await api().get('/api/v1/support/progress/me?days=30').set(auth(y.token));
    expect(prog.body.data.tasks.completionRate).toBe(100);
    expect(prog.body.data.milestones.map((m: { kind: string }) => m.kind)).toEqual(expect.arrayContaining(['COUNSELOR_CONNECTED', 'PLAN_AGREED']));
  });

  it('private notes are counselor-only', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    const { relationshipId } = await confirmedAppointment(y, c, 'IN_PERSON');
    await api().post(`/api/v1/support/relationships/${relationshipId}/notes`).set(auth(c.token)).send({ body: 'private' });
    expect((await api().get(`/api/v1/support/relationships/${relationshipId}/notes`).set(auth(y.token))).status).toBe(403);
  });
});
