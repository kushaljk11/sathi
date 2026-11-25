import type { z } from 'zod';
import type { matchingConfigSchema } from './matching.validation';

export type MatchingConfigInput = z.infer<typeof matchingConfigSchema>;
