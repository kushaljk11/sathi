import { z } from 'zod';

export const screeningSchema = z.object({
  answers: z
    .record(z.enum(['yes', 'no', 'unsure']))
    .nullish()
    .transform((a) => a ?? {}),
});
