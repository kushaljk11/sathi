import type { z } from 'zod';
import type {
  appealSchema,
  blockSchema,
  contentParamsSchema,
  createCommentSchema,
  createPostSchema,
  editContentSchema,
  listPostsQuerySchema,
  reactionSchema,
  reportSchema,
} from './community.validation';

export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type EditContentInput = z.infer<ReturnType<typeof editContentSchema>>;
export type ReactionInput = z.infer<typeof reactionSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type BlockInput = z.infer<typeof blockSchema>;
export type AppealInput = z.infer<typeof appealSchema>;
export type ContentParams = z.infer<typeof contentParamsSchema>;
export type ContentType = ContentParams['type'];
