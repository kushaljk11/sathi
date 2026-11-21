import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';

type Variant = 'primary' | 'secondary' | 'ghost' | 'light' | 'glass';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700 hover:shadow-brand-700/30',
  secondary: 'border border-slate-200 bg-white/80 text-slate-800 shadow-sm backdrop-blur hover:border-slate-300 hover:bg-white',
  ghost: 'text-slate-700 hover:bg-slate-900/5 hover:text-slate-900',
  light: 'bg-white text-brand-700 shadow-lg shadow-slate-900/10 hover:bg-brand-50',
  glass: 'border border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20',
};

export const buttonCls = (variant: Variant = 'primary', size: 'sm' | 'md' | 'lg' = 'md', className?: string) =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,color,transform] duration-200 active:scale-[0.98]',
    size === 'sm' ? 'px-4 py-2 text-sm' : size === 'md' ? 'px-5 py-2.5 text-sm' : 'px-6 py-3.5 text-base',
    VARIANTS[variant],
    className,
  );

/** Router link styled as a button. Use `href` for in-page anchors (#id). */
export function ButtonLink({ to, href, variant, size, className, children, onClick }: { to?: string; href?: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode; onClick?: () => void }) {
  const cls = buttonCls(variant, size, className);
  if (href) return <a href={href} className={cls} onClick={onClick}>{children}</a>;
  return <Link to={to ?? '/'} className={cls} onClick={onClick}>{children}</Link>;
}
