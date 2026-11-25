import {
  createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Loader2, Inbox, AlertTriangle, X, CheckCircle2, Info, ChevronLeft, ChevronRight, Search } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─────────────────────────── Buttons ───────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'soft';
export function Button({
  variant = 'primary', size = 'md', loading, className, children, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm active:scale-[.98]',
    outline:  'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
    ghost:    'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
    danger:   'bg-rose-600 text-white hover:bg-rose-700 shadow-sm active:scale-[.98]',
    soft:     'bg-brand-50 text-brand-700 hover:bg-brand-100',
  };
  const s: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };
  return (
    <button type="button" {...p} disabled={p.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-[0.75rem] font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        v[variant], s[size ?? 'md'], className,
      )}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ─────────────────────────── Form fields ───────────────────────────
const fieldBase = (error?: string) => cx(
  'w-full rounded-[0.75rem] border bg-white px-3.5 py-2.5 text-sm shadow-xs',
  'placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500',
  'disabled:bg-slate-50 disabled:text-slate-400',
  error ? 'border-rose-400 focus:ring-rose-300/30 focus:border-rose-400' : 'border-slate-200',
);

function Field({ label, error, hint, id, required, children }: {
  label?: string; error?: string; hint?: string; id?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      {label && (
        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
          {label}{required && <span className="text-rose-500">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span role="alert" className="flex items-center gap-1 text-xs text-rose-600"><AlertTriangle className="size-3" />{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
  label?: string; error?: string; hint?: string;
}>(({ label, error, hint, id, required, ...p }, ref) => (
  <Field label={label} error={error} hint={hint} id={id ?? p.name} required={required}>
    <input ref={ref} id={id ?? p.name} aria-invalid={!!error} required={required}
      {...p} className={cx(fieldBase(error), p.className)} />
  </Field>
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string; error?: string; hint?: string;
}>(({ label, error, hint, id, required, ...p }, ref) => (
  <Field label={label} error={error} hint={hint} id={id ?? p.name} required={required}>
    <textarea ref={ref} id={id ?? p.name} rows={4} aria-invalid={!!error} required={required}
      {...p} className={cx(fieldBase(error), p.className)} />
  </Field>
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string; error?: string; options: { value: string; label: string }[];
}>(({ label, error, options, id, required, ...p }, ref) => (
  <Field label={label} error={error} id={id ?? p.name} required={required}>
    <select ref={ref} id={id ?? p.name} required={required} {...p}
      className={cx(fieldBase(error), 'cursor-pointer', p.className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>
));
Select.displayName = 'Select';

export function SearchInput({ value, onChange, placeholder = 'Search…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} aria-label={placeholder}
        className="w-full rounded-[0.75rem] border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm shadow-xs transition focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2 group">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-brand-600' : 'bg-slate-200 group-hover:bg-slate-300')}>
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

export function ChipSelect({ options, value, onChange, multi = true }: {
  options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o.value) : [...value, o.value]) : [o.value])}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
              on ? 'border-brand-500 bg-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Display ───────────────────────────
export const Card = ({ title, subtitle, action, children, className, noPad }: {
  title?: ReactNode; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; noPad?: boolean;
}) => (
  <section className={cx('rounded-[1rem] border border-slate-200/80 bg-white shadow-[var(--shadow-card)]', !noPad && 'p-5', className)}>
    {(title || action) && (
      <header className={cx('flex flex-wrap items-start justify-between gap-2', !noPad && 'mb-4')}>
        <div>
          {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    {children}
  </section>
);

export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {action}
  </div>
);

type StatTone = 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'emerald';
const STAT_TONE: Record<StatTone, string> = {
  brand:   'bg-brand-50 text-brand-700 ring-brand-100',
  sky:     'bg-sky-50 text-sky-700 ring-sky-100',
  amber:   'bg-amber-50 text-amber-700 ring-amber-100',
  rose:    'bg-rose-50 text-rose-700 ring-rose-100',
  violet:  'bg-violet-50 text-violet-700 ring-violet-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
};
export const Stat = ({ label, value, icon, tone = 'brand', hint, delta }: {
  label: string; value: ReactNode; icon?: ReactNode; tone?: StatTone; hint?: string; delta?: { value: string; positive: boolean };
}) => (
  <div className="flex items-center gap-4 rounded-[1rem] border border-slate-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
    {icon && <div className={cx('grid size-12 place-items-center rounded-xl ring-1', STAT_TONE[tone])}>{icon}</div>}
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 leading-tight mt-0.5">{value}</p>
      {delta && <p className={cx('text-xs font-medium mt-0.5', delta.positive ? 'text-emerald-600' : 'text-rose-600')}>{delta.positive ? '↑' : '↓'} {delta.value}</p>}
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  </div>
);

const TONE_CLS = {
  brand:  'bg-brand-50  text-brand-700',
  slate:  'bg-slate-100 text-slate-600',
  amber:  'bg-amber-50  text-amber-700',
  rose:   'bg-rose-50   text-rose-700',
  sky:    'bg-sky-50    text-sky-700',
  green:  'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
} as const;
export type Tone = keyof typeof TONE_CLS;
export const Badge = ({ children, tone = 'brand' }: { children: ReactNode; tone?: Tone }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE_CLS[tone])}>
    {children}
  </span>
);

const STATUS_TONE: Record<string, Tone> = {
  CONFIRMED: 'green', APPROVED: 'green', PUBLISHED: 'green', READY: 'green', ACTIVE: 'green', COMPLETED: 'sky',
  SUCCESS: 'green', ACHIEVED: 'green', ATTENDED: 'green',
  PENDING: 'amber', PENDING_PAYMENT: 'amber', PENDING_COUNSELOR: 'amber', PENDING_APPROVAL: 'amber',
  PENDING_MODERATION: 'amber', PROPOSED: 'amber', CREATING: 'amber', FLAGGED: 'amber',
  IN_PROGRESS: 'sky', WAITLISTED: 'violet', APPEALED: 'violet', REQUESTED: 'amber',
  PROCESSING: 'amber', INITIATED: 'amber', PAUSED: 'slate', DRAFT: 'slate',
  DECLINED: 'rose', CANCELLED: 'slate', FAILED: 'rose', REJECTED: 'rose', REMOVED: 'rose',
  HIDDEN: 'rose', SUSPENDED: 'rose', EXPIRED: 'slate', MISSED: 'rose', OVERDUE: 'rose',
  NO_SHOW: 'rose', CLOSED: 'slate', ARCHIVED: 'slate', REFUNDED: 'sky',
};
export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONE[status] ?? 'slate'}>
    {status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
  </Badge>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cx('animate-pulse rounded-xl bg-slate-100', className)} />
);
export const LoadingBlock = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14" />)}
  </div>
);

export const EmptyState = ({ title, hint, action, icon }: {
  title: string; hint?: string; action?: ReactNode; icon?: ReactNode;
}) => (
  <div className="flex flex-col items-center py-12 text-center text-slate-500">
    <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200">
      {icon ?? <Inbox className="size-6" />}
    </div>
    <p className="font-medium text-slate-700">{title}</p>
    {hint && <p className="mt-1.5 max-w-sm text-sm">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
    <span className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" />{message}</span>
    {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
  </div>
);

export const Notice = ({ children, tone = 'sky' }: { children: ReactNode; tone?: 'sky' | 'amber' | 'rose' | 'brand' }) => {
  const cls = { sky: 'border-sky-100 bg-sky-50 text-sky-800', amber: 'border-amber-100 bg-amber-50 text-amber-800', rose: 'border-rose-100 bg-rose-50 text-rose-800', brand: 'border-brand-100 bg-brand-50 text-brand-800' }[tone];
  return (
    <div className={cx('flex gap-2.5 rounded-xl border p-3.5 text-sm', cls)}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden /><div>{children}</div>
    </div>
  );
};

export const Progress = ({ value, label }: { value: number; label?: string }) => (
  <div className="h-2 w-full rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-2 rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors', value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
          {t.label}
          {t.count != null && <span className={cx('ml-1.5 rounded-full px-1.5 text-xs', value === t.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Timeline({ items }: { items: { id: string; title: string; date: string | Date; meta?: string }[] }) {
  return (
    <ol className="relative ml-2 border-l border-slate-200 space-y-0">
      {items.map((i) => (
        <li key={i.id} className="mb-5 ml-5">
          <span className="absolute -left-1.5 mt-1 size-3 rounded-full border-2 border-white bg-brand-500 shadow-sm" aria-hidden />
          <p className="text-sm font-medium text-slate-800">{i.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{fmtDateTime(i.date)}{i.meta ? ` · ${i.meta}` : ''}</p>
        </li>
      ))}
    </ol>
  );
}

// ─────────────────────────── Table ───────────────────────────
export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string }
export function DataTable<T>({ columns, rows, rowKey, empty = 'No records', loading }: {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string; empty?: string; loading?: boolean;
}) {
  if (loading) return <LoadingBlock />;
  if (!rows?.length) return <EmptyState title={empty} />;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            {columns.map((c) => <th key={c.key} scope="col" className={cx('px-5 py-3 font-semibold', c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-slate-50/70 transition-colors">
              {columns.map((c) => <td key={c.key} className={cx('px-5 py-3.5 align-top', c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
      <span className="text-slate-500 text-xs">Page <strong>{page}</strong> of {pages}</span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
    </nav>
  );
}

// ─────────────────────────── Modal ───────────────────────────
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cx('max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-[var(--shadow-panel)] outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-2xl">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50/50 rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  );
}

// ─────────────────────────── Toasts & Confirm ───────────────────────────
type ToastT = { id: number; message: string; tone: 'success' | 'error' | 'info' };
type ConfirmOpts = { title: string; message: string; confirmLabel?: string; danger?: boolean };
const UiCtx = createContext<{ toast: (m: string, tone?: ToastT['tone']) => void; confirm: (o: ConfirmOpts) => Promise<boolean> }>(null!);
export const useToast = () => useContext(UiCtx).toast;
export const useConfirm = () => useContext(UiCtx).confirm;

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const toast = useCallback((message: string, tone: ToastT['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);
  const close = (v: boolean) => { dialog?.resolve(v); setDialog(null); };

  const toastStyle: Record<ToastT['tone'], string> = {
    success: 'bg-brand-700 text-white',
    error:   'bg-rose-600 text-white',
    info:    'bg-slate-800 text-white',
  };

  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed right-4 bottom-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className={cx('flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-lg pointer-events-auto animate-in slide-in-from-right-5 duration-300', toastStyle[t.tone])}>
            {t.tone === 'error' ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
      <Modal open={!!dialog} onClose={() => close(false)} title={dialog?.title ?? ''}
        footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dialog?.confirmLabel ?? 'Confirm'}</Button></>}>
        <p className="text-sm text-slate-600">{dialog?.message}</p>
      </Modal>
    </UiCtx.Provider>
  );
}

// ─────────────────────────── Formatting helpers ───────────────────────────
export const fmtDate     = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (d: string | Date) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtTime     = (d: string | Date) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
export const fmtMoney    = (paisa: number) => paisa ? `Rs ${(paisa / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Free';
export const label       = (s: string) => s.replace(/[_-]/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
