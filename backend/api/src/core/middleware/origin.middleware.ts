import type { Request, Response, NextFunction } from 'express';
import { env, isTest } from '../../config/env';
import { MESSAGES } from '../../constants/messages.constants';
import { ERROR_CODES } from '../errors/error.codes';

/** CSRF defence for cookie-authenticated endpoints: require a same-origin Origin/Referer. */
export function originCheck(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin') ?? req.get('referer') ?? '';
  if (isTest || !origin || origin.startsWith(env.FRONTEND_URL)) return next();
  res.status(403).json({ success: false, error: { code: ERROR_CODES.BAD_ORIGIN, message: MESSAGES.BAD_ORIGIN } });
}
