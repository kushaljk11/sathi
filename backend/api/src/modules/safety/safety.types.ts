import type { z } from 'zod';
import type { screeningSchema } from './safety.validation';

export type ScreeningInput = z.infer<typeof screeningSchema>;
