import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { BookOpen, Search, X } from 'lucide-react';
import { EmptyState, ErrorState, Pagination, Skeleton, cx } from '../../components/ui';
import { useApi } from '../../hooks';
import { errMsg } from '../../lib/api';
import { Seo } from '../components/Seo';
import { AnimatedItem, AnimatedSection } from '../components/AnimatedSection';
import { ArticleCard, FeaturedArticle, type ArticleList, type BlogCategory } from '../components/ArticleCard';
import { useMotionVariants } from '../animations/variants';

const PAGE_SIZE = 9;

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white">
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-3 p-6">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export default function BlogPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(q);
  const listRef = useRef<HTMLDivElement>(null);
  const v = useMotionVariants();

  // Keep the input in sync when the URL changes (e.g. back/forward).
  useEffect(() => setSearch((s) => (s.trim() === q ? s : q)), [q]);

  // Debounce search input → URL query param.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = window.setTimeout(() => {
      setParams((p) => {
        const n = new URLSearchParams(p);
        if (search.trim()) n.set('q', search.trim()); else n.delete('q');
        n.delete('page');
        return n;
      }, { replace: true });
    }, 350);
    return () => window.clearTimeout(t);
  }, [search, q, setParams]);

  const setCategory = (slug: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (slug) n.set('category', slug); else n.delete('category');
    n.delete('page');
    return n;
  });
  const setPage = (n: number) => {
    setParams((p) => { const x = new URLSearchParams(p); if (n > 1) x.set('page', String(n)); else x.delete('page'); return x; });
    listRef.current?.scrollIntoView({ block: 'start' });
  };

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) qs.set('q', q);
  if (category) qs.set('category', category);
  const cats = useApi<BlogCategory[]>(['blog', 'categories'], '/blog/categories');
  const list = useApi<ArticleList>(['blog', 'articles', q, category, page], `/blog/articles?${qs}`);

  const filtering = !!q || !!category;
  const featured = !filtering && page === 1 ? list.data?.featured ?? null : null;
  const items = (list.data?.items ?? []).filter((a) => a.id !== featured?.id);
  const activeCat = cats.data?.find((c) => c.slug === category);

  return (
    <>
      <Seo title="Blog" description="Articles on youth wellbeing, finding support and looking after yourself — general information from the Sathi team, not professional advice." />

      <section aria-labelledby="blog-title" className="relative isolate -mt-16 overflow-hidden px-4 pt-32 pb-12 sm:px-6 lg:-mt-[4.5rem] lg:px-8 lg:pt-40">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/80 via-white to-white" />
        <div aria-hidden className="absolute -top-24 right-10 -z-10 size-[28rem] rounded-full bg-sky-200/40 blur-3xl" />
        <AnimatedSection className="mx-auto max-w-7xl">
          <AnimatedItem><p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Blog</p></AnimatedItem>
          <AnimatedItem>
            <h1 id="blog-title" className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance text-slate-900 sm:text-5xl lg:text-6xl">Ideas for feeling better, one step at a time</h1>
          </AnimatedItem>
          <AnimatedItem>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">Practical reading on wellbeing, finding support and looking after yourself. General information only — not a substitute for professional advice.</p>
          </AnimatedItem>
        </AnimatedSection>
      </section>

      <section aria-label="Articles" className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* filters */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="search" className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <label htmlFor="blog-search" className="sr-only">Search articles</label>
              <input
                id="blog-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles…"
                maxLength={100}
                className="w-full rounded-full border border-slate-200 bg-white py-3 pr-10 pl-11 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
              <div role="group" aria-label="Filter by category" className="flex gap-2">
                {cats.isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />)}
                {cats.data && (
                  <>
                    <Chip on={!category} onClick={() => setCategory('')}>All</Chip>
                    {cats.data.map((c) => (
                      <Chip key={c.id} on={category === c.slug} onClick={() => setCategory(c.slug)}>
                        {c.name}{c._count ? <span className="ml-1.5 opacity-60">{c._count.articles}</span> : null}
                      </Chip>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <div ref={listRef} className="scroll-mt-28 pt-10" aria-live="polite" aria-busy={list.isLoading}>
            {filtering && list.data && (
              <p className="mb-6 text-sm text-slate-500">
                {list.data.total} {list.data.total === 1 ? 'article' : 'articles'}
                {q && <> matching “<span className="font-medium text-slate-800">{q}</span>”</>}
                {activeCat && <> in <span className="font-medium text-slate-800">{activeCat.name}</span></>}
              </p>
            )}

            {list.isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
            ) : list.isError ? (
              <ErrorState message={errMsg(list.error) === 'Something went wrong' ? 'We couldn’t load articles right now.' : errMsg(list.error)} onRetry={() => list.refetch()} />
            ) : !featured && items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60">
                <EmptyState
                  icon={<BookOpen className="size-6" />}
                  title={filtering ? 'No articles match your search' : 'No articles yet'}
                  hint={filtering ? 'Try a different word or category.' : 'New articles will appear here soon.'}
                  action={filtering ? <button type="button" onClick={() => setParams({})} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Clear filters</button> : undefined}
                />
              </div>
            ) : (
              <>
                {featured && <div className="mb-10"><FeaturedArticle article={featured} /></div>}
                <motion.div key={`${q}|${category}|${page}`} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" variants={v.stagger(0.06)} initial="hidden" animate="show">
                  {items.map((a) => <ArticleCard key={a.id} article={a} />)}
                </motion.div>
                {list.data && <div className="mt-10 flex justify-center"><Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} /></div>}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors', on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')}
    >
      {children}
    </button>
  );
}
