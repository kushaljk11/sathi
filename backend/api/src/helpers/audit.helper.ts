import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/** Appends an immutable audit-log entry. Never put wellbeing content in `metadata`. */
export async function audit(actorId: string | null, action: string, entityType: string, entityId?: string, metadata?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
}
