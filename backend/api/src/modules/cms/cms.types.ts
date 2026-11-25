import type { z } from 'zod';
import type {
  adminArticlesQuerySchema,
  articleBodySchema,
  blogArticlesQuerySchema,
  categoryBodySchema,
  contactMessagesQuerySchema,
  contactSchema,
  contactStatusSchema,
} from './cms.validation';

export type BlogArticlesQuery = z.infer<typeof blogArticlesQuerySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type ArticleInput = z.infer<typeof articleBodySchema>;
export type AdminArticlesQuery = z.infer<typeof adminArticlesQuerySchema>;
export type CategoryInput = z.infer<typeof categoryBodySchema>;
export type ContactMessagesQuery = z.infer<typeof contactMessagesQuerySchema>;
export type ContactStatusInput = z.infer<typeof contactStatusSchema>;
