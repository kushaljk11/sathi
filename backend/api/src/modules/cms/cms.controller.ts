import { asyncHandler } from '../../utils/async-handler.util';
import { ok } from '../../utils/response.util';
import * as service from './cms.service';
import type { AdminArticlesQuery, ArticleInput, BlogArticlesQuery, CategoryInput, ContactInput, ContactMessagesQuery, ContactStatusInput } from './cms.types';

// ================= PUBLIC BLOG =================

export const listBlogCategories = asyncHandler(async (_req, res) => {
  ok(res, await service.listBlogCategories());
});

export const listBlogArticles = asyncHandler(async (req, res) => {
  ok(res, await service.listBlogArticles(req.query as unknown as BlogArticlesQuery));
});

export const getBlogArticle = asyncHandler(async (req, res) => {
  ok(res, await service.getBlogArticle(String(req.params.slug)));
});

export const getBlogCover = asyncHandler(async (req, res) => {
  const { contentType, data } = await service.getBlogCover(String(req.params.key));
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(data);
});

export const sitemap = asyncHandler(async (_req, res) => {
  res.type('application/xml').send(await service.buildSitemap());
});

// ================= CONTACT =================

export const submitContact = asyncHandler(async (req, res) => {
  ok(res, await service.submitContact(req.body as ContactInput, req.ip), 201);
});

// ================= ADMIN CMS =================

export const adminListArticles = asyncHandler(async (req, res) => {
  ok(res, await service.listArticles(req.query as unknown as AdminArticlesQuery));
});

export const adminGetArticle = asyncHandler(async (req, res) => {
  ok(res, await service.getArticle(String(req.params.id)));
});

export const adminCreateArticle = asyncHandler(async (req, res) => {
  ok(res, await service.createArticle(req.user!.id, req.body as ArticleInput), 201);
});

export const adminUpdateArticle = asyncHandler(async (req, res) => {
  ok(res, await service.updateArticle(req.user!.id, String(req.params.id), req.body as ArticleInput));
});

export const adminUploadCover = asyncHandler(async (req, res) => {
  ok(res, await service.setArticleCover(String(req.params.id), req.file?.buffer));
});

export const adminGetCover = asyncHandler(async (req, res) => {
  const { contentType, data } = await service.getCoverPreview(String(req.params.key));
  res.setHeader('Content-Type', contentType);
  res.send(data);
});

export const adminCreateCategory = asyncHandler(async (req, res) => {
  ok(res, await service.createCategory(req.body as CategoryInput), 201);
});

export const adminUpdateCategory = asyncHandler(async (req, res) => {
  ok(res, await service.updateCategory(String(req.params.id), req.body as CategoryInput));
});

export const adminDeleteCategory = asyncHandler(async (req, res) => {
  ok(res, await service.deleteCategory(String(req.params.id)));
});

export const adminListContactMessages = asyncHandler(async (req, res) => {
  ok(res, await service.listContactMessages(req.query as unknown as ContactMessagesQuery));
});

export const adminSetContactStatus = asyncHandler(async (req, res) => {
  ok(res, await service.setContactStatus(String(req.params.id), req.body as ContactStatusInput));
});
