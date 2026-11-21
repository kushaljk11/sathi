import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Briefcase, CheckCircle2, Clock, FileText, ListOrdered, Pencil, Plus, ShieldCheck, Sparkles, Star, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import {
  Badge, Button, Card, ChipSelect, DataTable, EmptyState, ErrorState, Input, LoadingBlock, Modal, Notice, PageHeader, Progress, Select, Stat, StatusBadge,
  Textarea, fmtDate, fmtDateTime, fmtMoney, label, useConfirm, useToast,
} from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { del, post, put, useAction, useApi } from '../lib/hooks';

// =====================================================================
// Types
// =====================================================================
type Mode = 'ONLINE' | 'IN_PERSON' | 'BOTH';
interface Org {
  id: string; name: string; description: string | null; contactEmail: string; contactPhone: string | null; locationArea: string | null; languages: string[];
  operatingHours: string | null; verificationStatus: string; rejectionReason: string | null;
  documents: { id: string; fileName: string; uploadedAt: string }[];
  staff: { id: string; userId: string; isOwner: boolean; user: { id: string; displayName: string; email: string } }[];
}
interface Program {
  id: string; title: string; description: string; category: string; startsAt: string; endsAt: string; seats: number; seatsTaken: number; minAge: number | null; maxAge: number | null;
  eligibility: string | null; locationArea: string | null; mode: Mode; costPaisa: number; requirements: string | null; status: string; rejectionReason: string | null; createdAt: string;
  _count?: { waitlist: number; bookings: number };
}
interface Service { id: string; title: string; description: string; category: string; durationMin: number; capacity: number; locationArea: string | null; mode: Mode; costPaisa: number; status: string }
interface Booking {
  id: string; status: string; createdAt: string; youth: { ageGroup: string | null; user: { displayName: string } };
  attendance: { id: string; date: string; present: boolean }[]; feedback: { rating: number; comment: string | null } | null;
}
interface BookingsData { program: Program; bookings: Booking[]; waitlist: { id: string; position: number; createdAt: string }[] }

// =====================================================================
// Helpers
// =====================================================================
const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d?: string | Date | null) => { if (!d) return ''; const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const toDateTimeInput = (d?: string | Date | null) => { if (!d) return ''; const x = new Date(d); return `${toDateInput(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const MODE_OPTS = [{ value: 'IN_PERSON', label: 'In person' }, { value: 'ONLINE', label: 'Online' }, { value: 'BOTH', label: 'Online and in person' }];
const LANG_OPTS = [['ne', 'Nepali'], ['en', 'English'], ['mai', 'Maithili'], ['bho', 'Bhojpuri'], ['new', 'Newari'], ['tmg', 'Tamang'], ['hi', 'Hindi']].map(([value, l]) => ({ value, label: l }));
const MAX_UPLOAD = 5 * 1024 * 1024;
const rupeesOk = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100000; };

type QLike<T> = { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
function Loaded<T>({ q, children, rows }: { q: QLike<T>; children: (d: T) => ReactNode; rows?: number }) {
  if (q.isLoading) return <LoadingBlock rows={rows} />;
  if (q.isError || q.data === undefined) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <>{children(q.data)}</>;
}

const VERIF_COPY: Record<string, { tone: 'amber' | 'sky' | 'rose'; text: string }> = {
  DRAFT: { tone: 'amber', text: 'Your organization is not verified yet. You can prepare programs and services, but they can only be submitted for publishing after verification.' },
  PENDING: { tone: 'sky', text: 'Your verification is under review. You will be notified once an administrator has checked your documents.' },
  REJECTED: { tone: 'rose', text: 'Your verification was not approved. Update your details or documents and submit again.' },
  SUSPENDED: { tone: 'rose', text: 'Your organization is suspended. Contact the Sathi team for details.' },
};
function VerificationBanner({ org }: { org: Org }) {
  const c = VERIF_COPY[org.verificationStatus];
  if (!c) return null;
  return (
    <Notice tone={c.tone}>
      <p>{c.text}</p>
      {org.rejectionReason && <p className="mt-1"><span className="font-medium">Reason:</span> {org.rejectionReason}</p>}
      <Link to="/organization/profile" className="mt-1 inline-block font-medium underline">Go to profile & verification</Link>
    </Notice>
  );
}

function UploadDocument({ url, invalidate }: { url: string; invalidate: unknown[][] }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const upload = useAction((file: File) => { const fd = new FormData(); fd.append('file', file); return api.post(url, fd).then((r) => r.data.data); }, {
    success: 'Document uploaded', invalidate, onSuccess: () => { if (ref.current) ref.current.value = ''; },
  });
  const onFile = (file?: File) => {
    if (!file) return;
    const reset = () => { if (ref.current) ref.current.value = ''; };
    if (file.size > MAX_UPLOAD) { toast('File is larger than 5 MB', 'error'); reset(); return; }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { toast('Only PDF, PNG or JPG files are accepted', 'error'); reset(); return; }
    upload.mutate(file);
  };
  return (
    <div>
      <label htmlFor="org-doc" className="mb-1.5 block text-sm font-medium text-slate-700">Upload a document</label>
      <input id="org-doc" ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={upload.isPending} onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
      <p className="mt-1 text-xs text-slate-500">{upload.isPending ? 'Uploading…' : 'Registration certificate or similar. PDF, PNG or JPG, up to 5 MB.'}</p>
    </div>
  );
}

// =====================================================================
// 8. OrgHome
// =====================================================================
export function OrgHome() {
  const org = useApi<Org>(['org-me'], '/users/organization/me');
  const programs = useApi<Program[]>(['org-programs'], '/programs/org/programs');
  const services = useApi<Service[]>(['org-services'], '/programs/org/services');
  const p = programs.data ?? [];
  const count = (s: string) => p.filter((x) => x.status === s).length;
  const bookings = p.reduce((n, x) => n + (x._count?.bookings ?? 0), 0);
  const waitlist = p.reduce((n, x) => n + (x._count?.waitlist ?? 0), 0);
  const upcoming = p.filter((x) => x.status !== 'ARCHIVED' && new Date(x.startsAt) > new Date()).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 6);
  const rejected = p.filter((x) => x.status === 'REJECTED');

  return (
    <div className="space-y-6">
      <PageHeader title={org.data?.name ?? 'Overview'} subtitle="Programs, bookings and services at a glance." action={<Link to="/organization/programs"><Button><Plus className="size-4" />New program</Button></Link>} />
      {org.data && <VerificationBanner org={org.data} />}
      {org.isError && <ErrorState message={errMsg(org.error)} onRetry={() => org.refetch()} />}
      {programs.isError ? <ErrorState message={errMsg(programs.error)} onRetry={() => programs.refetch()} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Published programs" value={programs.data ? count('PUBLISHED') : '—'} icon={<Sparkles className="size-5" />} hint={programs.data ? `${count('DRAFT')} draft · ${count('PENDING_APPROVAL')} awaiting approval` : undefined} />
          <Stat label="Active bookings" value={programs.data ? bookings : '—'} icon={<Users className="size-5" />} tone="sky" hint="Confirmed, attended or completed" />
          <Stat label="On waitlists" value={programs.data ? waitlist : '—'} icon={<ListOrdered className="size-5" />} tone="violet" />
          <Stat label="Published services" value={services.data ? services.data.filter((s) => s.status === 'PUBLISHED').length : '—'} icon={<Briefcase className="size-5" />} tone="amber" hint={services.data ? `${services.data.length} total` : undefined} />
        </div>
      )}
      {!!rejected.length && <Notice tone="rose">{rejected.length} program{rejected.length > 1 ? 's were' : ' was'} not approved. Review the feedback on the <Link to="/organization/programs" className="font-medium underline">Programs</Link> page, edit and resubmit.</Notice>}
      <Card title="Upcoming programs" action={<Link to="/organization/programs" className="text-sm font-medium text-brand-700 hover:underline">All programs</Link>}>
        <Loaded q={programs}>{() => upcoming.length ? (
          <ul className="divide-y divide-slate-100">{upcoming.map((x) => (
            <li key={x.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_200px] sm:items-center">
              <div>
                <Link to={`/organization/programs/${x.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{x.title}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><StatusBadge status={x.status} /><span>{fmtDateTime(x.startsAt)}</span><span>· {x.category}</span>{!!x._count?.waitlist && <span>· {x._count.waitlist} waitlisted</span>}</div>
              </div>
              <div><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Seats</span><span>{x.seatsTaken}/{x.seats}</span></div><Progress value={(x.seatsTaken / x.seats) * 100} label={`${x.title} seats taken`} /></div>
            </li>
          ))}</ul>
        ) : <EmptyState title="No upcoming programs" hint="Create a program and submit it for approval to reach young people." action={<Link to="/organization/programs"><Button size="sm">Create program</Button></Link>} />}</Loaded>
      </Card>
    </div>
  );
}

// =====================================================================
// 9. OrgPrograms
// =====================================================================
interface ProgramForm { title: string; description: string; category: string; startsAt: string; endsAt: string; seats: string; minAge: string; maxAge: string; eligibility: string; locationArea: string; mode: Mode; cost: string; requirements: string }
const emptyProgram = (): ProgramForm => ({ title: '', description: '', category: '', startsAt: '', endsAt: '', seats: '20', minAge: '', maxAge: '', eligibility: '', locationArea: '', mode: 'IN_PERSON', cost: '0', requirements: '' });
const programToForm = (p: Program): ProgramForm => ({
  title: p.title, description: p.description, category: p.category, startsAt: toDateTimeInput(p.startsAt), endsAt: toDateTimeInput(p.endsAt), seats: String(p.seats),
  minAge: p.minAge != null ? String(p.minAge) : '', maxAge: p.maxAge != null ? String(p.maxAge) : '', eligibility: p.eligibility ?? '', locationArea: p.locationArea ?? '', mode: p.mode,
  cost: String(p.costPaisa / 100), requirements: p.requirements ?? '',
});

function ProgramFormModal({ open, onClose, program }: { open: boolean; onClose: () => void; program: Program | null }) {
  const [f, setF] = useState<ProgramForm>(emptyProgram());
  useEffect(() => { if (open) setF(program ? programToForm(program) : emptyProgram()); }, [open, program]);
  const set = <K extends keyof ProgramForm>(k: K, v: ProgramForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useAction(() => {
    const body = {
      title: f.title.trim(), description: f.description.trim(), category: f.category.trim(), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
      seats: Number(f.seats), minAge: f.minAge ? Number(f.minAge) : null, maxAge: f.maxAge ? Number(f.maxAge) : null, eligibility: f.eligibility.trim() || null,
      locationArea: f.locationArea.trim() || null, mode: f.mode, costPaisa: Math.round(Number(f.cost) * 100), requirements: f.requirements.trim() || null,
    };
    return program ? put(`/programs/org/programs/${program.id}`, body) : post('/programs/org/programs', body);
  }, { success: program ? 'Program updated' : 'Program created as a draft', invalidate: [['org-programs'], ['org-program']], onSuccess: onClose });

  const timeErr = f.startsAt && f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt) ? 'End must be after start' : undefined;
  const ageErr = f.minAge && f.maxAge && Number(f.maxAge) < Number(f.minAge) ? 'Max age must be at least min age' : undefined;
  const seatErr = program && Number(f.seats) < program.seatsTaken ? `Can't be below current bookings (${program.seatsTaken})` : undefined;
  const costErr = rupeesOk(f.cost) ? undefined : 'Enter an amount between 0 and 100,000';
  const descErr = f.description && f.description.trim().length < 10 ? 'At least 10 characters' : undefined;
  const invalid = !!(timeErr || ageErr || seatErr || costErr || descErr);
  const reapproval = program && ['PUBLISHED', 'REJECTED'].includes(program.status);

  return (
    <Modal open={open} onClose={onClose} title={program ? 'Edit program' : 'New program'} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!invalid) save.mutate(); }}>
        {reapproval && <Notice tone="amber">Saving changes sends this program back for admin approval{program?.status === 'PUBLISHED' ? ' — it will be hidden from youth until approved again' : ''}.</Notice>}
        <Input label="Title" required minLength={3} maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} />
        <Textarea label="Description" required maxLength={5000} value={f.description} onChange={(e) => set('description', e.target.value)} error={descErr} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Category" required minLength={2} maxLength={60} value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Life skills" />
          <Select label="Format" value={f.mode} onChange={(e) => set('mode', e.target.value as Mode)} options={MODE_OPTS} />
          <Input label="Starts" type="datetime-local" required value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          <Input label="Ends" type="datetime-local" required value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} error={timeErr} />
          <Input label="Seats" type="number" min={1} max={10000} required value={f.seats} onChange={(e) => set('seats', e.target.value)} error={seatErr} />
          <Input label="Cost (Rs)" type="number" min={0} step="0.01" required value={f.cost} onChange={(e) => set('cost', e.target.value)} error={costErr} hint="0 for free" />
          <Input label="Minimum age (optional)" type="number" min={10} max={40} value={f.minAge} onChange={(e) => set('minAge', e.target.value)} />
          <Input label="Maximum age (optional)" type="number" min={10} max={40} value={f.maxAge} onChange={(e) => set('maxAge', e.target.value)} error={ageErr} />
          <div className="sm:col-span-2"><Input label="Location / area (optional)" maxLength={100} value={f.locationArea} onChange={(e) => set('locationArea', e.target.value)} /></div>
        </div>
        <Textarea label="Eligibility (optional)" rows={2} maxLength={1000} value={f.eligibility} onChange={(e) => set('eligibility', e.target.value)} />
        <Textarea label="Requirements (optional)" rows={2} maxLength={1000} value={f.requirements} onChange={(e) => set('requirements', e.target.value)} hint="What participants should bring or prepare." />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={invalid}>{program ? 'Save changes' : 'Create draft'}</Button></div>
      </form>
    </Modal>
  );
}

function ProgramActions({ p, verified, onEdit }: { p: Program; verified: boolean; onEdit: () => void }) {
  const confirm = useConfirm();
  const submit = useAction(() => post(`/programs/org/programs/${p.id}/submit`), { success: 'Submitted for approval', invalidate: [['org-programs'], ['org-program']] });
  const archive = useAction(() => post(`/programs/org/programs/${p.id}/archive`), { success: 'Program archived', invalidate: [['org-programs'], ['org-program']] });
  const canSubmit = ['DRAFT', 'REJECTED'].includes(p.status);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {p.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${p.title}`}><Pencil className="size-3.5" />Edit</Button>}
      {canSubmit && <Button size="sm" variant="soft" disabled={!verified} loading={submit.isPending} title={verified ? undefined : 'Your organization must be verified before publishing'} onClick={() => submit.mutate()}>Submit</Button>}
      {p.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" loading={archive.isPending}
        onClick={async () => (await confirm({ title: 'Archive program?', message: 'It will no longer be listed for youth and cannot be edited. Existing bookings are not cancelled automatically.', confirmLabel: 'Archive', danger: true })) && archive.mutate()}>Archive</Button>}
    </div>
  );
}

export function OrgPrograms() {
  const navigate = useNavigate();
  const org = useApi<Org>(['org-me'], '/users/organization/me');
  const q = useApi<Program[]>(['org-programs'], '/programs/org/programs');
  const [editing, setEditing] = useState<Program | null>(null);
  const [open, setOpen] = useState(false);
  const verified = org.data?.verificationStatus === 'APPROVED';
  const edit = (p: Program | null) => { setEditing(p); setOpen(true); };

  return (
    <div className="space-y-4">
      <PageHeader title="Programs" subtitle="Create programs, submit them for approval and manage bookings." action={<Button onClick={() => edit(null)}><Plus className="size-4" />New program</Button>} />
      {org.data && !verified && <Notice tone="amber">Submitting for approval is disabled until your organization is verified. <Link to="/organization/profile" className="font-medium underline">Complete verification</Link></Notice>}
      <Card>
        {q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <DataTable<Program> loading={q.isLoading} rows={q.data} rowKey={(p) => p.id} empty="No programs yet" columns={[
            { key: 'title', header: 'Program', render: (p) => (
              <div>
                <button className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline" onClick={() => navigate(`/organization/programs/${p.id}`)}>{p.title}</button>
                <p className="text-xs text-slate-500">{p.category} · {label(p.mode)} · {fmtMoney(p.costPaisa)}</p>
                {p.status === 'REJECTED' && p.rejectionReason && <p className="mt-1 text-xs text-rose-600">Feedback: {p.rejectionReason}</p>}
              </div>
            ) },
            { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
            { key: 'dates', header: 'Dates', render: (p) => <span className="text-sm">{fmtDateTime(p.startsAt)}<br /><span className="text-xs text-slate-500">to {fmtDateTime(p.endsAt)}</span></span> },
            { key: 'seats', header: 'Seats', render: (p) => (
              <div className="w-32"><p className="mb-1 text-xs text-slate-600">{p.seatsTaken} / {p.seats}{p._count?.waitlist ? ` · ${p._count.waitlist} waitlisted` : ''}</p><Progress value={(p.seatsTaken / p.seats) * 100} label={`${p.title} seats taken`} /></div>
            ) },
            { key: 'actions', header: '', className: 'text-right', render: (p) => <ProgramActions p={p} verified={verified} onEdit={() => edit(p)} /> },
          ]} />
        )}
      </Card>
      <ProgramFormModal open={open} onClose={() => setOpen(false)} program={editing} />
    </div>
  );
}

// =====================================================================
// 10. OrgProgramDetail
// =====================================================================
export function OrgProgramDetail() {
  const { id = '' } = useParams();
  const org = useApi<Org>(['org-me'], '/users/organization/me');
  const q = useApi<BookingsData>(['org-program', id], `/programs/org/programs/${id}/bookings`);
  const [editOpen, setEditOpen] = useState(false);
  const [attFor, setAttFor] = useState<Booking | null>(null);

  if (q.isLoading) return <LoadingBlock rows={5} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const { program: p, bookings, waitlist } = q.data;
  const rated = bookings.filter((b) => b.feedback);
  const avg = rated.length ? rated.reduce((s, b) => s + b.feedback!.rating, 0) / rated.length : null;
  const verified = org.data?.verificationStatus === 'APPROVED';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/organization/programs" className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-800">← All programs</Link>
        <PageHeader title={p.title} subtitle={`${p.category} · ${fmtDateTime(p.startsAt)} – ${fmtDateTime(p.endsAt)} · ${label(p.mode)}${p.locationArea ? ` · ${p.locationArea}` : ''}`}
          action={<div className="flex items-center gap-2"><StatusBadge status={p.status} /><ProgramActions p={p} verified={verified} onEdit={() => setEditOpen(true)} /></div>} />
      </div>
      {p.status === 'REJECTED' && p.rejectionReason && <Notice tone="rose"><span className="font-medium">Not approved:</span> {p.rejectionReason}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Capacity</p>
          <p className="text-2xl font-bold text-slate-900">{p.seatsTaken} <span className="text-base font-medium text-slate-400">/ {p.seats}</span></p>
          <div className="mt-2"><Progress value={(p.seatsTaken / p.seats) * 100} label="Seats taken" /></div>
        </div>
        <Stat label="Waitlist" value={waitlist.length} icon={<ListOrdered className="size-5" />} tone="violet" />
        <Stat label="Bookings" value={bookings.filter((b) => b.status !== 'CANCELLED').length} icon={<Users className="size-5" />} tone="sky" hint={`${bookings.filter((b) => b.status === 'CANCELLED').length} cancelled`} />
        <Stat label="Average rating" value={avg == null ? '—' : avg.toFixed(1)} icon={<Star className="size-5" />} tone="amber" hint={rated.length ? `${rated.length} rating${rated.length > 1 ? 's' : ''}` : 'No feedback yet'} />
      </div>

      <Card title="Bookings" subtitle="Only booking details are shown — participants' wellbeing data and who referred them are never shared with organizations.">
        <DataTable<Booking> rows={bookings} rowKey={(b) => b.id} empty="No bookings yet" columns={[
          { key: 'who', header: 'Participant', render: (b) => <div><p className="font-medium text-slate-800">{b.youth.user.displayName}</p><p className="text-xs text-slate-500">{b.youth.ageGroup ? `Age ${b.youth.ageGroup}` : 'Age group not set'}</p></div> },
          { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
          { key: 'booked', header: 'Booked', render: (b) => fmtDate(b.createdAt) },
          { key: 'att', header: 'Attendance', render: (b) => b.attendance.length ? (
            <div className="text-xs"><p className="text-slate-700">{b.attendance.filter((a) => a.present).length} of {b.attendance.length} present</p>
              <p className="text-slate-500">Last: {fmtDate(b.attendance[b.attendance.length - 1].date)} {b.attendance[b.attendance.length - 1].present ? '(present)' : '(absent)'}</p></div>
          ) : <span className="text-xs text-slate-400">Not recorded</span> },
          { key: 'fb', header: 'Feedback', render: (b) => b.feedback ? <div className="text-xs"><p className="flex items-center gap-1 font-medium text-amber-700"><Star className="size-3 fill-current" />{b.feedback.rating}/5</p>{b.feedback.comment && <p className="max-w-[200px] text-slate-600">{b.feedback.comment}</p>}</div> : <span className="text-xs text-slate-400">—</span> },
          { key: 'actions', header: '', className: 'text-right', render: (b) => <BookingActions b={b} programId={id} onAttendance={() => setAttFor(b)} /> },
        ]} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Waitlist" subtitle="When a confirmed booking is cancelled, the next person is offered the seat automatically.">
          {waitlist.length ? (
            <ol className="divide-y divide-slate-100">{waitlist.map((w) => <li key={w.id} className="flex justify-between py-2 text-sm"><span className="font-medium text-slate-700">Position {w.position}</span><span className="text-slate-500">Joined {fmtDate(w.createdAt)}</span></li>)}</ol>
          ) : <EmptyState title="No one is waiting" />}
        </Card>
        <Card title="Feedback summary">
          {rated.length ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-slate-700"><Star className="size-4 fill-amber-400 text-amber-400" /><span className="text-lg font-semibold">{avg!.toFixed(1)}</span> average from {rated.length} participant{rated.length > 1 ? 's' : ''}</p>
              <ul className="space-y-2">{[5, 4, 3, 2, 1].map((n) => { const c = rated.filter((b) => b.feedback!.rating === n).length; return <li key={n} className="grid grid-cols-[32px_1fr_24px] items-center gap-2 text-xs text-slate-600"><span>{n}★</span><Progress value={(c / rated.length) * 100} label={`${n} star ratings`} /><span className="text-right">{c}</span></li>; })}</ul>
            </div>
          ) : <EmptyState title="No feedback yet" hint="Participants can rate a program after attending." />}
        </Card>
      </div>
      <Card title="Details">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Description</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{p.description}</dd></div>
          <div><dt className="text-xs text-slate-500">Cost</dt><dd className="mt-1">{fmtMoney(p.costPaisa)}</dd></div>
          <div><dt className="text-xs text-slate-500">Ages</dt><dd className="mt-1">{p.minAge || p.maxAge ? `${p.minAge ?? 'Any'} – ${p.maxAge ?? 'any'}` : 'All ages'}</dd></div>
          {p.eligibility && <div><dt className="text-xs text-slate-500">Eligibility</dt><dd className="mt-1">{p.eligibility}</dd></div>}
          {p.requirements && <div><dt className="text-xs text-slate-500">Requirements</dt><dd className="mt-1">{p.requirements}</dd></div>}
        </dl>
      </Card>
      <ProgramFormModal open={editOpen} onClose={() => setEditOpen(false)} program={p} />
      <AttendanceModal booking={attFor} onClose={() => setAttFor(null)} programId={id} />
    </div>
  );
}

function BookingActions({ b, programId, onAttendance }: { b: Booking; programId: string; onAttendance: () => void }) {
  const confirm = useConfirm();
  const inv = [['org-program', programId], ['org-programs']];
  const setStatus = useAction((status: 'COMPLETED' | 'NO_SHOW' | 'CANCELLED') => post(`/programs/org/bookings/${b.id}/status`, { status }), {
    success: (r) => (r && typeof r === 'object' && 'status' in r ? `Booking marked ${label(String((r as { status: string }).status)).toLowerCase()}` : 'Booking cancelled — the seat was offered to the waitlist if anyone is waiting'), invalidate: inv,
  });
  const active = ['CONFIRMED', 'ATTENDED'].includes(b.status);
  const cancellable = ['CONFIRMED', 'PENDING_PAYMENT'].includes(b.status);
  if (!active && !cancellable) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {active && <Button size="sm" variant="soft" onClick={onAttendance}><CheckCircle2 className="size-3.5" />Attendance</Button>}
      {active && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate('COMPLETED')}>Completed</Button>}
      {active && <Button size="sm" variant="ghost" onClick={async () => (await confirm({ title: 'Mark as no-show?', message: 'Use this when the participant did not attend the program.', confirmLabel: 'Mark no-show' })) && setStatus.mutate('NO_SHOW')}>No-show</Button>}
      {cancellable && <Button size="sm" variant="ghost" onClick={async () => (await confirm({ title: 'Cancel this booking?', message: 'The participant is notified. Their seat is released and, if the program hasn\'t started, offered to the next person on the waitlist.', confirmLabel: 'Cancel booking', danger: true })) && setStatus.mutate('CANCELLED')}>Cancel</Button>}
    </div>
  );
}

function AttendanceModal({ booking, onClose, programId }: { booking: Booking | null; onClose: () => void; programId: string }) {
  const [date, setDate] = useState(toDateInput(new Date()));
  const [present, setPresent] = useState('present');
  useEffect(() => { if (booking) { setDate(toDateInput(new Date())); setPresent('present'); } }, [booking]);
  const save = useAction(() => post(`/programs/org/bookings/${booking!.id}/attendance`, { date, present: present === 'present' }), { success: 'Attendance recorded', invalidate: [['org-program', programId]], onSuccess: onClose });
  return (
    <Modal open={!!booking} onClose={onClose} title="Record attendance">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <p className="text-sm text-slate-600">{booking?.youth.user.displayName}</p>
        <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <fieldset><legend className="mb-1.5 text-sm font-medium text-slate-700">Attendance</legend>
          <ChipSelect multi={false} value={[present]} onChange={(v) => setPresent(v[0])} options={[{ value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' }]} />
        </fieldset>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

// =====================================================================
// 11. OrgServices
// =====================================================================
interface ServiceForm { title: string; description: string; category: string; durationMin: string; capacity: string; locationArea: string; mode: Mode; cost: string }
const emptyService = (): ServiceForm => ({ title: '', description: '', category: '', durationMin: '60', capacity: '10', locationArea: '', mode: 'IN_PERSON', cost: '0' });

function ServiceFormModal({ open, onClose, service }: { open: boolean; onClose: () => void; service: Service | null }) {
  const [f, setF] = useState<ServiceForm>(emptyService());
  useEffect(() => {
    if (open) setF(service ? { title: service.title, description: service.description, category: service.category, durationMin: String(service.durationMin), capacity: String(service.capacity), locationArea: service.locationArea ?? '', mode: service.mode, cost: String(service.costPaisa / 100) } : emptyService());
  }, [open, service]);
  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useAction(() => {
    const body = { title: f.title.trim(), description: f.description.trim(), category: f.category.trim(), durationMin: Number(f.durationMin), capacity: Number(f.capacity), locationArea: f.locationArea.trim() || null, mode: f.mode, costPaisa: Math.round(Number(f.cost) * 100) };
    return service ? put(`/programs/org/services/${service.id}`, body) : post('/programs/org/services', body);
  }, { success: service ? 'Service updated' : 'Service created as a draft', invalidate: [['org-services']], onSuccess: onClose });
  const costErr = rupeesOk(f.cost) ? undefined : 'Enter an amount between 0 and 100,000';
  const descErr = f.description && f.description.trim().length < 10 ? 'At least 10 characters' : undefined;
  return (
    <Modal open={open} onClose={onClose} title={service ? 'Edit service' : 'New service'} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!costErr && !descErr) save.mutate(); }}>
        {service?.status === 'PUBLISHED' && <Notice tone="amber">Saving changes sends this service back for admin approval.</Notice>}
        <Input label="Title" required minLength={3} maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} />
        <Textarea label="Description" required maxLength={5000} value={f.description} onChange={(e) => set('description', e.target.value)} error={descErr} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Category" required minLength={2} maxLength={60} value={f.category} onChange={(e) => set('category', e.target.value)} />
          <Select label="Format" value={f.mode} onChange={(e) => set('mode', e.target.value as Mode)} options={MODE_OPTS} />
          <Input label="Duration (minutes)" type="number" min={15} max={600} required value={f.durationMin} onChange={(e) => set('durationMin', e.target.value)} />
          <Input label="Capacity" type="number" min={1} max={10000} required value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />
          <Input label="Location / area (optional)" maxLength={100} value={f.locationArea} onChange={(e) => set('locationArea', e.target.value)} />
          <Input label="Cost (Rs)" type="number" min={0} step="0.01" required value={f.cost} onChange={(e) => set('cost', e.target.value)} error={costErr} hint="0 for free" />
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!!(costErr || descErr)}>{service ? 'Save changes' : 'Create draft'}</Button></div>
      </form>
    </Modal>
  );
}

function ServiceActions({ s, verified, onEdit }: { s: Service; verified: boolean; onEdit: () => void }) {
  const confirm = useConfirm();
  const submit = useAction(() => post(`/programs/org/services/${s.id}/submit`), { success: 'Submitted for approval', invalidate: [['org-services']] });
  const archive = useAction(() => post(`/programs/org/services/${s.id}/archive`), { success: 'Service archived', invalidate: [['org-services']] });
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {s.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="size-3.5" />Edit</Button>}
      {['DRAFT', 'REJECTED'].includes(s.status) && <Button size="sm" variant="soft" disabled={!verified} title={verified ? undefined : 'Your organization must be verified before publishing'} loading={submit.isPending} onClick={() => submit.mutate()}>Submit</Button>}
      {s.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" loading={archive.isPending} onClick={async () => (await confirm({ title: 'Archive service?', message: 'It will no longer be listed for youth.', confirmLabel: 'Archive', danger: true })) && archive.mutate()}>Archive</Button>}
    </div>
  );
}

export function OrgServices() {
  const org = useApi<Org>(['org-me'], '/users/organization/me');
  const q = useApi<Service[]>(['org-services'], '/programs/org/services');
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);
  const verified = org.data?.verificationStatus === 'APPROVED';
  const edit = (s: Service | null) => { setEditing(s); setOpen(true); };
  return (
    <div className="space-y-4">
      <PageHeader title="Services" subtitle="Ongoing services young people can contact you about, such as drop-in support or skills sessions." action={<Button onClick={() => edit(null)}><Plus className="size-4" />New service</Button>} />
      {org.data && !verified && <Notice tone="amber">Submitting for approval is disabled until your organization is verified. <Link to="/organization/profile" className="font-medium underline">Complete verification</Link></Notice>}
      <Card>
        {q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <DataTable<Service> loading={q.isLoading} rows={q.data} rowKey={(s) => s.id} empty="No services yet" columns={[
            { key: 'title', header: 'Service', render: (s) => <div><p className="font-medium text-slate-900">{s.title}</p><p className="line-clamp-1 max-w-sm text-xs text-slate-500">{s.description}</p></div> },
            { key: 'cat', header: 'Category', render: (s) => s.category },
            { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
            { key: 'details', header: 'Details', render: (s) => <span className="text-xs text-slate-600"><Clock className="mr-1 inline size-3" />{s.durationMin} min · {s.capacity} people · {label(s.mode)}{s.locationArea ? ` · ${s.locationArea}` : ''}</span> },
            { key: 'cost', header: 'Cost', render: (s) => fmtMoney(s.costPaisa) },
            { key: 'actions', header: '', className: 'text-right', render: (s) => <ServiceActions s={s} verified={verified} onEdit={() => edit(s)} /> },
          ]} />
        )}
      </Card>
      <ServiceFormModal open={open} onClose={() => setOpen(false)} service={editing} />
    </div>
  );
}

// =====================================================================
// 12. OrgProfile
// =====================================================================
export function OrgProfile() {
  const q = useApi<Org>(['org-me'], '/users/organization/me');
  return (
    <div>
      <PageHeader title="Profile & staff" subtitle="Your organization's public details, verification and team access." />
      <Loaded q={q} rows={6}>{(org) => (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2"><OrgProfileForm org={org} /><StaffCard org={org} /></div>
          <OrgVerificationCard org={org} />
        </div>
      )}</Loaded>
    </div>
  );
}

function OrgProfileForm({ org }: { org: Org }) {
  const [f, setF] = useState({ name: org.name, description: org.description ?? '', contactEmail: org.contactEmail, contactPhone: org.contactPhone ?? '', locationArea: org.locationArea ?? '', languages: org.languages, operatingHours: org.operatingHours ?? '' });
  const [custom, setCustom] = useState('');
  const save = useAction(() => put('/users/organization/me', {
    name: f.name.trim(), description: f.description.trim() || null, contactEmail: f.contactEmail.trim(), contactPhone: f.contactPhone.trim() || null,
    locationArea: f.locationArea.trim() || null, languages: f.languages, operatingHours: f.operatingHours.trim() || null,
  }), { success: 'Profile saved', invalidate: [['org-me']] });
  const langOpts = [...LANG_OPTS, ...f.languages.filter((l) => !LANG_OPTS.some((o) => o.value === l)).map((l) => ({ value: l, label: l }))];
  const addLang = () => { const t = custom.trim(); if (t && !f.languages.includes(t)) setF({ ...f, languages: [...f.languages, t].slice(0, 20) }); setCustom(''); };
  return (
    <Card title="Organization details">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Organization name" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Textarea label="Description" maxLength={3000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Contact email" type="email" required value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
          <Input label="Contact phone (optional)" type="tel" maxLength={30} value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />
          <Input label="Location / area (optional)" maxLength={100} value={f.locationArea} onChange={(e) => setF({ ...f, locationArea: e.target.value })} />
          <Input label="Operating hours (optional)" maxLength={200} value={f.operatingHours} onChange={(e) => setF({ ...f, operatingHours: e.target.value })} placeholder="e.g. Sun–Fri, 10:00–17:00" />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Languages</legend>
          <ChipSelect options={langOpts} value={f.languages} onChange={(v) => setF({ ...f, languages: v.slice(0, 20) })} />
          <div className="flex max-w-sm gap-2">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} placeholder="Add another language…" aria-label="Add a custom language"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLang(); } }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm" />
            <Button size="sm" variant="outline" onClick={addLang} disabled={!custom.trim()}>Add</Button>
          </div>
        </fieldset>
        <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Save details</Button></div>
      </form>
    </Card>
  );
}

function OrgVerificationCard({ org }: { org: Org }) {
  const confirm = useConfirm();
  const submit = useAction(() => post('/users/organization/me/submit-verification'), { success: 'Submitted for verification', invalidate: [['org-me']] });
  const canSubmit = !['PENDING', 'APPROVED'].includes(org.verificationStatus);
  return (
    <Card title={<span className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-600" />Verification</span>}>
      <div className="space-y-4">
        <div className="flex items-center gap-2"><span className="text-sm text-slate-600">Status</span><StatusBadge status={org.verificationStatus} /></div>
        {org.verificationStatus === 'REJECTED' && org.rejectionReason && <Notice tone="rose"><span className="font-medium">Reason:</span> {org.rejectionReason}</Notice>}
        {org.verificationStatus === 'PENDING' && <Notice>An administrator is reviewing your documents.</Notice>}
        {org.verificationStatus === 'APPROVED' && <Notice tone="brand">Verified. You can submit programs and services for publishing.</Notice>}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Documents</p>
          {org.documents.length ? <ul className="space-y-1.5">{org.documents.map((d) => <li key={d.id} className="flex items-center gap-2 text-sm text-slate-700"><FileText className="size-4 text-slate-400" /><span className="min-w-0 flex-1 truncate">{d.fileName}</span><span className="text-xs text-slate-400">{fmtDate(d.uploadedAt)}</span></li>)}</ul>
            : <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
        </div>
        <UploadDocument url="/users/organization/me/documents" invalidate={[['org-me']]} />
        <Button className="w-full" disabled={!canSubmit || !org.documents.length} loading={submit.isPending}
          onClick={async () => (await confirm({ title: 'Submit for verification?', message: 'An administrator will review your organization details and documents.', confirmLabel: 'Submit' })) && submit.mutate()}>
          <Upload className="size-4" />Submit for verification
        </Button>
        {canSubmit && !org.documents.length && <p className="text-center text-xs text-slate-500">Upload at least one document first.</p>}
        {!canSubmit && <p className="text-center text-xs text-slate-500">{org.verificationStatus === 'APPROVED' ? 'Already verified.' : 'Already submitted — awaiting review.'}</p>}
      </div>
    </Card>
  );
}

function StaffCard({ org }: { org: Org }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [email, setEmail] = useState('');
  const isOwner = !!org.staff.find((s) => s.user.id === user?.id)?.isOwner;
  const add = useAction(() => post('/users/organization/me/staff', { email: email.trim() }), { success: 'Staff member added', invalidate: [['org-me']], onSuccess: () => setEmail('') });
  const remove = useAction((uid: string) => del(`/users/organization/me/staff/${uid}`), { success: 'Staff member removed', invalidate: [['org-me']] });
  return (
    <Card title="Staff" subtitle={isOwner ? 'Staff can manage programs, services and bookings.' : 'Only the organization owner can add or remove staff.'}>
      <ul className="divide-y divide-slate-100">
        {org.staff.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div><p className="text-sm font-medium text-slate-800">{s.user.displayName}{s.user.id === user?.id && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}</p><p className="text-xs text-slate-500">{s.user.email}</p></div>
            <div className="flex items-center gap-2">
              {s.isOwner ? <Badge tone="violet">Owner</Badge> : <Badge tone="slate">Staff</Badge>}
              {isOwner && !s.isOwner && s.user.id !== user?.id && (
                <Button size="sm" variant="ghost" aria-label={`Remove ${s.user.displayName}`} loading={remove.isPending && remove.variables === s.user.id}
                  onClick={async () => (await confirm({ title: 'Remove staff member?', message: `${s.user.displayName} will lose access to this organization.`, confirmLabel: 'Remove', danger: true })) && remove.mutate(s.user.id)}><Trash2 className="size-4" /></Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {isOwner && (
        <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4" onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(); }}>
          <div className="min-w-[220px] flex-1"><Input label="Add staff by email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} hint="They must already have registered an organization account on Sathi." /></div>
          <Button type="submit" loading={add.isPending} className="mb-5"><UserPlus className="size-4" />Add</Button>
        </form>
      )}
    </Card>
  );
}

