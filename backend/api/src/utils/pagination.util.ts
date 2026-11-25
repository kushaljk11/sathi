import { z } from 'zod';
import type { Paginated } from '../types/api.types';

/** Standard `?page=&pageSize=&q=` query. Extend it with `pageQuery.extend({...})`. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
});

export const paged = <T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> => ({
  items,
  total,
  page,
  pageSize,
  pages: Math.ceil(total / pageSize),
});
