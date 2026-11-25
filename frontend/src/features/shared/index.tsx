import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Bell, BookOpen, CheckCheck, ExternalLink, Flag, HandHeart, Heart, HeartHandshake, LifeBuoy, Lock, MessageCircle,
  Phone, Plus, Reply, ShieldCheck, Sparkles, Trash2, UserX,
} from 'lucide-react';
import {
  Badge, Button, Card, ChipSelect, EmptyState, ErrorState, Input, LoadingBlock, Modal, Notice, PageHeader, Pagination, SearchInput, Select,
  StatusBadge, Tabs, Textarea, Toggle, cx, fmtDate, fmtDateTime, label, useConfirm, useToast,
} from '../../components/ui';
import { del, patch, post, put, useAction, useApi, type Paged } from '../../hooks';
import { errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// ============================================================================
// Shared helpers
// ============================================================================
type ModStatus = 'APPROVED' | 'FLAGGED' | 'HIDDEN' | 'REJECTED' | 'APPEALED' | 'REMOVED' | string;
interface ModResponse { status: ModStatus; message: string; caseId?: string }
type TargetType = 'POST' | 'COMMENT';

const mentionsUrgentHelp = (m?: string) => !!m && /urgent help|emergency|danger|harming yourself/i.test(m);

/** Inline display of a moderation outcome (never shown for plain approvals). */
function ModerationResult({ result, onClose }: { result: ModResponse; onClose?: () => void }) {
  const tone = result.status === 'REJECTED' ? 'rose' : 'amber';
  return (
    <div className="space-y-3">
      <Notice tone={tone}>
        <p>{result.message}</p>
        {result.status === 'REJECTED' && (
          <p className="mt-1">
            You can edit it or appeal from <Link to="/community/mine" className="font-medium underline" onClick={onClose}>My posts &amp; comments</Link>.
          </p>
        )}
        {(result.status === 'FLAGGED' || result.status === 'HIDDEN') && (
          <p className="mt-1">You can follow its status in <Link to="/community/mine" className="font-medium underline" onClick={onClose}>My posts &amp; comments</Link>.</p>
        )}
      </Notice>
      {mentionsUrgentHelp(result.message) && <UrgentHelpLink />}
    </div>
  );
}

function UrgentHelpLink() {
  return (
    <Link to="/safety" className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">
      <LifeBuoy className="size-5 shrink-0" aria-hidden />
      <span>Need help right now? Open the urgent help page</span>
    </Link>
  );
}

const CATEGORY_LABEL = (c: string) => label(c);

// ============================================================================
// 1. Community feed
// ============================================================================
interface FeedPost { id: string; pseudonym: string; category: string; body: string; createdAt: string; commentCount: number; reactionCount: number; isMine?: boolean }

export function Community() {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const cats = useApi<string[]>(['community', 'categories'], '/community/categories');
  const qs = new URLSearchParams({ page: String(page) });
  if (category) qs.set('category', category);
  const feed = useApi<Paged<FeedPost>>(['community', 'posts', category, page], `/community/posts?${qs}`);

  const chipOptions = [{ value: '', label: 'All' }, ...(cats.data ?? []).map((c) => ({ value: c, label: CATEGORY_LABEL(c) }))];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Community"
        subtitle="A peer space to share, listen and support each other."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/community/mine" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">My posts &amp; comments</Link>
            <Button onClick={() => setComposeOpen(true)}><Plus className="size-4" aria-hidden />New post</Button>
          </div>
        }
      />

      <Card className="bg-brand-50/40">
        <div className="flex gap-3">
          <HeartHandshake className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Community guidelines</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Be kind. No bullying, harassment, hate or threats.</li>
              <li>No ads, promotions or spammy links.</li>
              <li>Don&apos;t share personal information — yours or anyone else&apos;s.</li>
              <li>This is peer support, not professional advice.</li>
            </ul>
            <p className="text-xs text-slate-500">Posts and comments are checked before they appear. If you are in danger, please visit <Link to="/safety" className="font-medium text-rose-700 underline">urgent help</Link>.</p>
          </div>
        </div>
      </Card>

      {cats.isError ? <ErrorState message="Could not load categories" onRetry={() => cats.refetch()} /> : (
        <ChipSelect multi={false} options={chipOptions} value={[category]} onChange={(v) => { setCategory(v[0] ?? ''); setPage(1); }} />
      )}

      {feed.isLoading ? <LoadingBlock rows={4} /> : feed.isError ? <ErrorState message={errMsg(feed.error)} onRetry={() => feed.refetch()} /> : !feed.data?.items.length ? (
        <Card><EmptyState icon={<MessageCircle className="size-6" />} title="No posts here yet" hint="Be the first to start a kind conversation." action={<Button onClick={() => setComposeOpen(true)}>Write a post</Button>} /></Card>
      ) : (
        <ul className="space-y-3">
          {feed.data.items.map((p) => (
            <li key={p.id}>
              <Link to={`/community/${p.id}`} className="block rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{p.pseudonym}</span>
                  <Badge tone="slate">{CATEGORY_LABEL(p.category)}</Badge>
                  <span>{fmtDateTime(p.createdAt)}</span>
                  {p.isMine && <Badge tone="brand">You</Badge>}
                </div>
                <p className="line-clamp-4 text-sm whitespace-pre-wrap text-slate-800">{p.body}</p>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{p.commentCount} {p.commentCount === 1 ? 'comment' : 'comments'}</span>
                  <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden />{p.reactionCount} {p.reactionCount === 1 ? 'reaction' : 'reactions'}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {feed.data && <Pagination page={page} pages={feed.data.pages} onChange={setPage} />}

      <NewPostModal open={composeOpen} onClose={() => setComposeOpen(false)} categories={cats.data ?? []} />
    </div>
  );
}

function NewPostModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: string[] }) {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<ModResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (open) { setResult(null); setErrors({}); } }, [open]);
  useEffect(() => { if (!category && categories.length) setCategory(categories[0]); }, [categories, category]);

  const create = useAction((v: { category: string; body: string; pseudonym?: string }) => post<ModResponse>('/community/posts', v), {
    invalidate: [['community']],
    onSuccess: (r) => {
      if (r.status === 'APPROVED') { toast('Published'); reset(); onClose(); }
      else { setResult(r); setBody(''); }
    },
  });
  const reset = () => { setBody(''); setPseudonym(''); setResult(null); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const p = pseudonym.trim();
    if (p && (p.length < 2 || p.length > 30)) errs.pseudonym = 'Pseudonym must be 2–30 characters';
    if (body.trim().length < 3) errs.body = 'Please write at least a few words';
    if (body.length > 4000) errs.body = 'Posts can be up to 4000 characters';
    if (!category) errs.category = 'Choose a category';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate({ category, body: body.trim(), ...(p ? { pseudonym: p } : {}) });
  };

  return (
    <Modal open={open} onClose={onClose} title="New post" wide>
      {result ? (
        <div className="space-y-4">
          <ModerationResult result={result} onClose={onClose} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setResult(null)}>Write another</Button><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Select label="Category" name="post-category" value={category} onChange={(e) => setCategory(e.target.value)} error={errors.category}
            options={categories.length ? categories.map((c) => ({ value: c, label: CATEGORY_LABEL(c) })) : [{ value: '', label: 'Loading…' }]} />
          <Input label="Pseudonym (optional)" name="pseudonym" value={pseudonym} maxLength={30} onChange={(e) => setPseudonym(e.target.value)} error={errors.pseudonym}
            hint="Your real name is never shown. Leave blank to post as an automatic member name, or choose a nickname (2–30 characters) that doesn't identify you." />
          <Textarea label="What's on your mind?" name="post-body" rows={7} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} error={errors.body}
            hint={`${body.length}/4000 · Please don't include phone numbers, addresses or other personal details.`} />
          {create.isError && <Notice tone="rose">{errMsg(create.error)}</Notice>}
          <p className="text-xs text-slate-500">Your post will be checked against the community guidelines before it appears.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={create.isPending}>Post</Button></div>
        </form>
      )}
    </Modal>
  );
}

// ============================================================================
// 2. Single post
// ============================================================================
interface PostDetail {
  post: { id: string; pseudonym: string; category: string; body: string; status: string; createdAt: string; isMine: boolean };
  comments: { id: string; pseudonym: string; body: string; status: string; createdAt: string; isMine: boolean; parentId: string | null }[];
  reactions: { kind: ReactionKind; _count: number }[];
}
type Comment = PostDetail['comments'][number];
type ReactionKind = 'SUPPORT' | 'RELATE' | 'THANKS';
const REACTIONS: { kind: ReactionKind; label: string; icon: typeof Heart }[] = [
  { kind: 'SUPPORT', label: 'Support', icon: HandHeart },
  { kind: 'RELATE', label: 'I relate', icon: Heart },
  { kind: 'THANKS', label: 'Thanks', icon: Sparkles },
];
const REPORT_REASONS = ['spam', 'bullying', 'harassment', 'hate', 'threat', 'personal-info', 'self-harm-concern', 'other'];

export function CommunityPost() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const key = ['community', 'post', id];
  const q = useApi<PostDetail>(key, `/community/posts/${id}`);
  const [report, setReport] = useState<{ type: TargetType; id: string } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ModResponse | null>(null);

  const react = useAction((kind: ReactionKind) => post<{ reacted: boolean }>(`/community/posts/${id}/reactions`, { kind }), { invalidate: [key] });
  const block = useAction((v: { targetType: TargetType; targetId: string }) => post('/community/blocks', v), { success: 'Member blocked. You will no longer see their content.', invalidate: [['community']] });
  const remove = useAction((v: { type: TargetType; id: string }) => del(`/community/content/${v.type}/${v.id}`), { success: 'Deleted', invalidate: [['community']] });

  const comments = q.data?.comments ?? [];
  const byParent = useMemo(() => {
    const m = new Map<string | null, Comment[]>();
    const ids = new Set(comments.map((c) => c.id));
    for (const c of comments) {
      const k = c.parentId && ids.has(c.parentId) ? c.parentId : null;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [comments]);

  if (q.isLoading) return <LoadingBlock rows={4} />;
  if (q.isError || !q.data) return <div className="space-y-4"><BackToCommunity /><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></div>;
  const { post: p, reactions } = q.data;
  const count = (k: ReactionKind) => reactions.find((r) => r.kind === k)?._count ?? 0;
  const approved = p.status === 'APPROVED';

  const onBlock = async (targetType: TargetType, targetId: string, isPostAuthor: boolean) => {
    if (!(await confirm({ title: 'Block this member?', message: 'You will no longer see their posts or comments. They won\'t be told. You can unblock them later from My posts & comments.', confirmLabel: 'Block', danger: true }))) return;
    block.mutate({ targetType, targetId }, { onSuccess: () => { if (isPostAuthor) nav('/community'); else q.refetch(); } });
  };
  const onDelete = async (type: TargetType, cid: string) => {
    if (!(await confirm({ title: `Delete this ${type === 'POST' ? 'post' : 'comment'}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    remove.mutate({ type, id: cid }, { onSuccess: () => { if (type === 'POST') nav('/community'); } });
  };

  const renderComment = (c: Comment, depth: number): ReactNode => {
    const children = byParent.get(c.id) ?? [];
    const pending = c.isMine && c.status !== 'APPROVED';
    return (
      <li key={c.id} className={cx(depth > 0 && 'ml-4 border-l-2 border-slate-100 pl-4 sm:ml-6')}>
        <div className={cx('rounded-xl p-3', pending ? 'border border-dashed border-amber-200 bg-amber-50/40' : 'bg-slate-50')}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{c.pseudonym}</span>
            {c.isMine && <Badge tone="brand">You</Badge>}
            {pending && <Badge tone={c.status === 'HIDDEN' || c.status === 'REJECTED' ? 'rose' : 'amber'}>{c.status === 'HIDDEN' ? 'Hidden' : c.status === 'REJECTED' ? 'Not published' : 'Pending review'}</Badge>}
            <span>{fmtDateTime(c.createdAt)}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-slate-800">{c.body}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {approved && c.status === 'APPROVED' && <Button size="sm" variant="ghost" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}><Reply className="size-3.5" aria-hidden />Reply</Button>}
            {c.isMine ? (
              <Button size="sm" variant="ghost" onClick={() => onDelete('COMMENT', c.id)}><Trash2 className="size-3.5" aria-hidden />Delete</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setReport({ type: 'COMMENT', id: c.id })}><Flag className="size-3.5" aria-hidden />Report</Button>
                <Button size="sm" variant="ghost" onClick={() => onBlock('COMMENT', c.id, false)}><UserX className="size-3.5" aria-hidden />Block</Button>
              </>
            )}
          </div>
        </div>
        {replyTo === c.id && (
          <div className="mt-2 ml-4">
            <CommentForm postId={id} parentId={c.id} compact onDone={(r) => { setReplyTo(null); setLastResult(r); }} onCancel={() => setReplyTo(null)} />
          </div>
        )}
        {children.length > 0 && <ul className="mt-2 space-y-2">{children.map((ch) => renderComment(ch, depth + 1))}</ul>}
      </li>
    );
  };

  const roots = byParent.get(null) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackToCommunity />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{p.pseudonym}</span>
          <Badge tone="slate">{CATEGORY_LABEL(p.category)}</Badge>
          {p.isMine && <Badge tone="brand">You</Badge>}
          {!approved && <StatusBadge status={p.status} />}
          <span>{fmtDateTime(p.createdAt)}</span>
        </div>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-800">{p.body}</p>
        {!approved && <div className="mt-3"><Notice tone="amber">Only you can see this post until it has been reviewed. Check <Link to="/community/mine" className="font-medium underline">My posts &amp; comments</Link> for details.</Notice></div>}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {REACTIONS.map((r) => (
            <Button key={r.kind} size="sm" variant="soft" disabled={!approved || react.isPending} onClick={() => react.mutate(r.kind)} aria-label={`${r.label} (${count(r.kind)})`}>
              <r.icon className="size-3.5" aria-hidden />{r.label}<span className="text-brand-600/80">{count(r.kind)}</span>
            </Button>
          ))}
          <span className="flex-1" />
          {p.isMine ? (
            <Button size="sm" variant="ghost" onClick={() => onDelete('POST', p.id)}><Trash2 className="size-3.5" aria-hidden />Delete</Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setReport({ type: 'POST', id: p.id })}><Flag className="size-3.5" aria-hidden />Report</Button>
              <Button size="sm" variant="ghost" onClick={() => onBlock('POST', p.id, true)}><UserX className="size-3.5" aria-hidden />Block author</Button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">Tap a reaction again to remove yours.</p>
      </Card>

      <Card title={`Comments (${comments.filter((c) => c.status === 'APPROVED').length})`}>
        {lastResult && <div className="mb-4"><ModerationResult result={lastResult} /></div>}
        {roots.length ? <ul className="mb-5 space-y-3">{roots.map((c) => renderComment(c, 0))}</ul> : <EmptyState title="No comments yet" hint="Share a kind word or something that helped you." />}
        {approved ? (
          <CommentForm postId={id} onDone={(r) => { setLastResult(r); if (r.status === 'APPROVED') toast('Published'); }} />
        ) : (
          <p className="text-sm text-slate-500">Comments open once this post is published.</p>
        )}
      </Card>

      <ReportModal target={report} onClose={() => setReport(null)} />
    </div>
  );
}

function BackToCommunity() {
  return <Link to="/community" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700"><ArrowLeft className="size-4" aria-hidden />Back to community</Link>;
}

function CommentForm({ postId, parentId, compact, onDone, onCancel }: { postId: string; parentId?: string; compact?: boolean; onDone: (r: ModResponse) => void; onCancel?: () => void }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const send = useAction((v: { body: string; parentId?: string }) => post<ModResponse>(`/community/posts/${postId}/comments`, v), {
    invalidate: [['community', 'post', postId], ['community', 'my-content']],
    onSuccess: (r) => { setBody(''); onDone(r); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return setError('Write something first');
    if (body.length > 2000) return setError('Comments can be up to 2000 characters');
    setError('');
    send.mutate({ body: body.trim(), ...(parentId ? { parentId } : {}) });
  };
  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <Textarea label={parentId ? 'Your reply' : 'Add a comment'} name={parentId ? `reply-${parentId}` : 'comment'} rows={compact ? 2 : 3} maxLength={2000}
        value={body} onChange={(e) => setBody(e.target.value)} error={error} placeholder="Be kind and supportive…" />
      {send.isError && <Notice tone="rose">{errMsg(send.error)}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" size="sm" loading={send.isPending}>{parentId ? 'Reply' : 'Comment'}</Button>
      </div>
    </form>
  );
}

function ReportModal({ target, onClose }: { target: { type: TargetType; id: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  useEffect(() => { if (target) { setReason('spam'); setDetails(''); } }, [target]);
  const send = useAction((v: { targetType: TargetType; targetId: string; reason: string; details?: string }) => post<{ message: string }>('/community/reports', v), {
    success: (r) => r.message ?? 'Thank you. Our moderators will review this.',
    onSuccess: () => onClose(),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    send.mutate({ targetType: target.type, targetId: target.id, reason, ...(details.trim() ? { details: details.trim() } : {}) });
  };
  return (
    <Modal open={!!target} onClose={onClose} title={`Report ${target?.type === 'COMMENT' ? 'comment' : 'post'}`}>
      <form onSubmit={submit} className="space-y-4">
        <Select label="Reason" name="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REPORT_REASONS.map((r) => ({ value: r, label: label(r) }))} />
        {reason === 'self-harm-concern' && (
          <Notice tone="rose">Thank you for looking out for someone. Sathi can&apos;t contact emergency services — if someone is in immediate danger, contact local emergency services. See <Link to="/safety" className="font-medium underline">urgent help</Link>.</Notice>
        )}
        <Textarea label="Details (optional)" name="report-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} hint="Reports are confidential. The author won't know who reported." />
        {send.isError && <Notice tone="rose">{errMsg(send.error)}</Notice>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={send.isPending}>Send report</Button></div>
      </form>
    </Modal>
  );
}

// ============================================================================
// 3. My community content
// ============================================================================
interface MyItem { type: TargetType; id: string; body: string; status: string; message?: string; caseId?: string; canAppeal: boolean; appealStatus?: string; createdAt: string }

export function MyCommunityContent() {
  const confirm = useConfirm();
  const content = useApi<MyItem[]>(['community', 'my-content'], '/community/my-content');
  const blocks = useApi<{ id: string; createdAt: string }[]>(['community', 'blocks'], '/community/blocks');
  const [editing, setEditing] = useState<MyItem | null>(null);
  const [appealing, setAppealing] = useState<MyItem | null>(null);
  const [tab, setTab] = useState<'all' | 'POST' | 'COMMENT'>('all');

  const unblock = useAction((id: string) => del(`/community/blocks/${id}`), { success: 'Unblocked', invalidate: [['community']] });
  const remove = useAction((v: { type: TargetType; id: string }) => del(`/community/content/${v.type}/${v.id}`), { success: 'Deleted', invalidate: [['community']] });

  const items = (content.data ?? []).filter((i) => tab === 'all' || i.type === tab);

  return (
    <div className="space-y-5">
      <BackToCommunity />
      <PageHeader title="My posts & comments" subtitle="See the review status of what you've shared, edit and resubmit, or appeal a decision." />

      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'all', label: 'All', count: content.data?.length },
          { value: 'POST', label: 'Posts', count: content.data?.filter((i) => i.type === 'POST').length },
          { value: 'COMMENT', label: 'Comments', count: content.data?.filter((i) => i.type === 'COMMENT').length },
        ]} />
        {content.isLoading ? <LoadingBlock /> : content.isError ? <ErrorState message={errMsg(content.error)} onRetry={() => content.refetch()} /> : !items.length ? (
          <EmptyState title="Nothing here yet" hint="Your posts and comments will appear here." action={<Link to="/community" className="text-sm font-medium text-brand-700 underline">Go to community</Link>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i) => {
              const editable = ['REJECTED', 'FLAGGED', 'HIDDEN'].includes(i.status);
              return (
                <li key={`${i.type}-${i.id}`} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge tone="slate">{i.type === 'POST' ? 'Post' : 'Comment'}</Badge>
                    <StatusBadge status={i.status} />
                    {i.appealStatus && <Badge tone="violet">Appeal: {label(i.appealStatus)}</Badge>}
                    <span>{fmtDateTime(i.createdAt)}</span>
                  </div>
                  <p className="line-clamp-4 text-sm whitespace-pre-wrap text-slate-800">{i.body}</p>
                  {i.message && <Notice tone={i.status === 'REJECTED' || i.status === 'REMOVED' ? 'rose' : 'amber'}>{i.message}</Notice>}
                  {mentionsUrgentHelp(i.message) && <UrgentHelpLink />}
                  <div className="flex flex-wrap gap-2">
                    {i.type === 'POST' && i.status !== 'REMOVED' && <Link to={`/community/${i.id}`} className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">View</Link>}
                    {editable && <Button size="sm" variant="outline" onClick={() => setEditing(i)}>Edit &amp; resubmit</Button>}
                    {i.canAppeal && i.caseId && <Button size="sm" variant="soft" onClick={() => setAppealing(i)}>Appeal</Button>}
                    {i.status !== 'REMOVED' && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (await confirm({ title: 'Delete this?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) remove.mutate({ type: i.type, id: i.id });
                      }}><Trash2 className="size-3.5" aria-hidden />Delete</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Blocked members" subtitle="You won't see posts or comments from people you've blocked. They aren't notified.">
        {blocks.isLoading ? <LoadingBlock rows={2} /> : blocks.isError ? <ErrorState message={errMsg(blocks.error)} onRetry={() => blocks.refetch()} /> : !blocks.data?.length ? (
          <EmptyState icon={<ShieldCheck className="size-6" />} title="You haven't blocked anyone" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {blocks.data.map((b, n) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div><p className="text-sm font-medium text-slate-800">Blocked member #{n + 1}</p><p className="text-xs text-slate-500">Since {fmtDate(b.createdAt)}</p></div>
                <Button size="sm" variant="outline" loading={unblock.isPending && unblock.variables === b.id} onClick={async () => {
                  if (await confirm({ title: 'Unblock this member?', message: 'Their posts and comments will be visible to you again.', confirmLabel: 'Unblock' })) unblock.mutate(b.id);
                }}>Unblock</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditContentModal item={editing} onClose={() => setEditing(null)} />
      <AppealModal item={appealing} onClose={() => setAppealing(null)} />
    </div>
  );
}

function EditContentModal({ item, onClose }: { item: MyItem | null; onClose: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [result, setResult] = useState<ModResponse | null>(null);
  useEffect(() => { if (item) { setBody(item.body); setResult(null); } }, [item]);
  const save = useAction((v: { type: TargetType; id: string; body: string }) => put<ModResponse>(`/community/content/${v.type}/${v.id}`, { body: v.body }), {
    invalidate: [['community']],
    onSuccess: (r) => { if (r.status === 'APPROVED') { toast('Published'); onClose(); } else setResult(r); },
  });
  const max = item?.type === 'COMMENT' ? 2000 : 4000;
  return (
    <Modal open={!!item} onClose={onClose} title={`Edit ${item?.type === 'COMMENT' ? 'comment' : 'post'}`} wide>
      {result ? (
        <div className="space-y-4"><ModerationResult result={result} onClose={onClose} /><div className="flex justify-end"><Button onClick={onClose}>Done</Button></div></div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (item && body.trim()) save.mutate({ type: item.type, id: item.id, body: body.trim() }); }}>
          <Notice>Your edited text will be checked again before it becomes visible. Removing links, promotions or personal details usually helps.</Notice>
          <Textarea label="Text" name="edit-body" rows={7} maxLength={max} value={body} onChange={(e) => setBody(e.target.value)} hint={`${body.length}/${max}`} />
          {save.isError && <Notice tone="rose">{errMsg(save.error)}</Notice>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!body.trim()}>Resubmit</Button></div>
        </form>
      )}
    </Modal>
  );
}

function AppealModal({ item, onClose }: { item: MyItem | null; onClose: () => void }) {
  const [message, setMessage] = useState('');
  useEffect(() => { if (item) setMessage(''); }, [item]);
  const send = useAction((v: { caseId: string; message: string }) => post<{ message: string }>('/community/appeals', v), {
    success: (r) => r.message ?? 'Your appeal has been submitted.',
    invalidate: [['community', 'my-content']],
    onSuccess: () => onClose(),
  });
  const tooShort = message.trim().length < 5;
  return (
    <Modal open={!!item} onClose={onClose} title="Appeal this decision">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (item?.caseId && !tooShort) send.mutate({ caseId: item.caseId, message: message.trim() }); }}>
        <p className="text-sm text-slate-600">Tell a moderator why you think this decision should be reconsidered. A person will review it.</p>
        <Textarea label="Your message" name="appeal-message" rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
          error={message && tooShort ? 'Please write at least 5 characters' : undefined} hint={`${message.length}/1000`} />
        {send.isError && <Notice tone="rose">{errMsg(send.error)}</Notice>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={send.isPending} disabled={tooShort}>Submit appeal</Button></div>
      </form>
    </Modal>
  );
}

// ============================================================================
// 4. Resources
// ============================================================================
interface ResourceItem { id: string; title: string; body: string; contentType: string; url: string | null; language: string; createdAt: string; category: { id: string; name: string } }
type ResourcePage = Paged<ResourceItem> & { categories: { id: string; name: string }[] };
const CONTENT_TYPES = ['ARTICLE', 'GUIDE', 'VIDEO'];

const safeHttpsUrl = (u?: string | null) => {
  if (!u) return null;
  try { const p = new URL(u); return p.protocol === 'https:' ? p.href : null; } catch { return null; }
};

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function Resources() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [categoryId, setCategoryId] = useState('');
  const [language, setLanguage] = useState('');
  const [contentType, setContentType] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ResourceItem | null>(null);
  useEffect(() => setPage(1), [q, categoryId, language, contentType]);

  const qs = new URLSearchParams({ page: String(page) });
  if (q) qs.set('q', q);
  if (categoryId) qs.set('categoryId', categoryId);
  if (language) qs.set('language', language);
  if (contentType) qs.set('contentType', contentType);
  const res = useApi<ResourcePage>(['resources', q, categoryId, language, contentType, page], `/resources?${qs}`);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (res.data?.categories) setCats(res.data.categories); }, [res.data]);

  const link = safeHttpsUrl(open?.url);

  return (
    <div className="space-y-5">
      <PageHeader title="Resources" subtitle="Guides and articles for everyday wellbeing." />
      <EmergencyCard />

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search</span><SearchInput value={search} onChange={setSearch} placeholder="Search resources" /></div>
          <Select label="Category" name="res-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={[{ value: '', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="Language" name="res-language" value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: '', label: 'Any language' }, { value: 'en', label: 'English' }, { value: 'ne', label: 'नेपाली (Nepali)' }]} />
          <Select label="Type" name="res-type" value={contentType} onChange={(e) => setContentType(e.target.value)} options={[{ value: '', label: 'Any type' }, ...CONTENT_TYPES.map((t) => ({ value: t, label: label(t) }))]} />
        </div>
      </Card>

      {res.isLoading ? <LoadingBlock rows={4} /> : res.isError ? <ErrorState message={errMsg(res.error)} onRetry={() => res.refetch()} /> : !res.data?.items.length ? (
        <Card><EmptyState icon={<BookOpen className="size-6" />} title="No resources found" hint="Try a different search or clear some filters." /></Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {res.data.items.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="flex h-full w-full flex-col rounded-2xl border border-slate-200/70 bg-white p-5 text-left shadow-sm transition hover:border-brand-200 hover:shadow focus-visible:ring-2 focus-visible:ring-brand-500">
                <div className="mb-2 flex flex-wrap gap-1.5"><Badge tone="slate">{r.category?.name}</Badge><Badge tone="sky">{label(r.contentType)}</Badge>{r.language === 'ne' && <Badge tone="violet">नेपाली</Badge>}</div>
                <h3 className="font-semibold text-slate-900">{r.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-slate-600">{r.body}</p>
                <span className="mt-auto pt-3 text-xs font-medium text-brand-700">Read more</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {res.data && <Pagination page={page} pages={res.data.pages} onChange={setPage} />}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} wide>
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5"><Badge tone="slate">{open.category?.name}</Badge><Badge tone="sky">{label(open.contentType)}</Badge><Badge tone="violet">{open.language === 'ne' ? 'नेपाली' : 'English'}</Badge></div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">{open.body}</p>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 underline">
                Open external link<ExternalLink className="size-4" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <p className="text-xs text-slate-400">Resources are for general information and are not a substitute for professional care.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EmergencyCard() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
        <div className="text-sm text-rose-900"><p className="font-semibold">If you are in danger, contact local emergency services now.</p><p className="text-rose-800">Sathi is not an emergency service.</p></div>
      </div>
      <Link to="/safety" className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700"><LifeBuoy className="size-4" aria-hidden />Urgent help</Link>
    </div>
  );
}

// ============================================================================
// 5. Notifications
// ============================================================================
interface NotificationItem { id: string; type: string; title: string; body: string; readAt: string | null; createdAt: string }

export function Notifications() {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const q = useApi<Paged<NotificationItem> & { unread: number }>(['notifications', 'list', tab, page], `/notifications?page=${page}&unread=${tab === 'unread'}`);
  const markOne = useAction((id: string) => post(`/notifications/${id}/read`), { invalidate: [['notifications']] });
  const markAll = useAction(() => post('/notifications/read-all'), { success: 'All caught up', invalidate: [['notifications']] });
  const unread = q.data?.unread ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Notifications" subtitle="Updates about your account and activity."
        action={<Button variant="outline" disabled={!unread} loading={markAll.isPending} onClick={() => markAll.mutate()}><CheckCheck className="size-4" aria-hidden />Mark all read</Button>} />
      <Card>
        <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: q.data ? unread : undefined }]} />
        {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !q.data?.items.length ? (
          <EmptyState icon={<Bell className="size-6" />} title={tab === 'unread' ? "You're all caught up" : 'No notifications yet'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {q.data.items.map((n) => (
              <li key={n.id} className={cx('flex items-start gap-3 py-3', !n.readAt && '-mx-2 rounded-xl bg-brand-50/40 px-2')}>
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm', n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900')}>{n.title}{!n.readAt && <span className="sr-only"> (unread)</span>}</p>
                  <p className="text-sm whitespace-pre-wrap text-slate-600">{n.body}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
                </div>
                {!n.readAt && <Button size="sm" variant="ghost" loading={markOne.isPending && markOne.variables === n.id} onClick={() => markOne.mutate(n.id)}>Mark read</Button>}
              </li>
            ))}
          </ul>
        )}
        {q.data && <Pagination page={page} pages={q.data.pages} onChange={setPage} />}
      </Card>
    </div>
  );
}

// ============================================================================
// 6. Settings
// ============================================================================
const TIMEZONES = ['Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];
const LANGS = [{ value: 'en', label: 'English' }, { value: 'ne', label: 'Nepali' }, { value: 'hi', label: 'Hindi' }, { value: 'mai', label: 'Maithili' }, { value: 'new', label: 'Newari' }, { value: 'bho', label: 'Bhojpuri' }];
const ACCESS = [{ value: 'wheelchair-access', label: 'Wheelchair access' }, { value: 'sign-language', label: 'Sign language' }, { value: 'screen-reader', label: 'Screen reader' }, { value: 'captions', label: 'Captions' }, { value: 'low-cost', label: 'Low cost' }, { value: 'quiet-space', label: 'Quiet space' }];
const withExtra = (opts: { value: string; label: string }[], vals: string[]) => [...opts, ...vals.filter((v) => !opts.some((o) => o.value === v)).map((v) => ({ value: v, label: label(v) }))];

export function Settings() {
  const { user } = useAuth();
  if (!user) return <LoadingBlock />;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" subtitle="Manage your profile, notifications and password." />
      <ProfileCard />
      {user.role === 'YOUTH' && <YouthProfileCard />}
      <NotificationPrefsCard />
      <PasswordCard />
      {user.role === 'YOUTH' && (
        <Card>
          <Link to="/youth/privacy" className="flex items-center gap-3 text-sm">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Lock className="size-5" aria-hidden /></span>
            <span><span className="block font-semibold text-slate-900">Privacy center</span><span className="text-slate-500">Download your data, manage consent, or delete your account.</span></span>
          </Link>
        </Card>
      )}
    </div>
  );
}

function ProfileCard() {
  const { user } = useAuth();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(TIMEZONES.includes(browserTz) ? browserTz : 'Asia/Kathmandu');
  const save = useAction((v: { displayName: string; timezone: string }) => patch('/users/me', v), { success: 'Profile saved' });
  const nameErr = displayName.trim().length < 2 ? 'Name must be at least 2 characters' : undefined;
  return (
    <Card title="Profile">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!nameErr) save.mutate({ displayName: displayName.trim(), timezone }); }}>
        <Input label="Display name" name="displayName" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} error={displayName && nameErr ? nameErr : undefined} />
        <Input label="Email" name="email" value={user?.email ?? ''} disabled />
        <Select label="Time zone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} options={TIMEZONES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} />
        <div className="flex justify-end"><Button type="submit" loading={save.isPending} disabled={!!nameErr}>Save profile</Button></div>
      </form>
    </Card>
  );
}

interface YouthProfile { ageGroup: string | null; locationArea: string | null; maxTravelKm: number | null; preferredLanguages: string[]; preferredMode: 'ONLINE' | 'IN_PERSON' | 'BOTH'; accessibility: string[]; checkInFrequencyDays: number }

function YouthProfileCard() {
  const q = useApi<YouthProfile>(['users', 'youth', 'me'], '/users/youth/me');
  const [f, setF] = useState<YouthProfile | null>(null);
  const [travel, setTravel] = useState('');
  useEffect(() => { if (q.data) { setF(q.data); setTravel(q.data.maxTravelKm == null ? '' : String(q.data.maxTravelKm)); } }, [q.data]);
  const save = useAction((v: Partial<YouthProfile>) => put('/users/youth/me', v), { success: 'Preferences saved', invalidate: [['users', 'youth', 'me']] });

  if (q.isLoading) return <Card title="About you"><LoadingBlock rows={2} /></Card>;
  if (q.isError || !f) return <Card title="About you"><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></Card>;

  const travelNum = travel === '' ? null : Number(travel);
  const travelErr = travelNum != null && (!Number.isInteger(travelNum) || travelNum < 0 || travelNum > 500) ? 'Enter a whole number between 0 and 500' : undefined;
  const freqErr = !Number.isInteger(f.checkInFrequencyDays) || f.checkInFrequencyDays < 1 || f.checkInFrequencyDays > 30 ? 'Choose between 1 and 30 days' : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (travelErr || freqErr) return;
    save.mutate({
      ageGroup: f.ageGroup || null,
      locationArea: f.locationArea?.trim() || null,
      maxTravelKm: travelNum,
      preferredLanguages: f.preferredLanguages,
      preferredMode: f.preferredMode,
      accessibility: f.accessibility,
      checkInFrequencyDays: f.checkInFrequencyDays,
    });
  };

  return (
    <Card title="About you" subtitle="Helps us suggest support that fits you. Only you and people you consent to can see this.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Age group" name="ageGroup" value={f.ageGroup ?? ''} onChange={(e) => setF({ ...f, ageGroup: e.target.value || null })}
            options={[{ value: '', label: 'Prefer not to say' }, ...['13-14', '15-17', '18-24', '25-29'].map((a) => ({ value: a, label: a }))]} />
          <Input label="Area (city or district)" name="locationArea" maxLength={100} value={f.locationArea ?? ''} onChange={(e) => setF({ ...f, locationArea: e.target.value })} hint="Just a general area — no street address." />
        </div>
        <div className="space-y-1.5"><span className="text-sm font-medium text-slate-700">Preferred languages</span>
          <ChipSelect options={withExtra(LANGS, f.preferredLanguages)} value={f.preferredLanguages} onChange={(v) => setF({ ...f, preferredLanguages: v })} /></div>
        <div className="space-y-1.5"><span className="text-sm font-medium text-slate-700">How would you like to meet?</span>
          <ChipSelect multi={false} options={[{ value: 'ONLINE', label: 'Online' }, { value: 'IN_PERSON', label: 'In person' }, { value: 'BOTH', label: 'Either' }]} value={[f.preferredMode]} onChange={(v) => setF({ ...f, preferredMode: (v[0] ?? 'BOTH') as YouthProfile['preferredMode'] })} /></div>
        <div className="space-y-1.5"><span className="text-sm font-medium text-slate-700">Accessibility needs</span>
          <ChipSelect options={withExtra(ACCESS, f.accessibility)} value={f.accessibility} onChange={(v) => setF({ ...f, accessibility: v })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Max travel distance (km)" name="maxTravelKm" type="number" min={0} max={500} inputMode="numeric" value={travel} onChange={(e) => setTravel(e.target.value)} error={travelErr} hint="Leave blank if not relevant." />
          <Input label="Check-in reminder every (days)" name="checkInFrequencyDays" type="number" min={1} max={30} inputMode="numeric" value={String(f.checkInFrequencyDays)} onChange={(e) => setF({ ...f, checkInFrequencyDays: Number(e.target.value) })} error={freqErr} />
        </div>
        <div className="flex justify-end"><Button type="submit" loading={save.isPending} disabled={!!travelErr || !!freqErr}>Save preferences</Button></div>
      </form>
    </Card>
  );
}

interface NotifPrefs { email: boolean; push: boolean; quietStartMin: number | null; quietEndMin: number | null }
const minToHHMM = (m: number | null) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const hhmmToMin = (s: string) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

function NotificationPrefsCard() {
  const q = useApi<NotifPrefs>(['users', 'notification-preferences'], '/users/me/notification-preferences');
  const [f, setF] = useState<NotifPrefs | null>(null);
  useEffect(() => { if (q.data) setF({ email: q.data.email, push: q.data.push, quietStartMin: q.data.quietStartMin, quietEndMin: q.data.quietEndMin }); }, [q.data]);
  const save = useAction((v: NotifPrefs) => put('/users/me/notification-preferences', v), { success: 'Notification preferences saved', invalidate: [['users', 'notification-preferences']] });

  if (q.isLoading) return <Card title="Notifications"><LoadingBlock rows={2} /></Card>;
  if (q.isError || !f) return <Card title="Notifications"><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></Card>;
  const halfQuiet = (f.quietStartMin == null) !== (f.quietEndMin == null);

  return (
    <Card title="Notifications">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!halfQuiet) save.mutate(f); }}>
        <Notice tone="brand">For your privacy, notification texts never include details about your wellbeing, check-ins or what you&apos;ve shared.</Notice>
        <div className="divide-y divide-slate-100">
          <Toggle label="Email notifications" description="Appointment reminders and account updates by email." checked={f.email} onChange={(v) => setF({ ...f, email: v })} />
          <Toggle label="Push notifications" description="Alerts on devices where you've allowed them." checked={f.push} onChange={(v) => setF({ ...f, push: v })} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">Quiet hours</legend>
          <p className="text-xs text-slate-500">We&apos;ll avoid sending notifications between these times. Leave both empty to turn quiet hours off.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36"><Input label="From" name="quietStart" type="time" value={minToHHMM(f.quietStartMin)} onChange={(e) => setF({ ...f, quietStartMin: hhmmToMin(e.target.value) })} /></div>
            <div className="w-36"><Input label="Until" name="quietEnd" type="time" value={minToHHMM(f.quietEndMin)} onChange={(e) => setF({ ...f, quietEndMin: hhmmToMin(e.target.value) })} /></div>
            {(f.quietStartMin != null || f.quietEndMin != null) && <Button variant="ghost" size="sm" onClick={() => setF({ ...f, quietStartMin: null, quietEndMin: null })}>Clear</Button>}
          </div>
          {halfQuiet && <p role="alert" className="text-xs text-rose-600">Set both a start and end time, or clear both.</p>}
        </fieldset>
        <div className="flex justify-end"><Button type="submit" loading={save.isPending} disabled={halfQuiet}>Save notification settings</Button></div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [touched, setTouched] = useState(false);
  const save = useAction((v: { currentPassword: string; newPassword: string }) => post('/auth/change-password', v), {
    success: 'Password changed',
    onSuccess: () => { setCur(''); setNext(''); setConfirmPw(''); setTouched(false); },
  });
  const nextErr = next.length < 10 ? 'Use at least 10 characters' : next.length > 128 ? 'Use at most 128 characters' : undefined;
  const confirmErr = confirmPw !== next ? "Passwords don't match" : undefined;
  return (
    <Card title="Change password">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (cur && !nextErr && !confirmErr) save.mutate({ currentPassword: cur, newPassword: next }); }}>
        <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={touched && !cur ? 'Enter your current password' : undefined} />
        <Input label="New password" name="newPassword" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={(touched || next) && nextErr ? nextErr : undefined} hint="At least 10 characters." />
        <Input label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} error={(touched || confirmPw) && confirmErr ? confirmErr : undefined} />
        <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Change password</Button></div>
      </form>
    </Card>
  );
}

// ============================================================================
// 7. Safety (public)
// ============================================================================
interface SafetyResource { id: string; title: string; phone: string | null; url: string | null; details: string; language: string; approved: boolean }
interface SafetyQuestion { key: string; prompt: string }
interface ScreeningResult { escalated: boolean; message: string; resources: SafetyResource[] }
type Answer = 'yes' | 'no' | 'unsure';

export function Safety() {
  const { user, loading } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700"><ArrowLeft className="size-4" aria-hidden />Back</Link>
          <Link to="/" className="flex items-center gap-2 text-brand-700"><HeartHandshake className="size-6" aria-hidden /><span className="text-lg font-bold">Sathi</span></Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Urgent help</h1>
          <p className="mt-1 text-sm text-slate-500">You deserve to be safe. Take a breath — help is available.</p>
        </div>

        <section className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-5" aria-labelledby="core-msg">
          <div className="flex gap-3">
            <LifeBuoy className="mt-0.5 size-6 shrink-0 text-rose-600" aria-hidden />
            <div className="space-y-2 text-rose-900">
              <h2 id="core-msg" className="font-semibold">If you or someone else is in immediate danger</h2>
              <p className="text-sm leading-relaxed">
                Sathi is not an emergency service and cannot contact emergency services for you. If you or someone else is in immediate danger,
                contact local emergency services or go to the nearest hospital. Reach out to someone you trust.
              </p>
            </div>
          </div>
        </section>

        {loading ? <LoadingBlock rows={2} /> : user ? (
          <>
            <SafetyResources />
            {user.role === 'YOUTH' && <SafetyScreening />}
          </>
        ) : (
          <Card>
            <p className="text-sm text-slate-700">Sign in to see more support contacts and services we&apos;ve gathered for you.</p>
            <Link to="/login" className="mt-3 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Sign in</Link>
          </Card>
        )}
      </main>
    </div>
  );
}

function SafetyResourceList({ items }: { items: SafetyResource[] }) {
  if (!items.length) return <EmptyState title="No support contacts listed yet" hint="Please contact local emergency services or someone you trust." />;
  return (
    <ul className="space-y-3">
      {items.map((r) => {
        const url = safeHttpsUrl(r.url);
        return (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{r.title}</p>
              {!r.approved && <Badge tone="amber">Pending professional review</Badge>}
              {r.language === 'ne' && <Badge tone="violet">नेपाली</Badge>}
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{r.details}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {r.phone && <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 underline"><Phone className="size-4" aria-hidden />{r.phone}</a>}
              {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-700 underline">Website<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span></a>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const sortApprovedFirst = (rs: SafetyResource[]) => [...rs].sort((a, b) => Number(b.approved) - Number(a.approved));

function SafetyResources() {
  const q = useApi<SafetyResource[]>(['safety', 'resources'], '/safety/resources');
  return (
    <Card title="Support contacts" subtitle="Services that may be able to help. Availability can vary.">
      {q.isLoading ? <LoadingBlock rows={2} /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : <SafetyResourceList items={sortApprovedFirst(q.data ?? [])} />}
    </Card>
  );
}

function SafetyScreening() {
  const qc = useQueryClient();
  const q = useApi<SafetyQuestion[]>(['safety', 'questions'], '/safety/questions');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const submit = useAction((v: { answers: Record<string, Answer> }) => post<ScreeningResult>('/safety/screenings', v), {
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['safety', 'resources'] }); },
  });

  if (q.isLoading) return <Card title="A quick check-in"><LoadingBlock rows={2} /></Card>;
  if (q.isError) return <Card title="A quick check-in"><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></Card>;
  const questions = q.data ?? [];
  if (!questions.length) return null;
  const complete = questions.every((x) => answers[x.key]);

  if (result) {
    return (
      <div className="space-y-4" aria-live="polite">
        {result.escalated ? (
          <section role="alert" className="rounded-2xl border-2 border-rose-300 bg-rose-100 p-5 text-rose-950 shadow-sm">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-6 shrink-0 text-rose-700" aria-hidden />
              <div className="space-y-2">
                <h2 className="text-lg font-bold">Your safety matters right now</h2>
                <p className="text-sm leading-relaxed">{result.message}</p>
                <p className="text-sm font-medium">Please don&apos;t stay alone with this — contact a person you trust or one of the services below.</p>
              </div>
            </div>
          </section>
        ) : (
          <Notice tone="brand">{result.message}</Notice>
        )}
        <Card title="Support contacts"><SafetyResourceList items={sortApprovedFirst(result.resources)} /></Card>
        <div className="flex justify-end"><Button variant="ghost" onClick={() => { setResult(null); setAnswers({}); }}>Answer again</Button></div>
      </div>
    );
  }

  return (
    <Card title="A quick check-in" subtitle="Optional. Your answers help us show the most useful information. This is not a diagnosis.">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (complete) submit.mutate({ answers }); }}>
        {questions.map((x) => (
          <fieldset key={x.key} className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">{x.prompt}</legend>
            <div className="flex flex-wrap gap-2">
              {(['yes', 'no', 'unsure'] as Answer[]).map((a) => (
                <label key={a} className={cx('flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500', answers[x.key] === a ? 'border-brand-500 bg-brand-50 font-medium text-brand-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>
                  <input type="radio" name={`safety-${x.key}`} value={a} checked={answers[x.key] === a} onChange={() => setAnswers({ ...answers, [x.key]: a })} className="sr-only" />
                  {a === 'yes' ? 'Yes' : a === 'no' ? 'No' : 'Not sure'}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {submit.isError && <Notice tone="rose">{errMsg(submit.error)}</Notice>}
        <div className="flex justify-end"><Button type="submit" loading={submit.isPending} disabled={!complete}>Continue</Button></div>
      </form>
    </Card>
  );
}
