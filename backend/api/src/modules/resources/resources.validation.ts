import { z } from 'zod';
import { pageQuery } from '../../utils/pagination.util';

export const listResourcesQuery = pageQuery.extend({ categoryId: z.string().uuid().optional(), language: z.enum(['en', 'ne']).optional(), contentType: z.string().max(20).optional() });
export const resourceIdParams = z.object({ id: z.string().uuid() });
