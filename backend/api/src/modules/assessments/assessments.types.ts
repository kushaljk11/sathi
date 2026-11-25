import type { z } from 'zod';
import type { assessmentAnswers, saveDraftSchema } from './assessments.validation';

export type AssessmentAnswersInput = z.infer<typeof assessmentAnswers>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
