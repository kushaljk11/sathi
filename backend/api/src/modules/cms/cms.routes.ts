import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { createLimiter } from '../../core/middleware/rate-limit.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import { upload } from '../../helpers/file.helper';
import { CONTACT_RATE_LIMIT, CONTACT_RATE_WINDOW_MS } from './cms.constants';
import * as controller from './cms.controller';
import {
  adminArticlesQuerySchema,
  articleBodySchema,
  blogArticlesQuerySchema,
  categoryBodySchema,
  contactMessagesQuerySchema,
  contactSchema,
  contactStatusSchema,
  idParamsSchema,
} from './cms.validation';

// ================= PUBLIC BLOG (mounted at /blog) =================
export const blogRoutes = Router();

blogRoutes.get('/categories', controller.listBlogCategories);
blogRoutes.get('/articles', validate({ query: blogArticlesQuerySchema }), controller.listBlogArticles);
blogRoutes.get('/articles/:slug', controller.getBlogArticle);
blogRoutes.get('/covers/:key', controller.getBlogCover);
blogRoutes.get('/sitemap.xml', controller.sitemap);

// ================= CONTACT (mounted at /contact) =================
export const contactRoutes = Router();

const contactLimiter = createLimiter(CONTACT_RATE_WINDOW_MS, CONTACT_RATE_LIMIT);
contactRoutes.post('/', contactLimiter, validate({ body: contactSchema }), controller.submitContact);

// ================= ADMIN CMS (mounted at /admin/cms) =================
export const adminCmsRoutes = Router();
adminCmsRoutes.use(authenticate, requireRole('ADMIN'));

adminCmsRoutes.get('/articles', validate({ query: adminArticlesQuerySchema }), controller.adminListArticles);
adminCmsRoutes.get('/articles/:id', validate({ params: idParamsSchema }), controller.adminGetArticle);
adminCmsRoutes.post('/articles', validate({ body: articleBodySchema }), controller.adminCreateArticle);
adminCmsRoutes.put('/articles/:id', validate({ params: idParamsSchema, body: articleBodySchema }), controller.adminUpdateArticle);
adminCmsRoutes.post('/articles/:id/cover', upload.single('file'), validate({ params: idParamsSchema }), controller.adminUploadCover);
adminCmsRoutes.get('/covers/:key', controller.adminGetCover);
adminCmsRoutes.post('/categories', validate({ body: categoryBodySchema }), controller.adminCreateCategory);
adminCmsRoutes.put('/categories/:id', validate({ params: idParamsSchema, body: categoryBodySchema }), controller.adminUpdateCategory);
adminCmsRoutes.delete('/categories/:id', validate({ params: idParamsSchema }), controller.adminDeleteCategory);
adminCmsRoutes.get('/contact-messages', validate({ query: contactMessagesQuerySchema }), controller.adminListContactMessages);
adminCmsRoutes.post('/contact-messages/:id/status', validate({ params: idParamsSchema, body: contactStatusSchema }), controller.adminSetContactStatus);
