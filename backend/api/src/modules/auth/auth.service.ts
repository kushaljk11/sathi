import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prisma, HttpError, audit } from '../../lib/core';
import { env } from '../../lib/env';
import type { RegisterInput } from '@sathi/shared';
import { enqueueEmail } from '../../lib/queue';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 7;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ARGON = { type: argon2.argon2id };

export const signAccess = (userId: string) => jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });

async function issueRefresh(userId: string, familyId: string = randomUUID(), userAgent?: string) {
  const raw = randomBytes(48).toString('base64url');
  const rec = await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: sha(raw), userAgent, expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) },
  });
  return { raw, id: rec.id };
}

const publicUser = (u: { id: string; email: string; role: string; displayName: string; emailVerifiedAt: Date | null; timezone?: string }) => ({
  id: u.id, email: u.email, role: u.role, displayName: u.displayName, emailVerified: !!u.emailVerifiedAt, timezone: u.timezone,
});

export async function register(input: RegisterInput) {
  const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (exists) throw new HttpError(409, 'An account with this email already exists', 'CONFLICT');
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(), passwordHash: await argon2.hash(input.password, ARGON),
      role: input.role, displayName: input.displayName,
      ...(input.role === 'YOUTH' ? { youthProfile: { create: { preferredLanguages: ['en'], accessibility: [] } } } : {}),
      ...(input.role === 'COUNSELOR'
        ? { counselorProfile: { create: { qualifications: '', specializations: [], supportedConcerns: [], languages: [], ageGroups: [] } } }
        : {}),
      notificationPref: { create: {} },
    },
  });
  if (input.role === 'ORGANIZATION') {
    await prisma.organization.create({
      data: { name: input.displayName, contactEmail: user.email, languages: [], staff: { create: { userId: user.id, isOwner: true } } },
    });
  }
  await sendVerification(user.id, user.email);
  await audit(user.id, 'REGISTER', 'User', user.id);
  return publicUser(user);
}

export async function sendVerification(userId: string, email: string) {
  const raw = randomBytes(32).toString('base64url');
  await prisma.emailVerificationToken.create({ data: { userId, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 864e5) } });
  await enqueueEmail(email, 'Verify your Sathi account', `Verify: ${env.FRONTEND_URL}/verify-email?token=${raw}`);
}

export async function verifyEmail(token: string) {
  const t = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new HttpError(400, 'Invalid or expired link');
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
}

export async function login(email: string, password: string, userAgent?: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Constant-ish failure path to avoid user enumeration.
  if (!user || !(await argon2.verify(user.passwordHash, password))) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  if (user.status !== 'ACTIVE') throw new HttpError(403, 'Account is suspended', 'SUSPENDED');
  const refresh = await issueRefresh(user.id, undefined, userAgent);
  await audit(user.id, 'LOGIN', 'User', user.id);
  return { user: publicUser(user), accessToken: signAccess(user.id), refreshToken: refresh.raw };
}

/** Rotates refresh tokens; reuse of a revoked token revokes the whole family. */
export async function rotate(raw: string | undefined) {
  if (!raw) throw new HttpError(401, 'No session', 'UNAUTHENTICATED');
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha(raw) }, include: { user: true } });
  if (!rec) throw new HttpError(401, 'Invalid session', 'UNAUTHENTICATED');
  if (rec.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(rec.userId, 'REFRESH_REUSE_DETECTED', 'RefreshToken', rec.id);
    throw new HttpError(401, 'Session revoked', 'TOKEN_REUSE');
  }
  if (rec.expiresAt < new Date() || rec.user.status !== 'ACTIVE') throw new HttpError(401, 'Session expired', 'UNAUTHENTICATED');
  const next = await issueRefresh(rec.userId, rec.familyId, rec.userAgent ?? undefined);
  await prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date(), replacedBy: next.id } });
  return { user: publicUser(rec.user), accessToken: signAccess(rec.userId), refreshToken: next.raw };
}

export async function logout(raw: string | undefined) {
  if (!raw) return;
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha(raw) } });
  if (rec) await prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return; // do not reveal existence
  const raw = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 36e5) } });
  await enqueueEmail(user.email, 'Reset your Sathi password', `Reset: ${env.FRONTEND_URL}/reset-password?token=${raw}`);
}

export async function resetPassword(token: string, password: string) {
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new HttpError(400, 'Invalid or expired link');
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await argon2.hash(password, ARGON) } }),
    prisma.refreshToken.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(t.userId, 'PASSWORD_RESET', 'User', t.userId);
}

export async function changePassword(userId: string, current: string, next: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await argon2.verify(u.passwordHash, current))) throw new HttpError(400, 'Current password is incorrect');
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, ARGON) } });
  await audit(userId, 'PASSWORD_CHANGE', 'User', userId);
}

export async function me(userId: string) {
  return publicUser(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
}
