import { z } from 'zod';

export const sessionRecordSchema = z.object({
  summary: z.string().min(1).max(5000),
  topics: z.array(z.string().max(80)).max(20),
  nextSteps: z.string().max(2000).optional(),
  followUpDate: z.coerce.date().optional(),
});
