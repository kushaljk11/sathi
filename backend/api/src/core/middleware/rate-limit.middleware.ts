import rateLimit, { type Options } from 'express-rate-limit';
import { isTest } from '../../config/env';

/** Rate limiter factory. Disabled under test so suites are not throttled. Pass `keyGenerator` to limit per user. */
export const createLimiter = (windowMs: number, limit: number, opts: Partial<Options> = {}) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => isTest, ...opts });

/** Global limiter for all /api routes. */
export const apiLimiter = createLimiter(60_000, 300);

/** Strict limiter for credential endpoints (register, login, password reset). */
export const authLimiter = createLimiter(15 * 60_000, 20);
