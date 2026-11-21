import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../lib/env';
import { HttpError, prisma } from '../lib/core';
import type { Role } from '@sathi/shared';

export interface AuthUser { id: string; role: Role }
declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'Authentication required', 'UNAUTHENTICATED'));
  try {
    const p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as { sub: string };
    // Role is always read from the DB, never trusted from client.
    const u = await prisma.user.findUnique({ where: { id: p.sub }, select: { id: true, role: true, status: true } });
    if (!u || u.status !== 'ACTIVE') return next(new HttpError(401, 'Account unavailable', 'UNAUTHENTICATED'));
    req.user = { id: u.id, role: u.role };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token', 'UNAUTHENTICATED'));
  }
}

/** Deny-by-default role guard. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Forbidden', 'FORBIDDEN'));
