import { prisma } from '../../config/database';
import { AppError, notFound } from '../../core/errors/app.error';
import type { AuthUser } from '../../core/middleware/auth.middleware';
import { relationshipFor } from '../support/support.service';
import { messageBodySchema } from './chat.validation';
import type { ListMessagesQuery, ReportMessageInput } from './chat.types';

/** One thread per relationship. Writing additionally requires an open relationship and an unblocked conversation. */
export async function conversationAccess(relationshipId: string, user: AuthUser, write = false) {
  const { rel } = await relationshipFor(relationshipId, user, { activeOnly: write });
  const conv = await prisma.conversation.upsert({ where: { relationshipId: rel.id }, update: {}, create: { relationshipId: rel.id } });
  if (write && conv.blocked) throw new AppError(403, 'Messaging is blocked for this conversation');
  return { rel, conv };
}

export async function listMessages(relationshipId: string, user: AuthUser, q: ListMessagesQuery) {
  const { conv, rel } = await conversationAccess(relationshipId, user);
  const messages = await prisma.message.findMany({ where: { conversationId: conv.id, ...(q.before ? { createdAt: { lt: q.before } } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 });
  await prisma.message.updateMany({ where: { conversationId: conv.id, senderId: { not: user.id }, readAt: null }, data: { readAt: new Date() } });
  return { conversationId: conv.id, blocked: conv.blocked, open: ['ACTIVE', 'PAUSED'].includes(rel.status), messages: messages.reverse() };
}

/** Shared by the REST endpoint and the socket `send` event, so the body is validated here. */
export async function sendMessage(relationshipId: string, user: AuthUser, body: unknown) {
  const text = messageBodySchema.parse(body);
  const { conv } = await conversationAccess(relationshipId, user, true);
  return prisma.message.create({ data: { conversationId: conv.id, senderId: user.id, body: text } });
}

export async function setBlocked(relationshipId: string, user: AuthUser, blocked: boolean) {
  const { conv } = await conversationAccess(relationshipId, user);
  await prisma.conversation.update({ where: { id: conv.id }, data: { blocked } });
  return { blocked };
}

export async function reportMessage(messageId: string, user: AuthUser, { reason }: ReportMessageInput) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!m) throw notFound('Message');
  await conversationAccess(m.conversation.relationshipId, user);
  await prisma.contentReport.create({ data: { reporterId: user.id, targetType: 'MESSAGE', targetId: m.id, reason } });
  return { reported: true };
}
