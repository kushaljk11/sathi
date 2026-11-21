import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/core';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Test-password-123';

let hash: string | null = null;
export async function truncateAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
}

export async function makeUser(role: Role, extra: Record<string, unknown> = {}) {
  hash ??= await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.dev`;
  const user = await prisma.user.create({ data: { email, role, displayName: `${role} user`, passwordHash: hash, emailVerifiedAt: new Date(), notificationPref: { create: {} } } });
  if (role === 'YOUTH') await prisma.youthProfile.create({ data: { userId: user.id, ageGroup: '18-24', preferredLanguages: ['ne'], accessibility: [], ...extra } });
  if (role === 'COUNSELOR')
    await prisma.counselorProfile.create({
      data: { userId: user.id, qualifications: 'MA', specializations: ['anxiety', 'stress'], supportedConcerns: ['anxiety', 'stress'], languages: ['ne', 'en'], ageGroups: ['18-24'], mode: 'BOTH', verificationStatus: 'APPROVED', sessionFeePaisa: 0, ...extra },
    });
  if (role === 'ORGANIZATION')
    await prisma.organization.create({ data: { name: 'Test Org', contactEmail: email, languages: ['ne'], verificationStatus: 'APPROVED', staff: { create: { userId: user.id, isOwner: true } } } });
  const res = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return { user, token: res.body.data.accessToken as string, cookie: res.headers['set-cookie'] as unknown as string[] };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function makeSlot(counselorUserId: string, hoursAhead = 48) {
  const c = await prisma.counselorProfile.findUniqueOrThrow({ where: { userId: counselorUserId } });
  const startsAt = new Date(Date.now() + hoursAhead * 3600_000);
  await prisma.availability.create({ data: { counselorId: c.id, dayOfWeek: startsAt.getUTCDay(), startMinute: 0, endMinute: 1440 } });
  return prisma.appointmentSlot.create({ data: { counselorId: c.id, startsAt, endsAt: new Date(startsAt.getTime() + 3600_000) } });
}

export const allConsents = [
  { category: 'SUPPORT_NEED_PROFILE', granted: true }, { category: 'CHECKIN_TRENDS', granted: true },
  { category: 'ASSESSMENT_SUMMARY', granted: false }, { category: 'SUPPORT_HISTORY', granted: false },
];

/** Books + confirms a free online appointment and returns ids. */
export async function confirmedAppointment(youth: { token: string }, counselor: { token: string; user: { id: string } }, mode: 'ONLINE' | 'IN_PERSON' = 'ONLINE') {
  const slot = await makeSlot(counselor.user.id);
  const hold = await api().post('/api/v1/appointments/holds').set(auth(youth.token)).send({ slotId: slot.id });
  const appt = await api().post('/api/v1/appointments').set(auth(youth.token)).send({ holdId: hold.body.data.id, mode, consents: allConsents });
  const dec = await api().post(`/api/v1/appointments/${appt.body.data.id}/decision`).set(auth(counselor.token)).send({ decision: 'ACCEPT' });
  return { appointmentId: appt.body.data.id as string, relationshipId: dec.body.data.relationshipId as string, decision: dec.body.data };
}
