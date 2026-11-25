import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  Lock,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ChipSelect,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  Notice,
  PageHeader,
  Progress,
  SearchInput,
  Select,
  Stat,
  StatusBadge,
  Tabs,
  Textarea,
  Timeline,
  Toggle,
  DataTable,
  cx,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtTime,
  label,
  useConfirm,
  useToast,
} from '../../components/ui';
import Chat from '../../components/Chat';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { del, patch, post, put, useAction, useApi } from '../../hooks';

// =====================================================================
// Types (mirror API responses)
// =====================================================================
type Mode = 'ONLINE' | 'IN_PERSON' | 'BOTH';
interface SessionRecord {
  id: string;
  summary: string;
  topics: string[];
  nextSteps: string | null;
  followUpDate: string | null;
  createdAt: string;
}
interface Appt {
  id: string;
  status: string;
  mode: 'ONLINE' | 'IN_PERSON';
  startsAt: string;
  endsAt: string;
  feePaisa: number;
  cancelReason: string | null;
  relationshipId: string | null;
  youth: { id: string; userId: string; user: { displayName: string } };
  meeting: { status: string; provider: string; creationStatus: string | null } | null;
  payments: { status: string; provider: string; amountPaisa: number; reference: string | null }[];
  sessionRecord: SessionRecord | null;
}
interface MeetingView {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  appointmentStatus: string;
  mode: string;
  meeting: {
    status: string;
    provider: string;
    creationStatus?: string | null;
    isDevManual: boolean;
    meetingUrl: string | null;
    joinable: boolean;
  } | null;
}
interface GoogleStatus {
  configured: boolean;
  devManualMeetings: boolean;
  connection: {
    status: string;
    connectedAt: string | null;
    scope: string;
    lastError: string | null;
  } | null;
}
interface CounselorMe {
  id: string;
  qualifications: string;
  experienceYears: number;
  bio: string | null;
  specializations: string[];
  supportedConcerns: string[];
  languages: string[];
  ageGroups: string[];
  locationArea: string | null;
  mode: Mode;
  sessionFeePaisa: number;
  acceptingBookings: boolean;
  verificationStatus: string;
  rejectionReason: string | null;
  documents: { id: string; fileName: string; uploadedAt: string; mimeType: string }[];
}
interface RelListItem {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  youth: { id: string; ageGroup: string | null; user: { displayName: string } };
  appointments: { id: string; startsAt: string; mode: string; status: string }[];
  plans: { id: string; status: string }[];
}
interface RelDetail {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  youth: { id: string; name: string; ageGroup?: string | null };
  counselor: { id: string; name: string };
  sessions: {
    id: string;
    status: string;
    mode: 'ONLINE' | 'IN_PERSON';
    startsAt: string;
    endsAt: string;
    sessionRecord: SessionRecord | null;
    meeting: { status: string } | null;
  }[];
  timeline: { id: string; type: string; title: string; occurredAt: string }[];
  milestones: { id: string; kind: string; achievedAt: string }[];
  reviews: {
    id: string;
    outcome: string;
    nextSteps: string | null;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
  }[];
}
interface SharedProfile {
  needProfile: {
    concerns: string[];
    impactLevel: number;
    durationBucket: string;
    desiredSupport: string[];
    languages: string[];
    mode: string;
    accessibility: string[];
    createdAt: string;
  } | null;
  assessment: { submittedAt: string; responses: { questionKey: string; value: unknown }[] } | null;
  history: { status: string; startedAt: string; endedAt: string | null }[] | null;
  consent: { needProfile: boolean; assessment: boolean; history: boolean };
}
type Metric = 'mood' | 'stress' | 'sleep' | 'energy' | 'social' | 'functioning';
interface ProgressData {
  from: string;
  to: string;
  checkInConsent: boolean;
  note: string;
  checkIns: ({ id: string; createdAt: string } & Record<Metric, number>)[] | null;
  whatChanged:
    | {
        metric: Metric;
        current: number | null;
        previous: number | null;
        change: number | null;
        currentCount: number;
        previousCount: number;
      }[]
    | null;
  tasks: { total: number; completionRate: number | null; byStatus: Record<string, number> };
  goals: { total: number; achieved: number };
  attendance: { attended: number; missed: number };
  milestones: { id: string; kind: string; achievedAt: string }[];
}
interface TaskHist {
  id: string;
  from: string | null;
  to: string;
  changedBy: string;
  changedAt: string;
}
interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  status: string;
  youthUpdate: string | null;
  reflection: string | null;
  counselorReviewedAt: string | null;
  history: TaskHist[];
}
interface Goal {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  targetDate: string | null;
  status: string;
  tasks: Task[];
}
interface PlanVersion {
  id: string;
  version: number;
  title: string;
  description: string;
  startDate: string;
  reviewDate: string;
  agreedAt: string | null;
  createdAt: string;
}
interface Plan {
  id: string;
  status: string;
  currentVersion: number;
  createdAt: string;
  versions: PlanVersion[];
  goals: Goal[];
}
interface Note {
  id: string;
  body: string;
  createdAt: string;
}
interface RankedProgram {
  id: string;
  title: string;
  description: string;
  category: string;
  startsAt: string;
  endsAt: string;
  seats: number;
  seatsTaken: number;
  mode: string;
  costPaisa: number;
  locationArea: string | null;
  organization: { id: string; name: string };
  score: number;
  reasons: string[];
}
interface SentRec {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  program: { title: string; startsAt: string };
}
interface AvailRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}
interface AvailabilityData {
  weekly: (AvailRow & { id: string })[];
  exceptions: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
}
interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  isBooked: boolean;
  hold: { expiresAt: string } | null;
}

// =====================================================================
// Page-local helpers
// =====================================================================
const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const minToTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MODE_OPTS = [
  { value: 'ONLINE', label: 'Online only' },
  { value: 'IN_PERSON', label: 'In person only' },
  { value: 'BOTH', label: 'Online and in person' },
];
const MAX_UPLOAD = 5 * 1024 * 1024;

type QLike<T> = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  refetch: () => unknown;
};
function Loaded<T>({
  q,
  children,
  rows,
}: {
  q: QLike<T>;
  children: (d: T) => ReactNode;
  rows?: number;
}) {
  if (q.isLoading) return <LoadingBlock rows={rows} />;
  if (q.isError || q.data === undefined)
    return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <>{children(q.data)}</>;
}

/** ChipSelect with suggested options plus free-text custom values. */
function TagPicker({
  legend,
  options,
  value,
  onChange,
  placeholder = 'Add another…',
}: {
  legend: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const all = [
    ...options,
    ...value
      .filter((v) => !options.some((o) => o.value === v))
      .map((v) => ({ value: v, label: v })),
  ];
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{legend}</legend>
      <ChipSelect options={all} value={value} onChange={onChange} />
      <div className="flex max-w-sm gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={60}
          placeholder={placeholder}
          aria-label={`${legend}: add custom value`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm"
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
    </fieldset>
  );
}

const ModeBadge = ({ mode }: { mode: string }) =>
  mode === 'ONLINE' ? (
    <Badge tone="sky">
      <Video className="size-3" />
      Online
    </Badge>
  ) : mode === 'IN_PERSON' ? (
    <Badge tone="violet">
      <MapPin className="size-3" />
      In person
    </Badge>
  ) : (
    <Badge tone="slate">Online / in person</Badge>
  );

const VERIF_COPY: Record<string, { tone: 'amber' | 'sky' | 'rose' | 'brand'; text: string }> = {
  DRAFT: {
    tone: 'amber',
    text: 'Your profile is not yet submitted for verification. Youth cannot find or book you until an administrator verifies your credentials.',
  },
  PENDING: {
    tone: 'sky',
    text: 'Your verification is under review. You will be notified once an administrator has checked your documents.',
  },
  REJECTED: {
    tone: 'rose',
    text: 'Your verification was not approved. Update your profile or documents and submit again.',
  },
  SUSPENDED: {
    tone: 'rose',
    text: 'Your profile is suspended. Contact the Sathi team for details.',
  },
};

function VerificationBanner({ me }: { me: CounselorMe }) {
  const c = VERIF_COPY[me.verificationStatus];
  if (!c) return null;
  return (
    <Notice tone={c.tone}>
      <p>{c.text}</p>
      {me.rejectionReason && (
        <p className="mt-1">
          <span className="font-medium">Reason:</span> {me.rejectionReason}
        </p>
      )}
      <Link to="/counselor/profile" className="mt-1 inline-block font-medium underline">
        Go to profile & verification
      </Link>
    </Notice>
  );
}

// =====================================================================
// Appointment building blocks
// =====================================================================
const apptKeys = [['appointments'], ['relationships'], ['rel']];

function DecisionButtons({ a }: { a: Appt }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const decide = useAction(
    (v: { decision: 'ACCEPT' | 'DECLINE'; reason?: string }) =>
      post<{ status: string }>(`/appointments/${a.id}/decision`, v),
    {
      success: (r) =>
        r.status === 'CONFIRMED'
          ? 'Session accepted'
          : 'Request declined — any payment will be fully refunded',
      invalidate: apptKeys,
      onSuccess: () => {
        setOpen(false);
        setReason('');
      },
    },
  );
  return (
    <>
      <Button
        size="sm"
        onClick={() => decide.mutate({ decision: 'ACCEPT' })}
        loading={decide.isPending && !open}
      >
        <CheckCircle2 className="size-4" />
        Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <XCircle className="size-4" />
        Decline
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Decline booking request"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() =>
                decide.mutate({ decision: 'DECLINE', reason: reason.trim() || undefined })
              }
            >
              Decline request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {a.youth.user.displayName} will be told the request could not be accepted, and any
            payment is fully refunded.
          </p>
          <Textarea
            label="Reason (optional, shared with the client)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
          />
        </div>
      </Modal>
    </>
  );
}

const SESSION_TOPICS = [
  'Stress',
  'Anxiety',
  'Studies',
  'Family',
  'Relationships',
  'Sleep',
  'Self-esteem',
  'Coping skills',
  'Goal setting',
  'Career',
].map((t) => ({ value: t, label: t }));

function SessionRecordForm({
  appointmentId,
  existing,
  onDone,
  invalidate,
}: {
  appointmentId: string;
  existing: SessionRecord | null;
  onDone: () => void;
  invalidate: unknown[][];
}) {
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [topics, setTopics] = useState<string[]>(existing?.topics ?? []);
  const [nextSteps, setNextSteps] = useState(existing?.nextSteps ?? '');
  const [followUp, setFollowUp] = useState(toDateInput(existing?.followUpDate));
  const save = useAction(
    () =>
      put(`/appointments/${appointmentId}/session-record`, {
        summary: summary.trim(),
        topics,
        nextSteps: nextSteps.trim() || undefined,
        followUpDate: followUp || undefined,
      }),
    {
      success: 'Session record saved and shared with the client',
      invalidate,
      onSuccess: onDone,
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (summary.trim()) save.mutate();
  };
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4"
    >
      <Notice tone="brand">
        Session records are shared with the client. Use <strong>Private notes</strong> on the client
        page for anything that should stay with you.
      </Notice>
      <Textarea
        label="Summary"
        required
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        maxLength={5000}
      />
      <TagPicker
        legend="Topics discussed"
        options={SESSION_TOPICS}
        value={topics}
        onChange={(v) => setTopics(v.slice(0, 20))}
        placeholder="Add a topic…"
      />
      <Textarea
        label="Next steps (optional)"
        rows={3}
        value={nextSteps}
        onChange={(e) => setNextSteps(e.target.value)}
        maxLength={2000}
      />
      <Input
        label="Follow-up date (optional)"
        type="date"
        value={followUp}
        onChange={(e) => setFollowUp(e.target.value)}
        className="max-w-xs"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!summary.trim()}>
          Save record
        </Button>
      </div>
    </form>
  );
}

function SessionRecordView({ r }: { r: SessionRecord }) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-sm">
      <p className="whitespace-pre-wrap text-slate-700">{r.summary}</p>
      {!!r.topics.length && (
        <div className="flex flex-wrap gap-1.5">
          {r.topics.map((t) => (
            <Badge key={t} tone="slate">
              {t}
            </Badge>
          ))}
        </div>
      )}
      {r.nextSteps && (
        <p className="text-slate-600">
          <span className="font-medium text-slate-700">Next steps:</span> {r.nextSteps}
        </p>
      )}
      {r.followUpDate && (
        <p className="text-xs text-slate-500">Follow-up on {fmtDate(r.followUpDate)}</p>
      )}
    </div>
  );
}

const CREATION_COPY: Record<
  string,
  { text: string; tone: 'sky' | 'amber' | 'rose' | 'brand'; link?: 'connect' | 'reconnect' }
> = {
  OK: { text: 'Google Meet link created on your Google Calendar.', tone: 'brand' },
  GOOGLE_NOT_CONNECTED: {
    text: 'Your Google account is not connected, so no Meet link could be created.',
    tone: 'amber',
    link: 'connect',
  },
  NOT_CONNECTED: {
    text: 'Your Google account is not connected, so no Meet link could be created.',
    tone: 'amber',
    link: 'connect',
  },
  GOOGLE_NOT_CONFIGURED: {
    text: 'Google Meet integration is not configured on this server; meeting links cannot be generated.',
    tone: 'amber',
  },
  NOT_CONFIGURED: {
    text: 'Google Meet integration is not configured on this server; meeting links cannot be generated.',
    tone: 'amber',
  },
  REVOKED: {
    text: 'Google access was revoked or has expired. Reconnect your account, then retry.',
    tone: 'rose',
    link: 'reconnect',
  },
  PROVIDER_ERROR: {
    text: 'Google Calendar returned an error while creating the meeting. You can retry.',
    tone: 'rose',
  },
  RESCHEDULE_FAILED: {
    text: 'The session was rescheduled but the meeting could not be moved. Retry to create it again.',
    tone: 'rose',
  },
  MANUAL_DEV: {
    text: 'A development-only link was added manually. This is not a Google Meet meeting.',
    tone: 'amber',
  },
};

function MeetingPanel({
  appointmentId,
  google,
}: {
  appointmentId: string;
  google: GoogleStatus | undefined;
}) {
  const q = useApi<MeetingView>(
    ['meeting', appointmentId],
    `/meetings/appointment/${appointmentId}`,
  );
  const confirm = useConfirm();
  const toast = useToast();
  const [devUrl, setDevUrl] = useState('');
  const inv = [['meeting', appointmentId], ['appointments']];
  const retry = useAction(() => post(`/meetings/appointment/${appointmentId}/retry`), {
    success: 'Meeting setup attempted — see status below',
    invalidate: inv,
  });
  const cancel = useAction(() => post(`/meetings/appointment/${appointmentId}/cancel`), {
    success: 'Meeting cancelled',
    invalidate: inv,
  });
  const manual = useAction(
    () => put(`/meetings/appointment/${appointmentId}/manual-link`, { url: devUrl.trim() }),
    { success: 'Development link saved', invalidate: inv, onSuccess: () => setDevUrl('') },
  );

  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Video className="size-4 text-sky-700" />
        Online meeting
      </div>
      <Loaded q={q} rows={1}>
        {(v) => {
          const m = v.meeting;
          const copy = m?.creationStatus ? CREATION_COPY[m.creationStatus] : undefined;
          const canRetry = !m || ['PENDING', 'FAILED'].includes(m.status);
          const canCancel = !!m && !['CANCELLED', 'COMPLETED'].includes(m.status);
          return (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {m ? <StatusBadge status={m.status} /> : <Badge tone="slate">Not created</Badge>}
                {m && (
                  <span className="text-xs text-slate-500">
                    {m.isDevManual
                      ? 'Manual development link'
                      : m.provider === 'GOOGLE_MEET'
                        ? 'Google Meet'
                        : label(m.provider)}
                  </span>
                )}
                <span className="text-xs text-slate-500">· {v.durationMin} min</span>
              </div>
              {!m && (
                <p className="text-slate-600">No meeting has been set up for this session yet.</p>
              )}
              {copy && (m?.status !== 'READY' || m?.creationStatus === 'MANUAL_DEV') ? (
                <Notice tone={copy.tone}>
                  {copy.text}{' '}
                  {copy.link && (
                    <Link to="/counselor/settings" className="font-medium underline">
                      {copy.link === 'reconnect' ? 'Reconnect Google' : 'Connect Google'}
                    </Link>
                  )}
                </Notice>
              ) : m?.creationStatus && !copy && m.status === 'FAILED' ? (
                <Notice tone="rose">
                  Meeting setup failed ({label(m.creationStatus)}). You can retry.
                </Notice>
              ) : null}
              {m?.meetingUrl && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-slate-700">
                    {m.meetingUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard.writeText(m.meetingUrl!).then(
                        () => toast('Link copied'),
                        () => toast('Could not copy link', 'error'),
                      )
                    }
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                  <a
                    href={m.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    <ExternalLink className="size-3.5" />
                    Open
                  </a>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {canRetry && (
                  <Button
                    size="sm"
                    variant="soft"
                    loading={retry.isPending}
                    onClick={() => retry.mutate()}
                  >
                    <RefreshCw className="size-3.5" />
                    {m ? 'Retry meeting setup' : 'Create meeting'}
                  </Button>
                )}
                {canCancel && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={cancel.isPending}
                    onClick={async () =>
                      (await confirm({
                        title: 'Cancel this meeting?',
                        message:
                          'The meeting link will stop working. The appointment itself stays confirmed.',
                        confirmLabel: 'Cancel meeting',
                        danger: true,
                      })) && cancel.mutate()
                    }
                  >
                    Cancel meeting
                  </Button>
                )}
              </div>
              {google?.devManualMeetings && (
                <form
                  className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (devUrl.trim().startsWith('https://')) manual.mutate();
                  }}
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="size-3.5" />
                    Development only — not Google Meet
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      pattern="https://.*"
                      value={devUrl}
                      onChange={(e) => setDevUrl(e.target.value)}
                      placeholder="https://…"
                      aria-label="Development meeting link (https)"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    />
                    <Button
                      size="sm"
                      type="submit"
                      variant="outline"
                      loading={manual.isPending}
                      disabled={!devUrl.trim().startsWith('https://')}
                    >
                      Save link
                    </Button>
                  </div>
                </form>
              )}
            </div>
          );
        }}
      </Loaded>
    </div>
  );
}

function AppointmentCard({ a, google }: { a: Appt; google: GoogleStatus | undefined }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const started = new Date(a.startsAt) <= new Date();
  const cancel = useAction(
    () => post<{ refund: { amountPaisa: number } | null }>(`/appointments/${a.id}/cancel`, {}),
    {
      success: (r) =>
        r.refund
          ? `Session cancelled — ${fmtMoney(r.refund.amountPaisa)} refund requested for the client`
          : 'Session cancelled',
      invalidate: apptKeys,
    },
  );
  const outcome = useAction(
    (o: 'COMPLETED' | 'MISSED') => post(`/appointments/${a.id}/outcome`, { outcome: o }),
    {
      success: (r) => `Marked as ${label(String((r as { status: string }).status))}`,
      invalidate: apptKeys,
    },
  );
  const canRecord = ['CONFIRMED', 'COMPLETED'].includes(a.status);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-slate-900">
            {a.relationshipId ? (
              <Link to={`/counselor/clients/${a.relationshipId}`} className="hover:underline">
                {a.youth.user.displayName}
              </Link>
            ) : (
              a.youth.user.displayName
            )}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarClock className="size-4 text-slate-400" />
            {fmtDate(a.startsAt)}, {fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={a.status} />
            <ModeBadge mode={a.mode} />
            <span className="text-xs text-slate-500">{fmtMoney(a.feePaisa)}</span>
          </div>
          {a.cancelReason && <p className="text-xs text-slate-500">Reason: {a.cancelReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {a.status === 'PENDING_COUNSELOR' && <DecisionButtons a={a} />}
          {a.status === 'CONFIRMED' && started && (
            <>
              <Button
                size="sm"
                loading={outcome.isPending && outcome.variables === 'COMPLETED'}
                onClick={() => outcome.mutate('COMPLETED')}
              >
                Mark completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={outcome.isPending && outcome.variables === 'MISSED'}
                onClick={async () =>
                  (await confirm({
                    title: 'Mark as missed?',
                    message: 'Use this when the client did not attend.',
                    confirmLabel: 'Mark missed',
                  })) && outcome.mutate('MISSED')
                }
              >
                Mark missed
              </Button>
            </>
          )}
          {a.status === 'CONFIRMED' && !started && (
            <Button
              size="sm"
              variant="ghost"
              loading={cancel.isPending}
              onClick={async () =>
                (await confirm({
                  title: 'Cancel this session?',
                  message:
                    'The client will be notified and receives a full refund of any payment. The time slot becomes free again.',
                  confirmLabel: 'Cancel session',
                  danger: true,
                })) && cancel.mutate()
              }
            >
              Cancel session
            </Button>
          )}
        </div>
      </div>
      {a.status === 'PENDING_PAYMENT' && (
        <p className="text-xs text-slate-500">
          Waiting for the client to complete payment before you can respond.
        </p>
      )}
      {a.status === 'CONFIRMED' && a.mode === 'ONLINE' && (
        <MeetingPanel appointmentId={a.id} google={google} />
      )}
      {a.status === 'COMPLETED' && !a.sessionRecord && !editing && (
        <Notice tone="amber">
          This session has no record yet.{' '}
          <button className="font-medium underline" onClick={() => setEditing(true)}>
            Document it now
          </button>{' '}
          so the client can see the summary and next steps.
        </Notice>
      )}
      {canRecord &&
        (editing ? (
          <SessionRecordForm
            appointmentId={a.id}
            existing={a.sessionRecord}
            onDone={() => setEditing(false)}
            invalidate={apptKeys}
          />
        ) : a.sessionRecord ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Session record
              </p>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
            <SessionRecordView r={a.sessionRecord} />
          </div>
        ) : (
          a.status === 'CONFIRMED' && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <FileText className="size-4" />
              Add session record
            </Button>
          )
        ))}
    </Card>
  );
}

// =====================================================================
// 1. CounselorHome
// =====================================================================
export function CounselorHome() {
  const { user } = useAuth();
  const me = useApi<CounselorMe>(['counselor-me'], '/users/counselor/me');
  const google = useApi<GoogleStatus>(['google-status'], '/meetings/google/status');
  const rels = useApi<RelListItem[]>(['relationships'], '/support/relationships');
  const upcoming = useApi<Appt[]>(['appointments', 'upcoming'], '/appointments?scope=upcoming');

  const pending = upcoming.data?.filter((a) => a.status === 'PENDING_COUNSELOR') ?? [];
  const confirmed = upcoming.data?.filter((a) => a.status === 'CONFIRMED') ?? [];
  const activeRels = rels.data?.filter((r) => r.status === 'ACTIVE').length;
  const proposedPlans = rels.data?.reduce(
    (n, r) => n + r.plans.filter((p) => p.status === 'PROPOSED').length,
    0,
  );
  const g = google.data;
  const googleOk = g?.connection?.status === 'CONNECTED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${user ? `, ${user.displayName.split(' ')[0]}` : ''}`}
        subtitle="Your counseling workspace — requests, sessions and clients at a glance."
      />
      <div className="space-y-3">
        {me.data && <VerificationBanner me={me.data} />}
        {g && !googleOk && (
          <Notice tone="amber">
            {g.configured ? (
              <>
                {g.connection?.status === 'REVOKED'
                  ? 'Your Google access was revoked or expired.'
                  : 'Google Meet is not connected.'}{' '}
                Online sessions need a Meet link.{' '}
                <Link to="/counselor/settings" className="font-medium underline">
                  {g.connection ? 'Reconnect Google' : 'Connect Google'}
                </Link>
              </>
            ) : (
              <>
                Google Meet integration is not configured on this server; meeting links cannot be
                generated.{' '}
                <Link to="/counselor/settings" className="font-medium underline">
                  Details
                </Link>
              </>
            )}
          </Notice>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active clients"
          value={activeRels ?? '—'}
          icon={<Users className="size-5" />}
        />
        <Stat
          label="Pending requests"
          value={upcoming.data ? pending.length : '—'}
          icon={<ClipboardList className="size-5" />}
          tone="amber"
          hint="Awaiting your response"
        />
        <Stat
          label="Upcoming sessions"
          value={upcoming.data ? confirmed.length : '—'}
          icon={<CalendarDays className="size-5" />}
          tone="sky"
        />
        <Stat
          label="Plans awaiting client"
          value={proposedPlans ?? '—'}
          icon={<FileText className="size-5" />}
          tone="violet"
          hint="Proposed, not yet agreed"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Booking requests"
          subtitle="Respond promptly — clients are waiting"
          action={
            <Link
              to="/counselor/appointments"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              All appointments
            </Link>
          }
        >
          <Loaded q={upcoming}>
            {() =>
              pending.length ? (
                <ul className="divide-y divide-slate-100">
                  {pending.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-800">{a.youth.user.displayName}</p>
                        <p className="text-xs text-slate-500">
                          {fmtDateTime(a.startsAt)} · {a.mode === 'ONLINE' ? 'Online' : 'In person'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <DecisionButtons a={a} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No pending requests"
                  hint="New booking requests will appear here."
                />
              )
            }
          </Loaded>
        </Card>
        <Card
          title="Upcoming sessions"
          action={
            <Link
              to="/counselor/availability"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Manage availability
            </Link>
          }
        >
          <Loaded q={upcoming}>
            {() =>
              confirmed.length ? (
                <ul className="divide-y divide-slate-100">
                  {confirmed.slice(0, 8).map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-800">
                          {a.relationshipId ? (
                            <Link
                              to={`/counselor/clients/${a.relationshipId}`}
                              className="hover:underline"
                            >
                              {a.youth.user.displayName}
                            </Link>
                          ) : (
                            a.youth.user.displayName
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{fmtDateTime(a.startsAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ModeBadge mode={a.mode} />
                        {a.mode === 'ONLINE' &&
                          (a.meeting ? (
                            <span
                              title={
                                a.meeting.creationStatus
                                  ? label(a.meeting.creationStatus)
                                  : undefined
                              }
                            >
                              <StatusBadge status={a.meeting.status} />
                            </span>
                          ) : (
                            <Badge tone="amber">No meeting</Badge>
                          ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No upcoming sessions"
                  hint="Make sure your availability is set and slots are generated."
                />
              )
            }
          </Loaded>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// 2. CounselorAppointments
// =====================================================================
export function CounselorAppointments() {
  const [tab, setTab] = useState<'pending' | 'upcoming' | 'past'>('pending');
  const upcoming = useApi<Appt[]>(['appointments', 'upcoming'], '/appointments?scope=upcoming');
  const past = useApi<Appt[]>(['appointments', 'past'], '/appointments?scope=past');
  const google = useApi<GoogleStatus>(['google-status'], '/meetings/google/status');
  const pending = upcoming.data?.filter((a) => a.status === 'PENDING_COUNSELOR');
  const later = upcoming.data?.filter((a) => a.status !== 'PENDING_COUNSELOR');
  const undocumented =
    past.data?.filter((a) => a.status === 'COMPLETED' && !a.sessionRecord).length ?? 0;
  const q = tab === 'past' ? past : upcoming;
  const list = tab === 'pending' ? pending : tab === 'upcoming' ? later : past.data;

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Respond to requests, run sessions and keep session records up to date."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pending', label: 'Pending', count: pending?.length },
          { value: 'upcoming', label: 'Upcoming', count: later?.length },
          { value: 'past', label: 'Past', count: past.data?.length },
        ]}
      />
      {tab === 'past' && undocumented > 0 && (
        <div className="mb-4">
          <Notice tone="amber">
            {undocumented} completed session{undocumented > 1 ? 's' : ''} without a session record.
            Add a summary so your client can see what was discussed.
          </Notice>
        </div>
      )}
      <Loaded q={q}>
        {() =>
          list?.length ? (
            <div className="space-y-4">
              {list.map((a) => (
                <AppointmentCard key={a.id} a={a} google={google.data} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title={
                  tab === 'pending'
                    ? 'No pending requests'
                    : tab === 'upcoming'
                      ? 'No upcoming sessions'
                      : 'No past sessions yet'
                }
              />
            </Card>
          )
        }
      </Loaded>
    </div>
  );
}

// =====================================================================
// 3. Clients
// =====================================================================
export function Clients() {
  const rels = useApi<RelListItem[]>(['relationships'], '/support/relationships');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const rows = rels.data?.filter(
    (r) =>
      (status === 'ALL' || r.status === status) &&
      r.youth.user.displayName.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Young people you support. Access to their information follows the consent they have given."
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search clients" />
          </div>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            {['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CLOSED'].map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : label(s)}
              </option>
            ))}
          </select>
        </div>
        {rels.isError ? (
          <ErrorState message={errMsg(rels.error)} onRetry={() => rels.refetch()} />
        ) : (
          <DataTable<RelListItem>
            loading={rels.isLoading}
            rows={rows}
            rowKey={(r) => r.id}
            empty="No clients yet"
            columns={[
              {
                key: 'name',
                header: 'Client',
                render: (r) => (
                  <Link
                    to={`/counselor/clients/${r.id}`}
                    className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {r.youth.user.displayName}
                    {r.youth.ageGroup && (
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        ({r.youth.ageGroup})
                      </span>
                    )}
                  </Link>
                ),
              },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'started', header: 'Started', render: (r) => fmtDate(r.startedAt) },
              {
                key: 'next',
                header: 'Next session',
                render: (r) =>
                  r.appointments[0] ? (
                    <span>
                      {fmtDateTime(r.appointments[0].startsAt)}{' '}
                      <span className="text-xs text-slate-500">
                        · {r.appointments[0].mode === 'ONLINE' ? 'Online' : 'In person'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400">None scheduled</span>
                  ),
              },
              {
                key: 'plan',
                header: 'Plan',
                render: (r) =>
                  r.plans.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.plans.map((p) => (
                        <StatusBadge key={p.id} status={p.status} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">No active plan</span>
                  ),
              },
              {
                key: 'open',
                header: '',
                className: 'text-right',
                render: (r) => (
                  <Link
                    to={`/counselor/clients/${r.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Open
                  </Link>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

// =====================================================================
// 4. ClientDetail
// =====================================================================
type ClientTab =
  'overview' | 'progress' | 'plan' | 'sessions' | 'notes' | 'reviews' | 'recommend' | 'messages';
const needsReview = (t: Task) =>
  !t.counselorReviewedAt &&
  t.status !== 'CANCELLED' &&
  (!!t.youthUpdate || !!t.reflection || t.status !== 'PENDING');

export function ClientDetail() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<ClientTab>('overview');
  const rel = useApi<RelDetail>(['rel', id], `/support/relationships/${id}`);
  const plans = useApi<Plan[]>(['rel', id, 'plans'], `/support/relationships/${id}/plans`);
  const confirm = useConfirm();
  const setStatus = useAction(
    (s: string) => patch(`/support/relationships/${id}/status`, { status: s }),
    { success: 'Relationship status updated', invalidate: [['rel', id], ['relationships']] },
  );
  const change = async (s: string, title: string, message: string, danger = false) => {
    if (await confirm({ title, message, confirmLabel: title.replace('?', ''), danger }))
      setStatus.mutate(s);
  };
  const toReview =
    plans.data?.flatMap((p) => p.goals.flatMap((g) => g.tasks)).filter(needsReview).length ?? 0;

  if (rel.isLoading) return <LoadingBlock rows={5} />;
  if (rel.isError || !rel.data)
    return <ErrorState message={errMsg(rel.error)} onRetry={() => rel.refetch()} />;
  const r = rel.data;
  const open = ['ACTIVE', 'PAUSED'].includes(r.status);

  return (
    <div>
      <Link
        to="/counselor/clients"
        className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-800"
      >
        ← All clients
      </Link>
      <PageHeader
        title={r.youth.name}
        subtitle={`Supporting since ${fmtDate(r.startedAt)}${r.youth.ageGroup ? ` · Age group ${r.youth.ageGroup}` : ''}${r.endedAt ? ` · Ended ${fmtDate(r.endedAt)}` : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {r.status === 'ACTIVE' && (
              <Button
                size="sm"
                variant="outline"
                loading={setStatus.isPending}
                onClick={() =>
                  change(
                    'PAUSED',
                    'Pause relationship?',
                    'Use this when support is on hold. You can resume it later.',
                  )
                }
              >
                Pause
              </Button>
            )}
            {r.status === 'PAUSED' && (
              <Button
                size="sm"
                variant="outline"
                loading={setStatus.isPending}
                onClick={() =>
                  change('ACTIVE', 'Resume relationship?', 'Support becomes active again.')
                }
              >
                Resume
              </Button>
            )}
            {open && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  change(
                    'COMPLETED',
                    'Complete relationship?',
                    'Marks support as successfully completed. Messaging and new plans will close. This cannot be undone.',
                  )
                }
              >
                Complete
              </Button>
            )}
            {open && (
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  change(
                    'CLOSED',
                    'Close relationship?',
                    'Ends the support relationship. Messaging and new plans will close. This cannot be undone.',
                    true,
                  )
                }
              >
                Close
              </Button>
            )}
          </div>
        }
      />
      <Tabs<ClientTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'progress', label: 'Progress' },
          { value: 'plan', label: 'Plan', count: toReview || undefined },
          { value: 'sessions', label: 'Sessions', count: r.sessions.length },
          { value: 'notes', label: 'Private notes' },
          { value: 'reviews', label: 'Reviews', count: r.reviews.length },
          { value: 'recommend', label: 'Recommend a program' },
          { value: 'messages', label: 'Messages' },
        ]}
      />
      {tab === 'overview' && <OverviewTab rel={r} />}
      {tab === 'progress' && <ProgressTab id={id} />}
      {tab === 'plan' && <PlanTab id={id} open={open} plans={plans} />}
      {tab === 'sessions' && <SessionsTab rel={r} />}
      {tab === 'notes' && <NotesTab id={id} />}
      {tab === 'reviews' && <ReviewsTab rel={r} open={open} />}
      {tab === 'recommend' && <RecommendTab id={id} open={open} />}
      {tab === 'messages' && <Chat relationshipId={id} />}
    </div>
  );
}

const NotShared = () => (
  <p className="flex items-center gap-2 text-sm text-slate-500">
    <Lock className="size-4" />
    Not shared by client
  </p>
);

function OverviewTab({ rel }: { rel: RelDetail }) {
  const q = useApi<SharedProfile>(
    ['rel', rel.id, 'shared'],
    `/support/relationships/${rel.id}/shared-profile`,
  );
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Notice>
          You only see information the client has chosen to share with you. Sharing can be withdrawn
          at any time.
        </Notice>
        <Loaded q={q}>
          {(s) => (
            <div className="space-y-4">
              <Card title="Support need profile">
                {!s.consent.needProfile ? (
                  <NotShared />
                ) : !s.needProfile ? (
                  <p className="text-sm text-slate-500">
                    Shared, but the client hasn't completed one yet.
                  </p>
                ) : (
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Concerns</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {s.needProfile.concerns.map((c) => (
                          <Badge key={c}>{label(c)}</Badge>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Impact on daily life</dt>
                      <dd className="mt-1">{s.needProfile.impactLevel} / 5</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Duration</dt>
                      <dd className="mt-1">{s.needProfile.durationBucket}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Preferred format</dt>
                      <dd className="mt-1">{label(s.needProfile.mode)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Desired support</dt>
                      <dd className="mt-1">
                        {s.needProfile.desiredSupport.map(label).join(', ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Languages</dt>
                      <dd className="mt-1">{s.needProfile.languages.join(', ') || '—'}</dd>
                    </div>
                    {!!s.needProfile.accessibility.length && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-slate-500">Accessibility needs</dt>
                        <dd className="mt-1">{s.needProfile.accessibility.join(', ')}</dd>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 sm:col-span-2">
                      Updated {fmtDate(s.needProfile.createdAt)}
                    </p>
                  </dl>
                )}
              </Card>
              <Card title="Assessment summary" subtitle="Self-reported answers; not a diagnosis">
                {!s.consent.assessment ? (
                  <NotShared />
                ) : !s.assessment ? (
                  <p className="text-sm text-slate-500">Shared, but no submitted assessment yet.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-xs text-slate-400">
                      Submitted {fmtDate(s.assessment.submittedAt)}
                    </p>
                    <dl className="divide-y divide-slate-100">
                      {s.assessment.responses.map((x) => (
                        <div
                          key={x.questionKey}
                          className="flex flex-wrap justify-between gap-2 py-2"
                        >
                          <dt className="text-slate-500">{label(x.questionKey)}</dt>
                          <dd className="text-right font-medium text-slate-800">
                            {Array.isArray(x.value)
                              ? x.value.map(String).map(label).join(', ')
                              : typeof x.value === 'object' && x.value !== null
                                ? JSON.stringify(x.value)
                                : String(x.value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </Card>
              <Card title="Previous support history">
                {!s.consent.history ? (
                  <NotShared />
                ) : !s.history?.length ? (
                  <p className="text-sm text-slate-500">No previous support relationships.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {s.history.map((h, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <StatusBadge status={h.status} />
                        {fmtDate(h.startedAt)} – {h.endedAt ? fmtDate(h.endedAt) : 'ongoing'}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </Loaded>
      </div>
      <Card title="Timeline">
        {rel.timeline.length ? (
          <Timeline
            items={rel.timeline.map((t) => ({
              id: t.id,
              title: t.title,
              date: t.occurredAt,
              meta: label(t.type),
            }))}
          />
        ) : (
          <EmptyState title="No events yet" />
        )}
      </Card>
    </div>
  );
}

const METRIC_META: Record<Metric, { label: string; color: string }> = {
  mood: { label: 'Mood', color: '#0e8583' },
  sleep: { label: 'Sleep', color: '#2563eb' },
  energy: { label: 'Energy', color: '#d97706' },
  social: { label: 'Social connection', color: '#7c3aed' },
  functioning: { label: 'Daily functioning', color: '#db2777' },
  stress: { label: 'Stress', color: '#e11d48' },
};
const MILESTONE_LABEL: Record<string, string> = {
  ASSESSMENT_COMPLETED: 'Assessment completed',
  COUNSELOR_CONNECTED: 'Counselor connected',
  FIRST_SESSION: 'First session completed',
  PLAN_AGREED: 'Support plan agreed',
  FIRST_REVIEW: 'First progress review completed',
  GOAL_ACHIEVED: 'Goal achieved',
};

function ProgressTab({ id }: { id: string }) {
  const [days, setDays] = useState<30 | 90>(30);
  const q = useApi<ProgressData>(
    ['rel', id, 'progress', days],
    `/support/relationships/${id}/progress?days=${days}`,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Self-reported measures support reflection and conversation; they do not indicate clinical
          recovery.
        </p>
        <div
          className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1"
          role="group"
          aria-label="Time range"
        >
          {([30, 90] as const).map((d) => (
            <button
              key={d}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cx(
                'rounded-lg px-3 py-1 text-sm',
                days === d ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>
      <Loaded q={q} rows={4}>
        {(p) => {
          const data = (p.checkIns ?? []).map((c) => ({
            date: fmtDate(c.createdAt),
            mood: c.mood,
            sleep: c.sleep,
            energy: c.energy,
            social: c.social,
            functioning: c.functioning,
            stress: c.stress,
          }));
          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Task completion"
                  value={p.tasks.completionRate == null ? '—' : `${p.tasks.completionRate}%`}
                  hint={
                    p.tasks.completionRate == null ? 'Not enough data' : `${p.tasks.total} tasks`
                  }
                  icon={<ClipboardList className="size-5" />}
                />
                <Stat
                  label="Goals achieved"
                  value={`${p.goals.achieved} / ${p.goals.total}`}
                  icon={<CheckCircle2 className="size-5" />}
                  tone="violet"
                />
                <Stat
                  label="Sessions attended"
                  value={p.attendance.attended}
                  icon={<CalendarDays className="size-5" />}
                  tone="sky"
                  hint={`In the last ${days} days`}
                />
                <Stat
                  label="Sessions missed"
                  value={p.attendance.missed}
                  icon={<XCircle className="size-5" />}
                  tone="rose"
                  hint={`In the last ${days} days`}
                />
              </div>
              {!p.checkInConsent ? (
                <Notice tone="amber">
                  Client hasn't shared check-in trends. Mood and wellbeing check-ins stay private
                  unless they choose to share them with you.
                </Notice>
              ) : (
                <>
                  {data.length ? (
                    <div className="grid gap-6 xl:grid-cols-3">
                      <Card
                        title="Wellbeing check-ins"
                        subtitle="Scale 1–5, higher is better. Gaps mean no check-in, not a low score."
                        className="xl:col-span-2"
                      >
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={data}
                              margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                            >
                              <CartesianGrid
                                stroke="#e2e8f0"
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={24}
                              />
                              <YAxis
                                domain={[1, 5]}
                                ticks={[1, 2, 3, 4, 5]}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              {(['mood', 'sleep', 'energy', 'social', 'functioning'] as const).map(
                                (m) => (
                                  <Line
                                    key={m}
                                    type="monotone"
                                    dataKey={m}
                                    name={METRIC_META[m].label}
                                    stroke={METRIC_META[m].color}
                                    strokeWidth={2}
                                    dot={{ r: 2 }}
                                  />
                                ),
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                      <Card title="Stress" subtitle="Scale 0–10, lower is better">
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={data}
                              margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid
                                stroke="#e2e8f0"
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={24}
                              />
                              <YAxis
                                domain={[0, 10]}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                              <Line
                                type="monotone"
                                dataKey="stress"
                                name="Stress"
                                stroke={METRIC_META.stress.color}
                                strokeWidth={2}
                                dot={{ r: 2 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    </div>
                  ) : (
                    <Card>
                      <EmptyState title="No check-ins in this period" />
                    </Card>
                  )}
                  {p.whatChanged && (
                    <Card
                      title="What changed?"
                      subtitle={`Average of this ${days}-day period compared with the previous ${days} days`}
                    >
                      <div className="-mx-5 overflow-x-auto">
                        <table className="w-full min-w-[480px] text-left text-sm">
                          <thead>
                            <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500 uppercase">
                              <th className="px-5 py-2 font-medium">Measure</th>
                              <th className="px-5 py-2 font-medium">This period</th>
                              <th className="px-5 py-2 font-medium">Previous</th>
                              <th className="px-5 py-2 font-medium">Change</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {p.whatChanged.map((w) => {
                              const better =
                                w.change != null &&
                                w.change !== 0 &&
                                (w.metric === 'stress' ? w.change < 0 : w.change > 0);
                              return (
                                <tr key={w.metric}>
                                  <td className="px-5 py-2.5 font-medium text-slate-800">
                                    {METRIC_META[w.metric]?.label ?? label(w.metric)}
                                  </td>
                                  <td className="px-5 py-2.5">
                                    {w.current ?? (
                                      <span className="text-slate-400">Not enough data</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5">
                                    {w.previous ?? (
                                      <span className="text-slate-400">Not enough data</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5">
                                    {w.change == null ? (
                                      <span className="text-slate-400">Not enough data</span>
                                    ) : (
                                      <span
                                        className={cx(
                                          w.change === 0
                                            ? 'text-slate-600'
                                            : better
                                              ? 'text-emerald-700'
                                              : 'text-amber-700',
                                        )}
                                      >
                                        {w.change > 0 ? '+' : ''}
                                        {w.change}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              )}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Tasks by status">
                  {p.tasks.total ? (
                    <div className="space-y-3">
                      {p.tasks.completionRate != null && (
                        <Progress value={p.tasks.completionRate} label="Task completion rate" />
                      )}
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(p.tasks.byStatus).map(([s, n]) => (
                          <span key={s} className="inline-flex items-center gap-1.5">
                            <StatusBadge status={s} />
                            <span className="text-sm text-slate-600">{n}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Not enough data — no tasks yet.</p>
                  )}
                </Card>
                <Card title="Milestones">
                  {p.milestones.length ? (
                    <Timeline
                      items={p.milestones.map((m) => ({
                        id: m.id,
                        title: MILESTONE_LABEL[m.kind] ?? label(m.kind),
                        date: m.achievedAt,
                      }))}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">No milestones yet.</p>
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

// ---------- Plan tab ----------
type PlanForm = { title: string; description: string; startDate: string; reviewDate: string };
function PlanFormModal({
  open,
  onClose,
  initial,
  onSubmit,
  loading,
  editingVersion,
}: {
  open: boolean;
  onClose: () => void;
  initial?: PlanForm;
  onSubmit: (v: PlanForm) => void;
  loading: boolean;
  editingVersion?: number;
}) {
  const blank: PlanForm = {
    title: '',
    description: '',
    startDate: toDateInput(new Date()),
    reviewDate: toDateInput(new Date(Date.now() + 28 * 864e5)),
  };
  const [f, setF] = useState<PlanForm>(initial ?? blank);
  useEffect(() => {
    if (open) setF(initial ?? blank);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const invalid = f.reviewDate <= f.startDate;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingVersion ? 'Edit support plan' : 'Create support plan'}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onSubmit(f);
        }}
      >
        {editingVersion && (
          <Notice>
            Saving creates <strong>version {editingVersion + 1}</strong>; earlier versions are kept.
            If the plan is active, it returns to <em>Proposed</em> and the client needs to agree
            again.
          </Notice>
        )}
        <Input
          label="Title"
          required
          minLength={2}
          maxLength={200}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
        />
        <Textarea
          label="Description"
          required
          maxLength={5000}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          hint="What you will work on together, in plain language the client can understand."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Start date"
            type="date"
            required
            value={f.startDate}
            onChange={(e) => setF({ ...f, startDate: e.target.value })}
          />
          <Input
            label="Review date"
            type="date"
            required
            value={f.reviewDate}
            onChange={(e) => setF({ ...f, reviewDate: e.target.value })}
            error={invalid ? 'Review date must be after start date' : undefined}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={invalid}>
            {editingVersion ? 'Save new version' : 'Create draft plan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PlanTab({ id, open, plans }: { id: string; open: boolean; plans: QLike<Plan[]> }) {
  const [creating, setCreating] = useState(false);
  const create = useAction((v: PlanForm) => post(`/support/relationships/${id}/plans`, v), {
    success: 'Draft plan created',
    invalidate: [['rel', id], ['relationships']],
    onSuccess: () => setCreating(false),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Plans start as drafts. Propose a plan to share it — it becomes active only when the client
          agrees. Task progress is self-reported by the client.
        </p>
        {open && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New plan
          </Button>
        )}
      </div>
      <Loaded q={plans}>
        {(list) =>
          list.length ? (
            <div className="space-y-6">
              {list.map((p) => (
                <PlanCard key={p.id} plan={p} relId={id} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No support plans yet"
                hint={
                  open
                    ? 'Create a plan with goals and small tasks you agree on together.'
                    : undefined
                }
              />
            </Card>
          )
        }
      </Loaded>
      <PlanFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={(v) => create.mutate(v)}
        loading={create.isPending}
      />
    </div>
  );
}

function PlanCard({ plan, relId }: { plan: Plan; relId: string }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [addGoal, setAddGoal] = useState(false);
  const v = plan.versions[0];
  const inv = [['rel', relId, 'plans'], ['rel', relId], ['relationships']];
  const status = useAction((s: string) => post(`/support/plans/${plan.id}/status`, { status: s }), {
    success: (r) => `Plan ${label(String((r as { status: string }).status)).toLowerCase()}`,
    invalidate: inv,
  });
  const edit = useAction((f: PlanForm) => put(`/support/plans/${plan.id}`, f), {
    success: 'New plan version saved',
    invalidate: inv,
    onSuccess: () => setEditing(false),
  });
  const closed = ['COMPLETED', 'ARCHIVED'].includes(plan.status);
  const act = async (s: string, title: string, message: string, danger = false) => {
    if (await confirm({ title, message, confirmLabel: title.replace('?', ''), danger }))
      status.mutate(s);
  };

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {v?.title ?? 'Support plan'}
          <StatusBadge status={plan.status} />
          <Badge tone="slate">v{plan.currentVersion}</Badge>
        </span>
      }
      subtitle={
        v
          ? `${fmtDate(v.startDate)} → review ${fmtDate(v.reviewDate)}${v.agreedAt ? ` · Agreed ${fmtDate(v.agreedAt)}` : ''}`
          : undefined
      }
      action={
        <div className="flex flex-wrap gap-2">
          {['DRAFT', 'PAUSED'].includes(plan.status) && (
            <Button
              size="sm"
              loading={status.isPending}
              onClick={() =>
                act(
                  'PROPOSED',
                  'Propose plan?',
                  'The client will be notified and can review and agree to the plan.',
                )
              }
            >
              Propose to client
            </Button>
          )}
          {plan.status === 'ACTIVE' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                act(
                  'PAUSED',
                  'Pause plan?',
                  'Pausing puts the plan on hold. You can propose it again later.',
                )
              }
            >
              Pause
            </Button>
          )}
          {['ACTIVE', 'PAUSED'].includes(plan.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                act(
                  'COMPLETED',
                  'Complete plan?',
                  'Marks this plan as completed. It can no longer be edited.',
                )
              }
            >
              Complete
            </Button>
          )}
          {!closed && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {['DRAFT', 'PROPOSED', 'PAUSED', 'COMPLETED'].includes(plan.status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                act(
                  'ARCHIVED',
                  'Archive plan?',
                  'Archived plans are kept for the record but can no longer be changed.',
                  true,
                )
              }
            >
              Archive
            </Button>
          )}
        </div>
      }
    >
      {plan.status === 'PROPOSED' && (
        <div className="mb-3">
          <Notice>Waiting for the client to agree to this plan.</Notice>
        </div>
      )}
      {v && <p className="mb-4 text-sm whitespace-pre-wrap text-slate-700">{v.description}</p>}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Goals ({plan.goals.length})</h3>
          {!closed && (
            <Button size="sm" variant="soft" onClick={() => setAddGoal((x) => !x)}>
              <Plus className="size-3.5" />
              Add goal
            </Button>
          )}
        </div>
        {addGoal && <GoalForm planId={plan.id} inv={inv} onDone={() => setAddGoal(false)} />}
        {plan.goals.length
          ? plan.goals.map((g) => <GoalBlock key={g.id} goal={g} inv={inv} closed={closed} />)
          : !addGoal && <p className="text-sm text-slate-500">No goals yet.</p>}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          className="text-xs font-medium text-slate-500 hover:text-slate-800"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((x) => !x)}
        >
          {showHistory ? 'Hide' : 'Show'} version history ({plan.versions.length})
        </button>
        {showHistory && (
          <ol className="mt-2 space-y-2">
            {plan.versions.map((pv) => (
              <li key={pv.id} className="rounded-lg border border-slate-100 p-2 text-sm">
                <p className="font-medium text-slate-800">
                  v{pv.version} · {pv.title}
                </p>
                <p className="text-xs text-slate-500">
                  Saved {fmtDateTime(pv.createdAt)} · {fmtDate(pv.startDate)} →{' '}
                  {fmtDate(pv.reviewDate)}
                  {pv.agreedAt ? ` · Agreed ${fmtDate(pv.agreedAt)}` : ' · Not agreed'}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <PlanFormModal
        open={editing}
        onClose={() => setEditing(false)}
        editingVersion={plan.currentVersion}
        loading={edit.isPending}
        onSubmit={(f) => edit.mutate(f)}
        initial={
          v
            ? {
                title: v.title,
                description: v.description,
                startDate: toDateInput(v.startDate),
                reviewDate: toDateInput(v.reviewDate),
              }
            : undefined
        }
      />
    </Card>
  );
}

function GoalForm({
  planId,
  inv,
  onDone,
}: {
  planId: string;
  inv: unknown[][];
  onDone: () => void;
}) {
  const [f, setF] = useState({
    title: '',
    description: '',
    startDate: toDateInput(new Date()),
    targetDate: '',
  });
  const add = useAction(
    () =>
      post(`/support/plans/${planId}/goals`, {
        title: f.title.trim(),
        description: f.description.trim() || undefined,
        startDate: f.startDate,
        targetDate: f.targetDate || undefined,
      }),
    { success: 'Goal added', invalidate: inv, onSuccess: onDone },
  );
  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.title.trim()) add.mutate();
      }}
    >
      <div className="sm:col-span-2">
        <Input
          label="Goal"
          required
          maxLength={200}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <Textarea
          label="Description (optional)"
          rows={2}
          maxLength={2000}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </div>
      <Input
        label="Start date"
        type="date"
        required
        value={f.startDate}
        onChange={(e) => setF({ ...f, startDate: e.target.value })}
      />
      <Input
        label="Target date (optional)"
        type="date"
        value={f.targetDate}
        onChange={(e) => setF({ ...f, targetDate: e.target.value })}
      />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" type="submit" loading={add.isPending}>
          Add goal
        </Button>
      </div>
    </form>
  );
}

const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED'].map((s) => ({
  value: s,
  label: label(s),
}));

function GoalBlock({ goal, inv, closed }: { goal: Goal; inv: unknown[][]; closed: boolean }) {
  const [addTask, setAddTask] = useState(false);
  const [t, setT] = useState({ title: '', description: '', dueDate: '' });
  const setStatus = useAction((status: string) => patch(`/support/goals/${goal.id}`, { status }), {
    success: 'Goal updated',
    invalidate: inv,
  });
  const add = useAction(
    () =>
      post(`/support/goals/${goal.id}/tasks`, {
        title: t.title.trim(),
        description: t.description.trim() || undefined,
        dueDate: t.dueDate || undefined,
      }),
    {
      success: 'Task added — the client has been notified',
      invalidate: inv,
      onSuccess: () => {
        setT({ title: '', description: '', dueDate: '' });
        setAddTask(false);
      },
    },
  );
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{goal.title}</p>
          {goal.description && <p className="text-sm text-slate-600">{goal.description}</p>}
          <p className="text-xs text-slate-500">
            From {fmtDate(goal.startDate)}
            {goal.targetDate ? ` · Target ${fmtDate(goal.targetDate)}` : ''}
          </p>
        </div>
        {closed ? (
          <StatusBadge status={goal.status} />
        ) : (
          <select
            aria-label={`Status of goal ${goal.title}`}
            value={goal.status}
            disabled={setStatus.isPending}
            onChange={(e) => setStatus.mutate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {GOAL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {goal.tasks.map((task) => (
          <TaskRow key={task.id} task={task} inv={inv} closed={closed} />
        ))}
      </ul>
      {!goal.tasks.length && <p className="mt-2 text-xs text-slate-400">No tasks yet.</p>}
      {!closed &&
        (addTask ? (
          <form
            className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (t.title.trim()) add.mutate();
            }}
          >
            <Input
              label="Task"
              required
              maxLength={200}
              value={t.title}
              onChange={(e) => setT({ ...t, title: e.target.value })}
            />
            <Input
              label="Due date (optional)"
              type="date"
              value={t.dueDate}
              onChange={(e) => setT({ ...t, dueDate: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="Details (optional)"
                rows={2}
                maxLength={2000}
                value={t.description}
                onChange={(e) => setT({ ...t, description: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button size="sm" variant="ghost" onClick={() => setAddTask(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" loading={add.isPending}>
                Add task
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAddTask(true)}>
            <Plus className="size-3.5" />
            Add task
          </Button>
        ))}
    </div>
  );
}

function TaskRow({ task, inv, closed }: { task: Task; inv: unknown[][]; closed: boolean }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [showHist, setShowHist] = useState(false);
  const upd = useAction(
    (b: { reviewed?: boolean; status?: string }) => patch(`/support/tasks/${task.id}`, b),
    { success: (_r) => 'Task updated', invalidate: inv },
  );
  const awaiting = needsReview(task);
  return (
    <li
      className={cx(
        'rounded-lg border p-3 text-sm',
        awaiting ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100 bg-slate-50/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cx(
              'font-medium',
              task.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-800',
            )}
          >
            {task.title}
          </p>
          {task.description && <p className="text-xs text-slate-600">{task.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusBadge status={task.status} />
            {task.dueDate && <span>Due {fmtDate(task.dueDate)}</span>}
            {task.completedAt && <span>Reported {fmtDate(task.completedAt)}</span>}
            {task.counselorReviewedAt ? (
              <Badge tone="green">
                <CheckCircle2 className="size-3" />
                Reviewed {fmtDate(task.counselorReviewedAt)}
              </Badge>
            ) : (
              awaiting && <Badge tone="amber">Awaiting your review</Badge>
            )}
          </div>
        </div>
        {!closed && task.status !== 'CANCELLED' && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="soft"
              loading={upd.isPending && upd.variables?.reviewed}
              onClick={() => upd.mutate({ reviewed: true })}
            >
              {task.counselorReviewedAt ? 'Mark reviewed again' : 'Mark reviewed'}
            </Button>
            {task.status !== 'COMPLETED' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () =>
                  (await confirm({
                    title: 'Cancel this task?',
                    message: 'The task will be shown as cancelled to the client.',
                    confirmLabel: 'Cancel task',
                    danger: true,
                  })) && upd.mutate({ status: 'CANCELLED' })
                }
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>
      {(task.youthUpdate || task.reflection) && (
        <div className="mt-2 space-y-1 rounded-lg bg-white p-2 text-xs text-slate-700">
          {task.youthUpdate && (
            <p>
              <span className="font-medium">Client update:</span> {task.youthUpdate}
            </p>
          )}
          {task.reflection && (
            <p>
              <span className="font-medium">Reflection:</span> {task.reflection}
            </p>
          )}
        </div>
      )}
      {!!task.history.length && (
        <div className="mt-1">
          <button
            className="text-xs text-slate-500 hover:text-slate-800"
            aria-expanded={showHist}
            onClick={() => setShowHist((x) => !x)}
          >
            {showHist ? 'Hide' : 'Show'} history
          </button>
          {showHist && (
            <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
              {task.history.map((h) => (
                <li key={h.id}>
                  {fmtDateTime(h.changedAt)} · {h.from ? `${label(h.from)} → ` : ''}
                  {label(h.to)} · {h.changedBy === user?.id ? 'by you' : 'by client'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function SessionsTab({ rel }: { rel: RelDetail }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!rel.sessions.length)
    return (
      <Card>
        <EmptyState title="No sessions yet" />
      </Card>
    );
  return (
    <div className="space-y-4">
      {rel.sessions.map((s) => {
        const canRecord = ['CONFIRMED', 'COMPLETED'].includes(s.status);
        return (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-800">
                  {fmtDate(s.startsAt)}, {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}
                </p>
                <StatusBadge status={s.status} />
                <ModeBadge mode={s.mode} />
              </div>
              {canRecord && editing !== s.id && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)}>
                  {s.sessionRecord ? 'Edit record' : 'Add record'}
                </Button>
              )}
            </div>
            <div className="mt-3">
              {editing === s.id ? (
                <SessionRecordForm
                  appointmentId={s.id}
                  existing={s.sessionRecord}
                  onDone={() => setEditing(null)}
                  invalidate={[['rel', rel.id], ['appointments']]}
                />
              ) : s.sessionRecord ? (
                <SessionRecordView r={s.sessionRecord} />
              ) : s.status === 'COMPLETED' ? (
                <Notice tone="amber">
                  No session record yet — add one so the client can see the summary.
                </Notice>
              ) : (
                <p className="text-sm text-slate-400">No session record.</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function NotesTab({ id }: { id: string }) {
  const q = useApi<Note[]>(['rel', id, 'notes'], `/support/relationships/${id}/notes`);
  const [body, setBody] = useState('');
  const add = useAction(() => post(`/support/relationships/${id}/notes`, { body: body.trim() }), {
    success: 'Private note saved',
    invalidate: [['rel', id, 'notes']],
    onSuccess: () => setBody(''),
  });
  return (
    <div className="space-y-4">
      <Notice tone="brand">
        <span className="flex items-center gap-1.5 font-medium">
          <Lock className="size-4" />
          Private — never shared with the client or administrators.
        </span>{' '}
        These are your professional notes. They are excluded from client data exports.
      </Notice>
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
        >
          <Textarea
            label="New private note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={10000}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={add.isPending} disabled={!body.trim()}>
              Save note
            </Button>
          </div>
        </form>
      </Card>
      <Loaded q={q}>
        {(notes) =>
          notes.length ? (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id}>
                  <Card>
                    <p className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{n.body}</p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <EmptyState title="No private notes yet" />
            </Card>
          )
        }
      </Loaded>
    </div>
  );
}

function ReviewsTab({ rel, open }: { rel: RelDetail; open: boolean }) {
  const [f, setF] = useState({
    outcome: '',
    nextSteps: '',
    periodStart: toDateInput(new Date(Date.now() - 30 * 864e5)),
    periodEnd: toDateInput(new Date()),
  });
  const add = useAction(
    () =>
      post(`/support/relationships/${rel.id}/reviews`, {
        outcome: f.outcome.trim(),
        nextSteps: f.nextSteps.trim() || undefined,
        periodStart: f.periodStart,
        periodEnd: f.periodEnd,
      }),
    {
      success: 'Progress review shared with the client',
      invalidate: [['rel', rel.id]],
      onSuccess: () => setF({ ...f, outcome: '', nextSteps: '' }),
    },
  );
  const invalid = f.periodEnd < f.periodStart;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {open ? (
        <Card title="New progress review" subtitle="Reviews are shared with the client">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (f.outcome.trim() && !invalid) add.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Period start"
                type="date"
                required
                value={f.periodStart}
                onChange={(e) => setF({ ...f, periodStart: e.target.value })}
              />
              <Input
                label="Period end"
                type="date"
                required
                value={f.periodEnd}
                onChange={(e) => setF({ ...f, periodEnd: e.target.value })}
                error={invalid ? 'End must be on or after start' : undefined}
              />
            </div>
            <Textarea
              label="Outcome"
              required
              maxLength={3000}
              value={f.outcome}
              onChange={(e) => setF({ ...f, outcome: e.target.value })}
              hint="What progress was made, in supportive language."
            />
            <Textarea
              label="Next steps (optional)"
              rows={3}
              maxLength={2000}
              value={f.nextSteps}
              onChange={(e) => setF({ ...f, nextSteps: e.target.value })}
            />
            <div className="flex justify-end">
              <Button type="submit" loading={add.isPending} disabled={!f.outcome.trim() || invalid}>
                Share review
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Notice>This relationship has ended, so new reviews can't be added.</Notice>
      )}
      <div className="space-y-3">
        {rel.reviews.length ? (
          rel.reviews.map((r) => (
            <Card
              key={r.id}
              title={`${fmtDate(r.periodStart)} – ${fmtDate(r.periodEnd)}`}
              subtitle={`Shared ${fmtDate(r.createdAt)}`}
            >
              <p className="text-sm whitespace-pre-wrap text-slate-700">{r.outcome}</p>
              {r.nextSteps && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Next steps:</span> {r.nextSteps}
                </p>
              )}
            </Card>
          ))
        ) : (
          <Card>
            <EmptyState title="No reviews yet" />
          </Card>
        )}
      </div>
    </div>
  );
}

function RecommendTab({ id, open }: { id: string; open: boolean }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const ranked = useApi<{ ranked: RankedProgram[]; usedNeedProfile: boolean }>(
    ['rel', id, 'recs', term],
    open ? `/programs/recommend/for/${id}${term ? `?q=${encodeURIComponent(term)}` : ''}` : null,
  );
  const sent = useApi<SentRec[]>(['rel', id, 'sent'], `/programs/recommend/sent/${id}`);
  const [target, setTarget] = useState<RankedProgram | null>(null);
  const [note, setNote] = useState('');
  const send = useAction(
    () =>
      post('/programs/recommend', {
        relationshipId: id,
        programId: target!.id,
        note: note.trim() || undefined,
      }),
    {
      success: "Recommendation sent — the choice is always the client's",
      invalidate: [['rel', id, 'sent']],
      onSuccess: () => {
        setTarget(null);
        setNote('');
      },
    },
  );
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {!open ? (
          <Notice>This relationship has ended, so new recommendations can't be sent.</Notice>
        ) : (
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search programs by title or category"
            />
            <Loaded q={ranked}>
              {(d) => (
                <div className="space-y-3">
                  <Notice tone={d.usedNeedProfile ? 'brand' : 'sky'}>
                    {d.usedNeedProfile
                      ? 'Ranked using the support need profile the client shared with you.'
                      : "The client hasn't shared their support need profile, so programs are not personalised."}
                  </Notice>
                  {d.ranked.length ? (
                    d.ranked.map((p) => (
                      <Card key={p.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-semibold text-slate-900">{p.title}</p>
                            <p className="text-xs text-slate-500">
                              {p.organization.name} · {p.category} · {fmtDate(p.startsAt)} ·{' '}
                              {label(p.mode)}
                              {p.locationArea ? ` · ${p.locationArea}` : ''} ·{' '}
                              {fmtMoney(p.costPaisa)} · {Math.max(0, p.seats - p.seatsTaken)} seats
                              left
                            </p>
                            <p className="line-clamp-2 text-sm text-slate-600">{p.description}</p>
                            {d.usedNeedProfile && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <Badge tone="violet">Score {p.score}</Badge>
                                {p.reasons.map((r) => (
                                  <Badge key={r} tone="slate">
                                    {r}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button size="sm" onClick={() => setTarget(p)}>
                            Recommend
                          </Button>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <EmptyState title="No published upcoming programs match" />
                    </Card>
                  )}
                </div>
              )}
            </Loaded>
          </>
        )}
      </div>
      <Card title="Sent recommendations">
        <Loaded q={sent}>
          {(list) =>
            list.length ? (
              <ul className="divide-y divide-slate-100">
                {list.map((r) => (
                  <li key={r.id} className="space-y-1 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-800">{r.program.title}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      Sent {fmtDate(r.createdAt)} · Starts {fmtDate(r.program.startsAt)}
                    </p>
                    {r.note && <p className="text-xs text-slate-600">“{r.note}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing sent yet" />
            )
          }
        </Loaded>
      </Card>
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Recommend program"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button loading={send.isPending} onClick={() => send.mutate()}>
              Send recommendation
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Recommend <strong>{target?.title}</strong> to your client. They decide whether to book;
            the organization never sees who recommended it.
          </p>
          <Textarea
            label="Note for the client (optional)"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

// =====================================================================
// 5. Availability
// =====================================================================
export function Availability() {
  const confirm = useConfirm();
  const q = useApi<AvailabilityData>(['availability'], '/counselors/me/availability');
  const slots = useApi<Slot[]>(['slots'], '/counselors/me/slots');
  const [rows, setRows] = useState<AvailRow[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      setRows(
        q.data.weekly.map(({ dayOfWeek, startMinute, endMinute, slotMinutes }) => ({
          dayOfWeek,
          startMinute,
          endMinute,
          slotMinutes,
        })),
      );
    }
  }, [q.data]);
  const [ex, setEx] = useState({ startsAt: '', endsAt: '', reason: '' });
  const [days, setDays] = useState(14);

  const save = useAction(() => put('/counselors/me/availability', { weekly: rows }), {
    success: 'Weekly availability saved',
    invalidate: [['availability']],
  });
  const addEx = useAction(
    () =>
      post('/counselors/me/exceptions', {
        startsAt: new Date(ex.startsAt).toISOString(),
        endsAt: new Date(ex.endsAt).toISOString(),
        reason: ex.reason.trim() || undefined,
      }),
    {
      success: 'Time blocked — free slots in that period were removed',
      invalidate: [['availability'], ['slots']],
      onSuccess: () => setEx({ startsAt: '', endsAt: '', reason: '' }),
    },
  );
  const delEx = useAction((exId: string) => del(`/counselors/me/exceptions/${exId}`), {
    success: 'Exception removed',
    invalidate: [['availability']],
  });
  const gen = useAction(
    () => post<{ created: number }>('/counselors/me/slots/generate', { days }),
    {
      success: (r) => `${r.created} new slot${r.created === 1 ? '' : 's'} created`,
      invalidate: [['slots']],
    },
  );
  const delSlot = useAction((sid: string) => del(`/counselors/me/slots/${sid}`), {
    success: 'Slot removed',
    invalidate: [['slots']],
  });

  const rowErr = (r: AvailRow) =>
    r.endMinute <= r.startMinute
      ? 'End must be after start'
      : r.endMinute - r.startMinute < r.slotMinutes
        ? 'Window is shorter than one slot'
        : null;
  const hasErr = rows.some((r) => rowErr(r));
  const upd = (i: number, p: Partial<AvailRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const exInvalid = !ex.startsAt || !ex.endsAt || new Date(ex.endsAt) <= new Date(ex.startsAt);

  const grouped = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) {
      const k = toDateInput(s.startsAt);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [slots.data]);
  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        subtitle="Set your weekly hours, block time off, then generate bookable slots. Times use your account timezone."
      />
      <Card
        title="Weekly hours"
        subtitle="Each row is a recurring window split into slots of the chosen length."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setRows([
                  ...rows,
                  { dayOfWeek: 1, startMinute: 540, endMinute: 1020, slotMinutes: 60 },
                ])
              }
            >
              <Plus className="size-4" />
              Add window
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={hasErr || !q.data}
              onClick={() => save.mutate()}
            >
              Save weekly hours
            </Button>
          </div>
        }
      >
        <Loaded q={q}>
          {() =>
            rows.length ? (
              <div className="space-y-3">
                {rows.map((r, i) => {
                  const err = rowErr(r);
                  return (
                    <div
                      key={i}
                      className="grid items-end gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
                    >
                      <Select
                        label="Day"
                        value={String(r.dayOfWeek)}
                        onChange={(e) => upd(i, { dayOfWeek: Number(e.target.value) })}
                        options={DAYS.map((d, k) => ({ value: String(k), label: d }))}
                        id={`day-${i}`}
                      />
                      <Input
                        label="Start"
                        type="time"
                        id={`start-${i}`}
                        value={minToTime(r.startMinute)}
                        onChange={(e) => upd(i, { startMinute: timeToMin(e.target.value) })}
                      />
                      <Input
                        label="End"
                        type="time"
                        id={`end-${i}`}
                        value={r.endMinute === 1440 ? '23:59' : minToTime(r.endMinute)}
                        onChange={(e) =>
                          upd(i, {
                            endMinute:
                              e.target.value === '23:59' ? 1440 : timeToMin(e.target.value),
                          })
                        }
                        error={err ?? undefined}
                      />
                      <Select
                        label="Slot length"
                        id={`len-${i}`}
                        value={String(r.slotMinutes)}
                        onChange={(e) => upd(i, { slotMinutes: Number(e.target.value) })}
                        options={[30, 45, 50, 60, 90, 120].map((n) => ({
                          value: String(n),
                          label: `${n} min`,
                        }))}
                      />
                      <Button
                        variant="ghost"
                        aria-label={`Remove ${DAYS[r.dayOfWeek]} window`}
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">
                  Changes apply after you save. Saving replaces your previous weekly hours; existing
                  slots are not removed.
                </p>
              </div>
            ) : (
              <EmptyState
                title="No weekly hours yet"
                hint="Add a window for each day you're available."
                action={
                  <Button
                    size="sm"
                    onClick={() =>
                      setRows([
                        { dayOfWeek: 1, startMinute: 540, endMinute: 1020, slotMinutes: 60 },
                      ])
                    }
                  >
                    <Plus className="size-4" />
                    Add window
                  </Button>
                }
              />
            )
          }
        </Loaded>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Time off & exceptions"
          subtitle="Free slots inside a blocked period are removed. Booked sessions are kept and must be handled separately."
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!exInvalid) addEx.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="From"
                type="datetime-local"
                required
                value={ex.startsAt}
                onChange={(e) => setEx({ ...ex, startsAt: e.target.value })}
              />
              <Input
                label="Until"
                type="datetime-local"
                required
                value={ex.endsAt}
                onChange={(e) => setEx({ ...ex, endsAt: e.target.value })}
                error={
                  ex.startsAt && ex.endsAt && exInvalid ? 'Must be after the start' : undefined
                }
              />
            </div>
            <Input
              label="Reason (optional, private)"
              maxLength={200}
              value={ex.reason}
              onChange={(e) => setEx({ ...ex, reason: e.target.value })}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={addEx.isPending} disabled={exInvalid}>
                Block time
              </Button>
            </div>
          </form>
          <div className="mt-4 border-t border-slate-100 pt-3">
            {q.data?.exceptions.length ? (
              <ul className="divide-y divide-slate-100">
                {q.data.exceptions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="text-slate-800">
                        {fmtDateTime(e.startsAt)} → {fmtDateTime(e.endsAt)}
                      </p>
                      {e.reason && <p className="text-xs text-slate-500">{e.reason}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remove exception"
                      onClick={async () =>
                        (await confirm({
                          title: 'Remove this exception?',
                          message:
                            'Removed slots are not recreated automatically — generate slots again afterwards.',
                          confirmLabel: 'Remove',
                        })) && delEx.mutate(e.id)
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No upcoming exceptions.</p>
            )}
          </div>
        </Card>
        <Card
          title="Generate slots"
          subtitle="Creates bookable slots from your weekly hours, skipping exceptions. Safe to run again — duplicates are skipped."
        >
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              gen.mutate();
            }}
          >
            <div className="w-40">
              <Input
                label="Days ahead"
                type="number"
                min={1}
                max={60}
                required
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              />
            </div>
            <Button type="submit" loading={gen.isPending}>
              <CalendarDays className="size-4" />
              Generate
            </Button>
          </form>
          {!q.data?.weekly.length && (
            <div className="mt-3">
              <Notice tone="amber">Save your weekly hours first.</Notice>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Upcoming slots"
        subtitle="Free slots can be removed. Booked or held slots are locked."
      >
        <Loaded q={slots}>
          {() =>
            grouped.length ? (
              <div className="space-y-4">
                {grouped.map(([day, list]) => (
                  <div key={day}>
                    <p className="mb-2 text-sm font-semibold text-slate-700">
                      {new Date(list[0].startsAt).toLocaleDateString(undefined, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((s) => {
                        const held =
                          !s.isBooked && !!s.hold && new Date(s.hold.expiresAt).getTime() > now;
                        const st = s.isBooked ? 'Booked' : held ? 'Held' : 'Free';
                        return (
                          <span
                            key={s.id}
                            className={cx(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
                              s.isBooked
                                ? 'border-brand-200 bg-brand-50 text-brand-800'
                                : held
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 bg-white text-slate-700',
                            )}
                          >
                            {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}{' '}
                            <span className="font-medium">{st}</span>
                            {st === 'Free' && (
                              <button
                                aria-label={`Remove slot at ${fmtTime(s.startsAt)}`}
                                className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                disabled={delSlot.isPending}
                                onClick={() => delSlot.mutate(s.id)}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No upcoming slots"
                hint="Generate slots from your weekly hours so youth can book you."
              />
            )
          }
        </Loaded>
      </Card>
    </div>
  );
}

// =====================================================================
// 6. CounselorProfile
// =====================================================================
const CONCERN_OPTS = [
  ['anxiety', 'Anxiety'],
  ['stress', 'Stress'],
  ['academic', 'Studies / exams'],
  ['low-mood', 'Low mood'],
  ['family', 'Family'],
  ['relationships', 'Relationships'],
  ['substance-use', 'Alcohol or drug use'],
  ['career', 'Career / future'],
  ['sleep', 'Sleep'],
].map(([value, l]) => ({ value, label: l }));
const SPEC_OPTS = [
  ...CONCERN_OPTS,
  { value: 'grief', label: 'Grief & loss' },
  { value: 'self-esteem', label: 'Self-esteem' },
  { value: 'trauma-informed', label: 'Trauma-informed care' },
];
const LANG_OPTS = [
  ['ne', 'Nepali'],
  ['en', 'English'],
  ['mai', 'Maithili'],
  ['bho', 'Bhojpuri'],
  ['new', 'Newari'],
  ['tmg', 'Tamang'],
  ['hi', 'Hindi'],
].map(([value, l]) => ({ value, label: l }));
const AGE_OPTS = ['13-14', '15-17', '18-24', '25-29'].map((a) => ({ value: a, label: a }));

interface ProfileForm {
  qualifications: string;
  experienceYears: number;
  bio: string;
  specializations: string[];
  supportedConcerns: string[];
  languages: string[];
  ageGroups: string[];
  locationArea: string;
  mode: Mode;
  feeRupees: string;
  acceptingBookings: boolean;
}

export function CounselorProfile() {
  const q = useApi<CounselorMe>(['counselor-me'], '/users/counselor/me');
  return (
    <div>
      <PageHeader
        title="Profile & verification"
        subtitle="Your public profile helps youth find the right counselor. Only verified counselors appear in search."
      />
      <Loaded q={q} rows={6}>
        {(me) => (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ProfileEditor me={me} />
            </div>
            <VerificationCard me={me} />
          </div>
        )}
      </Loaded>
    </div>
  );
}

function ProfileEditor({ me }: { me: CounselorMe }) {
  const [f, setF] = useState<ProfileForm>({
    qualifications: me.qualifications ?? '',
    experienceYears: me.experienceYears ?? 0,
    bio: me.bio ?? '',
    specializations: me.specializations,
    supportedConcerns: me.supportedConcerns,
    languages: me.languages,
    ageGroups: me.ageGroups,
    locationArea: me.locationArea ?? '',
    mode: me.mode,
    feeRupees: String((me.sessionFeePaisa ?? 0) / 100),
    acceptingBookings: me.acceptingBookings,
  });
  const fee = Number(f.feeRupees);
  const feeErr =
    !Number.isFinite(fee) || fee < 0 || fee > 100000
      ? 'Enter an amount between 0 and 100,000'
      : undefined;
  const save = useAction(
    () =>
      put('/users/counselor/me', {
        qualifications: f.qualifications.trim(),
        experienceYears: f.experienceYears,
        bio: f.bio.trim() || null,
        specializations: f.specializations,
        supportedConcerns: f.supportedConcerns,
        languages: f.languages,
        ageGroups: f.ageGroups,
        locationArea: f.locationArea.trim() || null,
        mode: f.mode,
        sessionFeePaisa: Math.round(fee * 100),
        acceptingBookings: f.acceptingBookings,
      }),
    { success: 'Profile saved', invalidate: [['counselor-me']] },
  );
  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  return (
    <Card title="Professional profile">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!feeErr) save.mutate();
        }}
      >
        <Textarea
          label="Qualifications"
          required
          minLength={2}
          maxLength={500}
          rows={3}
          value={f.qualifications}
          onChange={(e) => set('qualifications', e.target.value)}
          hint="Degrees, licences and training relevant to counseling."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Years of experience"
            type="number"
            min={0}
            max={60}
            required
            value={f.experienceYears}
            onChange={(e) =>
              set(
                'experienceYears',
                Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0))),
              )
            }
          />
          <Input
            label="Location / area"
            maxLength={100}
            value={f.locationArea}
            onChange={(e) => set('locationArea', e.target.value)}
            placeholder="e.g. Lalitpur"
          />
        </div>
        <Textarea
          label="Bio"
          maxLength={2000}
          value={f.bio}
          onChange={(e) => set('bio', e.target.value)}
          hint="A short, friendly introduction for young people."
        />
        <TagPicker
          legend="Concerns you support"
          options={CONCERN_OPTS}
          value={f.supportedConcerns}
          onChange={(v) => set('supportedConcerns', v.slice(0, 20))}
        />
        <TagPicker
          legend="Specializations"
          options={SPEC_OPTS}
          value={f.specializations}
          onChange={(v) => set('specializations', v.slice(0, 20))}
        />
        <TagPicker
          legend="Languages"
          options={LANG_OPTS}
          value={f.languages}
          onChange={(v) => set('languages', v.slice(0, 20))}
          placeholder="Language code, e.g. ne"
        />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">
            Age groups you work with
          </legend>
          <ChipSelect
            options={AGE_OPTS}
            value={f.ageGroups}
            onChange={(v) => set('ageGroups', v)}
          />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Session format"
            value={f.mode}
            onChange={(e) => set('mode', e.target.value as Mode)}
            options={MODE_OPTS}
          />
          <Input
            label="Session fee (Rs)"
            type="number"
            min={0}
            step="0.01"
            value={f.feeRupees}
            onChange={(e) => set('feeRupees', e.target.value)}
            error={feeErr}
            hint="Enter 0 for free sessions."
          />
        </div>
        <Toggle
          checked={f.acceptingBookings}
          onChange={(v) => set('acceptingBookings', v)}
          label="Accepting new bookings"
          description="Turn off to pause new requests. Existing sessions are not affected."
        />
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending} disabled={!!feeErr}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function VerificationCard({ me }: { me: CounselorMe }) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useAction(
    (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/users/counselor/me/documents', fd).then((r) => r.data.data);
    },
    {
      success: 'Document uploaded',
      invalidate: [['counselor-me']],
      onSuccess: () => {
        if (fileRef.current) fileRef.current.value = '';
      },
    },
  );
  const submit = useAction(() => post('/users/counselor/me/submit-verification'), {
    success: 'Submitted for verification',
    invalidate: [['counselor-me']],
  });
  const onFile = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      toast('File is larger than 5 MB', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      toast('Only PDF, PNG or JPG files are accepted', 'error');
      return;
    }
    upload.mutate(file);
  };
  const canSubmit = !['PENDING', 'APPROVED'].includes(me.verificationStatus);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand-600" />
          Verification
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Status</span>
          <StatusBadge status={me.verificationStatus} />
        </div>
        {me.verificationStatus === 'REJECTED' && me.rejectionReason && (
          <Notice tone="rose">
            <span className="font-medium">Reason:</span> {me.rejectionReason}
          </Notice>
        )}
        {me.verificationStatus === 'PENDING' && (
          <Notice>An administrator is reviewing your documents.</Notice>
        )}
        {me.verificationStatus === 'APPROVED' && (
          <Notice tone="brand">You're verified. Youth can find and book you.</Notice>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Credential documents</p>
          {me.documents.length ? (
            <ul className="space-y-1.5">
              {me.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <FileText className="size-4 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate">{d.fileName}</span>
                  <span className="text-xs text-slate-400">{fmtDate(d.uploadedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No documents uploaded yet.</p>
          )}
        </div>
        <div>
          <label htmlFor="cred-file" className="mb-1.5 block text-sm font-medium text-slate-700">
            Upload a document
          </label>
          <input
            id="cred-file"
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            disabled={upload.isPending}
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          <p className="mt-1 text-xs text-slate-500">
            {upload.isPending
              ? 'Uploading…'
              : 'PDF, PNG or JPG, up to 5 MB. Only administrators reviewing your application can view these.'}
          </p>
        </div>
        <Button
          className="w-full"
          disabled={!canSubmit}
          loading={submit.isPending}
          onClick={async () =>
            (await confirm({
              title: 'Submit for verification?',
              message:
                'An administrator will review your profile and documents. Make sure your qualifications, concerns and languages are saved.',
              confirmLabel: 'Submit',
            })) && submit.mutate()
          }
        >
          <Upload className="size-4" />
          Submit for verification
        </Button>
        {!canSubmit && (
          <p className="text-center text-xs text-slate-500">
            {me.verificationStatus === 'APPROVED'
              ? 'Already verified.'
              : 'Already submitted — awaiting review.'}
          </p>
        )}
      </div>
    </Card>
  );
}

// =====================================================================
// 7. CounselorGoogle
// =====================================================================
const GOOGLE_RESULT: Record<string, { msg: string; tone: 'success' | 'error' | 'info' }> = {
  connected: {
    msg: 'Google account connected. Meet links can now be created for online sessions.',
    tone: 'success',
  },
  denied: { msg: 'Google access was not granted. Nothing was connected.', tone: 'error' },
  expired: { msg: 'The connection request expired. Please try again.', tone: 'error' },
  error: { msg: 'Something went wrong connecting Google. Please try again.', tone: 'error' },
  no_refresh_token: {
    msg: 'Google did not grant ongoing access. Remove Sathi from your Google account permissions and connect again.',
    tone: 'error',
  },
  scope_missing: {
    msg: 'Calendar permission was not granted. Please allow calendar event access when connecting.',
    tone: 'error',
  },
};

export function CounselorGoogle() {
  const q = useApi<GoogleStatus>(['google-status'], '/meetings/google/status');
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const shown = useRef(false);
  useEffect(() => {
    const r = params.get('google');
    if (!r || shown.current) return;
    shown.current = true;
    const m = GOOGLE_RESULT[r] ?? GOOGLE_RESULT.error;
    toast(m.msg, m.tone);
    params.delete('google');
    setParams(params, { replace: true });
  }, [params, setParams, toast]);

  const connect = useAction(() => post<{ url: string }>('/meetings/google/connect'), {
    onSuccess: (r) => {
      window.location.href = r.url;
    },
  });
  const disconnect = useAction(() => del('/meetings/google'), {
    success: 'Google account disconnected',
    invalidate: [['google-status']],
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Google Meet"
        subtitle="Connect Google so Sathi can create Meet links for your confirmed online sessions."
      />
      <Loaded q={q}>
        {(g) => {
          const c = g.connection;
          const connected = c?.status === 'CONNECTED';
          return (
            <div className="space-y-6">
              {!g.configured && (
                <Notice tone="amber">
                  Google Meet integration is not configured on this server; meeting links cannot be
                  generated.
                </Notice>
              )}
              <Card
                title="Connection"
                action={
                  c ? <StatusBadge status={c.status} /> : <Badge tone="slate">Not connected</Badge>
                }
              >
                <div className="space-y-4 text-sm">
                  {c && (
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {c.connectedAt && (
                        <div>
                          <dt className="text-xs text-slate-500">Connected</dt>
                          <dd>{fmtDateTime(c.connectedAt)}</dd>
                        </div>
                      )}
                      {c.scope && (
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-500">Permission granted</dt>
                          <dd className="break-all">
                            {c.scope
                              .split(' ')
                              .map((s) => s.replace('https://www.googleapis.com/auth/', ''))
                              .join(', ')}
                          </dd>
                        </div>
                      )}
                      {c.lastError && (
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-slate-500">Last error</dt>
                          <dd className="text-rose-700">{c.lastError}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {c?.status === 'REVOKED' && (
                    <Notice tone="rose">
                      Google access was revoked or expired. Reconnect to keep creating meeting
                      links.
                    </Notice>
                  )}
                  {g.devManualMeetings && (
                    <Notice tone="amber">
                      Development mode: you can add manual meeting links on appointments. These are
                      clearly labelled and are not Google Meet.
                    </Notice>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {g.configured && (
                      <Button loading={connect.isPending} onClick={() => connect.mutate()}>
                        <Video className="size-4" />
                        {c ? 'Reconnect Google' : 'Connect Google'}
                      </Button>
                    )}
                    {c && (
                      <Button
                        variant="outline"
                        loading={disconnect.isPending}
                        onClick={async () =>
                          (await confirm({
                            title: 'Disconnect Google?',
                            message:
                              'Sathi will revoke its access. New online sessions will not get Meet links until you reconnect. Existing links keep working.',
                            confirmLabel: 'Disconnect',
                            danger: true,
                          })) && disconnect.mutate()
                        }
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                  {connected && (
                    <p className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="size-4" />
                      Meet links will be created automatically when you accept online sessions.
                    </p>
                  )}
                </div>
              </Card>
              <Card title="Privacy">
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
                  <li>Sessions are never recorded or transcribed by Sathi.</li>
                  <li>
                    Sathi requests only the minimal{' '}
                    <code className="rounded bg-slate-100 px-1">calendar.events</code> scope, used
                    to create, move and cancel session events on your calendar.
                  </li>
                  <li>
                    No attendee emails are shared with Google — the client joins via the link shown
                    inside Sathi.
                  </li>
                  <li>You can disconnect at any time; Sathi then revokes its access token.</li>
                </ul>
              </Card>
            </div>
          );
        }}
      </Loaded>
    </div>
  );
}
