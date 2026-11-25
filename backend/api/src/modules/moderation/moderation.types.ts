import type { z } from 'zod';
import type { ModResult } from '@sathi/shared';
import type { caseActionSchema, queueQuerySchema } from './moderation.validation';

export type QueueQuery = z.infer<typeof queueQuerySchema>;
export type CaseActionInput = z.infer<typeof caseActionSchema>;

export type ContentStatus = 'APPROVED' | 'FLAGGED' | 'HIDDEN' | 'REMOVED' | 'REJECTED' | 'APPEALED';

/** Provider abstraction: local rules always run; an external provider (Perspective) may add signal for supported languages. */
export interface ModerationProvider {
  name: string;
  classify(text: string, base: ModResult): Promise<ModResult>;
}
