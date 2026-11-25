import { z } from 'zod';

export const directoryQuerySchema = z.object({
  concern: z.string().optional(),
  language: z.string().optional(),
  mode: z.enum(['ONLINE', 'IN_PERSON', 'BOTH']).optional(),
});

export const slotsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  days: z.coerce.number().int().min(1).max(60).default(14),
});
