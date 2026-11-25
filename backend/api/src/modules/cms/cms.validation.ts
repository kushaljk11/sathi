import { z } from 'zod';
import { pageQuery } from '../../utils/pagination.util';
import { ARTICLE_STATUSES, CONTACT_STATUSES, SLUG_MAX_LENGTH } from './cms.constants';

export const idParamsSchema = z.object({ id: z.string().uuid() });

// ---- public blog ----
export const blogArticlesQuerySchema = pageQuery.extend({ category: z.string().max(80).optional() });

// ---- contact form ----
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(10).max(4000),
  website: z.string().max(0).optional().or(z.literal('')), // honeypot: must stay empty
  startedAt: z.number().int().optional(), // form render time; submissions in <3 s are treated as bots
});

// ---- admin CMS ----
export const articleBodySchema = z.object({
  title: z.string().trim().min(5).max(160),
  slug: z
    .string()
    .trim()
    .max(SLUG_MAX_LENGTH)
    .regex(/^[a-z0-9-]*$/)
    .optional(),
  excerpt: z.string().trim().min(10).max(300),
  body: z.string().trim().min(50).max(60000),
  categoryId: z.string().uuid(),
  authorName: z.string().trim().min(2).max(80),
  coverAlt: z.string().max(200).nullable().optional(),
  featured: z.boolean().default(false),
  status: z.enum(ARTICLE_STATUSES),
  publishedAt: z.coerce.date().nullable().optional(),
});

export const adminArticlesQuerySchema = pageQuery.extend({ status: z.enum(ARTICLE_STATUSES).optional() });

export const categoryBodySchema = z.object({ name: z.string().trim().min(2).max(60) });

export const contactMessagesQuerySchema = pageQuery.extend({ status: z.enum(CONTACT_STATUSES).optional() });

export const contactStatusSchema = z.object({ status: z.enum(CONTACT_STATUSES) });
