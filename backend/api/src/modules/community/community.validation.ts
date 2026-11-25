import { z } from 'zod';
import { pageQuery } from '../../utils/pagination.util';
import { CATEGORIES, COMMENT_BODY_MAX, CONTENT_TYPES, POST_BODY_MAX, REACTION_KINDS, REPORT_REASONS } from './community.constants';

const uuid = z.string().uuid();

export const idParamsSchema = z.object({ id: uuid });
export const contentParamsSchema = z.object({ type: z.enum(CONTENT_TYPES), id: uuid });

export const listPostsQuerySchema = pageQuery.extend({ category: z.string().optional() });

export const createPostSchema = z.object({
  category: z.enum(CATEGORIES),
  body: z.string().trim().min(3).max(POST_BODY_MAX),
  pseudonym: z.string().trim().min(2).max(30).optional(),
});

export const createCommentSchema = z.object({ body: z.string().trim().min(1).max(COMMENT_BODY_MAX), parentId: uuid.optional() });

/** The maximum length depends on the content type, so this is parsed in the controller once `:type` is known. */
export const editContentSchema = (type: (typeof CONTENT_TYPES)[number]) => z.object({ body: z.string().trim().min(1).max(type === 'POST' ? POST_BODY_MAX : COMMENT_BODY_MAX) });

export const reactionSchema = z.object({ kind: z.enum(REACTION_KINDS) });

export const reportSchema = z.object({
  targetType: z.enum(CONTENT_TYPES),
  targetId: uuid,
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(1000).optional(),
});

export const blockSchema = z.object({ targetType: z.enum(CONTENT_TYPES), targetId: uuid });

export const appealSchema = z.object({ caseId: uuid, message: z.string().trim().min(5).max(1000) });
