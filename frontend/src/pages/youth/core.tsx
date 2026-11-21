import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeft, ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock, CreditCard, Flag,
  HeartHandshake, ListChecks, LocateFixed, MapPin, Pencil, RefreshCw, Route as RouteIcon, ShieldCheck, Sparkles, SmilePlus, Timer, Users, XCircle,
} from 'lucide-react';
import {
  Badge, Button, Card, ChipSelect, EmptyState, ErrorState, Input, LoadingBlock, Modal, Notice, PageHeader, Progress, Skeleton, Stat, StatusBadge,
  Textarea, Toggle, cx, fmtDate, fmtDateTime, fmtMoney, fmtTime, label, useConfirm, useToast,
} from '../../components/ui';
import { del, post, put, useAction, useApi, type Paged } from '../../lib/hooks';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// =====================================================================
// Shared types & helpers (page-local)
// =====================================================================
type Mode = 'ONLINE' | 'IN_PERSON' | 'BOTH';
interface CheckIn { id: string; mood: number; stress: number; sleep: number; energy: number; social: number; functioning: number; concerns: string[]; reflection: string | null; createdAt: string }
interface Win { day: number; startMin: number; endMin: number }
interface NeedProfile { id: string; concerns: string[]; impactLevel: number; durationBucket: string; desiredSupport: string[]; languages: string[]; mode: Mode; locationArea: string | null; createdAt: string }
interface Relationship { id: string; status: string; startedAt: string; counselor: { id: string; user: { displayName: string } }; appointments: { id: string; startsAt: string; mode: string; status: string }[]; plans: { id: string; status: string }[] }
interface Appointment { id: string; startsAt: string; endsAt: string; mode: string; status: string; feePaisa: number; counselor: { id: string; user: { displayName: string } } }
interface Task { id: string; title: string; dueDate: string | null; status: string; goal: { title: string } }
interface ProgramRec { id: string; status: string; note: string | null; counselorName?: string; program: { id: string; title: string; category: string; startsAt: string; mode: string; costPaisa: number; organization: { name: string } } }
interface Milestone { id: string; kind: string; achievedAt: string }
interface Notification { id: string; title: string; body: string; readAt: string | null; createdAt: string }

const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

/** sessionStorage wrapper — every access guarded (private mode, blocked storage). */
const session = {
  get<T>(k: string): T | null { try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

const LANGS: Record<string, string> = { ne: 'Nepali', en: 'English', mai: 'Maithili', new: 'Newari', hi: 'Hindi', bho: 'Bhojpuri', tam: 'Tamang' };
const langName = (c: string) => LANGS[c] ?? c;
const MODE_LABEL: Record<string, string> = { ONLINE: 'Online', IN_PERSON: 'In person', BOTH: 'Online or in person' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const MOODS = [
  { v: 1, e: '😞', l: 'Very low' }, { v: 2, e: '🙁', l: 'Low' }, { v: 3, e: '😐', l: 'Okay' }, { v: 4, e: '🙂', l: 'Good' }, { v: 5, e: '😄', l: 'Great' },
];
const moodOf = (v?: number) => MOODS.find((m) => m.v === v);

/** Renders loading / error / data for a query with consistent states. */
function Q<T>({ q, rows = 2, children }: { q: UseQueryResult<T>; rows?: number; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <LoadingBlock rows={rows} />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <>{children(q.data as T)}</>;
}

/** Five-point scale as an accessible radio group. */
function Scale({ value, onChange, labels, name }: { value?: number; onChange: (v: number) => void; labels: string[]; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-5 gap-2">
      {labels.map((l, i) => {
        const v = i + 1, on = value === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={cx('flex flex-col items-center gap-1 rounded-xl border px-1 py-3 text-center transition', on ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
            <span className="text-lg font-bold">{v}</span><span className="text-[11px] leading-tight">{l}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Range slider with visible value. */
function Slider({ id, value, min, max, step = 1, onChange, labelText, valueText, ends }: { id: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; labelText: string; valueText: string; ends?: [string, string] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between"><label htmlFor={id} className="text-sm font-medium text-slate-700">{labelText}</label><span className="text-lg font-bold text-brand-700" aria-hidden>{valueText}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={valueText} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-600" />
      {ends && <div className="flex justify-between text-xs text-slate-500"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    </div>
  );
}

/** Focuses the step heading whenever the step changes (screen readers + keyboard users). */
function useStepFocus(step: unknown) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } ref.current?.focus(); }, [step]);
  return ref;
}

// =====================================================================
// 1. YouthHome
// =====================================================================
export function YouthHome() {
  const { user } = useAuth();
  const checkins = useApi<CheckIn[]>(['checkins', 30], '/check-ins?days=30');
  const need = useApi<NeedProfile | null>(['need-profile'], '/assessments/need-profile');
  const rels = useApi<Relationship[]>(['relationships'], '/support/relationships');
  const appts = useApi<Appointment[]>(['appointments', 'upcoming'], '/appointments?scope=upcoming');
  const tasks = useApi<Task[]>(['my-tasks'], '/support/my-tasks');
  const recs = useApi<ProgramRec[]>(['program-recs'], '/programs/my/recommendations');
  const progress = useApi<{ milestones: Milestone[] }>(['progress', 90], '/support/progress/me?days=90');
  const notes = useApi<Paged<Notification> & { unread: number }>(['notifications', 'latest'], '/notifications?pageSize=5');

  const latest = checkins.data?.length ? checkins.data[checkins.data.length - 1] : undefined;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const checkedToday = latest && new Date(latest.createdAt).toDateString() === new Date().toDateString();
  const trend = (checkins.data ?? []).map((c) => ({ date: new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), Mood: c.mood, Stress: c.stress }));
  const activeAppts = (appts.data ?? []).filter((a) => ['PENDING_PAYMENT', 'PENDING_COUNSELOR', 'CONFIRMED'].includes(a.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greet}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</h1>
          <p className="mt-1 text-sm text-brand-50">{checkedToday ? 'You checked in today. Thank you for looking after yourself.' : 'How are you feeling today? A quick check-in takes about a minute.'}</p>
        </div>
        <Link to="/youth/check-in" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-50">
          <SmilePlus className="size-4" aria-hidden />{checkedToday ? 'Check in again' : 'Start check-in'}
        </Link>
      </div>

      {need.isSuccess && !need.data && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><ClipboardList className="mt-0.5 size-6 shrink-0 text-brand-700" aria-hidden /><div><p className="font-semibold text-brand-900">Tell us what support would help</p><p className="text-sm text-brand-800">A short assessment builds your Support Need Profile so we can suggest counselors who fit. It is not a diagnosis.</p></div></div>
          <Link to="/youth/assessment" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Start assessment<ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {checkins.isLoading ? <Skeleton className="h-20" /> : <Stat label="Latest mood" icon={<SmilePlus className="size-5" />} value={latest ? <span>{moodOf(latest.mood)?.e} <span className="text-base font-semibold">{moodOf(latest.mood)?.l}</span></span> : '—'} hint={latest ? fmtDateTime(latest.createdAt) : 'No check-ins yet'} />}
        {checkins.isLoading ? <Skeleton className="h-20" /> : <Stat label="Latest stress" tone="amber" icon={<Flag className="size-5" />} value={latest ? `${latest.stress}/10` : '—'} hint={`${checkins.data?.length ?? 0} check-ins in 30 days`} />}
        {appts.isLoading ? <Skeleton className="h-20" /> : <Stat label="Upcoming sessions" tone="sky" icon={<CalendarDays className="size-5" />} value={activeAppts.length} hint={activeAppts[0] ? `Next: ${fmtDateTime(activeAppts[0].startsAt)}` : 'None scheduled'} />}
        {tasks.isLoading ? <Skeleton className="h-20" /> : <Stat label="Open tasks" tone="violet" icon={<ListChecks className="size-5" />} value={tasks.data?.length ?? 0} hint="From your support plan" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Mood & stress, last 30 days" subtitle="Self-reported, for reflection only. Gaps mean no check-in that day." className="lg:col-span-2"
          action={<Link to="/youth/progress" className="text-sm font-medium text-brand-700 hover:underline">See progress</Link>}>
          <Q q={checkins} rows={3}>{(d) => d.length < 2 ? (
            <EmptyState icon={<SmilePlus className="size-6" />} title={d.length ? 'One check-in so far' : 'No check-ins yet'} hint="Check in a few times and your trend will appear here." action={<Link to="/youth/check-in" className="text-sm font-medium text-brand-700 hover:underline">Check in now</Link>} />
          ) : (
            <div className="h-60" role="img" aria-label={`Line chart of mood (1 to 5) and stress (0 to 10) over ${d.length} check-ins`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis yAxisId="mood" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="stress" orientation="right" domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="mood" type="monotone" dataKey="Mood" stroke="#0e8583" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="stress" type="monotone" dataKey="Stress" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}</Q>
        </Card>

        <Card title="Support Need Profile" action={need.data ? <Link to="/youth/assessment" className="text-sm font-medium text-brand-700 hover:underline">Update</Link> : undefined}>
          <Q q={need}>{(p) => !p ? (
            <EmptyState icon={<ClipboardList className="size-6" />} title="Not started yet" hint="Your profile helps match you with the right support." action={<Link to="/youth/assessment" className="text-sm font-medium text-brand-700 hover:underline">Start the assessment</Link>} />
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" aria-hidden /><span className="font-medium text-slate-800">Ready</span><span className="text-xs text-slate-500">· updated {fmtDate(p.createdAt)}</span></div>
              <div><p className="mb-1 text-xs font-medium text-slate-500">Looking for support with</p><div className="flex flex-wrap gap-1.5">{p.concerns.map((c) => <Badge key={c}>{label(c)}</Badge>)}</div></div>
              <p className="text-slate-600">{MODE_LABEL[p.mode]} · {p.languages.map(langName).join(', ')}</p>
              <Link to="/youth/matches" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">See matched counselors<ArrowRight className="size-4" aria-hidden /></Link>
            </div>
          )}</Q>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Your support journey" action={<Link to="/youth/journey" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>}>
          <Q q={rels}>{(d) => !d.length ? (
            <EmptyState icon={<RouteIcon className="size-6" />} title="No active support yet" hint="When a counselor accepts your session, your journey starts here." action={<Link to="/youth/matches" className="text-sm font-medium text-brand-700 hover:underline">Find a counselor</Link>} />
          ) : (
            <ul className="space-y-2">{d.slice(0, 3).map((r) => (
              <li key={r.id}><Link to={`/youth/journey/${r.id}`} className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-800">{r.counselor.user.displayName}</span><StatusBadge status={r.status} /></div>
                <p className="mt-1 text-xs text-slate-500">Since {fmtDate(r.startedAt)}{r.appointments[0] ? ` · Next session ${fmtDateTime(r.appointments[0].startsAt)}` : ''}{r.plans.length ? ` · ${r.plans.length} plan${r.plans.length > 1 ? 's' : ''}` : ''}</p>
              </Link></li>
            ))}</ul>
          )}</Q>
        </Card>

        <Card title="Upcoming appointments" action={<Link to="/youth/appointments" className="text-sm font-medium text-brand-700 hover:underline">All appointments</Link>}>
          <Q q={appts}>{() => !activeAppts.length ? (
            <EmptyState icon={<CalendarDays className="size-6" />} title="Nothing scheduled" />
          ) : (
            <ul className="divide-y divide-slate-100">{activeAppts.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 py-2.5 first:pt-0">
                <div><p className="text-sm font-medium text-slate-800">{a.counselor.user.displayName}</p><p className="text-xs text-slate-500">{fmtDateTime(a.startsAt)} · {MODE_LABEL[a.mode] ?? label(a.mode)}</p></div>
                <StatusBadge status={a.status} />
              </li>
            ))}</ul>
          )}</Q>
        </Card>

        <Card title="Open tasks" action={<Link to="/youth/journey" className="text-sm font-medium text-brand-700 hover:underline">Go to journey</Link>}>
          <Q q={tasks}>{(d) => !d.length ? (
            <EmptyState icon={<ListChecks className="size-6" />} title="No open tasks" hint="Tasks you agree on with your counselor show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">{d.slice(0, 5).map((t) => (
              <li key={t.id}><Link to="/youth/journey" className="flex items-start justify-between gap-2 py-2.5 hover:bg-slate-50/60">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{t.title}</p><p className="truncate text-xs text-slate-500">{t.goal.title}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}</p></div>
                <StatusBadge status={t.status} />
              </Link></li>
            ))}</ul>
          )}</Q>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recommended programs" subtitle="Suggested by your counselor" action={<Link to="/youth/programs" className="text-sm font-medium text-brand-700 hover:underline">Browse</Link>}>
          <Q q={recs}>{(d) => !d.length ? (
            <EmptyState icon={<Sparkles className="size-6" />} title="No recommendations yet" />
          ) : (
            <ul className="space-y-2">{d.slice(0, 3).map((r) => (
              <li key={r.id}><Link to={`/youth/programs/${r.program.id}`} className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium text-slate-800">{r.program.title}</span><StatusBadge status={r.status} /></div>
                <p className="mt-1 text-xs text-slate-500">{r.program.organization.name} · {fmtDate(r.program.startsAt)} · {fmtMoney(r.program.costPaisa)}</p>
                {r.counselorName && <p className="mt-1 text-xs text-slate-400">Recommended by {r.counselorName}</p>}
              </Link></li>
            ))}</ul>
          )}</Q>
        </Card>

        <Card title="Milestones" subtitle="Steps you have taken">
          <Q q={progress}>{(d) => !d.milestones.length ? (
            <EmptyState icon={<Flag className="size-6" />} title="Your milestones will appear here" />
          ) : (
            <ul className="space-y-2">{[...d.milestones].reverse().slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check className="size-4" aria-hidden /></span>
                <div><p className="text-sm font-medium text-slate-800">{label(m.kind)}</p><p className="text-xs text-slate-500">{fmtDate(m.achievedAt)}</p></div></li>
            ))}</ul>
          )}</Q>
        </Card>

        <Card title={<span className="flex items-center gap-2">Notifications{!!notes.data?.unread && <Badge tone="rose">{notes.data.unread} new</Badge>}</span>} action={<Link to="/notifications" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>}>
          <Q q={notes}>{(d) => !d.items.length ? (
            <EmptyState icon={<Bell className="size-6" />} title="You're all caught up" />
          ) : (
            <ul className="divide-y divide-slate-100">{d.items.map((n) => (
              <li key={n.id} className="py-2.5 first:pt-0">
                <p className={cx('text-sm', n.readAt ? 'text-slate-600' : 'font-semibold text-slate-900')}>{!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-brand-500" aria-label="Unread" />}{n.title}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p><p className="text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </li>
            ))}</ul>
          )}</Q>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// 2. CheckInWizard
// =====================================================================
type CKey = 'mood' | 'stress' | 'sleep' | 'energy' | 'social' | 'functioning' | 'concerns' | 'reflection' | 'review';
interface CheckInDraft { mood?: number; stress?: number; sleep?: number; energy?: number; social?: number; functioning?: number; concerns: string[]; reflection: string }
const CK_DRAFT = 'sathi.checkin.draft';
const SCALES: Record<'sleep' | 'energy' | 'social' | 'functioning', { title: string; hint: string; labels: string[] }> = {
  sleep: { title: 'How have you been sleeping?', hint: 'Think about the last few nights.', labels: ['Very poorly', 'Poorly', 'Okay', 'Well', 'Very well'] },
  energy: { title: 'How is your energy today?', hint: 'Physical or mental energy — whatever feels most true.', labels: ['Drained', 'Low', 'Okay', 'Good', 'Full'] },
  social: { title: 'How connected do you feel to others?', hint: 'Friends, family, classmates or community.', labels: ['Very alone', 'Distant', 'Okay', 'Connected', 'Very connected'] },
  functioning: { title: 'How are daily things going?', hint: 'Studies, work, chores and routines.', labels: ['Very hard', 'Hard', 'Managing', 'Mostly well', 'Going well'] },
};
const CONCERN_OPTS = ['stress', 'sleep', 'studies', 'family', 'relationships', 'loneliness', 'health', 'money', 'other'].map((v) => ({ value: v, label: label(v) }));
const CK_LABEL: Record<Exclude<CKey, 'review'>, string> = { mood: 'Mood', stress: 'Stress', sleep: 'Sleep', energy: 'Energy', social: 'Social connection', functioning: 'Daily functioning', concerns: 'Current concerns', reflection: 'Reflection' };

export function CheckInWizard() {
  const nav = useNavigate();
  const saved = useMemo(() => session.get<{ a: CheckInDraft; step: CKey }>(CK_DRAFT), []);
  const [a, setA] = useState<CheckInDraft>(() => ({ concerns: [], reflection: '', ...(saved?.a ?? {}) }));
  const [step, setStep] = useState<CKey>(saved?.step ?? 'mood');
  const [fromReview, setFromReview] = useState(false);
  const [resumed] = useState(!!saved);
  const headRef = useStepFocus(step);

  const needsConcerns = (a.stress ?? 0) >= 7 || (a.mood ?? 5) <= 2;
  const steps: CKey[] = ['mood', 'stress', 'sleep', 'energy', 'social', 'functioning', ...(needsConcerns ? (['concerns'] as CKey[]) : []), 'reflection', 'review'];
  const idx = Math.max(0, steps.indexOf(step));
  useEffect(() => { if (!steps.includes(step)) setStep('reflection'); }); // concerns step can disappear
  useEffect(() => { session.set(CK_DRAFT, { a, step }); }, [a, step]);

  const set = <K extends keyof CheckInDraft>(k: K, v: CheckInDraft[K]) => setA((p) => ({ ...p, [k]: v }));
  const valid = (k: CKey) => (k === 'mood' || k === 'sleep' || k === 'energy' || k === 'social' || k === 'functioning' ? a[k] != null : true);
  const allValid = (['mood', 'sleep', 'energy', 'social', 'functioning'] as const).every((k) => a[k] != null);

  const next = () => {
    if (step === 'stress' && a.stress == null) set('stress', 5);
    if (fromReview) { setFromReview(false); setStep('review'); return; }
    setStep(steps[Math.min(idx + 1, steps.length - 1)]);
  };
  const back = () => { setFromReview(false); setStep(steps[Math.max(0, idx - 1)]); };
  const edit = (k: CKey) => { setFromReview(true); setStep(k); };
  const reset = () => { session.del(CK_DRAFT); setA({ concerns: [], reflection: '' }); setStep('mood'); setFromReview(false); };

  const submit = useAction(() => post('/check-ins', {
    mood: a.mood, stress: a.stress ?? 5, sleep: a.sleep, energy: a.energy, social: a.social, functioning: a.functioning,
    concerns: needsConcerns ? a.concerns : [], reflection: a.reflection.trim() || undefined,
  }), {
    success: 'Check-in saved. Thank you for taking a moment for yourself.', invalidate: [['checkins'], ['progress']],
    onSuccess: () => { session.del(CK_DRAFT); nav('/youth'); },
  });

  const display = (k: Exclude<CKey, 'review'>): string => {
    if (k === 'mood') return a.mood ? `${moodOf(a.mood)?.e} ${moodOf(a.mood)?.l}` : 'Not answered';
    if (k === 'stress') return `${a.stress ?? 5} / 10`;
    if (k === 'concerns') return a.concerns.length ? a.concerns.map(label).join(', ') : 'None selected';
    if (k === 'reflection') return a.reflection.trim() || 'Skipped';
    const v = a[k];
    return v ? `${v} — ${SCALES[k].labels[v - 1]}` : 'Not answered';
  };

  let body: ReactNode;
  let title = '';
  let hint = '';
  if (step === 'mood') {
    title = 'How are you feeling overall today?'; hint = 'There are no right or wrong answers.';
    body = (
      <div role="radiogroup" aria-label="Mood" className="grid grid-cols-5 gap-2 sm:gap-3">
        {MOODS.map((m) => (
          <button key={m.v} type="button" role="radio" aria-checked={a.mood === m.v} onClick={() => set('mood', m.v)}
            className={cx('flex flex-col items-center gap-1 rounded-2xl border p-2 py-4 transition sm:p-4', a.mood === m.v ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:bg-slate-50')}>
            <span className="text-3xl sm:text-4xl" aria-hidden>{m.e}</span><span className="text-xs font-medium text-slate-700">{m.l}</span>
          </button>
        ))}
      </div>
    );
  } else if (step === 'stress') {
    title = 'How stressed do you feel right now?'; hint = '0 means completely calm, 10 means extremely stressed.';
    body = <Slider id="stress" labelText="Stress level" value={a.stress ?? 5} min={0} max={10} onChange={(v) => set('stress', v)} valueText={`${a.stress ?? 5} / 10`} ends={['Calm', 'Very stressed']} />;
  } else if (step === 'sleep' || step === 'energy' || step === 'social' || step === 'functioning') {
    const s = SCALES[step]; title = s.title; hint = s.hint;
    body = <Scale name={CK_LABEL[step]} value={a[step]} onChange={(v) => set(step, v)} labels={s.labels} />;
  } else if (step === 'concerns') {
    title = 'What is on your mind at the moment?'; hint = 'Optional. Choose any that apply — it helps you notice patterns over time.';
    body = <ChipSelect options={CONCERN_OPTS} value={a.concerns} onChange={(v) => set('concerns', v)} />;
  } else if (step === 'reflection') {
    title = 'Anything you would like to note?'; hint = 'Optional. A sentence or two about your day — only you and people you choose to share with can see it.';
    body = <Textarea label="Reflection (optional)" name="reflection" maxLength={2000} value={a.reflection} onChange={(e) => set('reflection', e.target.value)} hint={`${a.reflection.length}/2000`} placeholder="Today I…" />;
  } else {
    title = 'Review your check-in'; hint = 'Change anything before saving.';
    body = (
      <dl className="divide-y divide-slate-100">
        {steps.filter((k): k is Exclude<CKey, 'review'> => k !== 'review').map((k) => (
          <div key={k} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{CK_LABEL[k]}</dt><dd className="text-sm break-words text-slate-800">{display(k)}</dd></div>
            <Button size="sm" variant="ghost" onClick={() => edit(k)} aria-label={`Edit ${CK_LABEL[k]}`}><Pencil className="size-3.5" />Edit</Button>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Daily check-in" subtitle="A minute to notice how you are doing. This is for reflection, not a diagnosis." />
      {resumed && step !== 'mood' && <Notice tone="brand">We restored your unfinished check-in. <button type="button" className="font-medium underline" onClick={reset}>Start over</button></Notice>}
      <Card>
        <div className="mb-5 space-y-2">
          <div className="flex justify-between text-xs text-slate-500"><span>Step {idx + 1} of {steps.length}</span><span>{step === 'review' ? 'Review' : CK_LABEL[step]}</span></div>
          <Progress value={((idx + 1) / steps.length) * 100} label="Check-in progress" />
        </div>
        <h2 ref={headRef} tabIndex={-1} className="text-lg font-semibold text-slate-900 outline-none">{title}</h2>
        {hint && <p className="mt-1 mb-5 text-sm text-slate-500">{hint}</p>}
        {body}
        {step === 'review' && needsConcerns && (
          <div className="mt-4"><Notice tone="amber">It sounds like things may be heavy right now. You can talk to a counselor through Sathi, and if you ever feel unsafe, <Link to="/safety" className="font-medium underline">urgent help is here</Link>.</Notice></div>
        )}
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={back} disabled={idx === 0}><ArrowLeft className="size-4" />Back</Button>
          {step === 'review'
            ? <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!allValid}><Check className="size-4" />Save check-in</Button>
            : <Button onClick={next} disabled={!valid(step)}>{fromReview ? 'Back to review' : 'Next'}<ArrowRight className="size-4" /></Button>}
        </div>
      </Card>
      <CheckInHistory />
    </div>
  );
}

function CheckInHistory() {
  const q = useApi<CheckIn[]>(['checkins', 90], '/check-ins?days=90');
  return (
    <Card title="Recent check-ins" subtitle="Last 90 days">
      <Q q={q} rows={3}>{(d) => !d.length ? <EmptyState title="No check-ins yet" hint="Your history will appear here after your first check-in." /> : (
        <ul className="divide-y divide-slate-100">{[...d].reverse().slice(0, 30).map((c) => (
          <li key={c.id} className="flex gap-3 py-3">
            <span className="text-2xl" role="img" aria-label={`Mood: ${moodOf(c.mood)?.l}`}>{moodOf(c.mood)?.e}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-800">{fmtDateTime(c.createdAt)}</p><span className="text-xs text-slate-500">Stress {c.stress}/10 · Sleep {c.sleep}/5 · Energy {c.energy}/5</span></div>
              {!!c.concerns.length && <div className="mt-1 flex flex-wrap gap-1">{c.concerns.map((x) => <Badge key={x} tone="slate">{label(x)}</Badge>)}</div>}
              {c.reflection && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.reflection}</p>}
            </div>
          </li>
        ))}</ul>
      )}</Q>
    </Card>
  );
}

// =====================================================================
// 3. AssessmentWizard
// =====================================================================
interface AForm { concerns: string[]; impact?: number; duration?: string; desiredSupport: string[]; languages: string[]; locationArea: string; latitude?: number; longitude?: number; maxTravelKm?: number; mode?: Mode; availability: Win[]; accessibility: string[] }
interface Question { key: string; prompt: string; type: string; options: { value: string; label: string }[] }
const EMPTY_FORM: AForm = { concerns: [], desiredSupport: [], languages: [], locationArea: '', availability: [], accessibility: [] };
const A_STEPS = ['concerns', 'impact', 'duration', 'desiredSupport', 'languages', 'locationArea', 'mode', 'availability', 'accessibility', 'review'] as const;
type AStep = (typeof A_STEPS)[number];
const A_TITLES: Record<AStep, string> = { concerns: 'Concerns', impact: 'Impact', duration: 'Duration', desiredSupport: 'Desired support', languages: 'Languages', locationArea: 'Location', mode: 'Session format', availability: 'Availability', accessibility: 'Accessibility', review: 'Review' };
const FALLBACK_Q: Record<string, { prompt: string; options: [string, string][] }> = {
  concerns: { prompt: 'What would you like support with?', options: [['anxiety', 'Feeling anxious or worried'], ['stress', 'Stress'], ['academic', 'Studies or exams'], ['low-mood', 'Low mood'], ['family', 'Family'], ['relationships', 'Relationships'], ['substance-use', 'Alcohol or drug use'], ['career', 'Career or future'], ['sleep', 'Sleep']] },
  impact: { prompt: 'How much is this affecting your daily life?', options: [] },
  duration: { prompt: 'How long has this been going on?', options: [['<2 weeks', 'Less than 2 weeks'], ['2-4 weeks', '2–4 weeks'], ['1-3 months', '1–3 months'], ['3-12 months', '3–12 months'], ['>1 year', 'More than a year']] },
  desiredSupport: { prompt: 'What kind of support would help?', options: [['counseling', 'Talking to a counselor'], ['skills', 'Learning coping skills'], ['group', 'Group programs'], ['information', 'Information and resources']] },
  languages: { prompt: 'Which languages are you comfortable with?', options: [['ne', 'Nepali'], ['en', 'English'], ['mai', 'Maithili'], ['new', 'Newari']] },
  locationArea: { prompt: 'Where are you based?', options: [] },
  mode: { prompt: 'How would you like to meet?', options: [['ONLINE', 'Online'], ['IN_PERSON', 'In person'], ['BOTH', 'Either']] },
  availability: { prompt: 'When are you usually available?', options: [] },
  accessibility: { prompt: 'Any accessibility needs?', options: [['wheelchair', 'Wheelchair access'], ['sign-language', 'Sign language'], ['captions', 'Captions'], ['low-bandwidth', 'Low-bandwidth calls']] },
};
const DURATIONS = ['<2 weeks', '2-4 weeks', '1-3 months', '3-12 months', '>1 year'];
const IMPACT_LABELS = ['A little', 'Somewhat', 'Moderately', 'A lot', 'Very much'];
const PERIODS = [{ k: 'Morning', s: 480, e: 720 }, { k: 'Afternoon', s: 720, e: 1020 }, { k: 'Evening', s: 1020, e: 1260 }];

const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
function fromDraft(d: Record<string, unknown> | null | undefined): { form: AForm; step: number } {
  if (!d) return { form: EMPTY_FORM, step: 0 };
  const wins = Array.isArray(d.availability) ? (d.availability as Win[]).filter((w) => w && typeof w.day === 'number' && typeof w.startMin === 'number' && typeof w.endMin === 'number') : [];
  return {
    form: {
      concerns: arr(d.concerns), impact: num(d.impact), duration: typeof d.duration === 'string' ? d.duration : undefined, desiredSupport: arr(d.desiredSupport),
      languages: arr(d.languages), locationArea: typeof d.locationArea === 'string' ? d.locationArea : '', latitude: num(d.latitude), longitude: num(d.longitude),
      maxTravelKm: num(d.maxTravelKm), mode: ['ONLINE', 'IN_PERSON', 'BOTH'].includes(d.mode as string) ? (d.mode as Mode) : undefined, availability: wins, accessibility: arr(d.accessibility),
    },
    step: Math.min(Math.max(0, num(d._step) ?? 0), A_STEPS.length - 1),
  };
}
function validateStep(s: AStep, f: AForm): string | null {
  switch (s) {
    case 'concerns': return !f.concerns.length ? 'Choose at least one area.' : f.concerns.length > 10 ? 'Choose up to 10.' : null;
    case 'duration': return f.duration ? null : 'Choose one option.';
    case 'desiredSupport': return !f.desiredSupport.length ? 'Choose at least one.' : f.desiredSupport.length > 6 ? 'Choose up to 6.' : null;
    case 'languages': return !f.languages.length ? 'Choose at least one language.' : f.languages.length > 5 ? 'Choose up to 5.' : null;
    case 'locationArea': return f.locationArea.length > 100 ? 'Keep the area name under 100 characters.' : null;
    case 'mode': return f.mode ? null : 'Choose how you would like to meet.';
    case 'availability': return !f.availability.length ? 'Pick at least one time you are usually free.' : f.availability.length > 21 ? 'Pick up to 21 time windows.' : null;
    case 'accessibility': return f.accessibility.length > 10 ? 'Choose up to 10.' : null;
    default: return null;
  }
}

export function AssessmentWizard() {
  const nav = useNavigate();
  const toast = useToast();
  const questions = useApi<Question[]>(['assessment', 'questions'], '/assessments/questions');
  const start = useQuery({
    queryKey: ['assessment', 'start'], retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
    queryFn: () => post<{ id: string; draft: Record<string, unknown> | null }>('/assessments'),
  });
  const [f, setF] = useState<AForm>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [fromReview, setFromReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [locating, setLocating] = useState(false);
  const prefilled = useRef(false);
  const headRef = useStepFocus(step);
  const id = start.data?.id;
  const cur = A_STEPS[step];

  useEffect(() => {
    if (!start.data || prefilled.current) return;
    prefilled.current = true;
    const d = fromDraft(start.data.draft);
    setF(d.form); setStep(d.step);
  }, [start.data]);

  const qOf = useCallback((key: string) => {
    const q = questions.data?.find((x) => x.key === key);
    const fb = FALLBACK_Q[key];
    return { prompt: q?.prompt ?? fb?.prompt ?? label(key), options: q?.options?.length ? q.options.map((o) => ({ value: o.value, label: o.label })) : (fb?.options ?? []).map(([value, l]) => ({ value, label: l })) };
  }, [questions.data]);
  const optLabel = (key: string, v: string) => qOf(key).options.find((o) => o.value === v)?.label ?? label(v);

  const saveDraft = (form: AForm, s: number) => {
    if (!id) return;
    setSaveState('saving');
    put(`/assessments/${id}/draft`, { draft: { ...form, _step: s } }).then(() => setSaveState('saved')).catch(() => setSaveState('error'));
  };
  const go = (s: number) => { setError(null); setStep(s); saveDraft(f, s); };
  const next = () => {
    const err = validateStep(cur, f);
    if (err) { setError(err); return; }
    if (cur === 'impact' && f.impact == null) setF((p) => ({ ...p, impact: 3 }));
    const formNow = cur === 'impact' && f.impact == null ? { ...f, impact: 3 } : f;
    const target = fromReview ? A_STEPS.length - 1 : step + 1;
    setFromReview(false); setError(null); setStep(target); saveDraft(formNow, target);
  };
  const editFromReview = (s: number) => { setFromReview(true); go(s); };
  const set = <K extends keyof AForm>(k: K, v: AForm[K]) => { setError(null); setF((p) => ({ ...p, [k]: v })); };

  const submit = useAction(() => {
    const hasLoc = !!f.locationArea.trim() || (f.latitude != null && f.longitude != null);
    return post(`/assessments/${id}/submit`, {
      concerns: f.concerns, impact: f.impact ?? 3, duration: f.duration, desiredSupport: f.desiredSupport, languages: f.languages,
      ...(f.locationArea.trim() ? { locationArea: f.locationArea.trim() } : {}),
      ...(f.latitude != null && f.longitude != null ? { latitude: f.latitude, longitude: f.longitude } : {}),
      ...(hasLoc && f.maxTravelKm != null ? { maxTravelKm: f.maxTravelKm } : {}),
      mode: f.mode, availability: f.availability, accessibility: f.accessibility,
    });
  }, { success: 'Your Support Need Profile is ready', invalidate: [['need-profile'], ['assessment']], onSuccess: () => nav('/youth/matches') });
  const submitAll = () => {
    const bad = A_STEPS.findIndex((s) => validateStep(s, f));
    if (bad >= 0) { setError(validateStep(A_STEPS[bad], f)); setStep(bad); setFromReview(true); return; }
    submit.mutate();
  };

  const locate = () => {
    if (!('geolocation' in navigator)) { toast('Location is not available in this browser', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setF((x) => ({ ...x, latitude: Math.round(p.coords.latitude * 1000) / 1000, longitude: Math.round(p.coords.longitude * 1000) / 1000, maxTravelKm: x.maxTravelKm ?? 10 })); toast('Approximate location added', 'info'); },
      () => { setLocating(false); toast('We could not get your location. You can type your area instead.', 'error'); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };
  const toggleWin = (day: number, s: number, e: number) => {
    const has = f.availability.some((w) => w.day === day && w.startMin === s && w.endMin === e);
    set('availability', has ? f.availability.filter((w) => !(w.day === day && w.startMin === s && w.endMin === e)) : [...f.availability, { day, startMin: s, endMin: e }].sort((x, y) => x.day - y.day || x.startMin - y.startMin));
  };
  const winLabel = (w: Win) => `${DAYS[w.day]} ${PERIODS.find((p) => p.s === w.startMin && p.e === w.endMin)?.k ?? `${hhmm(w.startMin)}–${hhmm(w.endMin)}`}`;

  if (start.isLoading || questions.isLoading) return <div className="mx-auto max-w-2xl"><PageHeader title="Support assessment" /><LoadingBlock rows={4} /></div>;
  if (start.isError) {
    const already = statusOf(start.error) === 409;
    return <div className="mx-auto max-w-2xl"><PageHeader title="Support assessment" /><ErrorState message={already ? 'This assessment was already submitted.' : errMsg(start.error)} onRetry={() => start.refetch()} /></div>;
  }

  const q = qOf(cur);
  let body: ReactNode = null;
  switch (cur) {
    case 'concerns': body = <><ChipSelect options={q.options} value={f.concerns} onChange={(v) => set('concerns', v)} /><p className="mt-2 text-xs text-slate-500">Choose all that apply (up to 10).</p></>; break;
    case 'impact': body = <Slider id="impact" labelText="Impact on daily life" min={1} max={5} value={f.impact ?? 3} onChange={(v) => set('impact', v)} valueText={`${f.impact ?? 3} — ${IMPACT_LABELS[(f.impact ?? 3) - 1]}`} ends={['A little', 'Very much']} />; break;
    case 'duration': body = <ChipSelect multi={false} options={q.options.length ? q.options : DURATIONS.map((d) => ({ value: d, label: d }))} value={f.duration ? [f.duration] : []} onChange={(v) => set('duration', v[0])} />; break;
    case 'desiredSupport': body = <><ChipSelect options={q.options} value={f.desiredSupport} onChange={(v) => set('desiredSupport', v)} /><p className="mt-2 text-xs text-slate-500">Choose up to 6.</p></>; break;
    case 'languages': body = <><ChipSelect options={q.options} value={f.languages} onChange={(v) => set('languages', v)} /><p className="mt-2 text-xs text-slate-500">Choose up to 5.</p></>; break;
    case 'locationArea': body = (
      <div className="space-y-4">
        <Input label="Area or city (optional)" name="locationArea" maxLength={100} placeholder="e.g. Lalitpur" value={f.locationArea} onChange={(e) => set('locationArea', e.target.value)} hint="Used to suggest in-person options nearby." />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={locate} loading={locating}><LocateFixed className="size-4" />Use my current location</Button>
          {f.latitude != null && f.longitude != null && (<><Badge tone="green"><MapPin className="size-3" />Approximate location added</Badge><Button size="sm" variant="ghost" onClick={() => setF((x) => ({ ...x, latitude: undefined, longitude: undefined }))}>Remove</Button></>)}
        </div>
        <p className="text-xs text-slate-500">Your location is rounded to about 100 m and only used for matching distance.</p>
        <Slider id="maxTravelKm" labelText="How far could you travel for in-person sessions?" min={1} max={100} value={f.maxTravelKm ?? 10} onChange={(v) => set('maxTravelKm', v)} valueText={`${f.maxTravelKm ?? 10} km`} ends={['1 km', '100 km']} />
      </div>
    ); break;
    case 'mode': body = (
      <div role="radiogroup" aria-label="Session format" className="grid gap-3 sm:grid-cols-3">
        {(q.options.length ? q.options : FALLBACK_Q.mode.options.map(([value, l]) => ({ value, label: l }))).map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={f.mode === o.value} onClick={() => set('mode', o.value as Mode)}
            className={cx('rounded-xl border p-4 text-left text-sm font-medium transition', f.mode === o.value ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>{o.label}</button>
        ))}
      </div>
    ); break;
    case 'availability': body = (
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Tap the times you are usually free. Morning 08–12, afternoon 12–17, evening 17–21.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead><tr><th scope="col" className="sr-only">Day</th>{PERIODS.map((p) => <th key={p.k} scope="col" className="px-1 pb-2 text-xs font-medium text-slate-500">{p.k}</th>)}</tr></thead>
            <tbody>{DAYS.map((d, day) => (
              <tr key={d}><th scope="row" className="pr-2 text-left text-xs font-medium text-slate-600">{DAYS_LONG[day]}</th>
                {PERIODS.map((p) => {
                  const on = f.availability.some((w) => w.day === day && w.startMin === p.s && w.endMin === p.e);
                  return <td key={p.k} className="p-1"><button type="button" aria-pressed={on} aria-label={`${DAYS_LONG[day]} ${p.k}`} onClick={() => toggleWin(day, p.s, p.e)}
                    className={cx('h-9 w-full rounded-lg border text-xs transition', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50')}>{on ? <Check className="mx-auto size-4" aria-hidden /> : '—'}</button></td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {f.availability.some((w) => !PERIODS.some((p) => p.s === w.startMin && p.e === w.endMin)) && (
          <div className="flex flex-wrap gap-2">{f.availability.filter((w) => !PERIODS.some((p) => p.s === w.startMin && p.e === w.endMin)).map((w) => (
            <Badge key={`${w.day}-${w.startMin}`} tone="slate">{winLabel(w)}<button type="button" aria-label={`Remove ${winLabel(w)}`} onClick={() => toggleWin(w.day, w.startMin, w.endMin)}><XCircle className="size-3.5" /></button></Badge>
          ))}</div>
        )}
      </div>
    ); break;
    case 'accessibility': body = <><ChipSelect options={q.options} value={f.accessibility} onChange={(v) => set('accessibility', v)} /><p className="mt-2 text-xs text-slate-500">Optional — skip if none apply.</p></>; break;
    case 'review': {
      const rows: [AStep, string][] = [
        ['concerns', f.concerns.map((v) => optLabel('concerns', v)).join(', ') || '—'],
        ['impact', f.impact ? `${f.impact} — ${IMPACT_LABELS[f.impact - 1]}` : '—'],
        ['duration', f.duration ? optLabel('duration', f.duration) : '—'],
        ['desiredSupport', f.desiredSupport.map((v) => optLabel('desiredSupport', v)).join(', ') || '—'],
        ['languages', f.languages.map((v) => optLabel('languages', v)).join(', ') || '—'],
        ['locationArea', [f.locationArea.trim() || null, f.latitude != null ? 'approximate location shared' : null, (f.locationArea.trim() || f.latitude != null) ? `up to ${f.maxTravelKm ?? 10} km` : null].filter(Boolean).join(' · ') || 'Not shared'],
        ['mode', f.mode ? MODE_LABEL[f.mode] : '—'],
        ['availability', f.availability.map(winLabel).join(', ') || '—'],
        ['accessibility', f.accessibility.map((v) => optLabel('accessibility', v)).join(', ') || 'None'],
      ];
      body = (
        <dl className="divide-y divide-slate-100">{rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{A_TITLES[k]}</dt><dd className={cx('text-sm break-words', validateStep(k, f) ? 'text-rose-600' : 'text-slate-800')}>{v}</dd></div>
            <Button size="sm" variant="ghost" onClick={() => editFromReview(A_STEPS.indexOf(k))} aria-label={`Edit ${A_TITLES[k]}`}><Pencil className="size-3.5" />Edit</Button>
          </div>
        ))}</dl>
      );
      break;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Support assessment" subtitle="About 5 minutes. Your answers are saved as you go." />
      <Notice tone="rose">If you are in danger right now, please <Link to="/safety" className="font-semibold underline">get urgent help</Link>. Sathi is not an emergency service.</Notice>
      <Notice>This assessment helps us understand what support might suit you. It is <strong>not a diagnosis</strong>.</Notice>
      <Card>
        <div className="mb-5 space-y-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Step {step + 1} of {A_STEPS.length} · {A_TITLES[cur]}</span>
            <span aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Draft saved' : saveState === 'error' ? 'Could not save draft' : ''}</span>
          </div>
          <Progress value={((step + 1) / A_STEPS.length) * 100} label="Assessment progress" />
        </div>
        <h2 ref={headRef} tabIndex={-1} className="mb-4 text-lg font-semibold text-slate-900 outline-none">{cur === 'review' ? 'Review and confirm' : q.prompt}</h2>
        {body}
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => { setFromReview(false); go(step - 1); }} disabled={step === 0}><ArrowLeft className="size-4" />Back</Button>
          {cur === 'review'
            ? <Button onClick={submitAll} loading={submit.isPending} disabled={!id}><Check className="size-4" />Confirm & find matches</Button>
            : <Button onClick={next}>{fromReview ? 'Back to review' : 'Next'}<ArrowRight className="size-4" /></Button>}
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// 4. Matches
// =====================================================================
interface Factor { factor: string; score: number; weight: number; weighted: number }
interface MatchResult {
  providerId: string; name: string; total: number; factors: Factor[]; explanations: string[]; gaps: string[];
  counselor?: { fee: number; mode: Mode; languages: string[]; locationArea: string | null; experienceYears: number; qualifications: string; bio: string; specializations: string[] } | null;
}
interface MatchRun { runId: string; createdAt?: string; configVersion: number; results: MatchResult[]; excludedCount?: number; disclaimer?: string }
const DEFAULT_DISCLAIMER = 'Compatibility reflects practical fit (concerns, language, availability, location, format). It does not predict treatment outcomes.';
const FACTOR_LABEL: Record<string, string> = { concern: 'Concerns', specialization: 'Specialization', language: 'Language', availability: 'Availability', location: 'Location', mode: 'Session format' };

export function Matches() {
  const qc = useQueryClient();
  const toast = useToast();
  const latest = useApi<MatchRun | null>(['matching', 'latest'], '/matching/runs/latest');
  const need = useApi<NeedProfile | null>(['need-profile'], '/assessments/need-profile');
  const [fresh, setFresh] = useState<MatchRun | null>(null);
  const [needsAssessment, setNeedsAssessment] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const run = useMutation({
    mutationFn: () => post<MatchRun>('/matching/run'),
    onSuccess: (r) => { setFresh(r); setCompare([]); qc.invalidateQueries({ queryKey: ['matching', 'latest'] }); toast(r.results.length ? 'Matches updated' : 'No matches right now', r.results.length ? 'success' : 'info'); },
    onError: (e) => { if (statusOf(e) === 400) setNeedsAssessment(true); else toast(errMsg(e), 'error'); },
  });

  const data = fresh ?? latest.data ?? null;
  const results = data?.results ?? [];
  const noProfile = needsAssessment || (need.isSuccess && !need.data);
  const picked = results.filter((r) => compare.includes(r.providerId));
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]));

  return (
    <div className="space-y-5">
      <PageHeader title="Find a counselor" subtitle="Counselors ranked by practical fit with your Support Need Profile."
        action={!noProfile && <Button onClick={() => run.mutate()} loading={run.isPending}><RefreshCw className="size-4" />{data ? 'Re-run matching' : 'Find my matches'}</Button>} />

      {noProfile ? (
        <Card><EmptyState icon={<ClipboardList className="size-6" />} title="Complete the support assessment first" hint="We use your Support Need Profile — concerns, language, availability and format — to suggest counselors who fit."
          action={<Link to="/youth/assessment" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Start assessment<ArrowRight className="size-4" aria-hidden /></Link>} /></Card>
      ) : latest.isLoading ? <LoadingBlock rows={3} /> : latest.isError && !fresh ? <ErrorState message={errMsg(latest.error)} onRetry={() => latest.refetch()} /> : !data ? (
        <Card><EmptyState icon={<Users className="size-6" />} title="Ready when you are" hint="Run matching to see counselors who fit your needs." action={<Button onClick={() => run.mutate()} loading={run.isPending}>Find my matches</Button>} /></Card>
      ) : (
        <>
          <Notice>{data.disclaimer ?? DEFAULT_DISCLAIMER} A higher score does not mean a counselor is better — only that the practical details line up.</Notice>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{data.createdAt ? `Last run ${fmtDateTime(data.createdAt)}` : 'Just now'} · scoring version {data.configVersion}{data.excludedCount ? ` · ${data.excludedCount} counselors not shown (unavailable or no fit)` : ''}</span>
            {compare.length > 0 && <Button size="sm" variant="soft" disabled={compare.length < 2} onClick={() => setShowCompare(true)}>Compare {compare.length} selected</Button>}
          </div>
          {!results.length ? (
            <Card><EmptyState icon={<Users className="size-6" />} title="No matches right now" hint="No available counselor fits your current profile. Try widening your availability, languages or format, or check back later." action={<Link to="/youth/assessment" className="text-sm font-medium text-brand-700 hover:underline">Update my profile</Link>} /></Card>
          ) : (
            <ol className="space-y-4">{results.map((r, i) => {
              const c = r.counselor;
              const isOpen = !!open[r.providerId];
              const checked = compare.includes(r.providerId);
              return (
                <li key={r.providerId}>
                  <article className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm" aria-labelledby={`m-${r.providerId}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">#{i + 1}</span><h2 id={`m-${r.providerId}`} className="truncate font-semibold text-slate-900">{r.name}</h2></div>
                        {c && <p className="text-sm text-slate-600">{c.qualifications}{c.experienceYears ? ` · ${c.experienceYears} yrs experience` : ''}</p>}
                        <div className="flex flex-wrap gap-1.5">{r.explanations.map((e) => <Badge key={e}>{e}</Badge>)}{r.gaps.map((g) => <Badge key={g} tone="amber">{g}</Badge>)}</div>
                        {c && <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{fmtMoney(c.fee)} / session</span><span>{MODE_LABEL[c.mode]}</span><span>{c.languages.map(langName).join(', ')}</span>{c.locationArea && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{c.locationArea}</span>}</p>}
                      </div>
                      <div className="flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-end">
                        <div className="text-right"><p className="text-3xl font-bold text-brand-700">{Math.round(r.total)}<span className="text-sm font-medium text-slate-400">/100</span></p><p className="text-xs text-slate-500">compatibility</p></div>
                        <Link to={`/youth/counselors/${r.providerId}`} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">View & book<ArrowRight className="size-4" aria-hidden /></Link>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <button type="button" aria-expanded={isOpen} aria-controls={`why-${r.providerId}`} onClick={() => setOpen((o) => ({ ...o, [r.providerId]: !isOpen }))} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                        Why am I seeing this recommendation?{isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                      <label className={cx('inline-flex items-center gap-2 text-sm', !checked && compare.length >= 3 ? 'text-slate-400' : 'text-slate-600')}>
                        <input type="checkbox" className="size-4 accent-brand-600" checked={checked} disabled={!checked && compare.length >= 3} onChange={() => toggleCompare(r.providerId)} />Compare
                      </label>
                    </div>
                    {isOpen && (
                      <div id={`why-${r.providerId}`} className="mt-3 space-y-2.5">
                        <p className="text-xs text-slate-500">Each factor contributes up to its weight. Points earned are shown out of the maximum.</p>
                        {r.factors.map((fc) => (
                          <div key={fc.factor}>
                            <div className="flex justify-between text-xs"><span className="font-medium text-slate-700">{FACTOR_LABEL[fc.factor] ?? label(fc.factor)}</span><span className="text-slate-500">{Math.round(fc.weighted * 10) / 10} / {fc.weight}</span></div>
                            <Progress value={fc.weight ? (fc.weighted / fc.weight) * 100 : 0} label={`${FACTOR_LABEL[fc.factor] ?? fc.factor}: ${Math.round(fc.weighted)} of ${fc.weight}`} />
                          </div>
                        ))}
                        {c?.bio && <p className="pt-2 text-sm text-slate-600">{c.bio}</p>}
                      </div>
                    )}
                  </article>
                </li>
              );
            })}</ol>
          )}
        </>
      )}

      <Modal open={showCompare} onClose={() => setShowCompare(false)} title="Compare counselors" wide>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead><tr className="border-b border-slate-100"><th scope="col" className="py-2 pr-3 text-xs font-medium text-slate-500">&nbsp;</th>{picked.map((p) => <th key={p.providerId} scope="col" className="px-3 py-2 font-semibold text-slate-900">{p.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">Compatibility</th>{picked.map((p) => <td key={p.providerId} className="px-3 py-2 font-semibold text-brand-700">{Math.round(p.total)}/100</td>)}</tr>
              {Object.keys(FACTOR_LABEL).filter((k) => picked.some((p) => p.factors.some((f) => f.factor === k))).map((k) => (
                <tr key={k}><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">{FACTOR_LABEL[k]}</th>{picked.map((p) => { const f = p.factors.find((x) => x.factor === k); return <td key={p.providerId} className="px-3 py-2">{f ? `${Math.round(f.weighted * 10) / 10} / ${f.weight}` : '—'}</td>; })}</tr>
              ))}
              <tr><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">Fee</th>{picked.map((p) => <td key={p.providerId} className="px-3 py-2">{p.counselor ? fmtMoney(p.counselor.fee) : '—'}</td>)}</tr>
              <tr><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">Languages</th>{picked.map((p) => <td key={p.providerId} className="px-3 py-2">{p.counselor?.languages.map(langName).join(', ') ?? '—'}</td>)}</tr>
              <tr><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">Format</th>{picked.map((p) => <td key={p.providerId} className="px-3 py-2">{p.counselor ? MODE_LABEL[p.counselor.mode] : '—'}</td>)}</tr>
              <tr><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">Experience</th>{picked.map((p) => <td key={p.providerId} className="px-3 py-2">{p.counselor ? `${p.counselor.experienceYears} yrs` : '—'}</td>)}</tr>
              <tr><th scope="row" className="py-2 pr-3 text-xs font-medium text-slate-500">&nbsp;</th>{picked.map((p) => <td key={p.providerId} className="px-3 py-2"><Link to={`/youth/counselors/${p.providerId}`} className="font-medium text-brand-700 hover:underline">View & book</Link></td>)}</tr>
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}

// =====================================================================
// 5. CounselorBooking
// =====================================================================
interface CounselorPublic { id: string; qualifications: string; experienceYears: number; bio: string; specializations: string[]; supportedConcerns: string[]; languages: string[]; ageGroups: string[]; locationArea: string | null; mode: Mode; sessionFeePaisa: number; acceptingBookings: boolean; user: { displayName: string } }
interface Slot { id: string; startsAt: string; endsAt: string }
interface Hold { id: string; slotId: string; expiresAt: string }
interface BookedAppt { id: string; status: string; feePaisa: number; startsAt: string; mode: string }
type ConsentCat = 'ASSESSMENT_SUMMARY' | 'SUPPORT_NEED_PROFILE' | 'CHECKIN_TRENDS' | 'SUPPORT_HISTORY';
const CONSENT_CATS: ConsentCat[] = ['ASSESSMENT_SUMMARY', 'SUPPORT_NEED_PROFILE', 'CHECKIN_TRENDS', 'SUPPORT_HISTORY'];
type BStep = 'slot' | 'format' | 'consent' | 'confirm';
const B_STEPS: { k: BStep; l: string }[] = [{ k: 'slot', l: 'Time' }, { k: 'format', l: 'Format' }, { k: 'consent', l: 'Sharing' }, { k: 'confirm', l: 'Confirm' }];

function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const cb = useRef(onExpire);
  cb.current = onExpire;
  const end = new Date(expiresAt).getTime();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - now);
  const fired = useRef(false);
  useEffect(() => { if (left === 0 && !fired.current) { fired.current = true; cb.current(); } }, [left]);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return (
    <div className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', left < 120_000 ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-800')} role="timer" aria-live="off">
      <Timer className="size-4" aria-hidden />Time held for you: <strong className="tabular-nums">{m}:{String(s).padStart(2, '0')}</strong>
    </div>
  );
}

export function CounselorBooking() {
  const { id = '' } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const counselor = useApi<CounselorPublic>(['counselor', id], `/counselors/${id}`);
  const slots = useApi<Slot[]>(['counselor', id, 'slots'], `/counselors/${id}/slots?days=21`);
  const consentText = useApi<Record<ConsentCat, string>>(['consents', 'descriptions'], '/consents/descriptions');
  const [step, setStep] = useState<BStep>('slot');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [mode, setMode] = useState<'ONLINE' | 'IN_PERSON' | null>(null);
  const [consents, setConsents] = useState<Record<ConsentCat, boolean>>({ ASSESSMENT_SUMMARY: false, SUPPORT_NEED_PROFILE: false, CHECKIN_TRENDS: false, SUPPORT_HISTORY: false });
  const [booked, setBooked] = useState<BookedAppt | null>(null);
  const headRef = useStepFocus(step);

  // Release a still-active hold if the youth leaves mid-flow (best effort).
  const holdRef = useRef<Hold | null>(null);
  holdRef.current = booked ? null : hold;
  useEffect(() => () => { if (holdRef.current) del(`/appointments/holds/${holdRef.current.id}`).catch(() => {}); }, []);

  const c = counselor.data;
  const modes: ('ONLINE' | 'IN_PERSON')[] = !c ? [] : c.mode === 'BOTH' ? ['ONLINE', 'IN_PERSON'] : [c.mode];
  useEffect(() => { if (modes.length === 1 && !mode) setMode(modes[0]); }, [modes, mode]);

  const backToSlots = useCallback(() => {
    setHold(null); setSlot(null); setStep('slot');
    qc.invalidateQueries({ queryKey: ['counselor', id, 'slots'] });
  }, [qc, id]);

  const placeHold = useMutation({
    mutationFn: (s: Slot) => post<Hold>('/appointments/holds', { slotId: s.id }),
    onSuccess: (h, s) => { setHold(h); setSlot(s); setStep('format'); },
    onError: (e) => { toast(errMsg(e), 'error'); if (statusOf(e) === 409 || statusOf(e) === 410) backToSlots(); },
  });
  const book = useMutation({
    mutationFn: () => post<BookedAppt>('/appointments', { holdId: hold!.id, mode, consents: CONSENT_CATS.map((category) => ({ category, granted: consents[category] })) }),
    onSuccess: (a) => {
      setBooked(a); setHold(null);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast(a.status === 'PENDING_PAYMENT' ? 'Time reserved — complete payment to send your request' : 'Session requested');
    },
    onError: (e) => { toast(errMsg(e), 'error'); if (statusOf(e) === 409 || statusOf(e) === 410) backToSlots(); },
  });
  const release = useAction((h: Hold) => del(`/appointments/holds/${h.id}`), { success: 'Time released', onSuccess: () => backToSlots() });
  const cancelHold = async () => {
    if (!hold) return;
    if (await confirm({ title: 'Release this time?', message: 'The time you picked will be released so others can book it.', confirmLabel: 'Release time' })) release.mutate(hold);
  };
  const onExpire = useCallback(() => { toast('Your 10-minute hold expired. Please choose a time again.', 'error'); backToSlots(); }, [toast, backToSlots]);

  const grouped = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) { const k = new Date(s.startsAt).toDateString(); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [slots.data]);

  if (counselor.isLoading) return <LoadingBlock rows={4} />;
  if (counselor.isError || !c) return <div className="space-y-4"><Link to="/youth/matches" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="size-4" />Back to matches</Link><ErrorState message={errMsg(counselor.error)} onRetry={() => counselor.refetch()} /></div>;

  if (booked) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader title={booked.status === 'PENDING_PAYMENT' ? 'Complete payment' : 'Request sent'} subtitle={`${c.user.displayName} · ${fmtDateTime(booked.startsAt)} · ${MODE_LABEL[booked.mode] ?? booked.mode}`} />
        {booked.status === 'PENDING_PAYMENT' ? <Checkout appt={booked} /> : (
          <Card>
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-3 grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-8" aria-hidden /></div>
              <h2 className="text-lg font-semibold text-slate-900">Waiting for {c.user.displayName} to accept</h2>
              <p className="mt-1 max-w-md text-sm text-slate-500">We have sent your request. You will get a notification once your counselor responds. If they cannot accept, nothing is charged.</p>
              <Link to="/youth/appointments" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"><CalendarDays className="size-4" aria-hidden />Go to my appointments</Link>
            </div>
          </Card>
        )}
      </div>
    );
  }

  const stepIdx = B_STEPS.findIndex((s) => s.k === step);
  return (
    <div className="space-y-5">
      <Link to="/youth/matches" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="size-4" />Back to matches</Link>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-700" aria-hidden>{c.user.displayName.charAt(0)}</div><div><h1 className="text-lg font-bold text-slate-900">{c.user.displayName}</h1><p className="text-xs text-slate-500">{c.qualifications}</p></div></div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Fee</dt><dd className="font-medium">{fmtMoney(c.sessionFeePaisa)} / session</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Format</dt><dd>{MODE_LABEL[c.mode]}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Experience</dt><dd>{c.experienceYears} yrs</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Languages</dt><dd className="text-right">{c.languages.map(langName).join(', ')}</dd></div>
            {c.locationArea && <div className="flex justify-between"><dt className="text-slate-500">Area</dt><dd>{c.locationArea}</dd></div>}
          </dl>
          {!!c.specializations.length && <div className="mt-4 flex flex-wrap gap-1.5">{c.specializations.map((s) => <Badge key={s} tone="slate">{label(s)}</Badge>)}</div>}
          {c.bio && <p className="mt-4 text-sm whitespace-pre-line text-slate-600">{c.bio}</p>}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {!c.acceptingBookings && <Notice tone="amber">{c.user.displayName} is not accepting new bookings at the moment.</Notice>}
          <ol className="flex gap-2" aria-label="Booking steps">{B_STEPS.map((s, i) => (
            <li key={s.k} aria-current={i === stepIdx ? 'step' : undefined} className={cx('flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium', i === stepIdx ? 'bg-brand-600 text-white' : i < stepIdx ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500')}>{i + 1}. {s.l}</li>
          ))}</ol>
          {hold && <Countdown key={hold.id} expiresAt={hold.expiresAt} onExpire={onExpire} />}
          {slot && step !== 'slot' && <p className="flex items-center gap-2 text-sm text-slate-700"><Clock className="size-4 text-brand-600" aria-hidden />{fmtDate(slot.startsAt)}, {fmtTime(slot.startsAt)}–{fmtTime(slot.endsAt)}</p>}

          <Card>
            {step === 'slot' && (
              <>
                <h2 ref={headRef} tabIndex={-1} className="mb-1 font-semibold text-slate-900 outline-none">Choose a time</h2>
                <p className="mb-4 text-sm text-slate-500">Times are shown in your local time. Picking one holds it for 10 minutes while you finish.</p>
                <Q q={slots} rows={3}>{() => !grouped.length ? (
                  <EmptyState icon={<CalendarDays className="size-6" />} title="No open times in the next 3 weeks" hint="Check back later or look at other matched counselors." action={<Link to="/youth/matches" className="text-sm font-medium text-brand-700 hover:underline">Back to matches</Link>} />
                ) : (
                  <div className="space-y-4">{grouped.map(([day, list]) => (
                    <section key={day} aria-label={new Date(list[0].startsAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
                      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{new Date(list[0].startsAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                      <div className="flex flex-wrap gap-2">{list.map((s) => (
                        <Button key={s.id} size="sm" variant="outline" disabled={!c.acceptingBookings || placeHold.isPending} loading={placeHold.isPending && placeHold.variables?.id === s.id} onClick={() => placeHold.mutate(s)} aria-label={`${fmtDateTime(s.startsAt)} to ${fmtTime(s.endsAt)}`}>
                          {fmtTime(s.startsAt)}
                        </Button>
                      ))}</div>
                    </section>
                  ))}</div>
                )}</Q>
              </>
            )}

            {step === 'format' && (
              <>
                <h2 ref={headRef} tabIndex={-1} className="mb-1 font-semibold text-slate-900 outline-none">How would you like to meet?</h2>
                <p className="mb-4 text-sm text-slate-500">{c.mode === 'BOTH' ? 'This counselor offers both formats.' : `This counselor offers ${MODE_LABEL[c.mode].toLowerCase()} sessions only.`}</p>
                <div role="radiogroup" aria-label="Session format" className="grid gap-3 sm:grid-cols-2">
                  {modes.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      className={cx('rounded-xl border p-4 text-left transition', mode === m ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 hover:bg-slate-50')}>
                      <p className="font-medium text-slate-800">{MODE_LABEL[m]}</p>
                      <p className="text-xs text-slate-500">{m === 'ONLINE' ? 'Video call — a meeting link is shared once confirmed.' : `Meet in person${c.locationArea ? ` in ${c.locationArea}` : ''}.`}</p>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 'consent' && (
              <>
                <h2 ref={headRef} tabIndex={-1} className="mb-1 font-semibold text-slate-900 outline-none">What would you like to share with {c.user.displayName}?</h2>
                <p className="mb-3 text-sm text-slate-500">Everything is off by default. Sharing can help your counselor prepare, but it is your choice. Only this counselor can see what you turn on, and you can withdraw it any time in the <Link to="/youth/privacy" className="font-medium text-brand-700 underline">Privacy center</Link>.</p>
                {consentText.isError && <ErrorState message="Could not load sharing descriptions" onRetry={() => consentText.refetch()} />}
                <div className="divide-y divide-slate-100">{CONSENT_CATS.map((cat) => (
                  <Toggle key={cat} label={label(cat)} description={consentText.data?.[cat]} checked={consents[cat]} onChange={(v) => setConsents((p) => ({ ...p, [cat]: v }))} />
                ))}</div>
                <p className="mt-3 flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />Your counselor's private notes and your community posts are never part of this.</p>
              </>
            )}

            {step === 'confirm' && (
              <>
                <h2 ref={headRef} tabIndex={-1} className="mb-3 font-semibold text-slate-900 outline-none">Confirm your request</h2>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between py-2"><dt className="text-slate-500">Counselor</dt><dd className="font-medium">{c.user.displayName}</dd></div>
                  <div className="flex justify-between py-2"><dt className="text-slate-500">When</dt><dd>{slot && `${fmtDate(slot.startsAt)}, ${fmtTime(slot.startsAt)}–${fmtTime(slot.endsAt)}`}</dd></div>
                  <div className="flex items-center justify-between py-2"><dt className="text-slate-500">Format</dt><dd className="flex items-center gap-2">{mode && MODE_LABEL[mode]}<Button size="sm" variant="ghost" onClick={() => setStep('format')} aria-label="Edit format"><Pencil className="size-3.5" /></Button></dd></div>
                  <div className="flex items-start justify-between gap-3 py-2"><dt className="text-slate-500">Sharing</dt><dd className="flex items-start gap-2 text-right">{CONSENT_CATS.filter((k) => consents[k]).map(label).join(', ') || 'Nothing shared'}<Button size="sm" variant="ghost" onClick={() => setStep('consent')} aria-label="Edit sharing"><Pencil className="size-3.5" /></Button></dd></div>
                  <div className="flex justify-between py-2"><dt className="text-slate-500">Fee</dt><dd className="font-semibold">{fmtMoney(c.sessionFeePaisa)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-slate-500">{c.sessionFeePaisa > 0 ? 'Next you will pay securely. Your counselor then reviews the request; if they cannot accept, your payment is refunded.' : 'Your counselor will review the request and confirm.'}</p>
              </>
            )}

            {step !== 'slot' && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" onClick={cancelHold} loading={release.isPending}>Cancel</Button>
                <div className="flex gap-2">
                  {step !== 'format' && <Button variant="outline" onClick={() => setStep(B_STEPS[stepIdx - 1].k)}><ArrowLeft className="size-4" />Back</Button>}
                  {step === 'confirm'
                    ? <Button onClick={() => book.mutate()} loading={book.isPending} disabled={!mode || !hold}><HeartHandshake className="size-4" />{c.sessionFeePaisa > 0 ? 'Reserve & continue to payment' : 'Send request'}</Button>
                    : <Button onClick={() => setStep(B_STEPS[stepIdx + 1].k)} disabled={step === 'format' && !mode}>Next<ArrowRight className="size-4" /></Button>}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Checkout({ appt, programBookingId }: { appt?: BookedAppt; programBookingId?: string }) {
  const providers = useApi<{ ESEWA: boolean; KHALTI: boolean }>(['payments', 'providers'], '/payments/providers');
  const [provider, setProvider] = useState<'ESEWA' | 'KHALTI' | null>(null);
  const available = providers.data ? (Object.entries(providers.data) as ['ESEWA' | 'KHALTI', boolean][]).filter(([, on]) => on).map(([k]) => k) : [];
  useEffect(() => { if (!provider && available.length) setProvider(available[0]); }, [available, provider]);

  const pay = useAction(() => post<{ reference: string; redirect: { method: 'GET' | 'POST'; url: string; fields?: Record<string, string> } }>('/payments/initiate', { provider, ...(appt ? { appointmentId: appt.id } : { programBookingId }) }), {
    onSuccess: ({ redirect }) => {
      if (redirect.method === 'POST') {
        const form = document.createElement('form');
        form.method = 'POST'; form.action = redirect.url; form.style.display = 'none';
        for (const [k, v] of Object.entries(redirect.fields ?? {})) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i); }
        document.body.appendChild(form); form.submit();
      } else window.location.href = redirect.url;
    },
  });

  return (
    <Card title="Payment" subtitle="You will be redirected to the payment provider and brought back here.">
      {appt && <p className="mb-4 flex items-baseline justify-between text-sm"><span className="text-slate-500">Amount</span><span className="text-xl font-bold text-slate-900">{fmtMoney(appt.feePaisa)}</span></p>}
      <Q q={providers}>{() => !available.length ? (
        <div className="space-y-3">
          <Notice tone="amber">Online payment isn't configured on this server yet, so this session can't be paid for online right now. Unpaid requests are released automatically after about 15 minutes.</Notice>
          <Link to="/youth/appointments" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Go to my appointments<ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Payment provider" className="grid gap-3 sm:grid-cols-2">{available.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={provider === p} onClick={() => setProvider(p)}
              className={cx('flex items-center gap-3 rounded-xl border p-4 text-left transition', provider === p ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 hover:bg-slate-50')}>
              <CreditCard className="size-5 text-brand-700" aria-hidden /><span className="font-medium text-slate-800">{p === 'ESEWA' ? 'eSewa' : 'Khalti'}</span>
            </button>
          ))}</div>
          <Button className="w-full" onClick={() => pay.mutate()} loading={pay.isPending} disabled={!provider}>Pay {appt ? fmtMoney(appt.feePaisa) : ''} with {provider === 'ESEWA' ? 'eSewa' : provider === 'KHALTI' ? 'Khalti' : '…'}</Button>
          <p className="text-xs text-slate-500">Please complete payment within about 15 minutes, or the reserved time is released. If your counselor cannot accept, you are refunded in full.</p>
        </div>
      )}</Q>
    </Card>
  );
}

// =====================================================================
// 6. PaymentResult
// =====================================================================
interface PaymentStatus { reference: string; status: string; amountPaisa: number; provider: string; appointmentId: string | null; programBookingId: string | null }
const PENDING_PAY = ['INITIATED', 'PENDING'];

export function PaymentResult() {
  const [params] = useSearchParams();
  const ref = params.get('ref');
  const started = useRef(Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const q = useQuery({
    queryKey: ['payment', ref], enabled: !!ref, retry: 1,
    queryFn: async () => (await api.get(`/payments/${encodeURIComponent(ref!)}`)).data.data as PaymentStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s && !PENDING_PAY.includes(s)) return false;
      if (Date.now() - started.current > 30_000) return false;
      return 3000;
    },
  });
  const pending = !!q.data && PENDING_PAY.includes(q.data.status);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setTimedOut(true), Math.max(0, 30_000 - (Date.now() - started.current)));
    return () => clearTimeout(t);
  }, [pending]);
  const retryNow = () => { started.current = Date.now(); setTimedOut(false); q.refetch(); };

  const isProgram = !!q.data?.programBookingId;
  const shell = (children: ReactNode) => <div className="mx-auto max-w-lg space-y-5"><PageHeader title="Payment status" />{children}</div>;
  if (!ref) return shell(<ErrorState message="Missing payment reference." />);
  if (q.isLoading) return shell(<Card><div className="flex flex-col items-center py-8 text-center"><RefreshCw className="mb-3 size-8 animate-spin text-brand-600" aria-hidden /><p className="font-medium text-slate-800">Checking your payment…</p><p className="text-sm text-slate-500">We are confirming directly with the payment provider.</p></div></Card>);
  if (q.isError || !q.data) return shell(<ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />);
  const p = q.data;

  let icon: ReactNode, title: string, text: string, cta: ReactNode;
  if (p.status === 'SUCCESS') {
    icon = <CheckCircle2 className="size-8" aria-hidden />; title = 'Payment received';
    text = isProgram ? 'Your program place is paid for. You can find it under Programs.' : 'Thank you. Your request has been sent — your counselor will review and accept it, and you will be notified. If they cannot accept, you will be refunded in full.';
    cta = <Link to={isProgram ? '/youth/programs' : '/youth/appointments'} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">{isProgram ? 'Go to programs' : 'View my appointments'}<ArrowRight className="size-4" aria-hidden /></Link>;
  } else if (pending) {
    icon = timedOut ? <Clock className="size-8" aria-hidden /> : <RefreshCw className="size-8 animate-spin" aria-hidden />;
    title = timedOut ? 'Still processing' : 'Confirming your payment…';
    text = timedOut ? 'The provider has not confirmed yet. This can take a few minutes — you will not be charged twice. Check again shortly or look in your appointments later.' : 'This usually takes a few seconds. Please keep this page open.';
    cta = timedOut ? <div className="flex flex-wrap justify-center gap-2"><Button onClick={retryNow} loading={q.isFetching}><RefreshCw className="size-4" />Check again</Button><Link to="/youth/appointments" className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">My appointments</Link></div> : null;
  } else if (p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED') {
    icon = <CheckCircle2 className="size-8" aria-hidden />; title = label(p.status); text = 'This payment has been refunded.';
    cta = <Link to="/youth/appointments" className="text-sm font-medium text-brand-700 hover:underline">View my appointments</Link>;
  } else {
    icon = <XCircle className="size-8" aria-hidden />; title = 'Payment not completed';
    text = 'The payment did not go through and you have not been charged. You can try again.';
    cta = <Link to={isProgram ? '/youth/programs' : '/youth/appointments'} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Try again</Link>;
  }
  const tone = p.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600' : pending ? 'bg-amber-50 text-amber-600' : p.status.includes('REFUND') ? 'bg-sky-50 text-sky-600' : 'bg-rose-50 text-rose-600';

  return shell(
    <Card>
      <div className="flex flex-col items-center py-6 text-center" aria-live="polite">
        <div className={cx('mb-3 grid size-14 place-items-center rounded-full', tone)}>{icon}</div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
        <dl className="mt-4 grid w-full max-w-xs grid-cols-2 gap-y-1 text-left text-xs">
          <dt className="text-slate-500">Amount</dt><dd className="text-right font-medium">{fmtMoney(p.amountPaisa)}</dd>
          <dt className="text-slate-500">Provider</dt><dd className="text-right">{p.provider === 'ESEWA' ? 'eSewa' : p.provider === 'KHALTI' ? 'Khalti' : p.provider}</dd>
          <dt className="text-slate-500">Status</dt><dd className="text-right"><StatusBadge status={p.status} /></dd>
          <dt className="text-slate-500">Reference</dt><dd className="truncate text-right font-mono" title={p.reference}>{p.reference.slice(0, 8)}…</dd>
        </dl>
        {cta && <div className="mt-5">{cta}</div>}
      </div>
    </Card>,
  );
}
