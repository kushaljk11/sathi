import { Router } from 'express';
import { z } from 'zod';
import { checkInSchema } from '@sathi/shared';
import { asyncH, ok, prisma, validate, HttpError } from '../../lib/core';
import { authenticate, requireRole } from '../../middleware/auth';

const r = Router();
r.use(authenticate, requireRole('YOUTH'));

const youthId = async (userId: string) => {
  const y = await prisma.youthProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!y) throw new HttpError(404, 'Youth profile not found');
  return y.id;
};

// Append-only: history is never overwritten.
r.post('/', asyncH(async (req, res) => {
  const data = validate(checkInSchema, req.body);
  ok(res, await prisma.wellbeingCheckIn.create({ data: { ...data, youthId: await youthId(req.user!.id) } }), 201);
}));

r.get('/', asyncH(async (req, res) => {
  const q = validate(z.object({ days: z.coerce.number().int().min(1).max(3650).default(30), from: z.coerce.date().optional(), to: z.coerce.date().optional() }), req.query);
  const from = q.from ?? new Date(Date.now() - q.days * 864e5);
  ok(res, await prisma.wellbeingCheckIn.findMany({
    where: { youthId: await youthId(req.user!.id), createdAt: { gte: from, ...(q.to ? { lte: q.to } : {}) } },
    orderBy: { createdAt: 'asc' },
  }));
}));

export default r;
