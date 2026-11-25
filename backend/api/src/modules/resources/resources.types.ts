import type { z } from 'zod';
import type { listResourcesQuery } from './resources.validation';

export type ListResourcesQuery = z.infer<typeof listResourcesQuery>;
