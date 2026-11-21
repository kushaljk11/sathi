import { Link } from 'react-router-dom';
import { LifeBuoy, Lock } from 'lucide-react';
import { footerColumns } from '../data/navigation';
import { Logo } from './Logo';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-slate-200/80 bg-white" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Site footer</h2>
      <div className="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Logo />
            <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-slate-600">
              Sathi helps young people find trusted support early — and stay supported, with counselors, programs and progress in one caring place.
            </p>
            <Link
              to="/safety"
              className="mt-6 inline-flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm text-rose-900 transition-colors hover:bg-rose-50"
            >
              <LifeBuoy className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
              <span>
                <span className="block font-semibold">Not an emergency service</span>
                <span className="text-rose-800">If you or someone else is in danger, get urgent help now →</span>
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {footerColumns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.to + l.label}>
                      <Link to={l.to} className="rounded text-sm text-slate-600 transition-colors hover:text-brand-700">{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-4 border-t border-slate-100 pt-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <p className="flex items-start gap-2 md:max-w-2xl">
            <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <span>Your privacy matters. Sensitive information is shared only with your consent, and Sathi is not a diagnostic tool or a replacement for professional care.</span>
          </p>
          <p className="shrink-0">© {year} Sathi. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
