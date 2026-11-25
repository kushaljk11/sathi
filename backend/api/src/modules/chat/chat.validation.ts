import { z } from 'zod';

const uuid = z.string().uuid();

export const relationshipIdParams = z.object({ relationshipId: uuid });
export const messageIdParams = z.object({ id: uuid });

export const messageBodySchema = z.string().trim().min(1).max(4000);
export const listMessagesQuery = z.object({ before: z.coerce.date().optional() });
export const reportMessageSchema = z.object({ reason: z.string().min(3).max(500) });
