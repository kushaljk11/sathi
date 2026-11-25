import { Link, useParams } from 'react-router-dom';
import { motion, useScroll, useSpring } from 'motion/react';
import { ArrowLeft, FileQuestion, Info, LifeBuoy } from 'lucide-react';
import { ErrorState, Skeleton } from '../../components/ui';
import { useApi } from '../../hooks';
import { Seo } from '../components/Seo';
import { AnimatedSection } from '../components/AnimatedSection';
import { ArticleCard, ArticleCover, ArticleMeta, CategoryBadge, coverUrl, type ArticleDetail, type ArticleSummary } from '../components/ArticleCard';
import { ButtonLink } from '../components/ButtonLink';
import { EASE } from '../animations/variants';

/** Renders plain-text article body as paragraphs (split on blank lines). Never injects HTML. */
function Body({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-6 text-[1.075rem] leading-[1.8] text-slate-700">
      {blocks.map((b, i) => {
        const heading = /^#{1,3}\s+/.exec(b);
        if (heading && !b.includes('\n')) {
          return <h2 key={i} className="pt-4 text-2xl font-semibold tracking-tight text-slate-900">{b.slice(heading[0].length)}</h2>;
        }
        return <p key={i} className="whitespace-pre-line">{b}</p>;
      })}
    </div>
  );
}

function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return <motion.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-50 h-1 origin-left bg-gradient-to-r from-brand-500 via-sky-500 to-violet-500" />;
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 pb-24 sm:px-6" aria-busy="true" aria-label="Loading article">
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-3 h-12 w-3/4" />
      <Skeleton className="mt-6 h-4 w-1/2" />
      <Skeleton className="mt-10 aspect-[16/9] w-full rounded-3xl" />
      <div className="mt-10 space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
    </div>
  );
}

export default function BlogDetailPage() {
  const { slug = '' } = useParams();
  const q = useApi<{ article: ArticleDetail; related: ArticleSummary[] }>(['blog', 'article', slug], `/blog/articles/${encodeURIComponent(slug)}`);
  const status = (q.error as { response?: { status?: number } } | null)?.response?.status;

  if (q.isLoading) return <DetailSkeleton />;

  if (status === 404 || (q.isError && status === 400)) {
    return (
      <section aria-labelledby="nf-title" className="mx-auto flex max-w-xl flex-col items-center px-4 py-32 text-center">
        <Seo title="Article not found" description="This article could not be found. It may have been moved or unpublished." />
        <span className="grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-500"><FileQuestion className="size-8" aria-hidden /></span>
        <h1 id="nf-title" className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Article not found</h1>
        <p className="mt-3 text-slate-600">This article may have been moved or is no longer published.</p>
        <ButtonLink to="/blog" className="mt-8"><ArrowLeft className="size-4" aria-hidden /> Back to the blog</ButtonLink>
      </section>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-32">
        <Seo title="Blog" description="Articles on youth wellbeing from the Sathi team." />
        <h1 className="sr-only">Article</h1>
        <ErrorState message="We couldn’t load this article right now." onRetry={() => q.refetch()} />
        <Link to="/blog" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden /> Back to the blog</Link>
      </div>
    );
  }

  const { article, related } = q.data;
  return (
    <>
      <Seo title={article.title} description={article.excerpt} type="article" image={article.coverImageKey ? coverUrl(article.coverImageKey) : undefined} />
      <ReadingProgress />
      <article aria-labelledby="article-title">
        <header className="relative isolate -mt-16 overflow-hidden px-4 pt-28 pb-10 sm:px-6 lg:-mt-[4.5rem] lg:pt-36">
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/70 via-white to-white" />
          <motion.div className="mx-auto max-w-3xl" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <Link to="/blog" className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-slate-600 hover:text-brand-700">
              <ArrowLeft className="size-4" aria-hidden /> All articles
            </Link>
            {article.category && (
              <div className="mt-8">
                <Link to={`/blog?category=${encodeURIComponent(article.category.slug)}`} className="rounded-full"><CategoryBadge name={article.category.name} /></Link>
              </div>
            )}
            <h1 id="article-title" className="mt-4 text-4xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-slate-900 sm:text-5xl">{article.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">{article.excerpt}</p>
            <ArticleMeta article={article} className="mt-6" />
          </motion.div>
        </header>

        <motion.div className="mx-auto max-w-5xl px-4 sm:px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>
          <div className="aspect-[16/9] overflow-hidden rounded-[2rem] bg-slate-100 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.5)]">
            <ArticleCover article={article} eager />
          </div>
        </motion.div>

        <div className="mx-auto max-w-3xl px-4 pt-12 pb-16 sm:px-6">
          <aside className="mb-10 flex gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-relaxed text-sky-900" aria-label="Important note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>This article is general information, not professional advice. If you are struggling, consider talking to a counselor or someone you trust.</p>
          </aside>
          <Body text={article.body} />
          <aside className="mt-14 flex flex-col gap-4 rounded-3xl bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
              <LifeBuoy className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
              <span>Sathi is not an emergency service. If you are in danger, <Link to="/safety" className="font-semibold text-rose-700 underline underline-offset-4">get urgent help now</Link>.</span>
            </p>
            <ButtonLink to="/register" size="sm" className="shrink-0">Find support on Sathi</ButtonLink>
          </aside>
        </div>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="border-t border-slate-100 bg-slate-50/60 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-end justify-between gap-4">
              <h2 id="related-title" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Keep reading</h2>
              <Link to="/blog" className="text-sm font-semibold text-brand-700 hover:underline">All articles</Link>
            </div>
            <AnimatedSection className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" step={0.08}>
              {related.map((a) => <ArticleCard key={a.id} article={a} />)}
            </AnimatedSection>
          </div>
        </section>
      )}
    </>
  );
}
