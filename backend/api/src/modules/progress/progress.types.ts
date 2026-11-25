import type { z } from 'zod';
import type { progressRangeQuery, createReviewSchema } from './progress.validation';

export type ProgressRangeQuery = z.infer<typeof progressRangeQuery>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
