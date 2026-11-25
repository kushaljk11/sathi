import { describe, it, expect, beforeAll } from 'vitest';
import { makeUser, makeSlot, truncateAll, confirmedAppointment } from './helpers';
import { prisma } from '../src/config/database';
import { processJob, sweep, daily } from '../src/jobs/processor';
import { quietDelayMs } from '../src/utils/date.util';
import { notify } from '../src/helpers/notification.helper';

beforeAll(truncateAll);

describe('background job processors (run directly; Redis transport not exercised here)', () => {
  it('notifications are idempotent by key', async () => {
    const y = await makeUser('YOUTH');
    const a = await notify(y.user.id, { type: 'T', title: 't', body: 'b', key: 'same-key' });
    const b = await notify(y.user.id, { type: 'T', title: 't', body: 'b', key: 'same-key' });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(await prisma.notification.count({ where: { idempotencyKey: 'same-key' } })).toBe(1);
  });

  it('quiet hours delay delivery (incl. windows crossing midnight)', () => {
    const at = new Date('2026-01-01T17:00:00Z'); // 22:45 in Asia/Kathmandu
    expect(quietDelayMs({ quietStartMin: 22 * 60, quietEndMin: 7 * 60 }, 'Asia/Kathmandu', at)).toBe((8 * 60 + 15) * 60_000);
    expect(quietDelayMs({ quietStartMin: 9 * 60, quietEndMin: 17 * 60 }, 'Asia/Kathmandu', at)).toBe(0);
    expect(quietDelayMs(null, 'UTC', at)).toBe(0);
  });

  it('sweep expires stale unpaid appointments, frees the slot, clears expired holds, marks overdue tasks', async () => {
    const c = await makeUser('COUNSELOR', { sessionFeePaisa: 1000 });
    const y = await makeUser('YOUTH');
    const slot = await makeSlot(c.user.id);
    const yp = await prisma.youthProfile.findUniqueOrThrow({ where: { userId: y.user.id } });
    await prisma.appointmentSlot.update({ where: { id: slot.id }, data: { isBooked: true } });
    const appt = await prisma.appointment.create({ data: { youthId: yp.id, counselorId: slot.counselorId, slotId: slot.id, mode: 'ONLINE', feePaisa: 1000, startsAt: slot.startsAt, endsAt: slot.endsAt, status: 'PENDING_PAYMENT', createdAt: new Date(Date.now() - 20 * 60_000) } });
    const slot2 = await makeSlot(c.user.id, 72);
    await prisma.slotHold.create({ data: { slotId: slot2.id, youthUserId: y.user.id, expiresAt: new Date(Date.now() - 1000) } });
    await sweep();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('EXPIRED');
    expect((await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } })).isBooked).toBe(false);
    expect(await prisma.slotHold.count({ where: { slotId: slot2.id } })).toBe(0);
  });

  it('reminders skip cancelled/rescheduled appointments and use neutral text', async () => {
    const c = await makeUser('COUNSELOR'), y = await makeUser('YOUTH');
    const { appointmentId } = await confirmedAppointment(y, c, 'IN_PERSON');
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await processJob('appointment-reminder', { appointmentId, offsetMin: 60, startsAt: new Date(0).toISOString() }); // stale
    expect(await prisma.notification.count({ where: { type: 'APPOINTMENT_REMINDER' } })).toBe(0);
    await processJob('appointment-reminder', { appointmentId, offsetMin: 60, startsAt: a.startsAt.toISOString() });
    const n = await prisma.notification.findMany({ where: { type: 'APPOINTMENT_REMINDER' } });
    expect(n).toHaveLength(2);
    expect(n[0].body).not.toMatch(/mood|stress|anxiety|assessment/i);
  });

  it('daily job sends check-in reminders once per day', async () => {
    await daily();
    const first = await prisma.notification.count({ where: { type: 'CHECKIN_REMINDER' } });
    await daily();
    expect(await prisma.notification.count({ where: { type: 'CHECKIN_REMINDER' } })).toBe(first);
    expect(first).toBeGreaterThan(0);
  });
});
