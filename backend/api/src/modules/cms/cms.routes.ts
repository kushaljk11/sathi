import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { asyncH, ok, prisma, validate, HttpError, notFound, pageQuery, paged, audit } from '../../lib/core';
import { env } from '../../lib/env';
import { authenticate, requireRole } from '../../middleware/auth';
import { upload, sniff, storage } from '../../lib/storage';
import { notify } from '../../lib/notify';
import { classifyText } from '@sathi/shared';

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 80) || 'article';
export const readingMinutes = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).length / 200));

const publicArticle = {
  id: true, slug: true, title: true, excerpt: true, coverImageKey: true, coverAlt: true, authorName: true, featured: true, readingMinutes: true, publishedAt: true,
  category: { select: { name: true, slug: true } },
} as const;
const livePublished = () => ({ status: 'PUBLISHED' as const, publishedAt: { lte: new Date() } });

// ================= PUBLIC BLOG =================
export const blog = Router();

blog.get('/categories', asyncH(async (_req, res) =>
  ok(res, await prisma.blogCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, _count: { select: { articles: { where: livePublished() } } } } }))));

blog.get('/articles', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ category: z.string().max(80).optional() }), req.query);
  const where: Prisma.BlogArticleWhereInput = {
    ...livePublished(),
    ...(q.category ? { category: { slug: q.category } } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { excerpt: { contains: q.q, mode: 'insensitive' } }, { body: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total, featured] = await Promise.all([
    prisma.blogArticle.findMany({ where, select: publicArticle, orderBy: { publishedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.blogArticle.count({ where }),
    prisma.blogArticle.findFirst({ where: { ...livePublished(), featured: true }, select: publicArticle, orderBy: { publishedAt: 'desc' } }),
  ]);
  ok(res, { ...paged(items, total, q.page, q.pageSize), featured });
}));

blog.get('/articles/:slug', asyncH(async (req, res) => {
  const a = await prisma.blogArticle.findFirst({ where: { slug: String(req.params.slug), ...livePublished() }, select: { ...publicArticle, body: true, updatedAt: true, categoryId: true } });
  if (!a) throw notFound('Article');
  const related = await prisma.blogArticle.findMany({ where: { ...livePublished(), categoryId: a.categoryId, id: { not: a.id } }, select: publicArticle, orderBy: { publishedAt: 'desc' }, take: 3 });
  const more = related.length < 3 ? await prisma.blogArticle.findMany({ where: { ...livePublished(), id: { notIn: [a.id, ...related.map((r) => r.id)] } }, select: publicArticle, orderBy: { publishedAt: 'desc' }, take: 3 - related.length }) : [];
  ok(res, { article: { ...a, categoryId: undefined }, related: [...related, ...more] });
}));

/** Cover images are public; keys are random and validated. */
blog.get('/covers/:key', asyncH(async (req, res) => {
  const key = String(req.params.key);
  if (!/^[0-9a-f-]{36}\.(png|jpg)$/.test(key)) throw notFound('Image');
  const used = await prisma.blogArticle.findFirst({ where: { coverImageKey: key, ...livePublished() }, select: { id: true } });
  if (!used) throw notFound('Image');
  res.setHeader('Content-Type', key.endsWith('.png') ? 'image/png' : 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(await storage.get(key));
}));

/** Sitemap: static marketing pages + published articles. */
blog.get('/sitemap.xml', asyncH(async (_req, res) => {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const articles = await prisma.blogArticle.findMany({ where: livePublished(), select: { slug: true, updatedAt: true } });
  const urls = ['/', '/about', '/features', '/blog', '/contact', '/login', '/register'].map((p) => `<url><loc>${base}${p}</loc></url>`)
    .concat(articles.map((a) => `<url><loc>${base}/blog/${a.slug}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod></url>`));
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
}));

// ================= CONTACT =================
export const contact = Router();
const contactLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => env.NODE_ENV === 'test' });
contact.post('/', contactLimiter, asyncH(async (req, res) => {
  const b = validate(z.object({
    name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(160), subject: z.string().trim().min(3).max(140), message: z.string().trim().min(10).max(4000),
    website: z.string().max(0).optional().or(z.literal('')), // honeypot: must stay empty
    startedAt: z.number().int().optional(), // form render time; submissions in <3 s are treated as bots
  }), req.body);
  const tooFast = b.startedAt != null && Date.now() - b.startedAt < 3000;
  const spammy = classifyText(`${b.subject} ${b.message}`).scores.spam >= 0.9;
  const ipHash = createHash('sha256').update(`${req.ip}:${env.JWT_REFRESH_SECRET}`).digest('hex').slice(0, 32);
  const msg = await prisma.contactMessage.create({ data: { name: b.name, email: b.email.toLowerCase(), subject: b.subject, message: b.message, ipHash, status: tooFast || spammy ? 'SPAM' : 'NEW' } });
  if (msg.status === 'NEW') {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
    for (const a of admins) await notify(a.id, { type: 'CONTACT', title: 'New contact message', body: 'A new message arrived through the website contact form.', key: `contact:${msg.id}:${a.id}`, email: false });
  }
  ok(res, { received: true, message: 'Thank you — your message has been received. We usually reply within a few working days.' }, 201);
}));

// ================= ADMIN CMS =================
export const adminCms = Router();
adminCms.use(authenticate, requireRole('ADMIN'));

const articleBody = z.object({
  title: z.string().trim().min(5).max(160), slug: z.string().trim().max(80).regex(/^[a-z0-9-]*$/).optional(), excerpt: z.string().trim().min(10).max(300),
  body: z.string().trim().min(50).max(60000), categoryId: z.string().uuid(), authorName: z.string().trim().min(2).max(80),
  coverAlt: z.string().max(200).nullable().optional(), featured: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']), publishedAt: z.coerce.date().nullable().optional(),
});
async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base), i = 1;
  while (await prisma.blogArticle.findFirst({ where: { slug, NOT: { id: excludeId } } })) slug = `${slugify(base)}-${++i}`;
  return slug;
}
const toData = async (b: z.infer<typeof articleBody>, existing?: { id: string; publishedAt: Date | null }) => ({
  title: b.title, excerpt: b.excerpt, body: b.body, categoryId: b.categoryId, authorName: b.authorName, coverAlt: b.coverAlt ?? null, featured: b.featured, status: b.status,
  slug: await uniqueSlug(b.slug || b.title, existing?.id), readingMinutes: readingMinutes(b.body),
  publishedAt: b.status === 'PUBLISHED' ? (b.publishedAt ?? existing?.publishedAt ?? new Date()) : (b.publishedAt ?? existing?.publishedAt ?? null),
});

adminCms.get('/articles', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional() }), req.query);
  const where: Prisma.BlogArticleWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}) };
  const [items, total] = await Promise.all([
    prisma.blogArticle.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { category: true } }),
    prisma.blogArticle.count({ where }),
  ]);
  ok(res, paged(items, total, q.page, q.pageSize));
}));
adminCms.get('/articles/:id', asyncH(async (req, res) => {
  const a = await prisma.blogArticle.findUnique({ where: { id: z.string().uuid().parse(req.params.id) }, include: { category: true } });
  if (!a) throw notFound('Article');
  ok(res, a);
}));
adminCms.post('/articles', asyncH(async (req, res) => {
  const b = validate(articleBody, req.body);
  const a = await prisma.blogArticle.create({ data: { ...(await toData(b)), authorUserId: req.user!.id } });
  await audit(req.user!.id, 'BLOG_ARTICLE_CREATED', 'BlogArticle', a.id);
  ok(res, a, 201);
}));
adminCms.put('/articles/:id', asyncH(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const existing = await prisma.blogArticle.findUnique({ where: { id } });
  if (!existing) throw notFound('Article');
  const b = validate(articleBody, req.body);
  const a = await prisma.blogArticle.update({ where: { id }, data: await toData(b, existing) });
  await audit(req.user!.id, `BLOG_ARTICLE_${b.status}`, 'BlogArticle', id);
  ok(res, a);
}));
adminCms.post('/articles/:id/cover', upload.single('file'), asyncH(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  if (!req.file) throw new HttpError(400, 'File required');
  const kind = sniff(req.file.buffer);
  if (!kind || kind.ext === 'pdf') throw new HttpError(400, 'Cover must be a PNG or JPEG image');
  const key = await storage.put(req.file.buffer, kind.ext);
  ok(res, await prisma.blogArticle.update({ where: { id }, data: { coverImageKey: key } }));
}));
adminCms.get('/covers/:key', asyncH(async (req, res) => { // preview for drafts
  const key = String(req.params.key);
  if (!/^[0-9a-f-]{36}\.(png|jpg)$/.test(key)) throw notFound('Image');
  res.setHeader('Content-Type', key.endsWith('.png') ? 'image/png' : 'image/jpeg');
  res.send(await storage.get(key));
}));
adminCms.post('/categories', asyncH(async (req, res) => {
  const { name } = validate(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
  ok(res, await prisma.blogCategory.create({ data: { name, slug: slugify(name) } }), 201);
}));
adminCms.put('/categories/:id', asyncH(async (req, res) => {
  const { name } = validate(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
  ok(res, await prisma.blogCategory.update({ where: { id: z.string().uuid().parse(req.params.id) }, data: { name, slug: slugify(name) } }));
}));
adminCms.delete('/categories/:id', asyncH(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  if (await prisma.blogArticle.count({ where: { categoryId: id } })) throw new HttpError(409, 'Move or archive articles in this category first');
  await prisma.blogCategory.delete({ where: { id } });
  ok(res, { deleted: true });
}));
adminCms.get('/contact-messages', asyncH(async (req, res) => {
  const q = validate(pageQuery.extend({ status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM']).optional() }), req.query);
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, omit: { ipHash: true } }),
    prisma.contactMessage.count({ where }),
  ]);
  ok(res, paged(items, total, q.page, q.pageSize));
}));
adminCms.post('/contact-messages/:id/status', asyncH(async (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM']) }), req.body);
  ok(res, await prisma.contactMessage.update({ where: { id: z.string().uuid().parse(req.params.id) }, data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } }));
}));
