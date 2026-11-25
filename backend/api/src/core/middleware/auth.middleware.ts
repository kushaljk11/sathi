import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@sathi/shared';
import { prisma } from '../../config/database';
import { verifyAccessToken } from '../../utils/jwt.util';
import { MESSAGES } from '../../constants/messages.constants';
import { AppError, forbidden, unauthenticated } from '../errors/app.error';

export type { AuthUser } from '../../types/common.types';

/** Verifies the Bearer token and loads the user. The role is always read from the DB, never trusted from the client. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthenticated(MESSAGES.AUTH_REQUIRED));
  try {
    const userId = verifyAccessToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
    if (!user || user.status !== 'ACTIVE') return next(unauthenticated(MESSAGES.AUTH_ACCOUNT_UNAVAILABLE));
    req.user = { id: user.id, role: user.role };
    next();
  } catch (e) {
    next(e instanceof AppError ? e : unauthenticated(MESSAGES.AUTH_INVALID_TOKEN));
  }
}

/** Deny-by-default role guard. Use after `authenticate`. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role) ? next() : next(forbidden());
