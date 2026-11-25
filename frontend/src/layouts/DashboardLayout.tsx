import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  HeartHandshake,
  LayoutDashboard,
  SmilePlus,
  Users,
  CalendarDays,
  ShieldCheck,
  Building2,
  SlidersHorizontal,
  LogOut,
  LifeBuoy,
  ClipboardList,
  Route as RouteIcon,
  LineChart,
  Sparkles,
  MessagesSquare,
  BookOpen,
  Bell,
  Lock,
  Settings,
  UserCircle,
  Clock,
  Briefcase,
  FileCheck2,
  Flag,
  CreditCard,
  ScrollText,
  Cog,
  ListChecks,
  Menu,
  X,
  Video,
  Server,
  Newspaper,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../hooks';
import { cx } from '../components/ui';

type Item = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
type Group = { title?: string; items: Item[] };

const NAV: Record<string, Group[]> = {
  YOUTH: [
    {
      items: [
        { to: '/youth', label: 'Home', icon: LayoutDashboard, end: true },
        { to: '/youth/check-in', label: 'Check-in', icon: SmilePlus },
        { to: '/youth/assessment', label: 'Support assessment', icon: ClipboardList },
      ],
    },
    {
      title: 'Support',
      items: [
        { to: '/youth/matches', label: 'Find a counselor', icon: Users },
        { to: '/youth/appointments', label: 'Appointments', icon: CalendarDays },
        { to: '/youth/journey', label: 'My journey', icon: RouteIcon },
        { to: '/youth/progress', label: 'Progress', icon: LineChart },
      ],
    },
    {
      title: 'Explore',
      items: [
        { to: '/youth/programs', label: 'Programs', icon: Sparkles },
        { to: '/community', label: 'Community', icon: MessagesSquare },
        { to: '/resources', label: 'Resources', icon: BookOpen },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/youth/privacy', label: 'Privacy center', icon: Lock },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  COUNSELOR: [
    {
      items: [
        { to: '/counselor', label: 'Workspace', icon: LayoutDashboard, end: true },
        { to: '/counselor/appointments', label: 'Appointments', icon: CalendarDays },
        { to: '/counselor/clients', label: 'Clients', icon: Users },
      ],
    },
    {
      title: 'Practice',
      items: [
        { to: '/counselor/availability', label: 'Availability', icon: Clock },
        { to: '/counselor/profile', label: 'Profile & verification', icon: UserCircle },
        { to: '/counselor/settings', label: 'Google Meet', icon: Video },
      ],
    },
    {
      title: 'More',
      items: [
        { to: '/community', label: 'Community', icon: MessagesSquare },
        { to: '/resources', label: 'Resources', icon: BookOpen },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  ORGANIZATION: [
    {
      items: [
        { to: '/organization', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/organization/programs', label: 'Programs', icon: Sparkles },
        { to: '/organization/services', label: 'Services', icon: Briefcase },
      ],
    },
    {
      title: 'Organization',
      items: [
        { to: '/organization/profile', label: 'Profile & staff', icon: Building2 },
        { to: '/resources', label: 'Resources', icon: BookOpen },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  ADMIN: [
    {
      items: [
        { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/admin/users', label: 'Users', icon: Users },
      ],
    },
    {
      title: 'Review',
      items: [
        { to: '/admin/verifications', label: 'Verifications', icon: FileCheck2 },
        { to: '/admin/approvals', label: 'Listing approvals', icon: ListChecks },
        { to: '/admin/moderation', label: 'Moderation', icon: Flag },
      ],
    },
    {
      title: 'Content & config',
      items: [
        { to: '/admin/resources', label: 'Resources', icon: BookOpen },
        { to: '/admin/blog', label: 'Blog', icon: Newspaper },
        { to: '/admin/contact', label: 'Contact inbox', icon: Mail },
        { to: '/admin/assessment', label: 'Assessment', icon: ClipboardList },
        { to: '/admin/matching', label: 'Matching weights', icon: SlidersHorizontal },
        { to: '/admin/settings', label: 'Platform settings', icon: Cog },
      ],
    },
    {
      title: 'Operations',
      items: [
        { to: '/admin/payments', label: 'Payments & refunds', icon: CreditCard },
        { to: '/admin/audit', label: 'Audit logs', icon: ScrollText },
        { to: '/admin/jobs', label: 'Background jobs', icon: Server },
      ],
    },
  ],
};

const ROLE_COLOR: Record<string, string> = {
  YOUTH: 'bg-teal-100 text-teal-700',
  COUNSELOR: 'bg-violet-100 text-violet-700',
  ORGANIZATION: 'bg-sky-100 text-sky-700',
  ADMIN: 'bg-rose-100 text-rose-700',
};

const ROLE_LABEL: Record<string, string> = {
  YOUTH: 'Youth',
  COUNSELOR: 'Counselor',
  ORGANIZATION: 'Organization',
  ADMIN: 'Admin',
};

function AvatarInitials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 font-semibold text-white',
        className ?? 'size-9 text-sm',
      )}
    >
      {initials}
    </span>
  );
}

function useBreadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    label: seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    to: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));
  return crumbs;
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const crumbs = useBreadcrumb();
  const unread = useApi<{ unread: number }>(
    ['notifications', 'unread'],
    user ? '/notifications?pageSize=1' : null,
    { refetchInterval: 60_000 },
  );
  if (!user) return null;

  const sidebar = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV[user.role].map((g, i) => (
        <div key={i} className={i > 0 ? 'mt-3' : ''}>
          {g.title && (
            <p className="mb-1 px-3 text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              {g.title}
            </p>
          )}
          <div className="space-y-0.5">
            {g.items.map((n) => (
              <NavLink
                key={n.to + n.label}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-800/20'
                      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <n.icon
                      className={cx(
                        'size-4 shrink-0 transition-transform duration-150',
                        !isActive && 'group-hover:scale-110',
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-900/40">
          <HeartHandshake className="size-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">Sathi</span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">{sidebar}</div>

      {/* User footer */}
      <div className="border-t border-slate-700/50 px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <AvatarInitials name={user.displayName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
            <span
              className={cx(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                ROLE_COLOR[user.role],
              )}
            >
              {ROLE_LABEL[user.role]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-0 h-screen overflow-hidden">{sidebarContent}</div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          aria-modal="true"
          role="dialog"
          aria-label="Navigation"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <aside
            className="absolute left-0 top-0 h-full w-72 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-full">
              {sidebarContent}
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content column */}
      <div className="flex min-w-0 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
                aria-label="Open navigation menu"
                onClick={() => setOpen(true)}
              >
                <Menu className="size-5" />
              </button>

              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-sm sm:flex">
                {crumbs.map((c, i) => (
                  <span key={c.to} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3.5 text-slate-400" />}
                    {c.isLast ? (
                      <span className="font-semibold text-slate-800">{c.label}</span>
                    ) : (
                      <Link to={c.to} className="text-slate-500 hover:text-brand-600">
                        {c.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>

              {/* Mobile: greeting */}
              <p className="text-sm font-medium text-slate-700 sm:hidden">
                Hi, {user.displayName.split(' ')[0]}
              </p>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1">
              <Link
                to="/safety"
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LifeBuoy className="size-4" />
                <span className="hidden sm:inline">Urgent help</span>
              </Link>

              <Link
                to="/notifications"
                className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label={`Notifications${unread.data?.unread ? `, ${unread.data.unread} unread` : ''}`}
              >
                <Bell className="size-5" />
                {!!unread.data?.unread && (
                  <span className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 py-px text-[10px] font-bold leading-none text-white">
                    {unread.data.unread > 9 ? '9+' : unread.data.unread}
                  </span>
                )}
              </Link>

              <button
                onClick={async () => {
                  await logout();
                  nav('/login');
                }}
                className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Email verification banner */}
        {!user.emailVerified && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 md:px-6">
            📧 Please verify your email address — check your inbox for the confirmation link.
          </div>
        )}

        {/* Page content */}
        <main id="main" className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
