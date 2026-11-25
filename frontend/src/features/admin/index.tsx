import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowRight, BadgeCheck, Building2, CalendarCheck2, CheckCircle2, ClipboardList, CreditCard, Download,
  FileCheck2, Flag, HeartHandshake, Inbox, ListChecks, Pencil, Plus, RefreshCw, Scale, Server, ShieldAlert, ShieldCheck, UserCog, Users,
} from 'lucide-react';
import {
  Badge, Button, Card, ChipSelect, DataTable, EmptyState, ErrorState, Input, LoadingBlock, Modal, Notice, PageHeader, Pagination,
  SearchInput, Select, Stat, StatusBadge, Tabs, Textarea, Toggle, cx, fmtDate, fmtDateTime, fmtMoney, label, useConfirm, useToast,
  type Column, type Tone,
} from '../../components/ui';
import { post, put, useAction, useApi, type Paged } from '../../hooks';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// =====================================================================================
// Shared helpers
// =====================================================================================

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Renders loading / error states for a query; returns children when data is present. */
function QueryGate<T>({ q, rows = 3, children }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; rows?: number; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <LoadingBlock rows={rows} />;
  if (q.error) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  if (q.data === undefined || q.data === null) return <EmptyState title="Nothing to show" />;
  return <>{children(q.data)}</>;
}

const SETTINGS_KEY = ['admin', 'settings'];
type Settings = Record<string, unknown>;

function useSaveSetting() {
  return useAction(({ key, value }: { key: string; value: unknown }) => put(`/admin/settings/${key}`, { value }), {
    invalidate: [SETTINGS_KEY], success: 'Setting saved',
  });
}

/** Fetch a verification document as a blob (auth header applied) and open or download it. */
async function openDocument(id: string, fileName: string, mimeType?: string) {
  const viewable = !!mimeType && (mimeType === 'application/pdf' || mimeType.startsWith('image/'));
  // Open the window synchronously so popup blockers allow it, then point it at the blob.
  const win = viewable ? window.open('', '_blank') : null;
  try {
    const r = await api.get(`/users/documents/${id}`, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data as Blob);
    if (win) {
      win.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

function DocList({ docs }: { docs: { id: string; fileName: string; mimeType?: string; uploadedAt: string }[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!docs.length) return <p className="text-sm text-amber-700">No documents uploaded.</p>;
  return (
    <ul className="space-y-1.5">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-700">{d.fileName}</span>
            <span className="text-xs text-slate-500">Uploaded {fmtDate(d.uploadedAt)}{d.mimeType ? ` · ${d.mimeType}` : ''}</span>
          </span>
          <Button size="sm" variant="outline" loading={busy === d.id} aria-label={`Open ${d.fileName}`}
            onClick={async () => {
              setBusy(d.id);
              try { await openDocument(d.id, d.fileName, d.mimeType); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(null); }
            }}>
            <Download className="size-3.5" /> Open
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Modal that collects a reason / note before running an action. */
function ReasonModal({ open, onClose, title, description, fieldLabel = 'Reason', required = true, minLength = 3, confirmLabel = 'Confirm', danger, loading, onSubmit, children }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; fieldLabel?: string; required?: boolean; minLength?: number;
  confirmLabel?: string; danger?: boolean; loading?: boolean; onSubmit: (reason: string) => void; children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setReason(''); setTouched(false); } }, [open]);
  const invalid = required && reason.trim().length < minLength;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!invalid) onSubmit(reason.trim());
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        {description && <div className="text-sm text-slate-600">{description}</div>}
        {children}
        <Textarea label={fieldLabel + (required ? '' : ' (optional)')} name="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
          error={touched && invalid ? `Please enter at least ${minLength} characters` : undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={loading}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

const Field = ({ k, children }: { k: string; children: ReactNode }) => (
  <div><dt className="text-xs font-medium text-slate-500">{k}</dt><dd className="text-sm text-slate-800">{children || <span className="text-slate-400">—</span>}</dd></div>
);
const chips = (xs?: string[] | null) => (xs?.length ? <span className="flex flex-wrap gap-1">{xs.map((x) => <Badge key={x} tone="slate">{label(x)}</Badge>)}</span> : null);

// =====================================================================================
// 1. Dashboard
// =====================================================================================

interface Analytics {
  users: number; byRole: Record<string, number>; verifiedCounselors: number; verifiedOrganizations: number;
  appointments: Record<string, number>; activeRelationships: number; programBookings: number; checkInsLast30Days: number;
  payments: { count: number; totalPaisa: number }; openModerationCases: number;
  pendingVerifications: { counselors: number; organizations: number }; signups: { day: string; count: number }[];
}
const CHART_COLORS = ['#0e8583', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f43f5e', '#64748b', '#10b981', '#ec4899'];

export function AdminHome() {
  const q = useApi<Analytics>(['admin', 'analytics'], '/admin/analytics');
  return (
    <div>
      <PageHeader title="Admin dashboard" subtitle="Platform health at a glance. Aggregates only — individual wellbeing records are never shown here." />
      <QueryGate q={q} rows={6}>{(a) => <Dashboard a={a} />}</QueryGate>
    </div>
  );
}

function Dashboard({ a }: { a: Analytics }) {
  const signups = useMemo(() => {
    const map = new Map(a.signups.map((s) => [new Date(s.day).toISOString().slice(0, 10), s.count]));
    const out: { day: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const k = d.toISOString().slice(0, 10);
      out.push({ day: k, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count: map.get(k) ?? 0 });
    }
    return out;
  }, [a.signups]);
  const roles = Object.entries(a.byRole).map(([role, count]) => ({ name: label(role), count }));
  const appts = Object.entries(a.appointments).map(([s, count]) => ({ name: label(s), count }));
  const pendingTotal = a.pendingVerifications.counselors + a.pendingVerifications.organizations;
  const totalSignups = signups.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-6">
      {(pendingTotal > 0 || a.openModerationCases > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {pendingTotal > 0 && (
            <Link to="/admin/verifications" className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 hover:bg-amber-100">
              <span className="flex items-center gap-3"><FileCheck2 className="size-5" /><span><b>{pendingTotal}</b> pending verification{pendingTotal === 1 ? '' : 's'} <span className="text-sm">({a.pendingVerifications.counselors} counselors · {a.pendingVerifications.organizations} organizations)</span></span></span>
              <ArrowRight className="size-4" />
            </Link>
          )}
          {a.openModerationCases > 0 && (
            <Link to="/admin/moderation" className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 hover:bg-rose-100">
              <span className="flex items-center gap-3"><Flag className="size-5" /><span><b>{a.openModerationCases}</b> moderation case{a.openModerationCases === 1 ? '' : 's'} awaiting human review</span></span>
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total users" value={a.users.toLocaleString()} icon={<Users className="size-5" />} hint={`${totalSignups} new in 30 days`} />
        <Stat label="Verified counselors" value={a.verifiedCounselors} icon={<BadgeCheck className="size-5" />} tone="sky" />
        <Stat label="Verified organizations" value={a.verifiedOrganizations} icon={<Building2 className="size-5" />} tone="violet" />
        <Stat label="Active relationships" value={a.activeRelationships} icon={<HeartHandshake className="size-5" />} />
        <Stat label="Program bookings" value={a.programBookings} icon={<CalendarCheck2 className="size-5" />} tone="sky" hint="Confirmed, attended or completed" />
        <Stat label="Check-ins (30 days)" value={a.checkInsLast30Days} icon={<Activity className="size-5" />} tone="violet" hint="Count only" />
        <Stat label="Payments collected" value={fmtMoney(a.payments.totalPaisa)} icon={<CreditCard className="size-5" />} tone="amber" hint={`${a.payments.count} successful payments`} />
        <Stat label="Open moderation cases" value={a.openModerationCases} icon={<Flag className="size-5" />} tone="rose" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Signups" subtitle="New accounts per day, last 30 days" className="lg:col-span-2">
          <div className="h-64" role="img" aria-label={`Signups per day chart, ${totalSignups} in the last 30 days`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={signups} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0e8583" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0e8583" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Signups" stroke="#0e8583" strokeWidth={2} fill="url(#signupFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Users by role">
          {roles.length ? (
            <div className="h-64" role="img" aria-label="Users by role chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roles} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Users" radius={[0, 6, 6, 0]}>{roles.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No users yet" />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Appointments by status" className="lg:col-span-2">
          {appts.length ? (
            <div className="h-64" role="img" aria-label="Appointments by status chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={appts} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Appointments" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No appointments yet" />}
        </Card>
        <Card title="Quick links" subtitle="Work queues">
          <nav className="space-y-1" aria-label="Admin queues">
            {[
              { to: '/admin/verifications', label: 'Verifications', icon: FileCheck2, count: pendingTotal },
              { to: '/admin/approvals', label: 'Listing approvals', icon: ListChecks },
              { to: '/admin/moderation', label: 'Moderation queue', icon: Flag, count: a.openModerationCases },
              { to: '/admin/payments', label: 'Payments & refunds', icon: CreditCard },
              { to: '/admin/users', label: 'User management', icon: Users },
              { to: '/admin/jobs', label: 'Background jobs', icon: Server },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                <span className="flex items-center gap-2.5"><l.icon className="size-4 text-slate-400" />{l.label}</span>
                <span className="flex items-center gap-2">{!!l.count && <Badge tone="amber">{l.count}</Badge>}<ArrowRight className="size-4 text-slate-300" /></span>
              </Link>
            ))}
          </nav>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================================
// 2. Users
// =====================================================================================

interface AdminUser {
  id: string; email: string; displayName: string; role: 'YOUTH' | 'COUNSELOR' | 'ORGANIZATION' | 'ADMIN'; status: string;
  emailVerifiedAt: string | null; createdAt: string; postingRestrictedUntil: string | null; moderationWarnings: number;
}
const ROLE_TONE: Record<string, Tone> = { YOUTH: 'brand', COUNSELOR: 'sky', ORGANIZATION: 'violet', ADMIN: 'amber' };

export function AdminUsers() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const qs = useDebounced(search.trim());
  useEffect(() => setPage(1), [qs, role, status]);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (qs) params.set('q', qs);
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  const q = useApi<Paged<AdminUser>>(['admin', 'users', page, qs, role, status], `/admin/users?${params}`);
  const [target, setTarget] = useState<{ user: AdminUser; status: 'ACTIVE' | 'SUSPENDED' } | null>(null);

  const setUserStatus = useAction((v: { id: string; status: string; reason: string }) => post(`/admin/users/${v.id}/status`, { status: v.status, reason: v.reason }), {
    invalidate: [['admin', 'users']], success: 'User status updated', onSuccess: () => setTarget(null),
  });
  const promote = useAction((id: string) => post(`/admin/users/${id}/role`, { role: 'ADMIN' }), { invalidate: [['admin', 'users']], success: 'User promoted to admin' });

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: (u) => <span className="font-medium text-slate-800">{u.displayName}</span> },
    { key: 'email', header: 'Email', render: (u) => <span className="break-all text-slate-600">{u.email}</span> },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]}>{label(u.role)}</Badge> },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'verified', header: 'Email verified', render: (u) => (u.emailVerifiedAt ? <Badge tone="green"><CheckCircle2 className="size-3" />Verified</Badge> : <Badge tone="slate">Unverified</Badge>) },
    { key: 'warn', header: 'Warnings', render: (u) => (u.moderationWarnings ? <Badge tone="amber">{u.moderationWarnings}</Badge> : <span className="text-slate-400">0</span>) },
    { key: 'restrict', header: 'Posting restricted until', render: (u) => (u.postingRestrictedUntil && new Date(u.postingRestrictedUntil) > new Date() ? <span className="text-amber-700">{fmtDateTime(u.postingRestrictedUntil)}</span> : <span className="text-slate-400">—</span>) },
    { key: 'joined', header: 'Joined', render: (u) => fmtDate(u.createdAt) },
    {
      key: 'actions', header: 'Actions', className: 'text-right', render: (u) => {
        if (u.id === me?.id) return <span className="text-xs text-slate-400">You</span>;
        if (u.status === 'DELETED') return <span className="text-xs text-slate-400">Deleted</span>;
        return (
          <div className="flex justify-end gap-1.5">
            {u.status === 'ACTIVE'
              ? <Button size="sm" variant="outline" className="text-rose-700" onClick={() => setTarget({ user: u, status: 'SUSPENDED' })}>Suspend</Button>
              : <Button size="sm" variant="outline" onClick={() => setTarget({ user: u, status: 'ACTIVE' })}>Activate</Button>}
            {u.role !== 'YOUTH' && u.role !== 'ADMIN' && (
              <Button size="sm" variant="ghost" loading={promote.isPending && promote.variables === u.id} title="Promote to admin"
                onClick={async () => {
                  if (await confirm({ title: 'Promote to admin?', message: `${u.displayName} will gain full administrative access to Sathi, including user management, verification and moderation. This change is audited.`, confirmLabel: 'Promote', danger: true })) promote.mutate(u.id);
                }}>
                <UserCog className="size-3.5" /> Promote
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Users" subtitle="Search, filter and manage account status. All changes are recorded in the audit log." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email" />
          <Select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: '', label: 'All roles' }, ...['YOUTH', 'COUNSELOR', 'ORGANIZATION', 'ADMIN'].map((r) => ({ value: r, label: label(r) }))]} />
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...['ACTIVE', 'SUSPENDED', 'DELETED'].map((r) => ({ value: r, label: label(r) }))]} />
        </div>
        {q.error ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            {q.data && <p className="mb-2 text-xs text-slate-500">{q.data.total.toLocaleString()} user{q.data.total === 1 ? '' : 's'}</p>}
            <DataTable columns={columns} rows={q.data?.items} rowKey={(u) => u.id} loading={q.isLoading} empty="No users match these filters" />
            <Pagination page={page} pages={q.data?.pages ?? 1} onChange={setPage} />
          </>
        )}
      </Card>
      <ReasonModal open={!!target} onClose={() => setTarget(null)} loading={setUserStatus.isPending}
        title={target?.status === 'SUSPENDED' ? `Suspend ${target.user.displayName}` : `Reactivate ${target?.user.displayName ?? ''}`}
        description={target?.status === 'SUSPENDED'
          ? 'Suspending signs the user out of all sessions and blocks access until reactivated. Record why — this is stored in the audit log.'
          : 'The user will be able to sign in again. Record why — this is stored in the audit log.'}
        confirmLabel={target?.status === 'SUSPENDED' ? 'Suspend account' : 'Activate account'} danger={target?.status === 'SUSPENDED'}
        onSubmit={(reason) => target && setUserStatus.mutate({ id: target.user.id, status: target.status, reason })} />
    </div>
  );
}

// =====================================================================================
// 3. Verifications
// =====================================================================================

type Doc = { id: string; fileName: string; mimeType: string; uploadedAt: string };
interface CounselorV {
  id: string; qualifications: string; experienceYears: number; bio: string | null; specializations: string[]; supportedConcerns: string[];
  languages: string[]; ageGroups: string[]; locationArea: string | null; mode: string; sessionFeePaisa: number; verificationStatus: string;
  rejectionReason: string | null; user: { displayName: string; email: string; createdAt: string }; documents: Doc[];
}
interface OrgV {
  id: string; name: string; description: string | null; contactEmail: string; contactPhone: string | null; locationArea: string | null;
  languages: string[]; operatingHours: string | null; verificationStatus: string; rejectionReason: string | null; createdAt: string; documents: Doc[];
}
type VStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function AdminVerifications() {
  const [status, setStatus] = useState<VStatus>('PENDING');
  const q = useApi<{ counselors: CounselorV[]; organizations: OrgV[] }>(['admin', 'verifications', status], `/admin/verifications?status=${status}`);
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<{ kind: 'counselor' | 'organization'; id: string; name: string } | null>(null);
  const decide = useAction((v: { kind: string; id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) => post(`/admin/verifications/${v.kind}/${v.id}`, { decision: v.decision, reason: v.reason }), {
    invalidate: [['admin', 'verifications'], ['admin', 'analytics']], success: (r) => ((r as { status: string }).status === 'APPROVED' ? 'Verification approved' : 'Verification rejected'), onSuccess: () => setRejecting(null),
  });
  const approve = async (kind: 'counselor' | 'organization', id: string, name: string) => {
    if (await confirm({ title: `Approve ${name}?`, message: kind === 'counselor' ? 'This counselor will become visible in matching and can accept bookings. Make sure credentials have been checked.' : 'This organization will be able to publish programs and services once approved.', confirmLabel: 'Approve' })) {
      decide.mutate({ kind, id, decision: 'APPROVED' });
    }
  };
  const Actions = ({ kind, id, name, current }: { kind: 'counselor' | 'organization'; id: string; name: string; current: string }) => (
    <div className="flex flex-wrap gap-2">
      {current !== 'APPROVED' && <Button size="sm" loading={decide.isPending && decide.variables?.id === id && decide.variables.decision === 'APPROVED'} onClick={() => approve(kind, id, name)}><ShieldCheck className="size-3.5" />Approve</Button>}
      {current !== 'REJECTED' && <Button size="sm" variant="outline" className="text-rose-700" onClick={() => setRejecting({ kind, id, name })}>{current === 'APPROVED' ? 'Revoke' : 'Reject'}</Button>}
    </div>
  );

  return (
    <div>
      <PageHeader title="Verifications" subtitle="Review counselor credentials and organization registration documents." />
      <Tabs value={status} onChange={setStatus} tabs={[
        { value: 'PENDING', label: 'Pending', count: status === 'PENDING' && q.data ? q.data.counselors.length + q.data.organizations.length : undefined },
        { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' },
      ]} />
      <QueryGate q={q}>{(d) => (
        <div className="space-y-8">
          <section aria-labelledby="v-counselors">
            <h2 id="v-counselors" className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><BadgeCheck className="size-4" /> Counselors <Badge tone="slate">{d.counselors.length}</Badge></h2>
            {!d.counselors.length ? <Card><EmptyState title={`No ${status.toLowerCase()} counselors`} /></Card> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {d.counselors.map((c) => (
                  <Card key={c.id} title={c.user.displayName} subtitle={`${c.user.email} · joined ${fmtDate(c.user.createdAt)}`} action={<StatusBadge status={c.verificationStatus} />}>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Field k="Qualifications">{c.qualifications}</Field>
                      <Field k="Experience">{c.experienceYears} year{c.experienceYears === 1 ? '' : 's'}</Field>
                      <Field k="Specializations">{chips(c.specializations)}</Field>
                      <Field k="Supported concerns">{chips(c.supportedConcerns)}</Field>
                      <Field k="Languages">{chips(c.languages)}</Field>
                      <Field k="Age groups">{chips(c.ageGroups)}</Field>
                      <Field k="Mode">{label(c.mode)}</Field>
                      <Field k="Location">{c.locationArea}</Field>
                      <Field k="Session fee">{fmtMoney(c.sessionFeePaisa)}</Field>
                    </dl>
                    {c.bio && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-600">{c.bio}</p>}
                    {c.rejectionReason && <div className="mt-3"><Notice tone="rose">Rejection reason: {c.rejectionReason}</Notice></div>}
                    <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Documents</h3>
                    <DocList docs={c.documents} />
                    <div className="mt-4 border-t border-slate-100 pt-4"><Actions kind="counselor" id={c.id} name={c.user.displayName} current={c.verificationStatus} /></div>
                  </Card>
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="v-orgs">
            <h2 id="v-orgs" className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><Building2 className="size-4" /> Organizations <Badge tone="slate">{d.organizations.length}</Badge></h2>
            {!d.organizations.length ? <Card><EmptyState title={`No ${status.toLowerCase()} organizations`} /></Card> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {d.organizations.map((o) => (
                  <Card key={o.id} title={o.name} subtitle={`Registered ${fmtDate(o.createdAt)}`} action={<StatusBadge status={o.verificationStatus} />}>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Field k="Contact email">{o.contactEmail}</Field>
                      <Field k="Contact phone">{o.contactPhone}</Field>
                      <Field k="Location">{o.locationArea}</Field>
                      <Field k="Operating hours">{o.operatingHours}</Field>
                      <Field k="Languages">{chips(o.languages)}</Field>
                    </dl>
                    {o.description && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-600">{o.description}</p>}
                    {o.rejectionReason && <div className="mt-3"><Notice tone="rose">Rejection reason: {o.rejectionReason}</Notice></div>}
                    <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Documents</h3>
                    <DocList docs={o.documents} />
                    <div className="mt-4 border-t border-slate-100 pt-4"><Actions kind="organization" id={o.id} name={o.name} current={o.verificationStatus} /></div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}</QueryGate>
      <ReasonModal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.name ?? ''}`} danger confirmLabel="Reject verification"
        description="The applicant will be notified and can see this reason. Be specific about what needs to change." loading={decide.isPending}
        onSubmit={(reason) => rejecting && decide.mutate({ kind: rejecting.kind, id: rejecting.id, decision: 'REJECTED', reason })} />
    </div>
  );
}

// =====================================================================================
// 4. Program / service approvals
// =====================================================================================

interface OrgRef { name: string; verificationStatus: string }
interface ProgramA { id: string; title: string; description: string; category: string; startsAt: string; endsAt: string; seats: number; minAge: number | null; maxAge: number | null; eligibility: string | null; locationArea: string | null; mode: string; costPaisa: number; requirements: string | null; createdAt: string; organization: OrgRef }
interface ServiceA { id: string; title: string; description: string; category: string; durationMin: number; capacity: number; locationArea: string | null; mode: string; costPaisa: number; organization: OrgRef }

export function AdminApprovals() {
  const q = useApi<{ programs: ProgramA[]; services: ServiceA[] }>(['admin', 'approvals'], '/admin/approvals');
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<{ kind: 'program' | 'service'; id: string; title: string } | null>(null);
  const decide = useAction((v: { kind: string; id: string; decision: 'PUBLISHED' | 'REJECTED'; reason?: string }) => post(`/admin/approvals/${v.kind}/${v.id}`, { decision: v.decision, reason: v.reason }), {
    invalidate: [['admin', 'approvals']], success: (r) => ((r as { status: string }).status === 'PUBLISHED' ? 'Listing published' : 'Listing rejected'), onSuccess: () => setRejecting(null),
  });
  const publish = async (kind: 'program' | 'service', id: string, title: string, org: OrgRef) => {
    const warn = org.verificationStatus !== 'APPROVED' ? ` Warning: ${org.name} is not a verified organization (${label(org.verificationStatus)}).` : '';
    if (await confirm({ title: `Publish "${title}"?`, message: `It will become visible to youth on Sathi.${warn}`, confirmLabel: 'Publish', danger: !!warn })) decide.mutate({ kind, id, decision: 'PUBLISHED' });
  };
  const OrgLine = ({ org }: { org: OrgRef }) => (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600"><Building2 className="size-4 text-slate-400" />{org.name}<StatusBadge status={org.verificationStatus} /></div>
  );
  const Footer = ({ kind, id, title, org }: { kind: 'program' | 'service'; id: string; title: string; org: OrgRef }) => (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
      <Button size="sm" loading={decide.isPending && decide.variables?.id === id && decide.variables.decision === 'PUBLISHED'} onClick={() => publish(kind, id, title, org)}>Publish</Button>
      <Button size="sm" variant="outline" className="text-rose-700" onClick={() => setRejecting({ kind, id, title })}>Reject</Button>
    </div>
  );
  return (
    <div>
      <PageHeader title="Listing approvals" subtitle="Programs and services submitted by organizations wait here before they are visible to youth." />
      <QueryGate q={q}>{(d) => (
        <div className="space-y-8">
          <section aria-labelledby="ap-programs">
            <h2 id="ap-programs" className="mb-3 flex items-center gap-2 font-semibold text-slate-800">Programs <Badge tone="slate">{d.programs.length}</Badge></h2>
            {!d.programs.length ? <Card><EmptyState title="No programs awaiting approval" /></Card> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {d.programs.map((p) => (
                  <Card key={p.id} title={p.title} subtitle={`${label(p.category)} · submitted ${fmtDate(p.createdAt)}`} action={<StatusBadge status="PENDING_APPROVAL" />}>
                    <OrgLine org={p.organization} />
                    {p.organization.verificationStatus !== 'APPROVED' && <div className="mb-3"><Notice tone="amber">This organization is not verified yet. Consider verifying it before publishing its listings.</Notice></div>}
                    <p className="mb-3 text-sm whitespace-pre-line text-slate-600">{p.description}</p>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Field k="Dates">{fmtDateTime(p.startsAt)} → {fmtDateTime(p.endsAt)}</Field>
                      <Field k="Seats">{p.seats}</Field>
                      <Field k="Mode">{label(p.mode)}</Field>
                      <Field k="Location">{p.locationArea}</Field>
                      <Field k="Cost">{fmtMoney(p.costPaisa)}</Field>
                      <Field k="Age range">{p.minAge || p.maxAge ? `${p.minAge ?? '—'} – ${p.maxAge ?? '—'}` : null}</Field>
                      <Field k="Eligibility">{p.eligibility}</Field>
                      <Field k="Requirements">{p.requirements}</Field>
                    </dl>
                    <Footer kind="program" id={p.id} title={p.title} org={p.organization} />
                  </Card>
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="ap-services">
            <h2 id="ap-services" className="mb-3 flex items-center gap-2 font-semibold text-slate-800">Services <Badge tone="slate">{d.services.length}</Badge></h2>
            {!d.services.length ? <Card><EmptyState title="No services awaiting approval" /></Card> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {d.services.map((s) => (
                  <Card key={s.id} title={s.title} subtitle={label(s.category)} action={<StatusBadge status="PENDING_APPROVAL" />}>
                    <OrgLine org={s.organization} />
                    {s.organization.verificationStatus !== 'APPROVED' && <div className="mb-3"><Notice tone="amber">This organization is not verified yet. Consider verifying it before publishing its listings.</Notice></div>}
                    <p className="mb-3 text-sm whitespace-pre-line text-slate-600">{s.description}</p>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Field k="Duration">{s.durationMin} min</Field>
                      <Field k="Capacity">{s.capacity}</Field>
                      <Field k="Mode">{label(s.mode)}</Field>
                      <Field k="Location">{s.locationArea}</Field>
                      <Field k="Cost">{fmtMoney(s.costPaisa)}</Field>
                    </dl>
                    <Footer kind="service" id={s.id} title={s.title} org={s.organization} />
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}</QueryGate>
      <ReasonModal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject "${rejecting?.title ?? ''}"`} danger confirmLabel="Reject listing"
        description="The organization will be notified. Explain what needs to change before it can be published." loading={decide.isPending}
        onSubmit={(reason) => rejecting && decide.mutate({ kind: rejecting.kind, id: rejecting.id, decision: 'REJECTED', reason })} />
    </div>
  );
}

// =====================================================================================
// 5. Moderation workspace
// =====================================================================================

type ModView = 'review' | 'safety' | 'appeals' | 'spam' | 'bullying' | 'resolved';
interface Appeal { id: string; message: string; status: string; createdAt: string; decidedAt: string | null }
interface ModCase {
  id: string; targetType: string; targetId: string; categories: string[]; maxScore: number; scores: Record<string, number>; reasons: string[];
  outcome: string; provider: string; safetyEscalated: boolean; needsHumanReview: boolean; resolvedAt: string | null; createdAt: string;
  originalText: string; appeals: Appeal[]; openReports?: number;
}
interface CaseDetail {
  case: ModCase & { actions: { id: string; action: string; note: string | null; createdAt: string }[] };
  content: { status: string; body: string; pseudonym: string } | null;
  author: { status?: string; moderationWarnings?: number; postingRestrictedUntil?: string | null; createdAt?: string; priorCases: { outcome: string; _count: number }[] };
  reports: { reason: string; details: string | null; createdAt: string; resolution: string | null }[];
}
const severity = (s: number): { label: string; tone: Tone } => (s >= 0.85 ? { label: 'High', tone: 'rose' } : s >= 0.5 ? { label: 'Medium', tone: 'amber' } : { label: 'Low', tone: 'slate' });
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function AdminModeration() {
  const [view, setView] = useState<ModView>('review');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useApi<Paged<ModCase>>(['admin', 'mod-queue', view, page], `/admin/moderation/queue?view=${view}&page=${page}&pageSize=20`);
  const changeView = (v: ModView) => { setView(v); setPage(1); };

  return (
    <div>
      <PageHeader title="Moderation" subtitle="Automated screening flags content; final decisions on accounts are always made by a human moderator." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          <Tabs value={view} onChange={changeView} tabs={[
            { value: 'review', label: 'Needs review' }, { value: 'safety', label: 'Safety' }, { value: 'appeals', label: 'Appeals' },
            { value: 'spam', label: 'Spam & links' }, { value: 'bullying', label: 'Bullying & hate' }, { value: 'resolved', label: 'Resolved' },
          ]} />
          {view === 'safety' && <div className="mb-4"><Notice tone="rose">Safety-escalated cases may indicate someone at risk. Review these first and follow the platform's safety escalation procedure.</Notice></div>}
          {q.isLoading ? <LoadingBlock rows={5} /> : q.error ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !q.data?.items.length ? (
            <Card><EmptyState title="Queue is clear" hint="No cases in this view right now." icon={<CheckCircle2 className="size-6" />} /></Card>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">{q.data.total} case{q.data.total === 1 ? '' : 's'}</p>
              <ul className="space-y-3">
                {q.data.items.map((c) => <QueueItem key={c.id} c={c} onOpen={() => setSelected(c.id)} />)}
              </ul>
              <Pagination page={page} pages={q.data.pages} onChange={setPage} />
            </>
          )}
        </div>
        <ModerationSettings />
      </div>
      {selected && <CaseModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function QueueItem({ c, onOpen }: { c: ModCase; onOpen: () => void }) {
  const sev = severity(c.maxScore);
  const openAppeal = c.appeals.some((a) => a.status === 'OPEN');
  return (
    <li>
      <button type="button" onClick={onOpen} className={cx('w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-brand-300 hover:shadow', c.safetyEscalated ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200/70')}>
        <div className="flex flex-wrap items-center gap-2">
          {c.safetyEscalated && <Badge tone="rose"><ShieldAlert className="size-3" />Safety escalation</Badge>}
          <Badge tone={sev.tone}>{sev.label} severity</Badge>
          <span className="text-xs text-slate-500">Confidence {pct(c.maxScore)}</span>
          <Badge tone="slate">{label(c.targetType)}</Badge>
          <StatusBadge status={c.outcome} />
          {!!c.openReports && <Badge tone="amber"><Flag className="size-3" />{c.openReports} open report{c.openReports === 1 ? '' : 's'}</Badge>}
          {openAppeal && <Badge tone="violet"><Scale className="size-3" />Open appeal</Badge>}
          {c.resolvedAt && <Badge tone="green">Resolved {fmtDate(c.resolvedAt)}</Badge>}
          <span className="ml-auto text-xs text-slate-400">{fmtDateTime(c.createdAt)}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-slate-700">{c.originalText}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.categories.map((cat) => <Badge key={cat} tone="rose">{label(cat)}</Badge>)}
          {c.reasons.slice(0, 3).map((r, i) => <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r}</span>)}
          {c.reasons.length > 3 && <span className="text-xs text-slate-400">+{c.reasons.length - 3} more</span>}
        </div>
      </button>
    </li>
  );
}

type ModAction = 'APPROVE' | 'REMOVE' | 'RESTORE' | 'WARN' | 'RESTRICT' | 'SUSPEND' | 'ESCALATE' | 'DISMISS_REPORT' | 'APPEAL_UPHELD' | 'APPEAL_DENIED';
const ACTION_INFO: Record<ModAction, { label: string; confirm: string; danger?: boolean }> = {
  APPROVE: { label: 'Approve content', confirm: 'Content will be visible, open reports dismissed, and the case resolved.' },
  REMOVE: { label: 'Remove content', confirm: 'Content will be removed from the community, reports marked actioned, and the case resolved.', danger: true },
  RESTORE: { label: 'Restore content', confirm: 'Content will be visible again and the case resolved.' },
  WARN: { label: 'Warn author', confirm: 'The author receives a community guidelines reminder and their warning count increases.' },
  RESTRICT: { label: 'Restrict posting', confirm: 'The author will be temporarily unable to post in the community. All other Sathi features remain available.', danger: true },
  SUSPEND: { label: 'Suspend account', confirm: '', danger: true },
  ESCALATE: { label: 'Escalate for safety review', confirm: 'The case will be flagged as a safety escalation and kept in the safety queue for priority review.' },
  DISMISS_REPORT: { label: 'Dismiss reports', confirm: 'Open reports will be dismissed, the content approved, and the case resolved.' },
  APPEAL_UPHELD: { label: 'Uphold appeal', confirm: "The author's appeal is accepted, content becomes visible again, and the author is notified." },
  APPEAL_DENIED: { label: 'Deny appeal', confirm: 'The original decision is kept and the author is notified.', danger: true },
};

function CaseModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useApi<CaseDetail>(['admin', 'mod-case', id], `/admin/moderation/cases/${id}`);
  const confirm = useConfirm();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [days, setDays] = useState(3);
  const act = useAction((v: { action: ModAction; note?: string; restrictDays?: number }) => post(`/admin/moderation/cases/${id}/action`, v), {
    invalidate: [['admin', 'mod-queue'], ['admin', 'mod-case', id], ['admin', 'analytics']], success: 'Moderation action recorded', onSuccess: () => setNote(''),
  });
  const run = async (action: ModAction) => {
    const info = ACTION_INFO[action];
    const n = note.trim();
    if (action === 'SUSPEND') {
      if (n.length < 3) { toast('A moderator note is required to suspend an account', 'error'); return; }
      const ok = await confirm({ title: 'Suspend this account?', danger: true, confirmLabel: 'Suspend account',
        message: 'This is a human decision, not an automated one. The author will be signed out everywhere and unable to use any part of Sathi — including counseling support — until an admin reactivates them. Only suspend for serious or repeated violations, and make sure your note explains why.' });
      if (ok) act.mutate({ action, note: n });
      return;
    }
    if (action === 'RESTRICT' && (!Number.isInteger(days) || days < 1 || days > 90)) { toast('Restriction must be 1–90 days', 'error'); return; }
    const ok = await confirm({ title: `${info.label}?`, message: action === 'RESTRICT' ? `${info.confirm} Duration: ${days} day${days === 1 ? '' : 's'}.` : info.confirm, confirmLabel: info.label, danger: info.danger });
    if (ok) act.mutate({ action, note: n || undefined, restrictDays: action === 'RESTRICT' ? days : undefined });
  };

  return (
    <Modal open onClose={onClose} title="Moderation case" wide>
      <QueryGate q={q} rows={5}>{(d) => {
        const c = d.case;
        const sev = severity(c.maxScore);
        const openAppeal = c.appeals.find((a) => a.status === 'OPEN');
        const scores = Object.entries(c.scores ?? {}).sort((a, b) => b[1] - a[1]);
        const restricted = d.author.postingRestrictedUntil && new Date(d.author.postingRestrictedUntil) > new Date();
        const btn = (a: ModAction, variant: 'primary' | 'outline' | 'danger' | 'soft' = 'outline') => (
          <Button size="sm" variant={variant} loading={act.isPending && act.variables?.action === a} disabled={act.isPending} onClick={() => run(a)}>{ACTION_INFO[a].label}</Button>
        );
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {c.safetyEscalated && <Badge tone="rose"><ShieldAlert className="size-3" />Safety escalation</Badge>}
              <Badge tone={sev.tone}>{sev.label} severity · {pct(c.maxScore)}</Badge>
              <Badge tone="slate">{label(c.targetType)}</Badge>
              <span className="text-xs text-slate-500">Automated outcome:</span><StatusBadge status={c.outcome} />
              {c.resolvedAt ? <Badge tone="green">Resolved {fmtDateTime(c.resolvedAt)}</Badge> : c.needsHumanReview && <Badge tone="amber">Needs human review</Badge>}
              <span className="ml-auto text-xs text-slate-400">Provider: {c.provider} · {fmtDateTime(c.createdAt)}</span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Evidence (original text)</h3>
                  <blockquote className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800">{c.originalText}</blockquote>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Current content</h3>
                  {d.content ? (
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500"><span>Posted as <b className="text-slate-700">{d.content.pseudonym}</b></span><StatusBadge status={d.content.status} /></div>
                      <p className="max-h-32 overflow-y-auto text-sm whitespace-pre-wrap text-slate-700">{d.content.body}</p>
                    </div>
                  ) : <p className="text-sm text-slate-500">Content no longer exists.</p>}
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Category scores</h3>
                  {scores.length ? (
                    <ul className="space-y-2">
                      {scores.map(([cat, s]) => (
                        <li key={cat}>
                          <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-700">{label(cat)}</span><span className="tabular-nums text-slate-500">{pct(s)}</span></div>
                          <div className="h-2 rounded-full bg-slate-100" role="meter" aria-label={`${label(cat)} score`} aria-valuenow={Math.round(s * 100)} aria-valuemin={0} aria-valuemax={100}>
                            <div className={cx('h-2 rounded-full', s >= 0.85 ? 'bg-rose-500' : s >= 0.5 ? 'bg-amber-500' : 'bg-slate-400')} style={{ width: `${Math.min(100, s * 100)}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-slate-500">No scores recorded.</p>}
                </section>
                {!!c.reasons.length && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Detection reasons</h3>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </section>
                )}
              </div>

              <div className="space-y-4">
                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Author summary</h3>
                  <p className="mb-2 text-xs text-slate-500">Pseudonymous — identity and wellbeing data are not shown.</p>
                  <dl className="grid grid-cols-2 gap-2">
                    <Field k="Account">{d.author.status && <StatusBadge status={d.author.status} />}</Field>
                    <Field k="Warnings">{String(d.author.moderationWarnings ?? 0)}</Field>
                    <Field k="Posting">{restricted ? <span className="text-amber-700">Restricted until {fmtDateTime(d.author.postingRestrictedUntil!)}</span> : 'Allowed'}</Field>
                    <Field k="Member since">{d.author.createdAt && fmtDate(d.author.createdAt)}</Field>
                  </dl>
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-500">Prior cases</p>
                    {d.author.priorCases.length ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">{d.author.priorCases.map((p) => <Badge key={p.outcome} tone="slate">{label(p.outcome)}: {p._count}</Badge>)}</div>
                    ) : <p className="text-sm text-slate-600">None</p>}
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Reports ({d.reports.length})</h3>
                  {d.reports.length ? (
                    <ul className="max-h-40 space-y-2 overflow-y-auto">
                      {d.reports.map((r, i) => (
                        <li key={i} className="rounded-lg bg-slate-50 p-2 text-sm">
                          <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-700">{label(r.reason)}</span><span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span></div>
                          {r.details && <p className="text-slate-600">{r.details}</p>}
                          {r.resolution ? <Badge tone="slate">{label(r.resolution)}</Badge> : <Badge tone="amber">Open</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-slate-500">No user reports.</p>}
                </section>
                {!!c.appeals.length && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Appeals</h3>
                    <ul className="space-y-2">
                      {c.appeals.map((a) => (
                        <li key={a.id} className="rounded-lg border border-violet-200 bg-violet-50/50 p-2 text-sm">
                          <div className="flex items-center justify-between gap-2"><Badge tone={a.status === 'OPEN' ? 'violet' : a.status === 'UPHELD' ? 'green' : 'slate'}>{label(a.status)}</Badge><span className="text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span></div>
                          <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.message}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Action history</h3>
                  {c.actions.length ? (
                    <ol className="space-y-1.5">
                      {c.actions.map((a) => (
                        <li key={a.id} className="text-sm">
                          <span className="font-medium text-slate-700">{ACTION_INFO[a.action as ModAction]?.label ?? label(a.action)}</span>
                          <span className="text-xs text-slate-400"> · {fmtDateTime(a.createdAt)}</span>
                          {a.note && <p className="text-xs text-slate-600">“{a.note}”</p>}
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-slate-500">No moderator actions yet.</p>}
                </section>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="mb-3 font-semibold text-slate-800">Moderator actions</h3>
              <Textarea label="Moderator note" name="mod-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} hint="Recorded with the action. Required for account suspension." />
              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Content</p>
                  <div className="flex flex-wrap gap-2">{btn('APPROVE', 'primary')}{btn('REMOVE', 'danger')}{btn('RESTORE')}{btn('DISMISS_REPORT')}</div>
                </div>
                {openAppeal && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Open appeal</p>
                    <div className="flex flex-wrap gap-2">{btn('APPEAL_UPHELD', 'soft')}{btn('APPEAL_DENIED')}</div>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Author</p>
                  <div className="flex flex-wrap items-end gap-2">
                    {btn('WARN')}
                    <div className="flex items-end gap-1.5">
                      <label className="text-xs text-slate-600">
                        <span className="mb-0.5 block">Days</span>
                        <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" aria-label="Restriction days" />
                      </label>
                      {btn('RESTRICT')}
                    </div>
                    {btn('SUSPEND', 'danger')}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Safety</p>
                  <div className="flex flex-wrap gap-2">{!c.safetyEscalated ? btn('ESCALATE') : <span className="text-sm text-rose-700">Already escalated for safety review.</span>}</div>
                </div>
              </div>
            </section>
          </div>
        );
      }}</QueryGate>
    </Modal>
  );
}

function ModerationSettings() {
  const q = useApi<Settings>(SETTINGS_KEY, '/admin/settings');
  return (
    <Card title="Moderation settings" subtitle="Changes apply to new content and are audited">
      <QueryGate q={q}>{(s) => <ModerationSettingsForm key={JSON.stringify([s['moderation.thresholds'], s['moderation.extraTerms'], s['moderation.reportsToFlag'], s['moderation.retentionDays']])} s={s} />}</QueryGate>
    </Card>
  );
}

function ModerationSettingsForm({ s }: { s: Settings }) {
  const save = useSaveSetting();
  const t0 = (s['moderation.thresholds'] ?? { hold: 0.5, hide: 0.85, reject: 0.9 }) as { hold: number; hide: number; reject: number };
  const [t, setT] = useState(t0);
  const [terms, setTerms] = useState<string[]>((s['moderation.extraTerms'] as string[]) ?? []);
  const [termInput, setTermInput] = useState('');
  const [reports, setReports] = useState(Number(s['moderation.reportsToFlag'] ?? 3));
  const [retention, setRetention] = useState(Number(s['moderation.retentionDays'] ?? 365));
  const tValid = 0 < t.hold && t.hold < t.hide && t.hide <= t.reject && t.reject <= 1;
  const addTerms = () => {
    const add = termInput.split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2 && x.length <= 60 && !terms.includes(x));
    if (add.length) setTerms([...terms, ...add]);
    setTermInput('');
  };
  const savingKey = save.isPending ? save.variables?.key : null;
  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); if (tValid) save.mutate({ key: 'moderation.thresholds', value: t }); }} className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Score thresholds</h3>
        <div className="grid grid-cols-3 gap-2">
          {(['hold', 'hide', 'reject'] as const).map((k) => (
            <Input key={k} label={label(k)} name={`t-${k}`} type="number" step={0.01} min={0} max={1} value={t[k]} onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })} />
          ))}
        </div>
        <p className={cx('text-xs', tValid ? 'text-slate-500' : 'text-rose-600')} role={tValid ? undefined : 'alert'}>Must satisfy 0 &lt; hold &lt; hide ≤ reject ≤ 1. Hold queues for review, hide removes from view pending review, reject blocks automatically.</p>
        <Button type="submit" size="sm" disabled={!tValid} loading={savingKey === 'moderation.thresholds'}>Save thresholds</Button>
      </form>

      <div className="space-y-2 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">Extra blocked terms</h3>
        <div className="flex gap-2">
          <input value={termInput} onChange={(e) => setTermInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerms(); } }}
            placeholder="Add term(s), comma-separated" aria-label="Add blocked terms" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <Button size="sm" variant="outline" onClick={addTerms} aria-label="Add terms"><Plus className="size-4" /></Button>
        </div>
        {terms.length ? (
          <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {terms.map((x) => (
              <li key={x}><button type="button" onClick={() => setTerms(terms.filter((y) => y !== x))} aria-label={`Remove ${x}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700">{x} ×</button></li>
            ))}
          </ul>
        ) : <p className="text-xs text-slate-500">No extra terms.</p>}
        <Button size="sm" loading={savingKey === 'moderation.extraTerms'} onClick={() => save.mutate({ key: 'moderation.extraTerms', value: terms })}>Save terms</Button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ key: 'moderation.reportsToFlag', value: reports }); }} className="space-y-2 border-t border-slate-100 pt-5">
        <Input label="Reports to flag content" name="reportsToFlag" type="number" min={1} max={50} value={reports} onChange={(e) => setReports(Number(e.target.value))} hint="Number of user reports that sends content to review (1–50)." />
        <Button type="submit" size="sm" disabled={!Number.isInteger(reports) || reports < 1 || reports > 50} loading={savingKey === 'moderation.reportsToFlag'}>Save</Button>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ key: 'moderation.retentionDays', value: retention }); }} className="space-y-2 border-t border-slate-100 pt-5">
        <Input label="Evidence retention (days)" name="retentionDays" type="number" min={30} max={3650} value={retention} onChange={(e) => setRetention(Number(e.target.value))} hint="How long case evidence is kept (30–3650)." />
        <Button type="submit" size="sm" disabled={!Number.isInteger(retention) || retention < 30 || retention > 3650} loading={savingKey === 'moderation.retentionDays'}>Save</Button>
      </form>
    </div>
  );
}

// =====================================================================================
// 6. Resources & safety resources
// =====================================================================================

interface Category { id: string; name: string }
interface Resource { id: string; categoryId: string; title: string; body: string; contentType: string; url: string | null; language: string; status: string; createdAt: string; category: Category }
interface SafetyRes { id: string; title: string; phone: string | null; url: string | null; details: string; language: string; approved: boolean; order?: number }
const CONTENT_TYPES = ['ARTICLE', 'GUIDE', 'VIDEO', 'AWARENESS', 'SUPPORT', 'SAFETY'];
const LANGS = [{ value: 'en', label: 'English' }, { value: 'ne', label: 'Nepali' }];

export function AdminResources() {
  const q = useApi<{ resources: Resource[]; categories: Category[] }>(['admin', 'resources'], '/admin/resources');
  const sq = useApi<SafetyRes[]>(['admin', 'safety-resources'], '/safety/resources');
  const summary = useApi<{ screenings30d: number; escalated30d: number }>(['admin', 'safety-summary'], '/admin/safety/summary');
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const [editingSafety, setEditingSafety] = useState<SafetyRes | 'new' | null>(null);
  const [catName, setCatName] = useState('');
  const [filter, setFilter] = useState('');
  const addCat = useAction((name: string) => post('/admin/resource-categories', { name }), { invalidate: [['admin', 'resources']], success: 'Category added', onSuccess: () => setCatName('') });

  const rows = (q.data?.resources ?? []).filter((r) => !filter || r.title.toLowerCase().includes(filter.toLowerCase()) || r.category.name.toLowerCase().includes(filter.toLowerCase()));
  const columns: Column<Resource>[] = [
    { key: 'title', header: 'Title', render: (r) => <div><p className="font-medium text-slate-800">{r.title}</p>{r.url && <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-xs break-all text-brand-700 hover:underline">{r.url}</a>}</div> },
    { key: 'cat', header: 'Category', render: (r) => r.category.name },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={r.contentType === 'SAFETY' ? 'rose' : 'sky'}>{label(r.contentType)}</Badge> },
    { key: 'lang', header: 'Language', render: (r) => r.language.toUpperCase() },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created', header: 'Created', render: (r) => fmtDate(r.createdAt) },
    { key: 'edit', header: '', className: 'text-right', render: (r) => <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.title}`}><Pencil className="size-3.5" />Edit</Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Resources" subtitle="Self-help content and crisis/safety contacts shown to users."
        action={<Button onClick={() => setEditing('new')} disabled={!q.data?.categories.length}><Plus className="size-4" />New resource</Button>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card title="Library">
          {q.error ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
            <>
              <div className="mb-3"><SearchInput value={filter} onChange={setFilter} placeholder="Filter by title or category" /></div>
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={q.isLoading} empty="No resources yet" />
            </>
          )}
        </Card>
        <Card title="Categories">
          {q.data && (q.data.categories.length ? (
            <ul className="mb-4 flex flex-wrap gap-1.5">{q.data.categories.map((c) => <li key={c.id}><Badge tone="slate">{c.name}</Badge></li>)}</ul>
          ) : <p className="mb-4 text-sm text-slate-500">Create a category before adding resources.</p>)}
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (catName.trim().length >= 2) addCat.mutate(catName.trim()); }}>
            <Input label="New category" name="catName" value={catName} maxLength={60} onChange={(e) => setCatName(e.target.value)} />
            <Button type="submit" size="sm" variant="outline" disabled={catName.trim().length < 2} loading={addCat.isPending}><Plus className="size-3.5" />Add category</Button>
          </form>
        </Card>
      </div>

      <Card title="Safety resources" subtitle="Crisis lines and emergency contacts" action={<Button size="sm" onClick={() => setEditingSafety('new')}><Plus className="size-3.5" />Add safety resource</Button>}>
        <div className="mb-4"><Notice tone="amber">Safety resources must be reviewed by a qualified mental health professional before being marked approved. Verify every phone number and link — people in crisis rely on them.</Notice></div>
        {summary.data && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Safety screenings (30 days)" value={summary.data.screenings30d} icon={<ShieldCheck className="size-5" />} tone="sky" hint="Aggregate count only" />
            <Stat label="Escalated screenings (30 days)" value={summary.data.escalated30d} icon={<ShieldAlert className="size-5" />} tone="rose" hint="Aggregate count only" />
          </div>
        )}
        {sq.error ? <ErrorState message={errMsg(sq.error)} onRetry={() => sq.refetch()} /> : (
          <DataTable rows={sq.data} rowKey={(r) => r.id} loading={sq.isLoading} empty="No safety resources" columns={[
            { key: 'title', header: 'Title', render: (r) => <div><p className="font-medium text-slate-800">{r.title}</p><p className="line-clamp-2 text-xs text-slate-500">{r.details}</p></div> },
            { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
            { key: 'url', header: 'Link', render: (r) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-xs break-all text-brand-700 hover:underline">{r.url}</a> : '—') },
            { key: 'lang', header: 'Language', render: (r) => r.language.toUpperCase() },
            { key: 'approved', header: 'Status', render: (r) => (r.approved ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Awaiting review</Badge>) },
            { key: 'edit', header: '', className: 'text-right', render: (r) => <Button size="sm" variant="ghost" onClick={() => setEditingSafety(r)} aria-label={`Edit ${r.title}`}><Pencil className="size-3.5" />Edit</Button> },
          ]} />
        )}
      </Card>

      {editing && q.data && <ResourceModal key={editing === 'new' ? 'new' : editing.id} resource={editing === 'new' ? null : editing} categories={q.data.categories} onClose={() => setEditing(null)} />}
      {editingSafety && <SafetyModal key={editingSafety === 'new' ? 'new' : editingSafety.id} item={editingSafety === 'new' ? null : editingSafety}
        defaultOrder={editingSafety === 'new' ? (sq.data?.length ?? 0) : Math.max(0, (sq.data ?? []).findIndex((x) => x.id === editingSafety.id))} onClose={() => setEditingSafety(null)} />}
    </div>
  );
}

function ResourceModal({ resource, categories, onClose }: { resource: Resource | null; categories: Category[]; onClose: () => void }) {
  const [f, setF] = useState({
    categoryId: resource?.categoryId ?? categories[0]?.id ?? '', title: resource?.title ?? '', body: resource?.body ?? '', contentType: resource?.contentType ?? 'ARTICLE',
    url: resource?.url ?? '', language: resource?.language ?? 'en', status: resource?.status ?? 'DRAFT',
  });
  const [touched, setTouched] = useState(false);
  const save = useAction((body: unknown) => (resource ? put(`/admin/resources/${resource.id}`, body) : post('/admin/resources', body)), {
    invalidate: [['admin', 'resources']], success: resource ? 'Resource updated' : 'Resource created', onSuccess: onClose,
  });
  const errs = {
    title: f.title.trim().length < 3 ? 'At least 3 characters' : undefined,
    body: !f.body.trim() ? 'Body is required' : undefined,
    url: f.url.trim() && !/^https:\/\/\S+\.\S+/.test(f.url.trim()) ? 'Must be a valid https:// URL' : undefined,
  };
  const valid = !errs.title && !errs.body && !errs.url && !!f.categoryId;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) save.mutate({ ...f, title: f.title.trim(), url: f.url.trim() || null });
  };
  return (
    <Modal open onClose={onClose} title={resource ? 'Edit resource' : 'New resource'} wide>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Title" name="title" value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} error={touched ? errs.title : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" name="categoryId" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Content type" name="contentType" value={f.contentType} onChange={(e) => setF({ ...f, contentType: e.target.value })} options={CONTENT_TYPES.map((x) => ({ value: x, label: label(x) }))} />
          <Select label="Language" name="language" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} options={LANGS} />
          <Select label="Status" name="status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((x) => ({ value: x, label: label(x) }))} />
        </div>
        <Input label="Link (optional)" name="url" type="url" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={touched ? errs.url : undefined} hint="Must start with https://" />
        <Textarea label="Body" name="body" rows={8} maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} error={touched ? errs.body : undefined} />
        {f.contentType === 'SAFETY' && <Notice tone="amber">Safety content should be reviewed by a qualified professional before publishing.</Notice>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>{resource ? 'Save changes' : 'Create resource'}</Button></div>
      </form>
    </Modal>
  );
}

function SafetyModal({ item, defaultOrder, onClose }: { item: SafetyRes | null; defaultOrder: number; onClose: () => void }) {
  const confirm = useConfirm();
  const [f, setF] = useState({ title: item?.title ?? '', phone: item?.phone ?? '', url: item?.url ?? '', details: item?.details ?? '', language: item?.language ?? 'en', approved: item?.approved ?? false, order: item?.order ?? defaultOrder });
  const [touched, setTouched] = useState(false);
  const save = useAction((body: unknown) => (item ? put(`/admin/safety-resources/${item.id}`, body) : post('/admin/safety-resources', body)), {
    invalidate: [['admin', 'safety-resources']], success: item ? 'Safety resource updated' : 'Safety resource created', onSuccess: onClose,
  });
  const errs = {
    title: f.title.trim().length < 2 ? 'At least 2 characters' : undefined,
    details: !f.details.trim() ? 'Details are required' : undefined,
    url: f.url.trim() && !/^https?:\/\/\S+\.\S+/.test(f.url.trim()) ? 'Must be a valid URL' : undefined,
  };
  const valid = !errs.title && !errs.details && !errs.url && Number.isInteger(f.order);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    if (f.approved && !item?.approved && !(await confirm({ title: 'Mark as approved?', message: 'Approved safety resources are shown to people who may be in crisis. Confirm a qualified professional has reviewed this entry and that the phone number and link work.', confirmLabel: 'Yes, it has been reviewed' }))) return;
    save.mutate({ title: f.title.trim(), phone: f.phone.trim() || null, url: f.url.trim() || null, details: f.details.trim(), language: f.language, approved: f.approved, order: f.order });
  };
  return (
    <Modal open onClose={onClose} title={item ? 'Edit safety resource' : 'New safety resource'}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Title" name="s-title" value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} error={touched ? errs.title : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone (optional)" name="s-phone" value={f.phone} maxLength={40} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Select label="Language" name="s-lang" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} options={LANGS} />
        </div>
        <Input label="Link (optional)" name="s-url" type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={touched ? errs.url : undefined} />
        <Textarea label="Details" name="s-details" maxLength={2000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} error={touched ? errs.details : undefined} />
        <Input label="Display order" name="s-order" type="number" step={1} value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} hint={item && item.order === undefined ? 'Current order is not returned by the API; defaults to list position.' : 'Lower numbers are shown first.'} />
        <Toggle checked={f.approved} onChange={(v) => setF({ ...f, approved: v })} label="Approved for display" description="Only after review by a qualified professional." />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>{item ? 'Save changes' : 'Create'}</Button></div>
      </form>
    </Modal>
  );
}

// =====================================================================================
// 7. Assessment configuration
// =====================================================================================

interface Question { id: string; key: string; step: number; prompt: string; type: string; required: boolean; isSafety: boolean; version: number; active: boolean; options: { id: string; value: string; label: string; order: number }[] }

export function AdminAssessment() {
  const q = useApi<Question[]>(['admin', 'assessment-questions'], '/admin/assessment-questions');
  const sq = useApi<Settings>(SETTINGS_KEY, '/admin/settings');
  const [editing, setEditing] = useState<Question | null>(null);
  const groups = useMemo(() => ({ support: (q.data ?? []).filter((x) => !x.isSafety), safety: (q.data ?? []).filter((x) => x.isSafety) }), [q.data]);

  const QList = ({ items }: { items: Question[] }) => (
    items.length ? (
      <ul className="divide-y divide-slate-100">
        {items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Step {x.step}</span><code className="rounded bg-slate-100 px-1.5">{x.key}</code><span>{x.type}</span><span>v{x.version}</span>
                {x.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800">{x.prompt}</p>
              {!!x.options.length && <p className="mt-1 text-xs text-slate-500">{x.options.map((o) => o.label).join(' · ')}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(x)} aria-label={`Edit question ${x.key}`}><Pencil className="size-3.5" />Edit</Button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No questions" />
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Assessment configuration" subtitle="Questions used in the support assessment and the safety screening." />
      <Notice tone="amber">Assessment questions and safety rules affect how young people are routed to support and crisis help. Every change must be reviewed by a qualified mental health professional before it is saved. Each edit increments the question version.</Notice>
      <QueryGate q={q}>{() => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={<span className="flex items-center gap-2"><ClipboardList className="size-4" />Support assessment</span>} subtitle={`${groups.support.length} questions`}><QList items={groups.support} /></Card>
          <div className="space-y-6">
            <Card title={<span className="flex items-center gap-2"><ShieldAlert className="size-4 text-rose-600" />Safety screening</span>} subtitle={`${groups.safety.length} questions`}><QList items={groups.safety} /></Card>
            <Card title="Safety escalation rules" subtitle="A “yes” to any selected question triggers immediate crisis resources">
              <QueryGate q={sq}>{(s) => <SafetyRulesForm key={JSON.stringify(s['safety.rules'])} initial={s['safety.rules'] as { escalateOnAnyYes: string[]; ruleVersion: number } | undefined} questions={groups.safety} />}</QueryGate>
            </Card>
          </div>
        </div>
      )}</QueryGate>
      {editing && <QuestionModal key={editing.id} question={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SafetyRulesForm({ initial, questions }: { initial?: { escalateOnAnyYes: string[]; ruleVersion: number }; questions: Question[] }) {
  const confirm = useConfirm();
  const save = useSaveSetting();
  const [keys, setKeys] = useState<string[]>(initial?.escalateOnAnyYes ?? []);
  const version = (initial?.ruleVersion ?? 0) + 1;
  const options = [...new Set([...questions.map((x) => x.key), ...keys])].map((k) => ({ value: k, label: questions.find((x) => x.key === k)?.prompt ?? `${k} (no matching question)` }));
  const removedAll = keys.length === 0;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Current rule version: <b>{initial?.ruleVersion ?? '—'}</b>. Saving publishes version {version}.</p>
      <ChipSelect options={options} value={keys} onChange={setKeys} />
      {removedAll && <Notice tone="rose">With no questions selected, safety screenings will never escalate.</Notice>}
      <Button size="sm" loading={save.isPending} onClick={async () => {
        if (await confirm({ title: 'Publish new safety rules?', danger: removedAll, confirmLabel: 'Publish rules', message: `This changes when young people are shown crisis resources (rule version ${version}). Confirm a qualified professional has approved this change.` })) {
          save.mutate({ key: 'safety.rules', value: { escalateOnAnyYes: keys, ruleVersion: version } });
        }
      }}>Save safety rules</Button>
    </div>
  );
}

function QuestionModal({ question, onClose }: { question: Question; onClose: () => void }) {
  const confirm = useConfirm();
  const [prompt, setPrompt] = useState(question.prompt);
  const [active, setActive] = useState(question.active);
  const [opts, setOpts] = useState(question.options.map((o) => ({ value: o.value, label: o.label })));
  const [touched, setTouched] = useState(false);
  const save = useAction((body: unknown) => put(`/admin/assessment-questions/${question.id}`, body), { invalidate: [['admin', 'assessment-questions']], success: 'Question updated', onSuccess: onClose });
  const promptErr = prompt.trim().length < 3 ? 'At least 3 characters' : prompt.length > 300 ? 'At most 300 characters' : undefined;
  const optErr = opts.some((o) => !o.value.trim() || !o.label.trim()) ? 'Every option needs a value and a label' : new Set(opts.map((o) => o.value.trim())).size !== opts.length ? 'Option values must be unique' : undefined;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (promptErr || optErr) return;
    if (question.isSafety && !(await confirm({ title: 'Edit a safety screening question?', message: 'Safety questions determine when crisis resources are shown. Confirm this change has been reviewed by a qualified professional.', confirmLabel: 'Save change', danger: true }))) return;
    const hadOptions = question.options.length > 0 || opts.length > 0;
    save.mutate({ prompt: prompt.trim(), active, ...(hadOptions ? { options: opts.map((o) => ({ value: o.value.trim(), label: o.label.trim() })) } : {}) });
  };
  return (
    <Modal open onClose={onClose} title={`Edit question · ${question.key}`} wide>
      <form onSubmit={submit} className="space-y-4">
        {question.isSafety && <Notice tone="rose">This is a safety screening question.</Notice>}
        <Textarea label="Prompt" name="prompt" rows={3} maxLength={300} value={prompt} onChange={(e) => setPrompt(e.target.value)} error={touched ? promptErr : undefined} />
        <Toggle checked={active} onChange={setActive} label="Active" description="Inactive questions are not shown to users." />
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-slate-700">Options</span>
            <Button size="sm" variant="outline" disabled={opts.length >= 30} onClick={() => setOpts([...opts, { value: '', label: '' }])}><Plus className="size-3.5" />Add option</Button></div>
          {opts.length ? (
            <ul className="space-y-2">
              {opts.map((o, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input aria-label={`Option ${i + 1} value`} placeholder="value" value={o.value} maxLength={60} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs" />
                  <input aria-label={`Option ${i + 1} label`} placeholder="Label" value={o.label} maxLength={120} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                  <Button size="sm" variant="ghost" aria-label={`Remove option ${i + 1}`} onClick={() => setOpts(opts.filter((_, j) => j !== i))}>×</Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-slate-500">This question has no options (e.g. slider, text or yes/no).</p>}
          {touched && optErr && <p role="alert" className="mt-1 text-xs text-rose-600">{optErr}</p>}
          <p className="mt-2 text-xs text-slate-500">Changing option values can affect matching and stored responses. Prefer editing labels.</p>
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save (creates v{question.version + 1})</Button></div>
      </form>
    </Modal>
  );
}

// =====================================================================================
// 8. Matching weights
// =====================================================================================

const WEIGHT_KEYS = ['concern', 'specialization', 'language', 'availability', 'location', 'mode'] as const;
type Weights = Record<(typeof WEIGHT_KEYS)[number], number>;
interface MatchConfig { id: string; version: number; active: boolean; weights: Weights; createdAt: string; createdBy: string | null }
const WEIGHT_HINT: Record<(typeof WEIGHT_KEYS)[number], string> = {
  concern: 'Overlap between youth concerns and counselor-supported concerns',
  specialization: 'Fit between desired support and specializations',
  language: 'Shared language',
  availability: 'Overlap with preferred time windows',
  location: 'Distance for in-person support',
  mode: 'Online / in-person preference match',
};

export function AdminMatching() {
  const q = useApi<MatchConfig[]>(['admin', 'matching-config'], '/matching/config');
  return (
    <div className="space-y-6">
      <PageHeader title="Matching weights" subtitle="How much each factor contributes to counselor compatibility scores." />
      <Notice>Each publish creates a new, auditable configuration version and makes it active. Previous versions are kept so every past match can be traced to the exact weights used. Compatibility reflects practical fit — it does not predict treatment outcomes.</Notice>
      <QueryGate q={q}>{(list) => {
        const active = list.find((c) => c.active) ?? list[0];
        return (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card title="Publish new version" subtitle={active ? `Starting from active version v${active.version}` : 'No configuration yet'}>
              <WeightsForm key={active?.id ?? 'none'} initial={active?.weights} />
            </Card>
            <Card title="Version history">
              <DataTable rows={list} rowKey={(c) => c.id} empty="No versions yet" columns={[
                { key: 'v', header: 'Version', render: (c) => <span className="font-medium">v{c.version} {c.active && <Badge tone="green">Active</Badge>}</span> },
                { key: 'w', header: 'Weights', render: (c) => <span className="text-xs text-slate-600">{WEIGHT_KEYS.map((k) => `${label(k)} ${c.weights?.[k] ?? 0}`).join(' · ')}</span> },
                { key: 'd', header: 'Created', render: (c) => fmtDateTime(c.createdAt) },
              ]} />
            </Card>
          </div>
        );
      }}</QueryGate>
    </div>
  );
}

function WeightsForm({ initial }: { initial?: Weights }) {
  const confirm = useConfirm();
  const [w, setW] = useState<Weights>(() => Object.fromEntries(WEIGHT_KEYS.map((k) => [k, initial?.[k] ?? 0])) as Weights);
  const total = WEIGHT_KEYS.reduce((s, k) => s + (Number.isFinite(w[k]) ? w[k] : 0), 0);
  const valid = Math.abs(total - 100) < 1e-9 && WEIGHT_KEYS.every((k) => w[k] >= 0 && w[k] <= 100);
  const changed = WEIGHT_KEYS.some((k) => w[k] !== (initial?.[k] ?? 0));
  const publish = useAction((body: Weights) => post<MatchConfig>('/matching/config', body), { invalidate: [['admin', 'matching-config']], success: (r) => `Published matching config v${r.version}` });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (await confirm({ title: 'Publish new matching weights?', message: 'A new configuration version will be created and become active immediately for all future matching runs.', confirmLabel: 'Publish' })) publish.mutate(w);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {WEIGHT_KEYS.map((k) => (
        <div key={k}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`w-${k}`} className="text-sm font-medium text-slate-700">{label(k)}</label>
            <input type="number" min={0} max={100} value={w[k]} aria-label={`${label(k)} weight`} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums" />
          </div>
          <input id={`w-${k}`} type="range" min={0} max={100} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-full accent-brand-600" />
          <p className="text-xs text-slate-500">{WEIGHT_HINT[k]}</p>
        </div>
      ))}
      <div className={cx('flex items-center justify-between rounded-xl p-3 text-sm font-medium', valid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')} aria-live="polite">
        <span>Total</span><span className="tabular-nums">{total} / 100</span>
      </div>
      {!valid && <p className="text-xs text-rose-600">Weights must add up to exactly 100 before publishing.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={!changed} onClick={() => setW(Object.fromEntries(WEIGHT_KEYS.map((k) => [k, initial?.[k] ?? 0])) as Weights)}>Reset</Button>
        <Button type="submit" disabled={!valid} loading={publish.isPending}>Publish new version</Button>
      </div>
    </form>
  );
}

// =====================================================================================
// 9. Payments & refunds
// =====================================================================================

interface RefundRow { id: string; paymentId: string; amountPaisa: number; reason: string; status: string; gatewayRef: string | null; createdAt: string; completedAt: string | null; payment?: { reference: string; provider: string; transactionId: string | null; amountPaisa: number } }
interface PaymentRow { id: string; reference: string; provider: string; amountPaisa: number; status: string; transactionId: string | null; failureReason: string | null; createdAt: string; verifiedAt: string | null; refunds: RefundRow[] }

export function AdminPayments() {
  const [tab, setTab] = useState<'payments' | 'refunds'>('payments');
  return (
    <div>
      <PageHeader title="Payments & refunds" subtitle="Gateway payments and the manual refund workflow." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'payments', label: 'Payments' }, { value: 'refunds', label: 'Refunds' }]} />
      {tab === 'payments' ? <PaymentsTab /> : <RefundsTab />}
    </div>
  );
}

function PaymentsTab() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useApi<Paged<PaymentRow>>(['admin', 'payments', status, page], `/admin/payments?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`);
  const reconcile = useAction((ref: string) => post<{ status: string }>(`/admin/payments/${encodeURIComponent(ref)}/reconcile`), {
    invalidate: [['admin', 'payments']], success: (r) => `Reconciled — status is now ${label(r.status)}`,
  });
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48"><Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          options={[{ value: '', label: 'All statuses' }, ...['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => ({ value: s, label: label(s) }))]} /></div>
        {q.data && <span className="text-xs text-slate-500">{q.data.total} payment{q.data.total === 1 ? '' : 's'}</span>}
      </div>
      {q.error ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
        <>
          <DataTable rows={q.data?.items} loading={q.isLoading} rowKey={(p) => p.id} empty="No payments" columns={[
            { key: 'ref', header: 'Reference', render: (p) => <code className="text-xs break-all">{p.reference}</code> },
            { key: 'prov', header: 'Provider', render: (p) => label(p.provider) },
            { key: 'amt', header: 'Amount', render: (p) => <span className="tabular-nums">{fmtMoney(p.amountPaisa)}</span> },
            { key: 'status', header: 'Status', render: (p) => <div><StatusBadge status={p.status} />{p.failureReason && <p className="mt-1 text-xs text-rose-600">{p.failureReason}</p>}</div> },
            { key: 'tx', header: 'Transaction ID', render: (p) => (p.transactionId ? <code className="text-xs break-all">{p.transactionId}</code> : <span className="text-slate-400">—</span>) },
            { key: 'created', header: 'Created', render: (p) => fmtDateTime(p.createdAt) },
            { key: 'verified', header: 'Verified', render: (p) => (p.verifiedAt ? fmtDateTime(p.verifiedAt) : <span className="text-slate-400">—</span>) },
            { key: 'refunds', header: 'Refunds', render: (p) => (p.refunds.length ? <div className="space-y-1">{p.refunds.map((r) => <div key={r.id} className="flex items-center gap-1 text-xs"><StatusBadge status={r.status} />{fmtMoney(r.amountPaisa)}</div>)}</div> : <span className="text-slate-400">—</span>) },
            { key: 'act', header: '', className: 'text-right', render: (p) => (p.status === 'INITIATED' || p.status === 'PENDING'
              ? <Button size="sm" variant="outline" loading={reconcile.isPending && reconcile.variables === p.reference} onClick={() => reconcile.mutate(p.reference)}><RefreshCw className="size-3.5" />Reconcile</Button> : null) },
          ]} />
          <Pagination page={page} pages={q.data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function RefundsTab() {
  const q = useApi<RefundRow[]>(['admin', 'refunds'], '/admin/refunds');
  const confirm = useConfirm();
  const [completing, setCompleting] = useState<RefundRow | null>(null);
  const [gatewayRef, setGatewayRef] = useState('');
  const [touched, setTouched] = useState(false);
  const inv = [['admin', 'refunds'], ['admin', 'payments']];
  const processing = useAction((id: string) => post(`/admin/refunds/${id}/processing`), { invalidate: inv, success: 'Refund marked as processing' });
  const fail = useAction((id: string) => post(`/admin/refunds/${id}/fail`), { invalidate: inv, success: 'Refund marked as failed' });
  const complete = useAction((v: { id: string; gatewayRef: string }) => post(`/admin/refunds/${v.id}/complete`, { gatewayRef: v.gatewayRef }), {
    invalidate: inv, success: 'Refund completed', onSuccess: () => setCompleting(null),
  });
  const refErr = gatewayRef.trim().length < 3 ? 'Enter the gateway refund reference (at least 3 characters)' : undefined;
  return (
    <>
      <Card>
        <div className="mb-4"><Notice>Refunds move <b>Requested → Processing → Completed</b>. Issue the refund in the payment provider's merchant portal first, then record its gateway reference here.</Notice></div>
        {q.error ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <DataTable rows={q.data} loading={q.isLoading} rowKey={(r) => r.id} empty="No refund requests" columns={[
            { key: 'ref', header: 'Payment', render: (r) => <div><code className="text-xs break-all">{r.payment?.reference}</code><p className="text-xs text-slate-500">{r.payment && label(r.payment.provider)}{r.payment?.transactionId ? ` · ${r.payment.transactionId}` : ''}</p></div> },
            { key: 'amt', header: 'Refund', render: (r) => <div className="tabular-nums">{fmtMoney(r.amountPaisa)}{r.payment && <p className="text-xs text-slate-500">of {fmtMoney(r.payment.amountPaisa)}</p>}</div> },
            { key: 'reason', header: 'Reason', render: (r) => <span className="text-sm text-slate-600">{r.reason}</span> },
            { key: 'status', header: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.gatewayRef && <p className="mt-1 text-xs text-slate-500">Ref: {r.gatewayRef}</p>}</div> },
            { key: 'created', header: 'Requested', render: (r) => fmtDateTime(r.createdAt) },
            { key: 'done', header: 'Completed', render: (r) => (r.completedAt ? fmtDateTime(r.completedAt) : <span className="text-slate-400">—</span>) },
            { key: 'act', header: 'Actions', className: 'text-right', render: (r) => (
              <div className="flex flex-wrap justify-end gap-1.5">
                {r.status === 'REQUESTED' && <Button size="sm" variant="outline" loading={processing.isPending && processing.variables === r.id} onClick={() => processing.mutate(r.id)}>Mark processing</Button>}
                {r.status === 'PROCESSING' && <Button size="sm" onClick={() => { setCompleting(r); setGatewayRef(''); setTouched(false); }}>Mark completed</Button>}
                {(r.status === 'REQUESTED' || r.status === 'PROCESSING') && (
                  <Button size="sm" variant="ghost" className="text-rose-700" loading={fail.isPending && fail.variables === r.id}
                    onClick={async () => { if (await confirm({ title: 'Mark refund as failed?', message: 'Use this only if the provider rejected the refund or it cannot be issued. The requester may need to be contacted.', confirmLabel: 'Mark failed', danger: true })) fail.mutate(r.id); }}>Mark failed</Button>
                )}
              </div>
            ) },
          ]} />
        )}
      </Card>
      <Modal open={!!completing} onClose={() => setCompleting(null)} title="Complete refund">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!refErr && completing) complete.mutate({ id: completing.id, gatewayRef: gatewayRef.trim() }); }}>
          <Notice tone="amber">Mark a refund completed only after the payment provider confirms the refund in the merchant portal.</Notice>
          {completing && <p className="text-sm text-slate-600">Refund of <b>{fmtMoney(completing.amountPaisa)}</b> for payment <code className="text-xs">{completing.payment?.reference}</code>.</p>}
          <Input label="Gateway refund reference" name="gatewayRef" maxLength={120} value={gatewayRef} onChange={(e) => setGatewayRef(e.target.value)} error={touched ? refErr : undefined} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCompleting(null)}>Cancel</Button><Button type="submit" loading={complete.isPending}>Mark completed</Button></div>
        </form>
      </Modal>
    </>
  );
}

// =====================================================================================
// 10. Audit logs
// =====================================================================================

interface AuditRow { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; ip: string | null; createdAt: string; actor: { displayName: string; role: string } | null }

export function AdminAudit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const a = useDebounced(action.trim());
  useEffect(() => setPage(1), [a]);
  const q = useApi<Paged<AuditRow>>(['admin', 'audit', a, page], `/admin/audit-logs?page=${page}&pageSize=25${a ? `&action=${encodeURIComponent(a)}` : ''}`);
  return (
    <div>
      <PageHeader title="Audit logs" subtitle="An append-only record of administrative and security-relevant actions." />
      <Card>
        <div className="mb-4 max-w-sm"><SearchInput value={action} onChange={setAction} placeholder="Filter by action (e.g. SUSPENDED)" /></div>
        {q.error ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <DataTable rows={q.data?.items} loading={q.isLoading} rowKey={(r) => r.id} empty="No audit entries" columns={[
              { key: 'time', header: 'Time', render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
              { key: 'actor', header: 'Actor', render: (r) => (r.actor ? <div><p className="font-medium text-slate-800">{r.actor.displayName}</p><p className="text-xs text-slate-500">{label(r.actor.role)}</p></div> : <span className="text-slate-400">System</span>) },
              { key: 'action', header: 'Action', render: (r) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.action}</code> },
              { key: 'entity', header: 'Entity', render: (r) => <div><p className="text-slate-700">{r.entityType}</p>{r.entityId && <code className="text-xs break-all text-slate-500">{r.entityId}</code>}</div> },
              { key: 'meta', header: 'Metadata', render: (r) => (r.metadata != null && !(typeof r.metadata === 'object' && !Object.keys(r.metadata as object).length) ? (
                <details className="max-w-xs"><summary className="cursor-pointer text-xs text-brand-700">View</summary><pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-xs whitespace-pre-wrap">{JSON.stringify(r.metadata, null, 2)}</pre></details>
              ) : <span className="text-slate-400">—</span>) },
            ]} />
            <Pagination page={page} pages={q.data?.pages ?? 1} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

// =====================================================================================
// 11. Platform settings
// =====================================================================================

export function AdminSettings() {
  const q = useApi<Settings>(SETTINGS_KEY, '/admin/settings');
  return (
    <div>
      <PageHeader title="Platform settings" subtitle="Changes take effect immediately and are recorded in the audit log." />
      <QueryGate q={q}>{(s) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Refund policy" subtitle="Applied when a youth cancels a paid appointment">
            <RefundPolicyForm key={JSON.stringify(s['refund.policy'])} initial={s['refund.policy'] as { fullHours: number; partialHours: number; partialPercent: number } | undefined} />
          </Card>
          <div className="space-y-6">
            <Card title="Follow-up timing"><NumberSettingForm key={String(s['followup.hoursAfterSession'])} k="followup.hoursAfterSession" initial={Number(s['followup.hoursAfterSession'] ?? 48)} min={1} max={336} label="Hours after session" hint="When to send the post-session follow-up check (1–336 hours)." /></Card>
            <Card title="Support contact"><EmailSettingForm key={String(s['platform.supportEmail'])} initial={String(s['platform.supportEmail'] ?? '')} /></Card>
          </div>
          <Card title="Other settings" subtitle="Read-only here — edit moderation settings on the Moderation page and safety rules on the Assessment page" className="lg:col-span-2">
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(s).filter(([k]) => k.startsWith('moderation.') || k.startsWith('safety.')).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3">
                  <dt className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500"><code>{k}</code>
                    <Link to={k.startsWith('safety.') ? '/admin/assessment' : '/admin/moderation'} className="text-brand-700 hover:underline">Edit</Link></dt>
                  <dd><pre className="max-h-32 overflow-auto text-xs whitespace-pre-wrap text-slate-700">{JSON.stringify(v, null, 2)}</pre></dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}</QueryGate>
    </div>
  );
}

function RefundPolicyForm({ initial }: { initial?: { fullHours: number; partialHours: number; partialPercent: number } }) {
  const save = useSaveSetting();
  const [p, setP] = useState(initial ?? { fullHours: 24, partialHours: 2, partialPercent: 50 });
  const err = [p.fullHours, p.partialHours, p.partialPercent].some((x) => !Number.isFinite(x) || x < 0) ? 'Values must be zero or more'
    : p.partialPercent > 100 ? 'Partial percent cannot exceed 100'
    : p.fullHours < p.partialHours ? 'Full-refund window must be at least as long as the partial window' : undefined;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!err) save.mutate({ key: 'refund.policy', value: p }); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Full refund (hours before)" name="fullHours" type="number" min={0} value={p.fullHours} onChange={(e) => setP({ ...p, fullHours: Number(e.target.value) })} />
        <Input label="Partial refund (hours before)" name="partialHours" type="number" min={0} value={p.partialHours} onChange={(e) => setP({ ...p, partialHours: Number(e.target.value) })} />
        <Input label="Partial refund %" name="partialPercent" type="number" min={0} max={100} value={p.partialPercent} onChange={(e) => setP({ ...p, partialPercent: Number(e.target.value) })} />
      </div>
      <p className="text-sm text-slate-600">
        Cancel ≥ <b>{p.fullHours}h</b> before → full refund · ≥ <b>{p.partialHours}h</b> → <b>{p.partialPercent}%</b> refund · later → no refund.
      </p>
      {err && <p role="alert" className="text-xs text-rose-600">{err}</p>}
      <Button type="submit" size="sm" disabled={!!err} loading={save.isPending}>Save refund policy</Button>
    </form>
  );
}

function NumberSettingForm({ k, initial, min, max, label: lbl, hint }: { k: string; initial: number; min: number; max: number; label: string; hint: string }) {
  const save = useSaveSetting();
  const [v, setV] = useState(initial);
  const ok = Number.isInteger(v) && v >= min && v <= max;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate({ key: k, value: v }); }}>
      <Input label={lbl} name={k} type="number" min={min} max={max} value={v} onChange={(e) => setV(Number(e.target.value))} hint={hint} error={ok ? undefined : `Whole number between ${min} and ${max}`} />
      <Button type="submit" size="sm" disabled={!ok} loading={save.isPending}>Save</Button>
    </form>
  );
}

function EmailSettingForm({ initial }: { initial: string }) {
  const save = useSaveSetting();
  const [v, setV] = useState(initial);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate({ key: 'platform.supportEmail', value: v.trim() }); }}>
      <Input label="Support email" name="supportEmail" type="email" value={v} onChange={(e) => setV(e.target.value)} hint="Shown to users who need help with their account." error={v && !ok ? 'Enter a valid email' : undefined} />
      <Button type="submit" size="sm" disabled={!ok} loading={save.isPending}>Save</Button>
    </form>
  );
}

// =====================================================================================
// 12. Background jobs
// =====================================================================================

interface Jobs { available: boolean; counts: Record<string, number> | null; failed: { id: string; name: string; attemptsMade: number; failedReason: string; timestamp: number }[] }

export function AdminJobs() {
  const q = useApi<Jobs>(['admin', 'jobs'], '/admin/jobs', { refetchInterval: 15_000 });
  const retry = useAction((id: string) => post(`/admin/jobs/${encodeURIComponent(id)}/retry`), { invalidate: [['admin', 'jobs']], success: 'Job queued for retry' });
  const tones: Record<string, 'brand' | 'sky' | 'amber' | 'rose' | 'violet'> = { waiting: 'amber', active: 'sky', delayed: 'violet', failed: 'rose', completed: 'brand' };
  return (
    <div>
      <PageHeader title="Background jobs" subtitle="Reminders, notifications and scheduled tasks. Refreshes every 15 seconds."
        action={<Button variant="outline" onClick={() => q.refetch()} loading={q.isFetching}><RefreshCw className="size-4" />Refresh</Button>} />
      <QueryGate q={q}>{(j) => (
        <div className="space-y-6">
          {!j.available && <Notice tone="rose"><b>Redis/worker not reachable — background jobs are not being processed.</b> Reminders, notifications and scheduled tasks will be delayed until the queue is back.</Notice>}
          {j.counts && (
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {['waiting', 'active', 'delayed', 'failed', 'completed'].map((k) => (
                <Stat key={k} label={label(k)} value={(j.counts?.[k] ?? 0).toLocaleString()} tone={tones[k]} icon={k === 'failed' ? <AlertTriangle className="size-5" /> : k === 'completed' ? <CheckCircle2 className="size-5" /> : <Inbox className="size-5" />} />
              ))}
            </div>
          )}
          <Card title="Failed jobs" subtitle="Most recent 50">
            <DataTable rows={j.failed} rowKey={(f) => String(f.id)} empty={j.available ? 'No failed jobs' : 'Queue unavailable'} columns={[
              { key: 'id', header: 'Job', render: (f) => <div><p className="font-medium text-slate-800">{f.name}</p><code className="text-xs text-slate-500">#{f.id}</code></div> },
              { key: 'reason', header: 'Failure reason', render: (f) => <span className="text-sm break-words text-rose-700">{f.failedReason}</span> },
              { key: 'attempts', header: 'Attempts', render: (f) => f.attemptsMade },
              { key: 'time', header: 'Queued', render: (f) => fmtDateTime(new Date(f.timestamp)) },
              { key: 'act', header: '', className: 'text-right', render: (f) => <Button size="sm" variant="outline" loading={retry.isPending && retry.variables === f.id} onClick={() => retry.mutate(f.id)}><RefreshCw className="size-3.5" />Retry</Button> },
            ]} />
          </Card>
        </div>
      )}</QueryGate>
    </div>
  );
}
