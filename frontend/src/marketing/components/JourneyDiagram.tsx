import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Check, Pause, Play } from 'lucide-react';
import { cx } from '../../components/ui';
import { EASE } from '../animations/variants';
import { journeySteps } from '../data/features';
import { EmojiScale, FactorBars, QuestionMini, TaskList, TrendMini, MeetMini } from './MiniVisuals';

const DURATION = 5000;

function StepVisual({ index }: { index: number }) {
  switch (index) {
    case 0: return <EmojiScale />;
    case 1: return <QuestionMini />;
    case 2: return <FactorBars />;
    case 3: return <div className="space-y-3"><MeetMini /><TaskList /></div>;
    default: return <TrendMini />;
  }
}

/**
 * "How Sathi works" — a 5-step interactive diagram. The connecting line draws on scroll,
 * the active step auto-advances (paused on hover/focus, when off-screen, or with reduced motion),
 * and every step is a keyboard-accessible tab.
 */
export function JourneyDiagram() {
  const [active, setActive] = useState(0);
  const [hoverPause, setHoverPause] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useInView(ref, { amount: 0.35 });
  const playing = !reduce && !userPaused && !hoverPause && inView;
  const n = journeySteps.length;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % n), DURATION);
    return () => window.clearTimeout(t);
  }, [active, playing, n]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = (map[e.key] + n) % n;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const step = journeySteps[active];
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHoverPause(true)}
      onMouseLeave={() => setHoverPause(false)}
      onFocus={() => setHoverPause(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverPause(false); }}
    >
      {/* rail */}
      <div className="relative">
        <div aria-hidden className="absolute top-6 right-[10%] left-[10%] h-0.5 sm:top-7">
          <motion.div
            className="h-full w-full origin-left rounded-full bg-slate-200"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 1.2, ease: EASE }}
          />
          <motion.div
            className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-brand-500 via-sky-500 to-violet-500"
            animate={{ scaleX: active / (n - 1) }} transition={{ duration: 0.6, ease: EASE }}
          />
        </div>
        <div role="tablist" aria-label="How Sathi works — steps" className="relative grid grid-cols-5 gap-1">
          {journeySteps.map((s, i) => {
            const Icon = s.icon;
            const on = i === active;
            const done = i < active;
            return (
              <button
                key={s.id}
                ref={(el) => { tabs.current[i] = el; }}
                role="tab"
                id={`journey-tab-${s.id}`}
                aria-selected={on}
                aria-controls="journey-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                className="group flex flex-col items-center gap-2 rounded-2xl px-1 py-1 text-center"
              >
                <span
                  className={cx(
                    'relative grid size-12 place-items-center rounded-2xl border transition-[background-color,border-color,color,box-shadow] duration-300 sm:size-14',
                    on ? 'border-brand-600 bg-brand-600 text-white shadow-lg shadow-brand-600/30' : done ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 group-hover:border-brand-200 group-hover:text-brand-700',
                  )}
                >
                  {done ? <Check className="size-5" aria-hidden /> : <Icon className="size-5 sm:size-6" aria-hidden />}
                  {on && !reduce && (
                    <motion.span layoutId="journey-ring" aria-hidden className="absolute -inset-1.5 rounded-[1.1rem] ring-2 ring-brand-500/30" transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
                  )}
                </span>
                <span className={cx('text-[11px] leading-tight font-semibold sm:text-sm', on ? 'text-slate-900' : 'text-slate-500')}>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.title}</span>
                </span>
                <span className="sr-only">Step {i + 1} of {n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* panel */}
      <div
        id="journey-panel"
        role="tabpanel"
        aria-labelledby={`journey-tab-${step.id}`}
        className="relative mt-10 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur"
      >
        {/* auto-advance timer */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-slate-100">
          {playing && (
            <motion.div key={active} className="h-full w-full origin-left bg-brand-500" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: DURATION / 1000, ease: 'linear' }} />
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -8 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="grid gap-8 p-6 sm:p-10 md:grid-cols-2 md:items-center"
          >
            <div>
              <p className="text-sm font-semibold text-brand-700">Step {active + 1} of {n}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-slate-600">{step.text}</p>
              <ul className="mt-5 space-y-2.5">
                {step.detail.map((d) => (
                  <li key={d} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Check className="size-3.5" aria-hidden /></span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:pl-4"><StepVisual index={active} /></div>
          </motion.div>
        </AnimatePresence>
      </div>
      {!reduce && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-pressed={userPaused}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            {userPaused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            {userPaused ? 'Resume auto-play' : 'Pause auto-play'}
          </button>
        </div>
      )}
    </div>
  );
}
