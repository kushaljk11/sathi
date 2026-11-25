import type { z } from 'zod';
import type { directoryQuerySchema, slotsQuerySchema } from './counselors.validation';

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
