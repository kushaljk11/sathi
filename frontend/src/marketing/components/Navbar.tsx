import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowRight, LayoutDashboard, Menu, X, LifeBuoy } from 'lucide-react';
import { cx } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { homeFor } from '../../pages/Auth';
import { mainNav } from '../data/navigation';
import { useMotionVariants } from '../animations/variants';
import { Logo } from './Logo';
import { buttonCls } from './ButtonLink';

const isActive = (pathname: string, to: string, end?: boolean) => (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));

export function Navbar() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));
  const closeMenu = useCallback(() => { setOpen(false); toggleRef.current?.focus(); }, []);

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cx(
        'sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300',
        scrolled ? 'border-b border-slate-200/70 bg-white/75 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/65' : 'border-b border-transparent bg-transparent',
      )}
    >
      <a href="#main" className="sr-only rounded-lg bg-white px-4 py-2 font-medium text-brand-700 shadow focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50">Skip to content</a>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <Logo />
        <ul className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => {
            const active = isActive(pathname, item.to, item.end);
            return (
              <li key={item.to} className="relative">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={cx('relative z-10 block rounded-full px-4 py-2 text-sm font-medium transition-colors', active ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900')}
                >
                  {item.label}
                </NavLink>
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-brand-50 ring-1 ring-brand-100"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <div className="hidden items-center gap-2 lg:flex">
          {loading ? <span className="h-10 w-56" aria-hidden /> : user ? (
            <Link to={homeFor(user.role)} className={buttonCls('primary', 'md')}><LayoutDashboard className="size-4" aria-hidden />Go to dashboard</Link>
          ) : (
            <>
              <Link to="/login" className={buttonCls('ghost', 'md')}>Login</Link>
              <Link to="/register" className={buttonCls('primary', 'md')}>Get Started <ArrowRight className="size-4" aria-hidden /></Link>
            </>
          )}
        </div>
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Open menu"
          className="grid size-11 place-items-center rounded-full text-slate-700 hover:bg-slate-900/5 lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </nav>
      <MobileDrawer open={open} onClose={closeMenu} pathname={pathname} />
    </header>
  );
}

function MobileDrawer({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const { user } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const v = useMotionVariants();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const els = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); window.clearTimeout(t); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={v.reduce ? { opacity: 0 } : { x: '100%' }}
            animate={v.reduce ? { opacity: 1 } : { x: 0 }}
            exit={v.reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col bg-white shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
              <Logo onClick={onClose} />
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className="grid size-11 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <motion.ul className="flex-1 space-y-1 overflow-y-auto p-4" variants={v.stagger(0.05, 0.1)} initial="hidden" animate="show">
              {mainNav.map((item) => {
                const active = isActive(pathname, item.to, item.end);
                return (
                  <motion.li key={item.to} variants={v.fadeUp}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={cx('flex items-center justify-between rounded-2xl px-4 py-3.5 text-base font-medium transition-colors', active ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50')}
                    >
                      {item.label}
                      {active && <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />}
                    </NavLink>
                  </motion.li>
                );
              })}
            </motion.ul>
            <div className="space-y-3 border-t border-slate-100 p-5">
              {user ? (
                <Link to={homeFor(user.role)} onClick={onClose} className={buttonCls('primary', 'lg', 'w-full')}><LayoutDashboard className="size-4" aria-hidden />Go to dashboard</Link>
              ) : (
                <>
                  <Link to="/register" onClick={onClose} className={buttonCls('primary', 'lg', 'w-full')}>Get Started <ArrowRight className="size-4" aria-hidden /></Link>
                  <Link to="/login" onClick={onClose} className={buttonCls('secondary', 'lg', 'w-full')}>Login</Link>
                </>
              )}
              <Link to="/safety" onClick={onClose} className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
                <LifeBuoy className="size-4" aria-hidden /> Need urgent help?
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
