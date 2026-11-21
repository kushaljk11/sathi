import { Router } from 'express';
import { z } from 'zod';
import { asyncH, ok, prisma, validate, notFound, HttpError, pageQuery, paged } from '../../lib/core';
import { authenticate } from '../../middleware/auth';
import { relationshipFor } from '../support/support.service';

// ---------- notifications ----------
export const notifications = Router();
notifications.use(authenticate);
notifications.get('/', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ unread: z.enum(['true', 'false']).optional() }), req.query);
  const where = { userId: req.user!.id, ...(q.unread === 'true' ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, omit: { idempotencyKey: true } }),
    prisma.notification.count({ where }), prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  ok(res, { ...paged(items, total, q.page, q.pageSize), unread });
}));
notifications.post('/:id/read', asyncH(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: String(req.params.id), userId: req.user!.id }, data: { readAt: new Date() } });
  ok(res, { read: true });
}));
notifications.post('/read-all', asyncH(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  ok(res, { read: true });
}));

// ---------- resource library (public, published only) ----------
export const resources = Router();
resources.get('/', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ categoryId: z.string().uuid().optional(), language: z.enum(['en', 'ne']).optional(), contentType: z.string().max(20).optional() }), req.query);
  const where = {
    status: 'PUBLISHED' as const, ...(q.categoryId ? { categoryId: q.categoryId } : {}), ...(q.language ? { language: q.language } : {}), ...(q.contentType ? { contentType: q.contentType } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' as const } }, { body: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
  };
  const [items, total, categories] = await Promise.all([
    prisma.resource.findMany({ where, include: { category: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.resource.count({ where }), prisma.resourceCategory.findMany({ orderBy: { name: 'asc' } }),
  ]);
  ok(res, { ...paged(items, total, q.page, q.pageSize), categories });
}));
resources.get('/:id', asyncH(async (req, res) => {
  const r = await prisma.resource.findFirst({ where: { id: z.string().uuid().parse(req.params.id), status: 'PUBLISHED' }, include: { category: true } });
  if (!r) throw notFound('Resource');
  ok(res, r);
}));

// ---------- private chat (one thread per relationship) ----------
export const chat = Router();
chat.use(authenticate);

export async function conversationAccess(relationshipId: string, user: { id: string; role: 'YOUTH' | 'COUNSELOR' | 'ORGANIZATION' | 'ADMIN' }, write = false) {
  const { rel } = await relationshipFor(relationshipId, user, { activeOnly: write });
  const conv = await prisma.conversation.upsert({ where: { relationshipId: rel.id }, update: {}, create: { relationshipId: rel.id } });
  if (write && conv.blocked) throw new HttpError(403, 'Messaging is blocked for this conversation');
  return { rel, conv };
}

chat.get('/:relationshipId/messages', asyncH(async (req, res) => {
  const { conv, rel } = await conversationAccess(z.string().uuid().parse(req.params.relationshipId), req.user!);
  const q = validate(z.object({ before: z.coerce.date().optional() }), req.query);
  const messages = await prisma.message.findMany({ where: { conversationId: conv.id, ...(q.before ? { createdAt: { lt: q.before } } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 });
  await prisma.message.updateMany({ where: { conversationId: conv.id, senderId: { not: req.user!.id }, readAt: null }, data: { readAt: new Date() } });
  ok(res, { conversationId: conv.id, blocked: conv.blocked, open: ['ACTIVE', 'PAUSED'].includes(rel.status), messages: messages.reverse() });
}));

export async function sendMessage(relationshipId: string, user: { id: string; role: 'YOUTH' | 'COUNSELOR' | 'ORGANIZATION' | 'ADMIN' }, body: string) {
  const text = z.string().trim().min(1).max(4000).parse(body);
  const { conv } = await conversationAccess(relationshipId, user, true);
  return prisma.message.create({ data: { conversationId: conv.id, senderId: user.id, body: text } });
}

chat.post('/:relationshipId/messages', asyncH(async (req, res) => {
  const m = await sendMessage(z.string().uuid().parse(req.params.relationshipId), req.user!, req.body?.body);
  const { io } = await import('../../realtime');
  io?.to(`rel:${req.params.relationshipId}`).emit('message', m);
  ok(res, m, 201);
}));
chat.post('/:relationshipId/block', asyncH(async (req, res) => {
  const { conv } = await conversationAccess(z.string().uuid().parse(req.params.relationshipId), req.user!);
  await prisma.conversation.update({ where: { id: conv.id }, data: { blocked: true } });
  ok(res, { blocked: true });
}));
chat.post('/:relationshipId/unblock', asyncH(async (req, res) => {
  const { conv } = await conversationAccess(z.string().uuid().parse(req.params.relationshipId), req.user!);
  await prisma.conversation.update({ where: { id: conv.id }, data: { blocked: false } });
  ok(res, { blocked: false });
}));
chat.post('/messages/:id/report', asyncH(async (req, res) => {
  const { reason } = validate(z.object({ reason: z.string().min(3).max(500) }), req.body);
  const m = await prisma.message.findUnique({ where: { id: z.string().uuid().parse(req.params.id) }, include: { conversation: true } });
  if (!m) throw notFound('Message');
  await conversationAccess(m.conversation.relationshipId, req.user!);
  await prisma.contentReport.create({ data: { reporterId: req.user!.id, targetType: 'MESSAGE', targetId: m.id, reason } });
  ok(res, { reported: true }, 201);
}));
