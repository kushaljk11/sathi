import { z } from 'zod';

/** Shared with the web app so both sides validate check-ins identically. */
export { checkInSchema } from '@sathi/shared';

export const listCheckInsQuery = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(30),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
