import { z } from 'zod';

export const relationshipIdParams = z.object({ id: z.string().uuid() });

export const updateRelationshipStatusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CLOSED']) });
export const createNoteSchema = z.object({ body: z.string().min(1).max(10000) });
