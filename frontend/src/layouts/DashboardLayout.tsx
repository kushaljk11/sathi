import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  HeartHandshake, LayoutDashboard, SmilePlus, Users, CalendarDays, ShieldCheck, Building2, SlidersHorizontal, LogOut, LifeBuoy, ClipboardList,
  Route as RouteIcon, LineChart, Sparkles, MessagesSquare, BookOpen, Bell, Lock, Settings, UserCircle, Clock, Briefcase, FileCheck2,
  Flag, CreditCard, ScrollText, Cog, ListChecks, Menu, X, Video, Server,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { cx } from '../components/ui';

type Item = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
type Group = { title?: string; items: Item[] };

const NAV: Record<string, Group[]> = {
  YOUTH: [
    { items: [{ to: '/youth', label: 'Home', icon: LayoutDashboard, end: true }, { to: '/youth/check-in', label: 'Check-in', icon: SmilePlus }, { to: '/youth/assessment', label: 'Support assessment', icon: ClipboardList }] },
    { title: 'Support', items: [{ to: '/youth/matches', label: 'Find a counselor', icon: Users }, { to: '/youth/appointments', label: 'Appointments', icon: CalendarDays }, { to: '/youth/journey', label: 'My journey', icon: RouteIcon }, { to: '/youth/progress', label: 'Progress', icon: LineChart }] },
    { title: 'Explore', items: [{ to: '/youth/programs', label: 'Programs', icon: Sparkles }, { to: '/community', label: 'Community', icon: MessagesSquare }, { to: '/resources', label: 'Resources', icon: BookOpen }] },
    { title: 'Account', items: [{ to: '/youth/privacy', label: 'Privacy center', icon: Lock }, { to: '/settings', label: 'Settings', icon: Settings }] },
  ],
  COUNSELOR: [
    { items: [{ to: '/counselor', label: 'Workspace', icon: LayoutDashboard, end: true }, { to: '/counselor/appointments', label: 'Appointments', icon: CalendarDays }, { to: '/counselor/clients', label: 'Clients', icon: Users }] },
    { title: 'Practice', items: [{ to: '/counselor/availability', label: 'Availability', icon: Clock }, { to: '/counselor/profile', label: 'Profile & verification', icon: UserCircle }, { to: '/counselor/settings', label: 'Google Meet', icon: Video }] },
    { title: 'More', items: [{ to: '/community', label: 'Community', icon: MessagesSquare }, { to: '/resources', label: 'Resources', icon: BookOpen }, { to: '/settings', label: 'Settings', icon: Settings }] },
  ],
  ORGANIZATION: [
    { items: [{ to: '/organization', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/organization/programs', label: 'Programs', icon: Sparkles }, { to: '/organization/services', label: 'Services', icon: Briefcase }] },
    { title: 'Organization', items: [{ to: '/organization/profile', label: 'Profile & staff', icon: Building2 }, { to: '/resources', label: 'Resources', icon: BookOpen }, { to: '/settings', label: 'Settings', icon: Settings }] },
  ],
  ADMIN: [
    { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/admin/users', label: 'Users', icon: Users }] },
    { title: 'Review', items: [{ to: '/admin/verifications', label: 'Verifications', icon: FileCheck2 }, { to: '/admin/approvals', label: 'Listing approvals', icon: ListChecks }, { to: '/admin/moderation', label: 'Moderation', icon: Flag }] },
    { title: 'Content & config', items: [{ to: '/admin/resources', label: 'Resources', icon: BookOpen }, { to: '/admin/assessment', label: 'Assessment', icon: ClipboardList }, { to: '/admin/matching', label: 'Matching weights', icon: SlidersHorizontal }, { to: '/admin/settings', label: 'Platform settings', icon: Cog }] },
    { title: 'Operations', items: [{ to: '/admin/payments', label: 'Payments & refunds', icon: CreditCard }, { to: '/admin/audit', label: 'Audit logs', icon: ScrollText }, { to: '/admin/jobs', label: 'Background jobs', icon: Server }] },
  ],
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useApi<{ unread: number }>(['notifications', 'unread'], user ? '/notifications?pageSize=1' : null, { refetchInterval: 60_000 });
  if (!user) return null;
  const sidebar = (
    <nav aria-label="Main" className="space-y-5">
      {NAV[user.role].map((g, i) => (
        <div key={i}>
          {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g.title}</p>}
          <div className="space-y-0.5">
            {g.items.map((n) => (
              <NavLink key={n.to + n.label} to={n.to} end={n.end} onClick={() => setOpen(false)}
                className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}>
                <n.icon className="size-4" aria-hidden />{n.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">Skip to content</a>
      <aside className="hidden border-r border-slate-200 bg-white p-4 lg:block">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2 text-brand-700"><HeartHandshake className="size-7" /><span className="text-xl font-bold">Sathi</span></Link>
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><span className="flex items-center gap-2 text-brand-700"><HeartHandshake className="size-7" /><span className="text-xl font-bold">Sathi</span></span><button aria-label="Close menu" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
            <p className="hidden text-sm text-slate-500 sm:block">Hi, <span className="font-medium text-slate-800">{user.displayName}</span></p>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link to="/safety" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"><LifeBuoy className="size-4" /><span className="hidden sm:inline">Urgent help</span></Link>
            <Link to="/notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Notifications${unread.data?.unread ? `, ${unread.data.unread} unread` : ''}`}>
              <Bell className="size-5" />{!!unread.data?.unread && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread.data.unread > 9 ? '9+' : unread.data.unread}</span>}
            </Link>
            <button onClick={async () => { await logout(); nav('/login'); }} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </header>
        {!user.emailVerified && <div className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 md:px-8">Please verify your email address — check your inbox for the link.</div>}
        <main id="main" className="mx-auto max-w-7xl p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
