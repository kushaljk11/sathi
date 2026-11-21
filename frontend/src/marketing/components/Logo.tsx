import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';

/** Sathi mark: two overlapping rounded forms (companionship) forming a heart. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('size-8', className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id="sathi-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14a3a0" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#sathi-mark)" />
      <path d="M16 24.5s-7.5-4.4-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10Z" fill="#fff" fillOpacity=".95" />
      <path d="M11.5 15.2h3l1.5-2.4 1.6 4.4 1.3-2h2.6" fill="none" stroke="#0e8583" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className={cx('group inline-flex items-center gap-2.5 rounded-xl', className)} aria-label="Sathi home">
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      <span className="text-lg font-semibold tracking-tight text-slate-900">sathi</span>
    </Link>
  );
}
