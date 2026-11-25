import type { Prisma } from '@prisma/client';
import { classifyText } from '@sathi/shared';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError, notFound } from '../../core/errors/app.error';
import { audit } from '../../helpers/audit.helper';
import { sniff } from '../../helpers/file.helper';
import { notify } from '../../helpers/notification.helper';
import { storage } from '../../integrations/storage/storage.service';
import { sha256 } from '../../utils/hash.util';
import { paged } from '../../utils/pagination.util';
import { CONTACT_MIN_FILL_MS, CONTACT_SPAM_SCORE, COVER_KEY_PATTERN, RELATED_ARTICLE_COUNT, SITEMAP_STATIC_PAGES, SLUG_MAX_LENGTH, WORDS_PER_MINUTE } from './cms.constants';
import type { AdminArticlesQuery, ArticleInput, BlogArticlesQuery, CategoryInput, ContactInput, ContactMessagesQuery, ContactStatusInput } from './cms.types';

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH) || 'article';

export const readingMinutes = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).length / WORDS_PER_MINUTE));

const publicArticle = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageKey: true,
  coverAlt: true,
  authorName: true,
  featured: true,
  readingMinutes: true,
  publishedAt: true,
  category: { select: { name: true, slug: true } },
} as const;

const livePublished = () => ({ status: 'PUBLISHED' as const, publishedAt: { lte: new Date() } });

const coverContentType = (key: string) => (key.endsWith('.png') ? 'image/png' : 'image/jpeg');

function assertCoverKey(key: string) {
  if (!COVER_KEY_PATTERN.test(key)) throw notFound('Image');
}

// ================= PUBLIC BLOG =================

export const listBlogCategories = () =>
  prisma.blogCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, _count: { select: { articles: { where: livePublished() } } } } });

export async function listBlogArticles(q: BlogArticlesQuery) {
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
  return { ...paged(items, total, q.page, q.pageSize), featured };
}

export async function getBlogArticle(slug: string) {
  const a = await prisma.blogArticle.findFirst({ where: { slug, ...livePublished() }, select: { ...publicArticle, body: true, updatedAt: true, categoryId: true } });
  if (!a) throw notFound('Article');
  const related = await prisma.blogArticle.findMany({
    where: { ...livePublished(), categoryId: a.categoryId, id: { not: a.id } },
    select: publicArticle,
    orderBy: { publishedAt: 'desc' },
    take: RELATED_ARTICLE_COUNT,
  });
  const more =
    related.length < RELATED_ARTICLE_COUNT
      ? await prisma.blogArticle.findMany({
          where: { ...livePublished(), id: { notIn: [a.id, ...related.map((r) => r.id)] } },
          select: publicArticle,
          orderBy: { publishedAt: 'desc' },
          take: RELATED_ARTICLE_COUNT - related.length,
        })
      : [];
  return { article: { ...a, categoryId: undefined }, related: [...related, ...more] };
}

/** Cover images are public; keys are random and validated. */
export async function getBlogCover(key: string) {
  assertCoverKey(key);
  const used = await prisma.blogArticle.findFirst({ where: { coverImageKey: key, ...livePublished() }, select: { id: true } });
  if (!used) throw notFound('Image');
  return { contentType: coverContentType(key), data: await storage.get(key) };
}

/** Sitemap: static marketing pages + published articles. */
export async function buildSitemap() {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const articles = await prisma.blogArticle.findMany({ where: livePublished(), select: { slug: true, updatedAt: true } });
  const urls = SITEMAP_STATIC_PAGES.map((p) => `<url><loc>${base}${p}</loc></url>`).concat(
    articles.map((a) => `<url><loc>${base}/blog/${a.slug}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod></url>`),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}

// ================= CONTACT =================

export async function submitContact(input: ContactInput, ip: string | undefined) {
  const tooFast = input.startedAt != null && Date.now() - input.startedAt < CONTACT_MIN_FILL_MS;
  const spammy = classifyText(`${input.subject} ${input.message}`).scores.spam >= CONTACT_SPAM_SCORE;
  const ipHash = sha256(`${ip}:${env.JWT_REFRESH_SECRET}`).slice(0, 32);
  const msg = await prisma.contactMessage.create({
    data: { name: input.name, email: input.email.toLowerCase(), subject: input.subject, message: input.message, ipHash, status: tooFast || spammy ? 'SPAM' : 'NEW' },
  });
  if (msg.status === 'NEW') {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
    for (const a of admins) {
      await notify(a.id, { type: 'CONTACT', title: 'New contact message', body: 'A new message arrived through the website contact form.', key: `contact:${msg.id}:${a.id}`, email: false });
    }
  }
  return { received: true, message: 'Thank you — your message has been received. We usually reply within a few working days.' };
}

// ================= ADMIN CMS =================

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base);
  let i = 1;
  while (await prisma.blogArticle.findFirst({ where: { slug, NOT: { id: excludeId } } })) slug = `${slugify(base)}-${++i}`;
  return slug;
}

const toData = async (b: ArticleInput, existing?: { id: string; publishedAt: Date | null }) => ({
  title: b.title,
  excerpt: b.excerpt,
  body: b.body,
  categoryId: b.categoryId,
  authorName: b.authorName,
  coverAlt: b.coverAlt ?? null,
  featured: b.featured,
  status: b.status,
  slug: await uniqueSlug(b.slug || b.title, existing?.id),
  readingMinutes: readingMinutes(b.body),
  publishedAt: b.status === 'PUBLISHED' ? (b.publishedAt ?? existing?.publishedAt ?? new Date()) : (b.publishedAt ?? existing?.publishedAt ?? null),
});

export async function listArticles(q: AdminArticlesQuery) {
  const where: Prisma.BlogArticleWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}) };
  const [items, total] = await Promise.all([
    prisma.blogArticle.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { category: true } }),
    prisma.blogArticle.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

export async function getArticle(id: string) {
  const a = await prisma.blogArticle.findUnique({ where: { id }, include: { category: true } });
  if (!a) throw notFound('Article');
  return a;
}

export async function createArticle(actorId: string, input: ArticleInput) {
  const a = await prisma.blogArticle.create({ data: { ...(await toData(input)), authorUserId: actorId } });
  await audit(actorId, 'BLOG_ARTICLE_CREATED', 'BlogArticle', a.id);
  return a;
}

export async function updateArticle(actorId: string, id: string, input: ArticleInput) {
  const existing = await prisma.blogArticle.findUnique({ where: { id } });
  if (!existing) throw notFound('Article');
  const a = await prisma.blogArticle.update({ where: { id }, data: await toData(input, existing) });
  await audit(actorId, `BLOG_ARTICLE_${input.status}`, 'BlogArticle', id);
  return a;
}

export async function setArticleCover(id: string, file: Buffer | undefined) {
  if (!file) throw new AppError(400, 'File required');
  const kind = sniff(file);
  if (!kind || kind.ext === 'pdf') throw new AppError(400, 'Cover must be a PNG or JPEG image');
  const key = await storage.put(file, kind.ext);
  return prisma.blogArticle.update({ where: { id }, data: { coverImageKey: key } });
}

/** Preview for drafts. */
export async function getCoverPreview(key: string) {
  assertCoverKey(key);
  return { contentType: coverContentType(key), data: await storage.get(key) };
}

export const createCategory = ({ name }: CategoryInput) => prisma.blogCategory.create({ data: { name, slug: slugify(name) } });

export const updateCategory = (id: string, { name }: CategoryInput) => prisma.blogCategory.update({ where: { id }, data: { name, slug: slugify(name) } });

export async function deleteCategory(id: string) {
  if (await prisma.blogArticle.count({ where: { categoryId: id } })) throw new AppError(409, 'Move or archive articles in this category first');
  await prisma.blogCategory.delete({ where: { id } });
  return { deleted: true };
}

export async function listContactMessages(q: ContactMessagesQuery) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, omit: { ipHash: true } }),
    prisma.contactMessage.count({ where }),
  ]);
  return paged(items, total, q.page, q.pageSize);
}

export const setContactStatus = (id: string, { status }: ContactStatusInput) =>
  prisma.contactMessage.update({ where: { id }, data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } });
