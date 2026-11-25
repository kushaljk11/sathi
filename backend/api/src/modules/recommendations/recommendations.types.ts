import type { z } from 'zod';
import type { createRecommendationSchema, rankQuery, recommendationIdParams, relationshipIdParams, respondSchema } from './recommendations.validation';

export type RecommendationIdParams = z.infer<typeof recommendationIdParams>;
export type RelationshipIdParams = z.infer<typeof relationshipIdParams>;
export type RespondInput = z.infer<typeof respondSchema>;
export type RankQuery = z.infer<typeof rankQuery>;
export type CreateRecommendationInput = z.infer<typeof createRecommendationSchema>;
