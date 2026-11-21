import { Router, type Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { registerSchema, loginSchema } from '@sathi/shared';
import { asyncH, ok, validate } from '../../lib/core';
import { isProd } from '../../lib/env';
import { authenticate } from '../../middleware/auth';
import * as svc from './auth.service';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });
const COOKIE = 'sathi_rt';
const setCookie = (res: Response, token: string) =>
  res.cookie(COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/api/v1/auth', maxAge: 7 * 864e5 });

r.post('/register', limiter, asyncH(async (req, res) => ok(res, await svc.register(validate(registerSchema, req.body)), 201)));

r.post('/login', limiter, asyncH(async (req, res) => {
  const { email, password } = validate(loginSchema, req.body);
  const { refreshToken, ...rest } = await svc.login(email, password, req.get('user-agent'));
  setCookie(res, refreshToken);
  ok(res, rest);
}));

r.post('/refresh', asyncH(async (req, res) => {
  if (!req.cookies?.[COOKIE]) return ok(res, null); // anonymous visitor: no session, not an error
  const { refreshToken, ...rest } = await svc.rotate(req.cookies?.[COOKIE]);
  setCookie(res, refreshToken);
  ok(res, rest);
}));

r.post('/logout', asyncH(async (req, res) => {
  await svc.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  ok(res, { loggedOut: true });
}));

r.post('/verify-email', asyncH(async (req, res) => {
  await svc.verifyEmail(validate(z.object({ token: z.string().min(10) }), req.body).token);
  ok(res, { verified: true });
}));

r.post('/forgot-password', limiter, asyncH(async (req, res) => {
  await svc.forgotPassword(validate(z.object({ email: z.string().email() }), req.body).email);
  ok(res, { message: 'If that account exists, a reset link has been sent.' });
}));

r.post('/reset-password', limiter, asyncH(async (req, res) => {
  const b = validate(z.object({ token: z.string().min(10), password: z.string().min(10).max(128) }), req.body);
  await svc.resetPassword(b.token, b.password);
  ok(res, { reset: true });
}));

r.post('/change-password', authenticate, asyncH(async (req, res) => {
  const b = validate(z.object({ currentPassword: z.string(), newPassword: z.string().min(10).max(128) }), req.body);
  await svc.changePassword(req.user!.id, b.currentPassword, b.newPassword);
  ok(res, { changed: true });
}));

r.get('/me', authenticate, asyncH(async (req, res) => ok(res, await svc.me(req.user!.id))));

export default r;
