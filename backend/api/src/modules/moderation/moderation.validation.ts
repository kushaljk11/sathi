import { z } from 'zod';
import { pageQuery } from '../../utils/pagination.util';
import { MODERATION_ACTIONS, QUEUE_VIEWS } from './moderation.constants';

export const caseIdParamsSchema = z.object({ id: z.string().uuid() });

export const queueQuerySchema = pageQuery.extend({ view: z.enum(QUEUE_VIEWS).default('review') });

export const caseActionSchema = z.object({
  action: z.enum(MODERATION_ACTIONS),
  note: z.string().max(1000).optional(),
  restrictDays: z.number().int().min(1).max(90).optional(),
});
