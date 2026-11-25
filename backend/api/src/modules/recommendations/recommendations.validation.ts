import { z } from 'zod';

export const recommendationIdParams = z.object({ id: z.string().uuid() });
export const relationshipIdParams = z.object({ relationshipId: z.string().uuid() });

export const respondSchema = z.object({ action: z.enum(['SAVE', 'DISMISS']) });
export const rankQuery = z.object({ q: z.string().max(100).optional() });
export const createRecommendationSchema = z.object({ relationshipId: z.string().uuid(), programId: z.string().uuid(), note: z.string().max(500).optional() });
