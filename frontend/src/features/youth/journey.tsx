import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, CheckCircle2, Clock, CreditCard, ExternalLink, Flag, Headphones, MapPin, Route as RouteIcon, ShieldCheck, Target, Video, Wifi } from 'lucide-react';
import { calculateRefund, isImprovement, METRICS, type Metric } from '@sathi/shared';
import { useAuth } from '../../lib/auth';
import { useAction, useApi, patch, post } from '../../hooks';
import Chat from '../../components/Chat';
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Modal, Notice, PageHeader, Select, Stat, StatusBadge, Tabs, Textarea, Timeline,
  cx, fmtDate, fmtDateTime, fmtMoney, fmtTime, label, useConfirm, useToast,
} from '../../components/ui';

// ======================================================================
// Shared types
// ======================================================================
interface SessionRecord { id: string; summary: string; topics: string[]; nextSteps: string | null; followUpDate: string | null; createdAt: string }
interface Appointment {
  id: string; status: string; mode: 'ONLINE' | 'IN_PERSON'; startsAt: string; endsAt: string; feePaisa: number; cancelReason?: string | null; relationshipId?: string | null;
  counselor: { id: string; userId: string; user: { displayName: string } };
  meeting: { status: string; provider: string; creationStatus?: string | null } | null;
  payments: { status: string; provider: string; amountPaisa: number; reference: string }[];
  sessionRecord: SessionRecord | null;
}
interface UpcomingMeeting {
  appointmentId: string; counselorName: string; startsAt: string; endsAt: string; durationMin: number; appointmentStatus: string; mode: string;
  meeting: { status: string; provider: string; isDevManual: boolean; meetingUrl: string | null; joinable: boolean } | null;
}
type Providers = Record<'ESEWA' | 'KHALTI', boolean>;
type PayTarget = { appointmentId: string } | { programBookingId: string };
interface InitiateResult { paymentId: string; reference: string; redirect: { method: 'GET' | 'POST'; url: string; fields?: Record<string, string> } }

const modeLabel = (m: string) => (m === 'IN_PERSON' ? 'In person' : m === 'ONLINE' ? 'Online' : label(m));

/** Sends the browser to the payment gateway (POST via a hidden form, GET via location). */
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

/** Pay-now button: lets the youth pick an available gateway, then redirects. */
function PayButton({ target, size = 'sm' }: { target: PayTarget; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const providers = useApi<Providers>(['payment-providers'], open ? '/payments/providers' : null);
  const pay = useAction((provider: 'ESEWA' | 'KHALTI') => post<InitiateResult>('/payments/initiate', { provider, ...target }), {
    onSuccess: (r) => goToGateway(r.redirect),
  });
  const enabled = providers.data ? (Object.keys(providers.data) as ('ESEWA' | 'KHALTI')[]).filter((k) => providers.data![k]) : [];
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}><CreditCard className="size-4" aria-hidden />Pay now</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose how to pay">
        {providers.isLoading ? <LoadingBlock rows={2} /> : providers.isError ? <ErrorState message="Could not load payment options" onRetry={() => providers.refetch()} /> : !enabled.length ? (
          <Notice tone="amber">Online payment isn't available right now. Please try again later.</Notice>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">You'll be taken to the payment provider's secure page. We confirm the payment directly with them before your booking moves forward.</p>
            <div className="flex flex-wrap gap-2">
              {enabled.map((p) => <Button key={p} variant="outline" loading={pay.isPending && pay.variables === p} disabled={pay.isPending} onClick={() => pay.mutate(p)}>Pay with {label(p)}</Button>)}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function SessionRecordView({ rec }: { rec: SessionRecord }) {
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Session summary</p>
      <p className="whitespace-pre-wrap text-slate-700">{rec.summary}</p>
      {rec.topics.length > 0 && <div className="flex flex-wrap gap-1.5">{rec.topics.map((t) => <Badge key={t} tone="violet">{t}</Badge>)}</div>}
      {rec.nextSteps && <p className="text-slate-700"><span className="font-medium">Next steps: </span>{rec.nextSteps}</p>}
      {rec.followUpDate && <p className="text-xs text-slate-500">Suggested follow-up: {fmtDate(rec.followUpDate)}</p>}
    </div>
  );
}

// ======================================================================
// 1. Appointments
// ======================================================================
export function YouthAppointments() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  return (
    <div>
      <PageHeader title="Appointments" subtitle="Your counseling sessions, in one place." action={<Link to="/youth/matches"><Button variant="soft">Book a session</Button></Link>} />
      <Tabs tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} value={tab} onChange={setTab} />
      {tab === 'upcoming' && <UpcomingMeetings />}
      <AppointmentList scope={tab} />
    </div>
  );
}

function UpcomingMeetings() {
  const q = useApi<UpcomingMeeting[]>(['meetings', 'upcoming'], '/meetings/upcoming', { refetchInterval: 60_000 });
  if (q.isLoading) return <div className="mb-6"><LoadingBlock rows={1} /></div>;
  if (q.isError) return <div className="mb-6"><ErrorState message="Could not load your online meetings" onRetry={() => q.refetch()} /></div>;
  if (!q.data?.length) return null;
  return (
    <Card title="Upcoming online meetings" subtitle="The join button appears when your meeting link is ready (from 24 hours before the session)." className="mb-6">
      <ul className="space-y-3">
        {q.data.map((m) => (
          <li key={m.appointmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Video className="size-5" aria-hidden /></div>
              <div>
                <p className="font-medium text-slate-800">{m.counselorName}</p>
                <p className="text-sm text-slate-500">{fmtDate(m.startsAt)} · {fmtTime(m.startsAt)} · {m.durationMin} min</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {m.appointmentStatus !== 'CONFIRMED' && <StatusBadge status={m.appointmentStatus} />}
                  {m.meeting ? <StatusBadge status={m.meeting.status} /> : <Badge tone="slate">Meeting not created yet</Badge>}
                  {m.meeting?.isDevManual && <Badge tone="amber">Development link</Badge>}
                </div>
              </div>
            </div>
            {m.meeting?.joinable && m.meeting.meetingUrl ? (
              <a href={m.meeting.meetingUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                <ExternalLink className="size-4" aria-hidden />Join meeting<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className="text-xs text-slate-500">{m.appointmentStatus === 'PENDING_COUNSELOR' ? 'Waiting for your counselor to confirm' : 'Link will appear closer to the time'}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <p className="flex items-center gap-2"><MapPin className="size-4 text-brand-600" aria-hidden />Find a quiet, private space where you feel comfortable.</p>
        <p className="flex items-center gap-2"><Headphones className="size-4 text-brand-600" aria-hidden />Headphones help keep your conversation private.</p>
        <p className="flex items-center gap-2"><Wifi className="size-4 text-brand-600" aria-hidden />Test your internet, camera and microphone a few minutes early.</p>
        <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-600" aria-hidden />Sessions are not recorded.</p>
      </div>
    </Card>
  );
}

function AppointmentList({ scope }: { scope: 'upcoming' | 'past' }) {
  const q = useApi<Appointment[]>(['appointments', scope], `/appointments?scope=${scope}`);
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorState message="Could not load your appointments" onRetry={() => q.refetch()} />;
  if (!q.data?.length)
    return (
      <EmptyState icon={<CalendarDays className="size-6" />} title={scope === 'upcoming' ? 'No upcoming sessions' : 'No past sessions yet'}
        hint={scope === 'upcoming' ? 'When you book a session with a counselor, it will show up here.' : 'Sessions you have had will appear here, along with any summaries your counselor shares.'}
        action={scope === 'upcoming' ? <Link to="/youth/matches"><Button>Find a counselor</Button></Link> : undefined} />
    );
  return <ul className="space-y-3">{q.data.map((a) => <AppointmentItem key={a.id} a={a} past={scope === 'past'} />)}</ul>;
}

function refundEstimate(a: Appointment) {
  const paid = a.payments.find((p) => p.status === 'SUCCESS');
  if (!paid) return null;
  return calculateRefund(paid.amountPaisa, new Date(a.startsAt), new Date(), 'YOUTH');
}

function AppointmentItem({ a, past }: { a: Appointment; past: boolean }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [rescheduling, setRescheduling] = useState(false);
  const cancel = useAction(() => post<{ status: string; refund: { amountPaisa: number; status: string } | null }>(`/appointments/${a.id}/cancel`, {}), {
    invalidate: [['appointments'], ['meetings']],
    onSuccess: (r) => toast(r.refund && r.refund.amountPaisa > 0 ? `Session cancelled. Refund of ${fmtMoney(r.refund.amountPaisa)} is ${label(r.refund.status)}.` : 'Session cancelled.'),
  });
  const canCancel = ['PENDING_PAYMENT', 'PENDING_COUNSELOR', 'CONFIRMED'].includes(a.status) && !past;
  const canReschedule = ['PENDING_COUNSELOR', 'CONFIRMED'].includes(a.status) && !past;
  const payment = a.payments[0];

  const onCancel = async () => {
    const est = refundEstimate(a);
    const ok = await confirm({
      title: 'Cancel this session?',
      message:
        'Refund policy: more than 24 hours before the session — full refund; 2 to 24 hours before — 50% refund; less than 2 hours before — no refund. If your counselor cancels, you always get a full refund.' +
        (est != null ? ` Based on the current time, you would likely receive about ${fmtMoney(est) === 'Free' ? 'no refund' : fmtMoney(est)}. The final amount is confirmed by Sathi.` : ''),
      confirmLabel: 'Cancel session', danger: true,
    });
    if (ok) cancel.mutate();
  };

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">{a.counselor.user.displayName}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1"><CalendarDays className="size-4" aria-hidden />{fmtDate(a.startsAt)}</span>
              <span className="flex items-center gap-1"><Clock className="size-4" aria-hidden />{fmtTime(a.startsAt)} – {fmtTime(a.endsAt)}</span>
              <span className="flex items-center gap-1">{a.mode === 'ONLINE' ? <Video className="size-4" aria-hidden /> : <MapPin className="size-4" aria-hidden />}{modeLabel(a.mode)}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={a.status} />
              {a.feePaisa > 0 ? (payment ? <Badge tone="slate">Payment: {label(payment.status)}</Badge> : <Badge tone="slate">Payment: not started</Badge>) : <Badge tone="green">Free</Badge>}
              {a.feePaisa > 0 && <span className="text-xs text-slate-500">{fmtMoney(a.feePaisa)}</span>}
            </div>
            {a.cancelReason && <p className="mt-2 text-xs text-slate-500">Reason: {a.cancelReason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {a.status === 'PENDING_PAYMENT' && !past && <PayButton target={{ appointmentId: a.id }} />}
            {canReschedule && <Button size="sm" variant="outline" onClick={() => setRescheduling(true)}>Reschedule</Button>}
            {canCancel && <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={onCancel}>Cancel</Button>}
          </div>
        </div>
        {a.status === 'PENDING_PAYMENT' && !past && <p className="mt-3 text-xs text-slate-500">Your time is reserved once payment is complete. Your counselor will then confirm the session.</p>}
        {a.sessionRecord && <SessionRecordView rec={a.sessionRecord} />}
      </Card>
      {rescheduling && <RescheduleModal a={a} onClose={() => setRescheduling(false)} />}
    </li>
  );
}

function RescheduleModal({ a, onClose }: { a: Appointment; onClose: () => void }) {
  const slots = useApi<{ id: string; startsAt: string; endsAt: string }[]>(['slots', a.counselor.id], `/counselors/${a.counselor.id}/slots`);
  const [slotId, setSlotId] = useState<string | null>(null);
  const move = useAction(async (sid: string) => {
    const hold = await post<{ id: string }>('/appointments/holds', { slotId: sid });
    return post(`/appointments/${a.id}/reschedule`, { holdId: hold.id });
  }, { success: 'Session moved. Your counselor will confirm the new time.', invalidate: [['appointments'], ['meetings'], ['slots', a.counselor.id]], onSuccess: onClose });

  const byDay = useMemo(() => {
    const m = new Map<string, { id: string; startsAt: string; endsAt: string }[]>();
    (slots.data ?? []).forEach((s) => { const k = fmtDate(s.startsAt); m.set(k, [...(m.get(k) ?? []), s]); });
    return [...m.entries()];
  }, [slots.data]);

  return (
    <Modal open onClose={onClose} title="Choose a new time" wide
      footer={<><Button variant="ghost" onClick={onClose}>Keep current time</Button><Button disabled={!slotId} loading={move.isPending} onClick={() => slotId && move.mutate(slotId)}>Move session</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Currently {fmtDate(a.startsAt)} at {fmtTime(a.startsAt)} with {a.counselor.user.displayName}. After you move it, your counselor will be asked to confirm the new time.</p>
      {slots.isLoading ? <LoadingBlock rows={2} /> : slots.isError ? <ErrorState message="Could not load available times" onRetry={() => slots.refetch()} /> : !byDay.length ? (
        <EmptyState title="No open times right now" hint="Your counselor has no free times in the next two weeks. You can message them or try again later." />
      ) : (
        <div className="space-y-4" role="radiogroup" aria-label="Available times">
          {byDay.map(([day, list]) => (
            <div key={day}>
              <p className="mb-2 text-sm font-medium text-slate-700">{day}</p>
              <div className="flex flex-wrap gap-2">
                {list.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={slotId === s.id} onClick={() => setSlotId(s.id)}
                    className={cx('rounded-lg border px-3 py-1.5 text-sm', slotId === s.id ? 'border-brand-500 bg-brand-50 font-medium text-brand-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
                    {fmtTime(s.startsAt)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ======================================================================
// 2. Journey list
// ======================================================================
interface RelationshipListItem {
  id: string; status: string; startedAt: string; endedAt: string | null;
  counselor: { id: string; user: { displayName: string } };
  appointments: { id: string; startsAt: string; mode: string; status: string }[];
  plans: { id: string; status: string }[];
}

export function Journey() {
  const q = useApi<RelationshipListItem[]>(['relationships'], '/support/relationships');
  return (
    <div>
      <PageHeader title="My journey" subtitle="The people supporting you, your plans and how things are going." />
      {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState message="Could not load your support relationships" onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<RouteIcon className="size-6" />} title="Your journey starts when you connect with a counselor"
          hint="Once a counselor confirms your first session, your shared plan, sessions and messages will live here."
          action={<Link to="/youth/matches"><Button>Find a counselor</Button></Link>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data.map((r) => {
            const next = r.appointments[0];
            const plan = r.plans.find((p) => p.status === 'ACTIVE') ?? r.plans[0];
            return (
              <li key={r.id}>
                <Link to={`/youth/journey/${r.id}`} className="block rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow focus-visible:outline-2 focus-visible:outline-brand-500">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{r.counselor.user.displayName}</p>
                      <p className="text-xs text-slate-500">Started {fmtDate(r.startedAt)}{r.endedAt ? ` · Ended ${fmtDate(r.endedAt)}` : ''}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Next session</dt><dd className="text-right text-slate-800">{next ? `${fmtDateTime(next.startsAt)} · ${modeLabel(next.mode)}` : 'None scheduled'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Support plan</dt><dd>{plan ? <StatusBadge status={plan.status} /> : <span className="text-slate-800">Not yet</span>}</dd></div>
                  </dl>
                  {r.plans.some((p) => p.status === 'PROPOSED') && <p className="mt-3 text-xs font-medium text-amber-700">A plan is waiting for your review.</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ======================================================================
// 3. Journey detail
// ======================================================================
interface TaskHistory { id: string; from: string | null; to: string; changedBy: string; changedAt: string }
interface Task { id: string; title: string; description: string | null; dueDate: string | null; completedAt: string | null; status: string; youthUpdate: string | null; reflection: string | null; counselorReviewedAt: string | null; history: TaskHistory[] }
interface Goal { id: string; title: string; description: string | null; startDate: string; targetDate: string | null; status: string; tasks: Task[] }
interface PlanVersion { id: string; version: number; title: string; description: string; startDate: string; reviewDate: string; agreedAt: string | null; createdAt: string }
interface Plan { id: string; status: string; currentVersion: number; createdAt: string; versions: PlanVersion[]; goals: Goal[] }
interface RelationshipDetail {
  id: string; status: string; startedAt: string; endedAt: string | null;
  counselor: { id: string; name: string };
  sessions: (Omit<Appointment, 'counselor' | 'payments'> & { meeting: { status: string } | null })[];
  timeline: { id: string; type: string; title: string; occurredAt: string }[];
  milestones: { id: string; kind: string; achievedAt: string }[];
  reviews: { id: string; outcome: string; nextSteps: string | null; periodStart: string; periodEnd: string; createdAt: string }[];
}
type DetailTab = 'plan' | 'goals' | 'sessions' | 'timeline' | 'messages';

export function JourneyDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [tab, setTab] = useState<DetailTab>('plan');
  const q = useApi<RelationshipDetail>(['relationship', id], `/support/relationships/${id}`);
  const plans = useApi<Plan[]>(['plans', id], `/support/relationships/${id}/plans`);
  const end = useAction(() => patch(`/support/relationships/${id}/status`, { status: 'CLOSED' }), {
    success: 'This support relationship has ended', invalidate: [['relationship', id], ['relationships']],
  });

  if (q.isLoading) return <LoadingBlock rows={4} />;
  if (q.isError || !q.data) return <ErrorState message="Could not load this support relationship" onRetry={() => q.refetch()} />;
  const r = q.data;
  const open = ['ACTIVE', 'PAUSED'].includes(r.status);

  return (
    <div>
      <button type="button" onClick={() => navigate('/youth/journey')} className="mb-3 text-sm text-brand-700 hover:underline">← All support relationships</button>
      <PageHeader title={`Support with ${r.counselor.name}`} subtitle={`Started ${fmtDate(r.startedAt)}${r.endedAt ? ` · Ended ${fmtDate(r.endedAt)}` : ''}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={r.status} />
          {open && <Button size="sm" variant="ghost" loading={end.isPending} onClick={async () => (await confirm({
            title: 'End this support relationship?',
            message: `You can end your support with ${r.counselor.name} at any time — no reason needed. Messaging and new plans will stop. Your history stays visible to you. You can always look for support again later.`,
            confirmLabel: 'End relationship', danger: true,
          })) && end.mutate()}>End this support relationship</Button>}
        </div>} />
      <Tabs<DetailTab> value={tab} onChange={setTab} tabs={[
        { value: 'plan', label: 'Plan' }, { value: 'goals', label: 'Goals & tasks' }, { value: 'sessions', label: 'Sessions', count: r.sessions.length },
        { value: 'timeline', label: 'Timeline & milestones' }, { value: 'messages', label: 'Messages' },
      ]} />
      {(tab === 'plan' || tab === 'goals') && (plans.isLoading ? <LoadingBlock /> : plans.isError ? <ErrorState message="Could not load your support plan" onRetry={() => plans.refetch()} /> : tab === 'plan'
        ? <PlanTab plans={plans.data ?? []} relId={id} />
        : <GoalsTab plans={plans.data ?? []} relId={id} editable={open} />)}
      {tab === 'sessions' && <SessionsTab sessions={r.sessions} />}
      {tab === 'timeline' && <TimelineTab r={r} />}
      {tab === 'messages' && <Chat relationshipId={id} />}
    </div>
  );
}

function PlanTab({ plans, relId }: { plans: Plan[]; relId: string }) {
  const confirm = useConfirm();
  const agree = useAction((planId: string) => post(`/support/plans/${planId}/status`, { status: 'ACTIVE' }), {
    success: 'Thanks — your plan is now active', invalidate: [['plans', relId], ['relationship', relId], ['relationships']],
  });
  if (!plans.length) return <EmptyState icon={<Target className="size-6" />} title="No support plan yet" hint="Your counselor may suggest a plan after you've talked. You'll be asked to agree before it starts." />;
  return (
    <div className="space-y-4">
      {plans.map((p) => {
        const v = p.versions[0];
        if (!v) return null;
        return (
          <Card key={p.id} title={v.title} subtitle={`Version ${v.version} · ${fmtDate(v.startDate)} – review on ${fmtDate(v.reviewDate)}`} action={<StatusBadge status={p.status} />}>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{v.description}</p>
            {v.agreedAt && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" aria-hidden />You agreed on {fmtDate(v.agreedAt)}</p>}
            {p.status === 'PROPOSED' && (
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">{p.versions.length > 1 ? 'Your counselor updated this plan. ' : ''}Take your time to read it. If something doesn't feel right, you can talk about it in Messages before agreeing.</p>
                <Button className="mt-3" size="sm" loading={agree.isPending} onClick={async () => (await confirm({
                  title: 'Agree to this plan?', message: 'Agreeing makes this plan active. You can still talk to your counselor about changes at any time.', confirmLabel: 'I agree',
                })) && agree.mutate(p.id)}>I agree to this plan</Button>
              </div>
            )}
            {p.versions.length > 1 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Version history ({p.versions.length})</summary>
                <ol className="mt-2 space-y-2">
                  {p.versions.map((pv) => (
                    <li key={pv.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                      <p className="font-medium text-slate-800">v{pv.version} · {pv.title}</p>
                      <p className="text-xs text-slate-500">Created {fmtDate(pv.createdAt)}{pv.agreedAt ? ` · Agreed ${fmtDate(pv.agreedAt)}` : ''}</p>
                      <p className="mt-1 line-clamp-3 text-slate-600">{pv.description}</p>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const YOUTH_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'SKIPPED'];

function GoalsTab({ plans, relId, editable }: { plans: Plan[]; relId: string; editable: boolean }) {
  const plan = plans.find((p) => p.status === 'ACTIVE') ?? plans.find((p) => p.status === 'PROPOSED');
  if (!plan) return <EmptyState icon={<Target className="size-6" />} title="No goals yet" hint="Goals and small steps appear here once you and your counselor have a plan." />;
  if (!plan.goals.length) return <EmptyState icon={<Target className="size-6" />} title="No goals in this plan yet" hint="Your counselor will add goals you can work on together." />;
  return (
    <div className="space-y-4">
      <Notice>Task progress is self-reported — you decide how it went. There's no wrong answer, and skipping something is okay.</Notice>
      {plan.status === 'PROPOSED' && <Notice tone="amber">This plan is still waiting for your agreement (see the Plan tab).</Notice>}
      {plan.goals.map((g) => (
        <Card key={g.id} title={g.title} subtitle={`${g.targetDate ? `Target ${fmtDate(g.targetDate)}` : `Started ${fmtDate(g.startDate)}`}`} action={<StatusBadge status={g.status} />}>
          {g.description && <p className="mb-3 text-sm text-slate-600">{g.description}</p>}
          {!g.tasks.length ? <p className="text-sm text-slate-500">No tasks for this goal yet.</p> : (
            <ul className="space-y-3">{g.tasks.map((t) => <TaskItem key={t.id} t={t} relId={relId} editable={editable} />)}</ul>
          )}
        </Card>
      ))}
    </div>
  );
}

function TaskItem({ t, relId, editable }: { t: Task; relId: string; editable: boolean }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(t.status);
  const [update, setUpdate] = useState(t.youthUpdate ?? '');
  const [reflection, setReflection] = useState(t.reflection ?? '');
  const save = useAction(() => {
    const body: Record<string, string> = {};
    if (status !== t.status && YOUTH_TASK_STATUSES.includes(status)) body.status = status;
    if (update !== (t.youthUpdate ?? '')) body.youthUpdate = update;
    if (reflection !== (t.reflection ?? '')) body.reflection = reflection;
    return patch(`/support/tasks/${t.id}`, body);
  }, { success: 'Update saved', invalidate: [['plans', relId]] });
  const dirty = status !== t.status || update !== (t.youthUpdate ?? '') || reflection !== (t.reflection ?? '');
  const canEdit = editable && t.status !== 'CANCELLED';
  const opts = [...new Set([...(YOUTH_TASK_STATUSES.includes(t.status) ? [] : [t.status]), ...YOUTH_TASK_STATUSES])].map((s) => ({ value: s, label: label(s) }));

  return (
    <li className="rounded-xl border border-slate-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{t.title}</p>
          {t.description && <p className="text-sm text-slate-600">{t.description}</p>}
          <p className="mt-1 text-xs text-slate-500">{t.dueDate ? `Due ${fmtDate(t.dueDate)}` : 'No due date'}{t.counselorReviewedAt ? ` · Reviewed by your counselor ${fmtDate(t.counselorReviewedAt)}` : ''}</p>
        </div>
        <StatusBadge status={t.status} />
      </div>
      {canEdit ? (
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(); }}>
          <Select label="How's it going?" id={`status-${t.id}`} value={status} onChange={(e) => setStatus(e.target.value)} options={opts} />
          <Input label="Quick update (optional)" id={`upd-${t.id}`} value={update} maxLength={2000} onChange={(e) => setUpdate(e.target.value)} placeholder="e.g. Tried it twice this week" />
          <div className="sm:col-span-2"><Textarea label="Reflection (optional)" id={`ref-${t.id}`} rows={2} maxLength={2000} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="What did you notice? What helped or got in the way?" /></div>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" size="sm" disabled={!dirty} loading={save.isPending}>Save update</Button></div>
        </form>
      ) : (
        (t.youthUpdate || t.reflection) && (
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            {t.youthUpdate && <p><span className="font-medium">Your update: </span>{t.youthUpdate}</p>}
            {t.reflection && <p><span className="font-medium">Reflection: </span>{t.reflection}</p>}
          </div>
        )
      )}
      {t.history.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">Status history</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {t.history.map((h) => (
              <li key={h.id}>{fmtDateTime(h.changedAt)} · {h.from ? `${label(h.from)} → ` : ''}{label(h.to)} · {h.changedBy === user?.id ? 'You' : 'Counselor'}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function SessionsTab({ sessions }: { sessions: RelationshipDetail['sessions'] }) {
  if (!sessions.length) return <EmptyState icon={<CalendarDays className="size-6" />} title="No sessions yet" hint="Sessions with this counselor will appear here." />;
  return (
    <ul className="space-y-3">
      {sessions.map((s) => (
        <li key={s.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</p>
                <p className="text-sm text-slate-500">{modeLabel(s.mode)}</p>
              </div>
              <StatusBadge status={s.status} />
            </div>
            {s.sessionRecord ? <SessionRecordView rec={s.sessionRecord} /> : ['COMPLETED'].includes(s.status) && <p className="mt-2 text-xs text-slate-500">No summary shared for this session.</p>}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function TimelineTab({ r }: { r: RelationshipDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Timeline" className="lg:col-span-2">
        {r.timeline.length ? <Timeline items={r.timeline.map((e) => ({ id: e.id, title: e.title, date: e.occurredAt, meta: label(e.type) }))} /> : <EmptyState title="Nothing here yet" />}
      </Card>
      <div className="space-y-4">
        <Card title="Milestones">
          {r.milestones.length ? (
            <ul className="space-y-2">{r.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm"><Flag className="size-4 text-brand-600" aria-hidden /><span className="text-slate-800">{label(m.kind)}</span><span className="ml-auto text-xs text-slate-500">{fmtDate(m.achievedAt)}</span></li>
            ))}</ul>
          ) : <p className="text-sm text-slate-500">Milestones like your first session or agreeing a plan will show here.</p>}
        </Card>
        {r.reviews.length > 0 && (
          <Card title="Progress reviews">
            <ul className="space-y-3">{r.reviews.map((rv) => (
              <li key={rv.id} className="text-sm">
                <p className="text-xs text-slate-500">{fmtDate(rv.periodStart)} – {fmtDate(rv.periodEnd)}</p>
                <p className="text-slate-700">{rv.outcome}</p>
                {rv.nextSteps && <p className="text-slate-600"><span className="font-medium">Next: </span>{rv.nextSteps}</p>}
              </li>
            ))}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// 4. Progress
// ======================================================================
interface CheckIn extends Record<Metric, number> { id: string; createdAt: string }
interface Change { metric: Metric; current: number | null; previous: number | null; change: number | null; currentCount: number; previousCount: number }
interface ProgressData {
  from: string; to: string; checkIns: CheckIn[] | null; whatChanged: Change[] | null;
  tasks: { total: number; completionRate: number | null; byStatus: Record<string, number> };
  goals: { total: number; achieved: number };
  attendance: { attended: number; missed: number };
  milestones: { id: string; kind: string; achievedAt: string }[];
  note: string;
}
const METRIC_META: Record<Metric, { name: string; color: string; scale: string }> = {
  mood: { name: 'Mood', color: '#0d9488', scale: '1–5' },
  stress: { name: 'Stress', color: '#e11d48', scale: '0–10' },
  sleep: { name: 'Sleep', color: '#6366f1', scale: '1–5' },
  energy: { name: 'Energy', color: '#d97706', scale: '1–5' },
  social: { name: 'Connection', color: '#0284c7', scale: '1–5' },
  functioning: { name: 'Daily functioning', color: '#7c3aed', scale: '1–5' },
};
type Range = '7' | '30' | '90' | 'custom';
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** One point per calendar day; days without check-ins stay null so the chart shows a gap, never a low score. */
function dailySeries(checkIns: CheckIn[], from: Date, to: Date) {
  const buckets = new Map<string, CheckIn[]>();
  checkIns.forEach((c) => { const k = dayKey(new Date(c.createdAt)); buckets.set(k, [...(buckets.get(k) ?? []), c]); });
  const out: Record<string, number | string | null>[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; d <= to && i < 800; i++, d.setDate(d.getDate() + 1)) {
    const list = buckets.get(dayKey(d));
    const row: Record<string, number | string | null> = { day: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) };
    METRICS.forEach((m) => { row[m] = list?.length ? Math.round((list.reduce((s, c) => s + c[m], 0) / list.length) * 10) / 10 : null; });
    out.push(row);
  }
  return out;
}

export function ProgressPage() {
  const [range, setRange] = useState<Range>('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shown, setShown] = useState<Metric[]>(['mood', 'stress', 'sleep', 'energy']);
  const customValid = !!from && !!to && from <= to;
  const url = range === 'custom'
    ? (customValid ? `/support/progress/me?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59`).toISOString())}` : null)
    : `/support/progress/me?days=${range}`;
  const q = useApi<ProgressData>(['progress', 'me', url], url);
  const series = useMemo(() => (q.data?.checkIns ? dailySeries(q.data.checkIns, new Date(q.data.from), new Date(q.data.to)) : []), [q.data]);
  const toggle = (m: Metric) => setShown((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  const today = dayKey(new Date());

  return (
    <div>
      <PageHeader title="Your progress" subtitle="A look back at how things have been — for your own reflection." />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Time range" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {(['7', '30', '90', 'custom'] as Range[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', range === r ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
              {r === 'custom' ? 'Custom' : `${r} days`}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40"><Input type="date" label="From" id="progress-from" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="w-40"><Input type="date" label="To" id="progress-to" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}
      </div>
      {range === 'custom' && !customValid ? <Notice>Choose a start and end date to see your progress for that period.</Notice>
        : q.isLoading ? <LoadingBlock rows={4} /> : q.isError || !q.data ? <ErrorState message="Could not load your progress" onRetry={() => q.refetch()} /> : (
          <div className="space-y-6">
            <Card title="Check-in trends" subtitle={`${fmtDate(q.data.from)} – ${fmtDate(q.data.to)} · Stress uses a 0–10 scale (lower is calmer); others use 1–5.`}>
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show or hide measures">
                {METRICS.map((m) => (
                  <button key={m} type="button" aria-pressed={shown.includes(m)} onClick={() => toggle(m)}
                    className={cx('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition', shown.includes(m) ? 'border-slate-300 bg-white text-slate-800' : 'border-dashed border-slate-300 bg-slate-50 text-slate-400 line-through')}>
                    <span className="size-2.5 rounded-full" style={{ background: METRIC_META[m].color }} aria-hidden />{METRIC_META[m].name}
                  </button>
                ))}
              </div>
              {!q.data.checkIns?.length ? (
                <EmptyState title="No check-ins in this period" hint="Check-ins you do will appear here as a trend." action={<Link to="/youth/check-in"><Button size="sm">Do a check-in</Button></Link>} />
              ) : (
                <div className="h-72 w-full" role="img" aria-label="Line chart of your check-in measures over time. Days without a check-in are shown as gaps.">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} minTickGap={16} />
                      <YAxis yAxisId="five" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="ten" orientation="right" domain={[0, 10]} tick={{ fontSize: 11 }} hide={!shown.includes('stress')} />
                      <Tooltip formatter={(v, n) => [v == null ? 'No check-in' : String(v), String(n)]} />
                      {METRICS.filter((m) => shown.includes(m)).map((m) => (
                        <Line key={m} yAxisId={m === 'stress' ? 'ten' : 'five'} type="monotone" dataKey={m} name={`${METRIC_META[m].name} (${METRIC_META[m].scale})`}
                          stroke={METRIC_META[m].color} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {q.data.whatChanged && (
              <section aria-labelledby="what-changed">
                <h2 id="what-changed" className="mb-3 font-semibold text-slate-900">What changed?</h2>
                <p className="-mt-2 mb-3 text-xs text-slate-500">Compares your average in this period with the period just before it.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data.whatChanged.map((c) => <ChangeCard key={c.metric} c={c} />)}</div>
              </section>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Tasks completed" value={q.data.tasks.completionRate == null ? '—' : `${q.data.tasks.completionRate}%`} hint={q.data.tasks.completionRate == null ? 'No tasks yet' : `${q.data.tasks.total} task${q.data.tasks.total === 1 ? '' : 's'} (self-reported)`} icon={<CheckCircle2 className="size-5" />} />
              <Stat label="Goals achieved" value={q.data.goals.total ? `${q.data.goals.achieved} / ${q.data.goals.total}` : '—'} hint={q.data.goals.total ? undefined : 'No goals yet'} icon={<Target className="size-5" />} tone="violet" />
              <Stat label="Sessions attended" value={q.data.attendance.attended} hint="In this period" icon={<CalendarDays className="size-5" />} tone="sky" />
              <Stat label="Sessions missed" value={q.data.attendance.missed} hint="In this period" icon={<Clock className="size-5" />} tone="amber" />
            </div>
            {q.data.tasks.completionRate != null && <Card><p className="mb-2 text-sm text-slate-600">Task completion</p><ProgressBarWithLabel value={q.data.tasks.completionRate} /></Card>}

            <Card title="Milestones">
              {q.data.milestones.length ? (
                <ul className="space-y-2">{q.data.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm"><Flag className="size-4 text-brand-600" aria-hidden /><span className="text-slate-800">{label(m.kind)}</span><span className="ml-auto text-xs text-slate-500">{fmtDate(m.achievedAt)}</span></li>
                ))}</ul>
              ) : <p className="text-sm text-slate-500">Milestones will appear here as you go — every step counts.</p>}
            </Card>
            <Notice>{q.data.note}</Notice>
          </div>
        )}
    </div>
  );
}

function ProgressBarWithLabel({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1"><div className="h-2 w-full rounded-full bg-slate-100" role="progressbar" aria-label="Task completion" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>
      <span className="text-sm font-medium text-slate-700">{value}%</span>
    </div>
  );
}

function ChangeCard({ c }: { c: Change }) {
  const meta = METRIC_META[c.metric];
  let text: string, tone: 'green' | 'slate' | 'amber' = 'slate';
  if (c.current == null) text = 'Not enough data';
  else if (c.change == null) text = 'Not enough data to compare';
  else if (c.change === 0) text = 'About the same';
  else {
    const better = isImprovement(c.metric, c.change);
    tone = better ? 'green' : 'amber';
    text = `${c.change > 0 ? 'Up' : 'Down'} ${Math.abs(c.change)} ${better ? '· an improvement' : '· worth noticing'}`;
  }
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="size-2.5 rounded-full" style={{ background: meta.color }} aria-hidden />{meta.name}</p>
        <span className="text-xs text-slate-400">{meta.scale}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{c.current == null ? '—' : c.current}</p>
      <p className="text-xs text-slate-500">Before: {c.previous == null ? 'Not enough data' : c.previous} · {c.currentCount} check-in{c.currentCount === 1 ? '' : 's'} now</p>
      <div className="mt-2"><Badge tone={tone}>{text}</Badge></div>
    </div>
  );
}
