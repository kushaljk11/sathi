import { useEffect, useState } from 'react';
import { ExternalLink, ImagePlus, Plus, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useAction, post, put, del, type Paged } from '../lib/hooks';
import {
  Button, Card, DataTable, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, Toggle,
  Notice, fmtDate, fmtDateTime, useConfirm, useToast,
} from '../components/ui';

interface Category { id: string; name: string; slug: string }
interface Article {
  id: string; slug: string; title: string; excerpt: string; body: string; categoryId: string; category: Category; authorName: string; coverImageKey: string | null;
  coverAlt: string | null; featured: boolean; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishedAt: string | null; updatedAt: string; readingMinutes: number;
}
type Form = { title: string; slug: string; excerpt: string; body: string; categoryId: string; authorName: string; coverAlt: string; featured: boolean; status: Article['status']; publishedAt: string };

const toLocalInput = (d: string | null) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

/** Admin blog CMS: drafts, publishing (incl. scheduled), archiving, categories, cover images. */
export function AdminBlog() {
  const [status, setStatus] = useState<'' | Article['status']>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const list = useApi<Paged<Article>>(['cms', 'articles', status, q, page], `/admin/cms/articles?page=${page}&pageSize=15${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const cats = useApi<Category[]>(['blog', 'categories'], '/blog/categories');
  useEffect(() => setPage(1), [status, q]);

  return (
    <div>
      <PageHeader title="Blog & articles" subtitle="Publish general wellbeing information for the public website. Articles are not clinical advice — have sensitive topics reviewed by a qualified professional."
        action={<Button onClick={() => setEditing('new')} disabled={!cats.data?.length}><Plus className="size-4" />New article</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <Tabs value={status} onChange={setStatus} tabs={[{ value: '', label: 'All' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Drafts' }, { value: 'ARCHIVED', label: 'Archived' }]} />
          <div className="mb-4 max-w-sm"><SearchInput value={q} onChange={setQ} placeholder="Search titles…" /></div>
          {list.isError ? <ErrorState message="Could not load articles" onRetry={() => list.refetch()} /> : (
            <DataTable loading={list.isLoading} rows={list.data?.items} rowKey={(a) => a.id} empty="No articles yet"
              columns={[
                { key: 't', header: 'Title', render: (a) => <div><p className="font-medium text-slate-800">{a.title}{a.featured && <span className="ml-2 text-xs text-brand-700">★ Featured</span>}</p><p className="text-xs text-slate-500">/{a.slug} · {a.readingMinutes} min</p></div> },
                { key: 'c', header: 'Category', render: (a) => a.category.name },
                { key: 's', header: 'Status', render: (a) => <div className="space-y-1"><StatusBadge status={a.status} />{a.status === 'PUBLISHED' && a.publishedAt && new Date(a.publishedAt) > new Date() && <p className="text-xs text-amber-700">Scheduled {fmtDateTime(a.publishedAt)}</p>}</div> },
                { key: 'p', header: 'Published', render: (a) => (a.publishedAt ? fmtDate(a.publishedAt) : '—') },
                { key: 'a', header: '', render: (a) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Pencil className="size-3.5" />Edit</Button>
                    {a.status === 'PUBLISHED' && <a className="inline-flex items-center rounded-lg px-2 text-xs text-brand-700 hover:bg-brand-50" href={`/blog/${a.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${a.title}`}><ExternalLink className="size-3.5" /></a>}
                  </div>
                ) },
              ]} />
          )}
          {list.data && <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />}
        </Card>
        <Categories categories={cats.data ?? []} loading={cats.isLoading} />
      </div>
      {editing && <ArticleEditor article={editing === 'new' ? null : editing} categories={cats.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Categories({ categories, loading }: { categories: Category[]; loading: boolean }) {
  const [name, setName] = useState('');
  const confirm = useConfirm();
  const add = useAction(() => post('/admin/cms/categories', { name }), { success: 'Category added', invalidate: [['blog', 'categories']], onSuccess: () => setName('') });
  const remove = useAction((id: string) => del(`/admin/cms/categories/${id}`), { success: 'Category removed', invalidate: [['blog', 'categories']] });
  return (
    <Card title="Categories">
      {!loading && !categories.length && <EmptyState title="No categories" hint="Create one to start writing." />}
      <ul className="mb-4 divide-y divide-slate-100 text-sm">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span>{c.name}</span>
            <button className="text-xs text-slate-400 hover:text-rose-600" onClick={async () => (await confirm({ title: 'Delete category?', message: `Delete "${c.name}"? Categories with articles cannot be deleted.`, danger: true })) && remove.mutate(c.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) add.mutate(); }}>
        <Input aria-label="New category name" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Button type="submit" loading={add.isPending}>Add</Button>
      </form>
    </Card>
  );
}

function ArticleEditor({ article, categories, onClose }: { article: Article | null; categories: Category[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>({
    title: article?.title ?? '', slug: article?.slug ?? '', excerpt: article?.excerpt ?? '', body: article?.body ?? '', categoryId: article?.categoryId ?? categories[0]?.id ?? '',
    authorName: article?.authorName ?? 'Sathi Editorial Team', coverAlt: article?.coverAlt ?? '', featured: article?.featured ?? false, status: article?.status ?? 'DRAFT',
    publishedAt: toLocalInput(article?.publishedAt ?? null),
  });
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { // authenticated preview of the existing cover (drafts are not public)
    if (!article?.coverImageKey) return;
    let url = '';
    api.get(`/admin/cms/covers/${article.coverImageKey}`, { responseType: 'blob' }).then((r) => { url = URL.createObjectURL(r.data); setPreview(url); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [article?.coverImageKey]);

  const errors: Partial<Record<keyof Form, string>> = {};
  if (f.title.trim().length < 5) errors.title = 'At least 5 characters';
  if (f.slug && !/^[a-z0-9-]+$/.test(f.slug)) errors.slug = 'Lowercase letters, numbers and dashes only';
  if (f.excerpt.trim().length < 10) errors.excerpt = 'At least 10 characters';
  if (f.body.trim().length < 50) errors.body = 'At least 50 characters';
  const valid = !Object.keys(errors).length && !!f.categoryId;

  const save = useAction(async (status: Form['status']) => {
    const body = { ...f, status, slug: f.slug || undefined, coverAlt: f.coverAlt || null, publishedAt: f.publishedAt ? new Date(f.publishedAt).toISOString() : null };
    const saved = article ? await put<Article>(`/admin/cms/articles/${article.id}`, body) : await post<Article>('/admin/cms/articles', body);
    if (cover) {
      const fd = new FormData();
      fd.append('file', cover);
      await api.post(`/admin/cms/articles/${saved.id}/cover`, fd);
    }
    return saved;
  }, { success: (a) => (a.status === 'PUBLISHED' ? 'Article published' : a.status === 'ARCHIVED' ? 'Article archived' : 'Draft saved'), invalidate: [['cms', 'articles']], onSuccess: onClose });

  const pickCover = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast('Cover must be a PNG or JPEG image', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('Image must be 5 MB or smaller', 'error');
    setCover(file);
    setPreview(URL.createObjectURL(file));
  };

  return (
    <Modal open wide onClose={onClose} title={article ? 'Edit article' : 'New article'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {article && article.status !== 'ARCHIVED' && <Button variant="outline" disabled={!valid} loading={save.isPending && save.variables === 'ARCHIVED'} onClick={() => save.mutate('ARCHIVED')}>Archive</Button>}
        <Button variant="outline" disabled={!valid} loading={save.isPending && save.variables === 'DRAFT'} onClick={() => save.mutate('DRAFT')}>Save draft</Button>
        <Button disabled={!valid} loading={save.isPending && save.variables === 'PUBLISHED'} onClick={() => save.mutate('PUBLISHED')}>{f.publishedAt && new Date(f.publishedAt) > new Date() ? 'Schedule' : 'Publish'}</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Input label="Title" value={f.title} onChange={(e) => set('title', e.target.value)} error={f.title ? errors.title : undefined} maxLength={160} /></div>
        <Input label="URL slug" hint="Leave empty to generate from the title" value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} error={errors.slug} maxLength={80} />
        <Select label="Category" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <Input label="Author name" value={f.authorName} onChange={(e) => set('authorName', e.target.value)} maxLength={80} />
        <Input label="Publication date" type="datetime-local" hint="Future date = scheduled. Empty = now when published." value={f.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />
        <div className="md:col-span-2"><Textarea label="Excerpt" rows={2} value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} error={f.excerpt ? errors.excerpt : undefined} maxLength={300} /></div>
        <div className="md:col-span-2"><Textarea label="Body" hint="Plain text. Separate paragraphs with a blank line." rows={12} value={f.body} onChange={(e) => set('body', e.target.value)} error={f.body ? errors.body : undefined} maxLength={60000} /></div>
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Cover image</span>
          {preview ? <img src={preview} alt="" className="aspect-video w-full rounded-xl object-cover" /> : <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-slate-300 text-slate-400"><ImagePlus className="size-6" /></div>}
          <input type="file" accept="image/png,image/jpeg" aria-label="Upload cover image" onChange={(e) => pickCover(e.target.files?.[0])} className="text-sm" />
        </div>
        <div className="space-y-3">
          <Input label="Cover alt text" hint="Describe the image for screen readers" value={f.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} maxLength={200} />
          <Toggle checked={f.featured} onChange={(v) => set('featured', v)} label="Featured article" description="Shown as the hero article on the blog page" />
          <Notice tone="amber">Articles share general information only. Do not present content as diagnosis or clinical guidance.</Notice>
        </div>
      </div>
    </Modal>
  );
}

interface ContactMessage { id: string; name: string; email: string; subject: string; message: string; status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'SPAM'; createdAt: string; resolvedAt: string | null }

/** Contact inbox for website messages (spam-flagged submissions are kept separately). */
export function AdminContact() {
  const [status, setStatus] = useState<ContactMessage['status']>('NEW');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ContactMessage | null>(null);
  const list = useApi<Paged<ContactMessage>>(['cms', 'contact', status, page], `/admin/cms/contact-messages?status=${status}&page=${page}`);
  const update = useAction(({ id, s }: { id: string; s: ContactMessage['status'] }) => post(`/admin/cms/contact-messages/${id}/status`, { status: s }), { success: 'Updated', invalidate: [['cms', 'contact']], onSuccess: () => setOpen(null) });
  useEffect(() => setPage(1), [status]);
  return (
    <div>
      <PageHeader title="Contact messages" subtitle="Messages sent through the public website. Reply by email from your support inbox." />
      <Card>
        <Tabs value={status} onChange={setStatus} tabs={[{ value: 'NEW', label: 'New' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'SPAM', label: 'Spam' }]} />
        {list.isError ? <ErrorState message="Could not load messages" onRetry={() => list.refetch()} /> : (
          <DataTable loading={list.isLoading} rows={list.data?.items} rowKey={(m) => m.id} empty="No messages here"
            columns={[
              { key: 'f', header: 'From', render: (m) => <div><p className="font-medium">{m.name}</p><p className="text-xs text-slate-500">{m.email}</p></div> },
              { key: 's', header: 'Subject', render: (m) => <button className="text-left font-medium text-brand-700 hover:underline" onClick={() => setOpen(m)}>{m.subject}</button> },
              { key: 'd', header: 'Received', render: (m) => fmtDateTime(m.createdAt) },
              { key: 'st', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
            ]} />
        )}
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />}
      </Card>
      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.subject}
          footer={<>
            {open.status !== 'SPAM' && <Button variant="ghost" onClick={() => update.mutate({ id: open.id, s: 'SPAM' })}>Mark spam</Button>}
            {open.status !== 'IN_PROGRESS' && <Button variant="outline" onClick={() => update.mutate({ id: open.id, s: 'IN_PROGRESS' })}>In progress</Button>}
            {open.status !== 'RESOLVED' && <Button onClick={() => update.mutate({ id: open.id, s: 'RESOLVED' })}>Resolve</Button>}
          </>}>
          <p className="text-sm text-slate-500">{open.name} · <a className="text-brand-700" href={`mailto:${open.email}?subject=${encodeURIComponent('Re: ' + open.subject)}`}>{open.email}</a> · {fmtDateTime(open.createdAt)}</p>
          <p className="mt-4 text-sm whitespace-pre-wrap text-slate-800">{open.message}</p>
        </Modal>
      )}
    </div>
  );
}
