import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cx } from '../../components/ui';
import { useMotionVariants } from '../animations/variants';

const TONES = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
} as const;
export type FeatureTone = keyof typeof TONES;

export function FeatureIcon({ icon: Icon, tone = 'brand', className }: { icon: LucideIcon; tone?: FeatureTone; className?: string }) {
  return (
    <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl ring-1', TONES[tone], className)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/**
 * Feature card. Optional `how` list renders an accessible "How it works" disclosure;
 * optional `visual` renders a small illustration inside the card (used in the bento grid).
 */
export function FeatureCard({ icon, title, summary, how, visual, tone = 'brand', className, headingLevel = 3 }: {
  icon: LucideIcon; title: string; summary: string; how?: readonly string[]; visual?: ReactNode; tone?: FeatureTone; className?: string; headingLevel?: 2 | 3 | 4;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const v = useMotionVariants();
  const H = `h${headingLevel}` as 'h3';
  return (
    <motion.article
      variants={v.fadeUp}
      className={cx(
        'group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] transition-[box-shadow,border-color] duration-300 hover:border-brand-100 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(14,133,131,0.25)]',
        className,
      )}
    >
      <FeatureIcon icon={icon} tone={tone} />
      <H className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</H>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-600">{summary}</p>
      {visual && <div className="mt-6 flex-1">{visual}</div>}
      {how && how.length > 0 && (
        <div className="mt-auto pt-5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-brand-700 hover:text-brand-600"
          >
            How it works
            <ChevronDown className={cx('size-4 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
            <span className="sr-only"> — {title}</span>
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ol
                id={id}
                initial={{ opacity: 0, y: v.reduce ? 0 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-3 space-y-2 border-t border-slate-100 pt-3"
              >
                {how.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700" aria-hidden>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.article>
  );
}
