import { z } from 'zod';

const weight = z.number().min(0).max(100);

export const matchingConfigSchema = z.object({ concern: weight, specialization: weight, language: weight, availability: weight, location: weight, mode: weight });
