import { prisma } from '../../config/database';
import { paged } from '../../utils/pagination.util';
import type { ListNotificationsQuery } from './notifications.types';

export async function listNotifications(userId: string, q: ListNotificationsQuery) {
  const where = { userId, ...(q.unread === 'true' ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, omit: { idempotencyKey: true } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { ...paged(items, total, q.page, q.pageSize), unread };
}

export async function markRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { readAt: new Date() } });
  return { read: true };
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { read: true };
}
