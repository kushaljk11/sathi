import type { Response } from 'express';
import { isProd } from '../../config/env';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_DAYS } from '../../constants/app.constants';
import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import { DAY_MS } from '../../utils/date.util';
import * as service from './auth.service';
import type { ChangePasswordInput, ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput, VerifyEmailInput } from './auth.types';

/** The refresh token only ever travels in an HttpOnly, SameSite=Strict cookie scoped to the auth routes. */
const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'strict', path: REFRESH_COOKIE_PATH, maxAge: REFRESH_TOKEN_DAYS * DAY_MS });

export const register = asyncHandler(async (req, res) => {
  ok(res, await service.register(req.body as RegisterInput), 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as LoginInput;
  const { refreshToken, ...rest } = await service.login(email, password, req.get('user-agent'));
  setRefreshCookie(res, refreshToken);
  ok(res, rest);
});

export const refresh = asyncHandler(async (req, res) => {
  if (!req.cookies?.[REFRESH_COOKIE]) return ok(res, null); // anonymous visitor: no session, not an error
  const { refreshToken, ...rest } = await service.rotate(req.cookies[REFRESH_COOKIE]);
  setRefreshCookie(res, refreshToken);
  ok(res, rest);
});

export const logout = asyncHandler(async (req, res) => {
  await service.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  ok(res, { loggedOut: true });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await service.verifyEmail((req.body as VerifyEmailInput).token);
  ok(res, { verified: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await service.forgotPassword((req.body as ForgotPasswordInput).email);
  ok(res, { message: 'If that account exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as ResetPasswordInput;
  await service.resetPassword(token, password);
  ok(res, { reset: true });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  await service.changePassword(req.user!.id, currentPassword, newPassword);
  ok(res, { changed: true });
});

export const me = asyncHandler(async (req, res) => {
  ok(res, await service.me(req.user!.id));
});
