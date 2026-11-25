import { z } from 'zod';
import { pageQuery } from '../../utils/pagination.util';

export const programMode = z.enum(['ONLINE', 'IN_PERSON', 'BOTH']);

export const idParams = z.object({ id: z.string().uuid() });

export const listProgramsQuery = pageQuery.extend({
  category: z.string().optional(),
  mode: programMode.optional(),
  free: z.enum(['true', 'false']).optional(),
});

export const feedbackSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() });
