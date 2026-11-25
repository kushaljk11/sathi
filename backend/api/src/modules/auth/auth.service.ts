import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/app.error';
import { ERROR_CODES } from '../../core/errors/error.codes';
import { REFRESH_TOKEN_DAYS } from '../../constants/app.constants';
import { audit } from '../../helpers/audit.helper';
import { enqueueEmail } from '../../helpers/email.helper';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../utils/hash.util';
import { signAccessToken } from '../../utils/jwt.util';
import { DAY_MS } from '../../utils/date.util';
import { EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS } from './auth.constants';
import type { PublicUser, RegisterInput } from './auth.types';

async function issueRefresh(userId: string, familyId: string = randomUUID(), userAgent?: string) {
  const raw = randomToken(48);
  const rec = await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: sha256(raw), userAgent, expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * DAY_MS) },
  });
  return { raw, id: rec.id };
}

const publicUser = (u: { id: string; email: string; role: string; displayName: string; emailVerifiedAt: Date | null; timezone?: string }): PublicUser => ({
  id: u.id,
  email: u.email,
  role: u.role,
  displayName: u.displayName,
  emailVerified: !!u.emailVerifiedAt,
  timezone: u.timezone,
});

export async function register(input: RegisterInput) {
  const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (exists) throw new AppError(409, 'An account with this email already exists', ERROR_CODES.CONFLICT);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      displayName: input.displayName,
      ...(input.role === 'YOUTH' ? { youthProfile: { create: { preferredLanguages: ['en'], accessibility: [] } } } : {}),
      ...(input.role === 'COUNSELOR' ? { counselorProfile: { create: { qualifications: '', specializations: [], supportedConcerns: [], languages: [], ageGroups: [] } } } : {}),
      notificationPref: { create: {} },
    },
  });
  if (input.role === 'ORGANIZATION') {
    await prisma.organization.create({ data: { name: input.displayName, contactEmail: user.email, languages: [], staff: { create: { userId: user.id, isOwner: true } } } });
  }
  await sendVerification(user.id, user.email);
  await audit(user.id, 'REGISTER', 'User', user.id);
  return publicUser(user);
}

export async function sendVerification(userId: string, email: string) {
  const raw = randomToken();
  await prisma.emailVerificationToken.create({ data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) } });
  await enqueueEmail(email, 'Verify your Sathi account', `Verify: ${env.FRONTEND_URL}/verify-email?token=${raw}`);
}

export async function verifyEmail(token: string) {
  const t = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new AppError(400, 'Invalid or expired link');
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
}

export async function login(email: string, password: string, userAgent?: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Same failure for unknown email and wrong password to avoid user enumeration.
  if (!user || !(await verifyPassword(user.passwordHash, password))) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is suspended', 'SUSPENDED');
  const refresh = await issueRefresh(user.id, undefined, userAgent);
  await audit(user.id, 'LOGIN', 'User', user.id);
  return { user: publicUser(user), accessToken: signAccessToken(user.id), refreshToken: refresh.raw };
}

/** Rotates refresh tokens; reuse of a revoked token revokes the whole family. */
export async function rotate(raw: string | undefined) {
  if (!raw) throw new AppError(401, 'No session', ERROR_CODES.UNAUTHENTICATED);
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!rec) throw new AppError(401, 'Invalid session', ERROR_CODES.UNAUTHENTICATED);
  if (rec.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(rec.userId, 'REFRESH_REUSE_DETECTED', 'RefreshToken', rec.id);
    throw new AppError(401, 'Session revoked', 'TOKEN_REUSE');
  }
  if (rec.expiresAt < new Date() || rec.user.status !== 'ACTIVE') throw new AppError(401, 'Session expired', ERROR_CODES.UNAUTHENTICATED);
  const next = await issueRefresh(rec.userId, rec.familyId, rec.userAgent ?? undefined);
  await prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date(), replacedBy: next.id } });
  return { user: publicUser(rec.user), accessToken: signAccessToken(rec.userId), refreshToken: next.raw };
}

export async function logout(raw: string | undefined) {
  if (!raw) return;
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (rec) await prisma.refreshToken.updateMany({ where: { familyId: rec.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return; // do not reveal whether the account exists
  const raw = randomToken();
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) } });
  await enqueueEmail(user.email, 'Reset your Sathi password', `Reset: ${env.FRONTEND_URL}/reset-password?token=${raw}`);
}

export async function resetPassword(token: string, password: string) {
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) throw new AppError(400, 'Invalid or expired link');
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.refreshToken.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(t.userId, 'PASSWORD_RESET', 'User', t.userId);
}

export async function changePassword(userId: string, current: string, next: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(u.passwordHash, current))) throw new AppError(400, 'Current password is incorrect');
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await audit(userId, 'PASSWORD_CHANGE', 'User', userId);
}

export async function me(userId: string) {
  return publicUser(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
}
