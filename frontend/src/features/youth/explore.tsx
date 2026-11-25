import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, Building2, CalendarDays, CreditCard, Download, Lock, Mail, MapPin, Phone, ShieldCheck, Sparkles, Star, Trash2, Users } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi, del, post, put, type Paged } from '../../hooks';
import {
  Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, LoadingBlock, Modal, Notice, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, Toggle,
  cx, fmtDate, fmtDateTime, fmtMoney, label, useConfirm, useToast,
} from '../../components/ui';

// ======================================================================
// Shared types & helpers
// ======================================================================
interface Program {
  id: string; title: string; description: string; category: string; startsAt: string; endsAt: string; seats: number; seatsTaken: number;
  minAge: number | null; maxAge: number | null; eligibility: string | null; locationArea: string | null; mode: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  costPaisa: number; requirements: string | null; organization: { id: string; name: string; locationArea: string | null };
}
interface Booking { id: string; programId: string; status: string; createdAt: string; program: Program; feedback: { rating: number; comment: string | null } | null }
interface WaitlistEntry { id: string; programId: string; position: number; createdAt: string; program: Program }
interface MyBookings { bookings: Booking[]; waitlist: WaitlistEntry[]; saved: { id: string; programId: string; createdAt: string }[] }
interface Recommendation { id: string; programId: string; status: string; note: string | null; counselorName?: string; createdAt: string; program: Program }
interface ServiceItem {
  id: string; title: string; description: string; category: string; durationMin: number; capacity: number; locationArea: string | null; mode: string; costPaisa: number;
  organization: { name: string; contactEmail: string; contactPhone: string | null; locationArea: string | null };
}
type Providers = Record<'ESEWA' | 'KHALTI', boolean>;
interface InitiateResult { redirect: { method: 'GET' | 'POST'; url: string; fields?: Record<string, string> } }
type BookResult = { outcome: 'WAITLISTED'; waitlistPosition: number } | { outcome: 'CONFIRMED' | 'PENDING_PAYMENT'; booking: { id: string; status: string } };

const modeLabel = (m: string) => ({ ONLINE: 'Online', IN_PERSON: 'In person', BOTH: 'Online & in person' }[m] ?? label(m));
const seatsLeft = (p: Program) => Math.max(0, p.seats - p.seatsTaken);
const ageText = (p: Program) => (p.minAge != null && p.maxAge != null ? `Ages ${p.minAge}–${p.maxAge}` : p.minAge != null ? `Ages ${p.minAge}+` : p.maxAge != null ? `Up to age ${p.maxAge}` : null);
const BOOKINGS_KEY = ['programs', 'my', 'bookings'];

function goToGateway(r: InitiateResult['redirect']) {
  if (r.method === 'GET') { window.location.href = r.url; return; }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = r.url;
  form.style.display = 'none';
  Object.entries(r.fields ?? {}).forEach(([k, v]) => {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v;
    form.appendChild(i);
  });
  document.body.appendChild(form);
  form.submit();
}

/** Gateway chooser for a program booking awaiting payment. */
function PayModal({ bookingId, open, onClose }: { bookingId: string; open: boolean; onClose: () => void }) {
  const providers = useApi<Providers>(['payment-providers'], open ? '/payments/providers' : null);
  const pay = useAction((provider: 'ESEWA' | 'KHALTI') => post<InitiateResult>('/payments/initiate', { provider, programBookingId: bookingId }), { onSuccess: (r) => goToGateway(r.redirect) });
  const enabled = providers.data ? (Object.keys(providers.data) as ('ESEWA' | 'KHALTI')[]).filter((k) => providers.data![k]) : [];
  return (
    <Modal open={open} onClose={onClose} title="Complete payment">
      {providers.isLoading ? <LoadingBlock rows={2} /> : providers.isError ? <ErrorState message="Could not load payment options" onRetry={() => providers.refetch()} /> : !enabled.length ? (
        <Notice tone="amber">Online payment isn't available right now. Your place is held as pending — please try again later.</Notice>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">You'll be taken to the provider's secure page. Your place is confirmed once we verify the payment with them.</p>
          <div className="flex flex-wrap gap-2">
            {enabled.map((p) => <Button key={p} variant="outline" loading={pay.isPending && pay.variables === p} disabled={pay.isPending} onClick={() => pay.mutate(p)}>Pay with {label(p)}</Button>)}
          </div>
        </div>
      )}
    </Modal>
  );
}
function PayButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  return <><Button size="sm" onClick={() => setOpen(true)}><CreditCard className="size-4" aria-hidden />Pay now</Button><PayModal bookingId={bookingId} open={open} onClose={() => setOpen(false)} /></>;
}

function ProgramMeta({ p }: { p: Program }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{fmtDate(p.startsAt)}</span>
      <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{modeLabel(p.mode)}{p.locationArea ? ` · ${p.locationArea}` : ''}</span>
      <span className="flex items-center gap-1"><Building2 className="size-3.5" aria-hidden />{p.organization.name}</span>
    </p>
  );
}

function ProgramCard({ p, children }: { p: Program; children?: ReactNode }) {
  const left = seatsLeft(p);
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-1.5"><Badge tone="violet">{p.category}</Badge><Badge tone={p.costPaisa ? 'slate' : 'green'}>{fmtMoney(p.costPaisa)}</Badge>{left === 0 ? <Badge tone="amber">Full · waitlist</Badge> : <Badge tone="sky">{left} seat{left === 1 ? '' : 's'} left</Badge>}</div>
      <Link to={`/youth/programs/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{p.title}</Link>
      <p className="mt-1 mb-3 line-clamp-2 text-sm text-slate-600">{p.description}</p>
      <ProgramMeta p={p} />
      {children && <div className="mt-auto pt-4">{children}</div>}
    </div>
  );
}

// ======================================================================
// 5. Programs
// ======================================================================
type ProgTab = 'discover' | 'recommended' | 'bookings' | 'services';

export function Programs() {
  const [tab, setTab] = useState<ProgTab>('discover');
  return (
    <div>
      <PageHeader title="Programs & services" subtitle="Workshops, groups and community services you can join if they feel right for you." />
      <Tabs<ProgTab> value={tab} onChange={setTab} tabs={[
        { value: 'discover', label: 'Discover' }, { value: 'recommended', label: 'Recommended for you' }, { value: 'bookings', label: 'My bookings' }, { value: 'services', label: 'Services' },
      ]} />
      {tab === 'discover' && <Discover />}
      {tab === 'recommended' && <Recommended />}
      {tab === 'bookings' && <MyBookingsTab />}
      {tab === 'services' && <Services />}
    </div>
  );
}

function Discover() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [mode, setMode] = useState('');
  const [free, setFree] = useState(false);
  const [page, setPage] = useState(1);
  const cats = useApi<string[]>(['programs', 'categories'], '/programs/categories');
  const params = new URLSearchParams({ page: String(page), pageSize: '12' });
  if (q.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  if (mode) params.set('mode', mode);
  if (free) params.set('free', 'true');
  const list = useApi<Paged<Program>>(['programs', 'list', params.toString()], `/programs?${params}`);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1"><SearchInput value={q} onChange={reset(setQ)} placeholder="Search programs…" /></div>
        <Select aria-label="Category" value={category} onChange={(e) => reset(setCategory)(e.target.value)} options={[{ value: '', label: 'All categories' }, ...(cats.data ?? []).map((c) => ({ value: c, label: c }))]} />
        <Select aria-label="Format" value={mode} onChange={(e) => reset(setMode)(e.target.value)} options={[{ value: '', label: 'Any format' }, { value: 'ONLINE', label: 'Online' }, { value: 'IN_PERSON', label: 'In person' }]} />
        <div className="rounded-xl border border-slate-200 bg-white px-3"><Toggle checked={free} onChange={reset(setFree)} label="Free only" /></div>
      </div>
      {list.isLoading ? <LoadingBlock rows={4} /> : list.isError || !list.data ? <ErrorState message="Could not load programs" onRetry={() => list.refetch()} /> : !list.data.items.length ? (
        <EmptyState icon={<Sparkles className="size-6" />} title="No programs match" hint="Try a different search or clear some filters." />
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">{list.data.total} program{list.data.total === 1 ? '' : 's'}</p>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data.items.map((p) => <li key={p.id}><ProgramCard p={p}><Link to={`/youth/programs/${p.id}`}><Button size="sm" variant="soft">View details</Button></Link></ProgramCard></li>)}</ul>
          <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function Recommended() {
  const navigate = useNavigate();
  const key = ['programs', 'my', 'recommendations'];
  const q = useApi<Recommendation[]>(key, '/programs/my/recommendations');
  const act = useAction(({ id, action }: { id: string; action: 'SAVE' | 'DISMISS' }) => post(`/programs/my/recommendations/${id}`, { action }), {
    success: (r) => ((r as { status: string }).status === 'SAVED' ? 'Saved for later' : 'Okay, we hid that one'), invalidate: [key],
  });
  return (
    <div>
      <Notice tone="brand">Your counselor may suggest programs they think could help. These are only ideas — the choice is always yours.</Notice>
      <div className="mt-4">
        {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState message="Could not load recommendations" onRetry={() => q.refetch()} /> : !q.data?.length ? (
          <EmptyState icon={<Sparkles className="size-6" />} title="No recommendations right now" hint="If your counselor suggests a program, it will show up here." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {q.data.map((r) => (
              <li key={r.id}>
                <ProgramCard p={r.program}>
                  {r.note && <blockquote className="mb-3 border-l-2 border-brand-300 pl-3 text-sm text-slate-600 italic">“{r.note}”{r.counselorName && <span className="mt-1 block text-xs not-italic text-slate-500">— {r.counselorName}</span>}</blockquote>}
                  {!r.note && r.counselorName && <p className="mb-3 text-xs text-slate-500">Suggested by {r.counselorName}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === 'BOOKED' ? <StatusBadge status="CONFIRMED" /> : <Button size="sm" onClick={() => navigate(`/youth/programs/${r.programId}`)}>Book</Button>}
                    {r.status === 'SAVED' ? <Badge tone="sky"><Bookmark className="size-3" aria-hidden />Saved</Badge> : r.status === 'PENDING' && (
                      <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: 'SAVE' })}>Save</Button>
                    )}
                    {r.status !== 'BOOKED' && <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: 'DISMISS' })}>Not now</Button>}
                  </div>
                </ProgramCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MyBookingsTab() {
  const confirm = useConfirm();
  const q = useApi<MyBookings>(BOOKINGS_KEY, '/programs/my/bookings');
  const [feedbackFor, setFeedbackFor] = useState<Booking | null>(null);
  const cancel = useAction((id: string) => post(`/programs/bookings/${id}/cancel`, {}), { success: 'Booking cancelled', invalidate: [BOOKINGS_KEY, ['programs', 'list'], ['program']] });
  const leave = useAction((programId: string) => del(`/programs/${programId}/waitlist`), { success: 'You left the waitlist', invalidate: [BOOKINGS_KEY] });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorState message="Could not load your bookings" onRetry={() => q.refetch()} />;
  const { bookings, waitlist, saved } = q.data;
  return (
    <div className="space-y-6">
      <Card title="Bookings">
        {!bookings.length ? <EmptyState title="No bookings yet" hint="Programs you book will appear here." /> : (
          <ul className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <Link to={`/youth/programs/${b.program.id}`} className="font-medium text-slate-800 hover:underline">{b.program.title}</Link>
                  <ProgramMeta p={b.program} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><StatusBadge status={b.status} />{b.feedback && <Badge tone="slate"><Star className="size-3" aria-hidden />You rated {b.feedback.rating}/5</Badge>}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.status === 'PENDING_PAYMENT' && <PayButton bookingId={b.id} />}
                  {['ATTENDED', 'COMPLETED'].includes(b.status) && <Button size="sm" variant="outline" onClick={() => setFeedbackFor(b)}>{b.feedback ? 'Edit feedback' : 'Give feedback'}</Button>}
                  {['CONFIRMED', 'PENDING_PAYMENT'].includes(b.status) && (
                    <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === b.id} onClick={async () => (await confirm({
                      title: 'Cancel this booking?', message: `Your place in "${b.program.title}" will be released to someone else. Refunds for paid programs depend on the organization.`, confirmLabel: 'Cancel booking', danger: true,
                    })) && cancel.mutate(b.id)}>Cancel</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Waitlist" subtitle="If a place opens up, you'll be moved in automatically and notified.">
        {!waitlist.length ? <p className="text-sm text-slate-500">You're not on any waitlists.</p> : (
          <ul className="divide-y divide-slate-100">
            {waitlist.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><Link to={`/youth/programs/${w.programId}`} className="font-medium text-slate-800 hover:underline">{w.program.title}</Link><p className="text-xs text-slate-500">Position {w.position} · {fmtDate(w.program.startsAt)}</p></div>
                <Button size="sm" variant="ghost" loading={leave.isPending && leave.variables === w.programId} onClick={async () => (await confirm({ title: 'Leave the waitlist?', message: 'You will lose your place in the queue.', confirmLabel: 'Leave waitlist' })) && leave.mutate(w.programId)}>Leave waitlist</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Saved for later">
        {!saved.length ? <p className="text-sm text-slate-500">Nothing saved yet.</p> : <ul className="divide-y divide-slate-100">{saved.map((s) => <SavedRow key={s.id} programId={s.programId} />)}</ul>}
      </Card>
      {feedbackFor && <FeedbackModal booking={feedbackFor} onClose={() => setFeedbackFor(null)} />}
    </div>
  );
}

function SavedRow({ programId }: { programId: string }) {
  const q = useApi<Program>(['program', programId], `/programs/${programId}`);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      {q.isLoading ? <span className="text-sm text-slate-400">Loading…</span> : !q.data ? <span className="text-sm text-slate-500">This program is no longer available.</span> : (
        <><div><p className="font-medium text-slate-800">{q.data.title}</p><ProgramMeta p={q.data} /></div><Link to={`/youth/programs/${programId}`}><Button size="sm" variant="soft">View</Button></Link></>
      )}
    </li>
  );
}

function FeedbackModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [rating, setRating] = useState(booking.feedback?.rating ?? 0);
  const [comment, setComment] = useState(booking.feedback?.comment ?? '');
  const send = useAction(() => post(`/programs/bookings/${booking.id}/feedback`, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) }), {
    success: 'Thanks for sharing your feedback', invalidate: [BOOKINGS_KEY], onSuccess: onClose,
  });
  return (
    <Modal open onClose={onClose} title={`Feedback: ${booking.program.title}`}>
      <form onSubmit={(e) => { e.preventDefault(); if (rating) send.mutate(); }} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">How was it overall?</legend>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setRating(n)} className="rounded-lg p-1 hover:bg-slate-100">
                <Star className={cx('size-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
              </button>
            ))}
          </div>
        </fieldset>
        <Textarea label="Anything you'd like to share? (optional)" id="fb-comment" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} hint="Shared with the organization to help them improve. Keep it about the program." />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!rating} loading={send.isPending}>Send feedback</Button></div>
      </form>
    </Modal>
  );
}

function Services() {
  const q = useApi<ServiceItem[]>(['programs', 'services'], '/programs/services');
  const [search, setSearch] = useState('');
  const list = useMemo(() => (q.data ?? []).filter((s) => !search.trim() || `${s.title} ${s.category} ${s.organization.name}`.toLowerCase().includes(search.trim().toLowerCase())), [q.data, search]);
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorState message="Could not load services" onRetry={() => q.refetch()} />;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">Ongoing services offered by verified organizations. Contact them directly to ask about access.</p>
      <div className="mb-4 max-w-sm"><SearchInput value={search} onChange={setSearch} placeholder="Search services…" /></div>
      {!list.length ? <EmptyState title="No services found" /> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((s) => (
            <li key={s.id}>
              <Card title={s.title} subtitle={s.organization.name} action={<Badge tone="violet">{s.category}</Badge>} className="h-full">
                <p className="mb-3 text-sm text-slate-600">{s.description}</p>
                <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{s.durationMin} min</span><span>{modeLabel(s.mode)}</span>{(s.locationArea || s.organization.locationArea) && <span>{s.locationArea ?? s.organization.locationArea}</span>}<span>{fmtMoney(s.costPaisa)}</span>
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a href={`mailto:${s.organization.contactEmail}`} className="flex items-center gap-1 text-brand-700 hover:underline"><Mail className="size-4" aria-hidden />{s.organization.contactEmail}</a>
                  {s.organization.contactPhone && <a href={`tel:${s.organization.contactPhone}`} className="flex items-center gap-1 text-brand-700 hover:underline"><Phone className="size-4" aria-hidden />{s.organization.contactPhone}</a>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ======================================================================
// 6. Program detail
// ======================================================================
export function ProgramDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useApi<Program>(['program', id], `/programs/${id}`);
  const mine = useApi<MyBookings>(BOOKINGS_KEY, '/programs/my/bookings');
  const [payFor, setPayFor] = useState<string | null>(null);
  const [waitPos, setWaitPos] = useState<number | null>(null);
  const book = useAction(() => post<BookResult>(`/programs/${id}/book`, {}), {
    invalidate: [BOOKINGS_KEY, ['program', id], ['programs', 'list'], ['programs', 'my', 'recommendations']],
    onSuccess: (r) => {
      if (r.outcome === 'CONFIRMED') toast('You are booked in. See you there!');
      else if (r.outcome === 'WAITLISTED') setWaitPos(r.waitlistPosition);
      else setPayFor(r.booking.id);
    },
  });
  const save = useAction(() => post(`/programs/${id}/save`, {}), { success: 'Saved for later', invalidate: [BOOKINGS_KEY] });

  if (q.isLoading) return <LoadingBlock rows={4} />;
  if (q.isError || !q.data) return <ErrorState message={q.error ? errMsg(q.error) : 'Could not load this program'} onRetry={() => q.refetch()} />;
  const p = q.data;
  const left = seatsLeft(p);
  const booking = mine.data?.bookings.find((b) => b.programId === p.id && b.status !== 'CANCELLED');
  const wait = mine.data?.waitlist.find((w) => w.programId === p.id);
  const isSaved = mine.data?.saved.some((s) => s.programId === p.id);
  const bookErr = book.error as { response?: { status?: number } } | null;
  const age = ageText(p);

  return (
    <div>
      <button type="button" onClick={() => navigate('/youth/programs')} className="mb-3 text-sm text-brand-700 hover:underline">← All programs</button>
      <PageHeader title={p.title} subtitle={`By ${p.organization.name}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="About this program">
            <div className="mb-3 flex flex-wrap gap-1.5"><Badge tone="violet">{p.category}</Badge><Badge tone="slate">{modeLabel(p.mode)}</Badge></div>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{p.description}</p>
            {p.requirements && <><h3 className="mt-4 text-sm font-semibold text-slate-800">What to bring / requirements</h3><p className="text-sm whitespace-pre-wrap text-slate-600">{p.requirements}</p></>}
          </Card>
          {(p.eligibility || age) && (
            <Card title="Who it's for">
              {age && <p className="text-sm text-slate-700">{age}</p>}
              {p.eligibility && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{p.eligibility}</p>}
            </Card>
          )}
        </div>
        <aside className="space-y-4">
          <Card>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Starts</dt><dd className="text-right text-slate-800">{fmtDateTime(p.startsAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Ends</dt><dd className="text-right text-slate-800">{fmtDateTime(p.endsAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Format</dt><dd className="text-slate-800">{modeLabel(p.mode)}</dd></div>
              {p.locationArea && <div className="flex justify-between gap-2"><dt className="text-slate-500">Location</dt><dd className="text-right text-slate-800">{p.locationArea}</dd></div>}
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Cost</dt><dd className="font-medium text-slate-900">{fmtMoney(p.costPaisa)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Seats left</dt><dd className="flex items-center gap-1 text-slate-800"><Users className="size-4" aria-hidden />{left} of {p.seats}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Organization</dt><dd className="text-right text-slate-800">{p.organization.name}{p.organization.locationArea ? `, ${p.organization.locationArea}` : ''}</dd></div>
            </dl>
            <div className="mt-5 space-y-2">
              {booking ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm text-slate-700">Your booking: <StatusBadge status={booking.status} /></p>
                  {booking.status === 'PENDING_PAYMENT' && <PayButton bookingId={booking.id} />}
                </div>
              ) : wait || waitPos != null ? (
                <Notice tone="sky">You're on the waitlist (position {wait?.position ?? waitPos}). We'll let you know if a place opens up.</Notice>
              ) : (
                <Button className="w-full" loading={book.isPending} onClick={() => book.mutate()}>{left === 0 ? 'Join the waitlist' : p.costPaisa ? `Book · ${fmtMoney(p.costPaisa)}` : 'Book a place'}</Button>
              )}
              {!isSaved ? <Button className="w-full" variant="outline" loading={save.isPending} onClick={() => save.mutate()}><Bookmark className="size-4" aria-hidden />Save for later</Button>
                : <p className="flex items-center justify-center gap-1 text-xs text-slate-500"><Bookmark className="size-3.5" aria-hidden />Saved</p>}
              {book.isError && <div className="pt-1"><Notice tone={bookErr?.response?.status === 403 ? 'amber' : 'rose'}>{errMsg(book.error)}</Notice></div>}
            </div>
          </Card>
          <p className="text-xs text-slate-500">Programs are run by independent organizations. Sathi only shares your name and booking details with them — never your check-ins, assessments or counseling information.</p>
        </aside>
      </div>
      {payFor && <PayModal bookingId={payFor} open onClose={() => setPayFor(null)} />}
    </div>
  );
}

// ======================================================================
// 7. Privacy center
// ======================================================================
type Category = 'ASSESSMENT_SUMMARY' | 'SUPPORT_NEED_PROFILE' | 'CHECKIN_TRENDS' | 'SUPPORT_HISTORY';
const CATEGORIES: Category[] = ['SUPPORT_NEED_PROFILE', 'ASSESSMENT_SUMMARY', 'CHECKIN_TRENDS', 'SUPPORT_HISTORY'];
interface ConsentRecord {
  id: string; recipientId: string; recipientName: string; recipientType: string; category: Category; purpose: string; granted: boolean;
  grantedAt: string; withdrawnAt: string | null; history: { id: string; granted: boolean; changedAt: string }[];
}
interface AccessLog { category: string; allowed: boolean; reason: string; createdAt: string }

export function PrivacyCenter() {
  const consents = useApi<ConsentRecord[]>(['consents'], '/consents');
  const desc = useApi<Record<Category, string>>(['consents', 'descriptions'], '/consents/descriptions');
  const log = useApi<AccessLog[]>(['consents', 'access-log'], '/consents/access-log');
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; records: ConsentRecord[] }>();
    (consents.data ?? []).forEach((c) => { const g = m.get(c.recipientId) ?? { name: c.recipientName, records: [] }; g.records.push(c); m.set(c.recipientId, g); });
    return [...m.entries()];
  }, [consents.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Privacy center" subtitle="You decide what's shared, and you can change your mind at any time." />
      <Card title="What Sathi shares, and with whom">
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /><span><strong className="text-slate-800">Counselors</strong> you connect with can only see the information you allow below — like your support needs or check-in trends. Each time they look, it's recorded in your access log.</span></li>
          <li className="flex gap-2"><Lock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /><span><strong className="text-slate-800">Your messages</strong> with a counselor are private to the two of you. Session summaries are shared with you; counselors' private notes are professional records.</span></li>
          <li className="flex gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /><span><strong className="text-slate-800">Organizations</strong> running programs only see your name and booking details — never your check-ins, assessments, or who recommended a program.</span></li>
          <li className="flex gap-2"><Users className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /><span><strong className="text-slate-800">Community</strong> posts use a pseudonym, not your name.</span></li>
        </ul>
      </Card>

      <Card title="Your sharing choices" subtitle="Withdrawing consent means future access stops immediately. Anything already viewed can't be un-seen.">
        {consents.isLoading ? <LoadingBlock /> : consents.isError ? <ErrorState message="Could not load your consents" onRetry={() => consents.refetch()} /> : !groups.length ? (
          <EmptyState icon={<ShieldCheck className="size-6" />} title="No sharing set up yet" hint="When you book with a counselor, you'll choose what they can see. Those choices will appear here." />
        ) : (
          <div className="space-y-5">{groups.map(([cid, g]) => <ConsentGroup key={cid} counselorId={cid} name={g.name} records={g.records} desc={desc.data} />)}</div>
        )}
      </Card>

      <Card title="Access log" subtitle="Every time someone tried to view your sensitive information.">
        {log.isError ? <ErrorState message="Could not load the access log" onRetry={() => log.refetch()} /> : (
          <DataTable<AccessLog> loading={log.isLoading} rows={log.data} rowKey={(r) => `${r.createdAt}-${r.category}-${r.reason}`} empty="No one has accessed your sensitive information"
            columns={[
              { key: 'when', header: 'When', render: (r) => fmtDateTime(r.createdAt) },
              { key: 'what', header: 'Information', render: (r) => label(r.category) },
              { key: 'result', header: 'Result', render: (r) => <Badge tone={r.allowed ? 'green' : 'slate'}>{r.allowed ? 'Allowed' : 'Blocked'}</Badge> },
              { key: 'reason', header: 'Reason', render: (r) => <span className="text-slate-600">{r.reason}</span> },
            ]} />
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <DownloadData />
        <DeleteAccount />
      </div>
    </div>
  );
}

function ConsentGroup({ counselorId, name, records, desc }: { counselorId: string; name: string; records: ConsentRecord[]; desc?: Record<Category, string> }) {
  const confirm = useConfirm();
  const update = useAction(({ category, granted }: { category: Category; granted: boolean }) => put('/consents', { counselorId, items: [{ category, granted }] }), {
    success: (r) => (r ? 'Your choice was saved' : 'Saved'), invalidate: [['consents']],
  });
  const byCat = Object.fromEntries(records.map((r) => [r.category, r])) as Partial<Record<Category, ConsentRecord>>;
  const history = records.flatMap((r) => r.history.map((h) => ({ ...h, category: r.category }))).sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  const onToggle = async (category: Category, granted: boolean) => {
    if (!granted && !(await confirm({ title: 'Stop sharing this?', message: `${name} will no longer be able to see ${label(category).toLowerCase()}. Future access stops immediately.`, confirmLabel: 'Stop sharing' }))) return;
    update.mutate({ category, granted });
  };
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <p className="mb-1 font-medium text-slate-900">{name}</p>
      <div className="divide-y divide-slate-100">
        {CATEGORIES.map((c) => {
          const rec = byCat[c];
          const on = !!rec?.granted && !rec.withdrawnAt;
          return (
            <div key={c}>
              <Toggle checked={on} onChange={(v) => !update.isPending && onToggle(c, v)} label={label(c)} description={desc?.[c]} />
              {rec?.withdrawnAt && <p className="pb-2 text-xs text-slate-400">Withdrawn {fmtDate(rec.withdrawnAt)}</p>}
            </div>
          );
        })}
      </div>
      {history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">Change history ({history.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {history.map((h) => <li key={h.id}>{fmtDateTime(h.changedAt)} · {label(h.category)} · {h.granted ? 'Shared' : 'Stopped sharing'}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function DownloadData() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/users/me/export');
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sathi-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Your data download has started');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Download my data" subtitle="A copy of your account, check-ins, assessments, consents, bookings and posts as a JSON file.">
      <Button variant="outline" loading={busy} onClick={download}><Download className="size-4" aria-hidden />Download my data</Button>
    </Card>
  );
}

function DeleteAccount() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const remove = useAction((pw: string) => post('/users/me/delete', { password: pw }), {
    onSuccess: async () => { await logout(); navigate('/login', { replace: true }); },
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    if (await confirm({ title: 'Delete your account permanently?', message: 'This removes your identity from Sathi and signs you out everywhere. It cannot be undone. Some records (like payments) are kept as required by law, without your name.', confirmLabel: 'Delete my account', danger: true }))
      remove.mutate(password);
  };
  return (
    <Card title="Delete account" subtitle="If you'd like to leave Sathi, you can delete your account here.">
      <Button variant="outline" className="text-rose-700" onClick={() => setOpen(true)}><Trash2 className="size-4" aria-hidden />Delete my account</Button>
      <Modal open={open} onClose={() => { setOpen(false); setPassword(''); }} title="Delete your account">
        <form onSubmit={submit} className="space-y-4">
          <Notice tone="rose">Deleting your account removes your name and email, signs you out everywhere, and shows your community posts as "Deleted user". You might want to download your data first.</Notice>
          <Input type="password" label="Confirm your password" id="delete-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setOpen(false); setPassword(''); }}>Keep my account</Button>
            <Button type="submit" variant="danger" disabled={!password} loading={remove.isPending}>Delete account</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
