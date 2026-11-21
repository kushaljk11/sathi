import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Clock } from 'lucide-react';
import { cx, fmtDate } from '../../components/ui';
import { useMotionVariants } from '../animations/variants';

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageKey: string | null;
  coverAlt: string | null;
  authorName: string;
  featured: boolean;
  readingMinutes: number;
  publishedAt: string;
  category: { name: string; slug: string } | null;
}
export interface ArticleDetail extends ArticleSummary { body: string; updatedAt?: string }
export interface BlogCategory { id: string; name: string; slug: string; _count?: { articles: number } }
export interface ArticleList { items: ArticleSummary[]; total: number; page: number; pageSize: number; pages: number; featured: ArticleSummary | null }

export const coverUrl = (key: string) => `/api/v1/blog/covers/${encodeURIComponent(key)}`;

const GRADIENTS = [
  'from-brand-500 via-teal-600 to-sky-700',
  'from-sky-500 via-indigo-500 to-violet-600',
  'from-violet-500 via-fuchsia-500 to-rose-400',
  'from-emerald-500 via-teal-500 to-cyan-600',
  'from-amber-400 via-orange-400 to-rose-500',
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Cover image (lazy) or a branded gradient placeholder when missing / failing to load. */
export function ArticleCover({ article, className, eager }: { article: Pick<ArticleSummary, 'coverImageKey' | 'coverAlt' | 'title' | 'category' | 'slug'>; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (article.coverImageKey && !failed) {
    return (
      <img
        src={coverUrl(article.coverImageKey)}
        alt={article.coverAlt ?? ''}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
        className={cx('h-full w-full object-cover', className)}
      />
    );
  }
  const g = GRADIENTS[hash(article.category?.slug ?? article.slug) % GRADIENTS.length];
  return (
    <div aria-hidden className={cx('relative h-full w-full overflow-hidden bg-gradient-to-br', g, className)}>
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 size-44 rounded-full bg-black/10 blur-2xl" />
      <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full opacity-30" preserveAspectRatio="none">
        <path d="M0 90 C 40 60, 80 110, 120 80 S 180 40, 200 60" fill="none" stroke="white" strokeWidth="1.5" />
        <path d="M0 70 C 50 40, 90 90, 130 60 S 180 20, 200 35" fill="none" stroke="white" strokeWidth="1" />
      </svg>
      <span className="absolute bottom-4 left-4 text-sm font-semibold text-white/90">{article.category?.name ?? 'Sathi blog'}</span>
    </div>
  );
}

export function ArticleMeta({ article, className }: { article: ArticleSummary; className?: string }) {
  return (
    <p className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500', className)}>
      <span className="font-medium text-slate-700">{article.authorName}</span>
      <span aria-hidden>·</span>
      <time dateTime={article.publishedAt}>{fmtDate(article.publishedAt)}</time>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{article.readingMinutes} min read</span>
    </p>
  );
}

export function CategoryBadge({ name }: { name: string }) {
  return <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{name}</span>;
}

export function ArticleCard({ article }: { article: ArticleSummary }) {
  const v = useMotionVariants();
  return (
    <motion.article variants={v.fadeUp} className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white transition-shadow duration-300 hover:shadow-[0_24px_50px_-30px_rgba(15,23,42,0.35)]">
      <div className="aspect-[16/10] overflow-hidden bg-slate-100">
        <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"><ArticleCover article={article} /></div>
      </div>
      <div className="flex flex-1 flex-col p-6">
        {article.category && <div><CategoryBadge name={article.category.name} /></div>}
        <h3 className="mt-3 text-lg leading-snug font-semibold tracking-tight text-slate-900">
          <Link to={`/blog/${article.slug}`} className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:text-brand-700">
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{article.excerpt}</p>
        <ArticleMeta article={article} className="mt-auto pt-5 text-xs" />
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl ring-brand-500 ring-offset-2 group-has-[:focus-visible]:ring-2" />
    </motion.article>
  );
}

export function FeaturedArticle({ article }: { article: ArticleSummary }) {
  const v = useMotionVariants();
  return (
    <motion.article variants={v.fadeUp} initial="hidden" animate="show" className="group relative grid overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_30px_70px_-45px_rgba(15,23,42,0.45)] lg:grid-cols-2">
      <div className="aspect-[16/10] overflow-hidden bg-slate-100 lg:aspect-auto lg:min-h-[22rem]">
        <div className="h-full w-full transition-transform duration-700 group-hover:scale-[1.03]"><ArticleCover article={article} eager /></div>
      </div>
      <div className="flex flex-col justify-center p-7 sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">Featured</span>
          {article.category && <CategoryBadge name={article.category.name} />}
        </div>
        <h2 className="mt-4 text-2xl leading-tight font-semibold tracking-tight text-balance text-slate-900 sm:text-3xl">
          <Link to={`/blog/${article.slug}`} className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:text-brand-700">{article.title}</Link>
        </h2>
        <p className="mt-3 leading-relaxed text-slate-600">{article.excerpt}</p>
        <ArticleMeta article={article} className="mt-6" />
        <span aria-hidden className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">Read article <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[2rem] ring-brand-500 ring-offset-2 group-has-[:focus-visible]:ring-2" />
    </motion.article>
  );
}
