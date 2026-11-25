import type { z } from 'zod';
import type { feedbackSchema, idParams, listProgramsQuery } from './programs.validation';

export type IdParams = z.infer<typeof idParams>;
export type ListProgramsQuery = z.infer<typeof listProgramsQuery>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
