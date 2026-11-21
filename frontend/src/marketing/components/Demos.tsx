import { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarCheck, Check, ClipboardCheck, EyeOff, FileText, Lock, Route, Unlock, Video, Info } from 'lucide-react';
import { cx } from '../../components/ui';
import { EASE } from '../animations/variants';
import { consentCategories, matchingFactors } from '../data/features';

/* ================================================================== */
/* Explainable match demo                                              */
/* ================================================================== */
type FactorId = (typeof matchingFactors)[number]['id'];

const PREFS = {
  concern: { label: 'What would you like help with?', options: ['Exam stress', 'Sleep', 'Friendships'] },
  language: { label: 'Preferred language', options: ['English', 'Nepali', 'Maithili'] },
  mode: { label: 'Session format', options: ['Online', 'In person', 'Either'] },
  time: { label: 'Best time for you', options: ['Weekday evenings', 'Weekends'] },
} as const;
type PrefKey = keyof typeof PREFS;

/** Example counselor: focuses on stress & sleep, speaks English and Nepali, online only, evenings. */
function scoreFor(p: Record<PrefKey, number>): Record<FactorId, number> {
  const concern = [95, 88, 45][p.concern];
  return {
    concern,
    specialization: [90, 85, 55][p.concern],
    language: [100, 100, 30][p.language],
    availability: [92, 45][p.time],
    location: p.mode === 1 ? 50 : 100,
    mode: [100, 35, 100][p.mode],
  };
}

function Ring({ value }: { value: number }) {
  return (
    <div className="relative grid size-28 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <motion.circle cx="50" cy="50" r="42" fill="none" stroke="#0e8583" strokeWidth="8" strokeLinecap="round" animate={{ pathLength: value / 100 }} initial={false} transition={{ duration: 0.6, ease: EASE }} />
      </svg>
      <p className="text-center"><span className="block text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</span><span className="text-xs text-slate-500">out of 100</span></p>
    </div>
  );
}

export function MatchDemo() {
  const [prefs, setPrefs] = useState<Record<PrefKey, number>>({ concern: 0, language: 1, mode: 0, time: 0 });
  const [focus, setFocus] = useState<FactorId | null>(null);
  const hintId = useId();
  const scores = useMemo(() => scoreFor(prefs), [prefs]);
  const rows = matchingFactors.map((f) => ({ ...f, score: scores[f.id], points: Math.round((f.weight * scores[f.id]) / 100) }));
  const total = Math.round(rows.reduce((s, r) => s + (r.weight * r.score) / 100, 0));
  const strong = rows.filter((r) => r.score >= 80);
  const partial = rows.filter((r) => r.score < 60);
  const focused = rows.find((r) => r.id === focus);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_70px_-40px_rgba(15,23,42,0.35)]">
      <div className="grid lg:grid-cols-[1fr_1.25fr]">
        <fieldset className="border-b border-slate-100 bg-slate-50/70 p-6 sm:p-8 lg:border-r lg:border-b-0">
          <legend className="sr-only">Your preferences (example)</legend>
          <p className="text-sm font-semibold text-slate-900">Try it: tell us about you</p>
          <p className="mt-1 text-sm text-slate-500">Change a preference and watch the explanation update.</p>
          <div className="mt-6 space-y-5">
            {(Object.keys(PREFS) as PrefKey[]).map((k) => (
              <div key={k} role="radiogroup" aria-label={PREFS[k].label}>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{PREFS[k].label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PREFS[k].options.map((o, i) => {
                    const on = prefs[k] === i;
                    return (
                      <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPrefs((p) => ({ ...p, [k]: i }))}
                        className={cx('rounded-full border px-3.5 py-1.5 text-sm transition-colors', on ? 'border-brand-600 bg-brand-600 font-medium text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300')}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-5">
            <Ring value={total} />
            <div>
              <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Example counselor</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">Match score {total}/100</p>
              <p className="text-sm text-slate-500">Focus: stress & sleep · English, Nepali · Online · Evenings</p>
            </div>
          </div>
          <p className="mt-6 text-sm font-semibold text-slate-900">Why this match?</p>
          <ul className="mt-3 space-y-2.5" aria-describedby={hintId}>
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseEnter={() => setFocus(r.id)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(r.id)}
                  onBlur={() => setFocus(null)}
                  aria-label={`${r.label}: ${r.points} of ${r.weight} points. ${r.hint}`}
                  className={cx('grid w-full grid-cols-[7rem_1fr_3rem] items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm transition-colors sm:grid-cols-[8.5rem_1fr_3rem]', focus === r.id ? 'bg-slate-100' : 'hover:bg-slate-50')}
                >
                  <span className="truncate text-slate-700">{r.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.span
                      className={cx('block h-full w-full origin-left rounded-full', r.score >= 80 ? 'bg-brand-500' : r.score >= 60 ? 'bg-sky-400' : 'bg-amber-400')}
                      animate={{ scaleX: r.score / 100 }} initial={false} transition={{ duration: 0.5, ease: EASE }}
                    />
                  </span>
                  <span className="text-right font-medium text-slate-600 tabular-nums">{r.points}/{r.weight}</span>
                </button>
              </li>
            ))}
          </ul>
          <p id={hintId} aria-live="polite" className="mt-3 flex min-h-10 items-start gap-2 text-sm text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {focused ? focused.hint : 'Hover or focus a factor to see what it measures. Weights reflect how much each factor counts.'}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-800">Strong match on</p>
              <p className="mt-1 text-sm text-emerald-900">{strong.length ? strong.map((s) => s.label).join(', ') : '—'}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800">Partial match on</p>
              <p className="mt-1 text-sm text-amber-900">{partial.length ? partial.map((s) => s.label).join(', ') : 'Nothing — a close fit'}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Illustrative example with a fictional counselor. Real suggestions use your assessment and verified counselor profiles, and you always make the final choice.</p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Consent toggle demo                                                 */
/* ================================================================== */
const PREVIEW: Record<string, string> = {
  ASSESSMENT_SUMMARY: 'Looking for help with exam stress; prefers online sessions.',
  SUPPORT_NEED_PROFILE: 'Concerns: stress, sleep · Language: Nepali',
  CHECKIN_TRENDS: 'Mood improving over the last 4 weeks.',
  SUPPORT_HISTORY: '3 sessions completed · 1 active plan',
};

export function ConsentDemo() {
  const [granted, setGranted] = useState<Record<string, boolean>>({ ASSESSMENT_SUMMARY: true, SUPPORT_NEED_PROFILE: true, CHECKIN_TRENDS: false, SUPPORT_HISTORY: false });
  const reduce = !!useReducedMotion();
  return (
    <div className="grid overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] lg:grid-cols-2">
      <div className="p-6 sm:p-8">
        <p className="text-sm font-semibold text-white">Try it: your consent settings</p>
        <p className="mt-1 text-sm text-slate-300">Demo only — nothing here is saved.</p>
        <ul className="mt-6 space-y-3">
          {consentCategories.map((c) => {
            const on = granted[c.id];
            return (
              <li key={c.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span>
                  <span className="block text-sm font-medium text-white">{c.label}</span>
                  <span className="block text-xs text-slate-400">{c.hint}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Share ${c.label} with my counselor`}
                  onClick={() => setGranted((g) => ({ ...g, [c.id]: !g[c.id] }))}
                  className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-teal-400' : 'bg-slate-600')}
                >
                  <motion.span
                    className="absolute top-1 left-1 size-5 rounded-full bg-white shadow"
                    animate={{ x: on ? 20 : 0 }} initial={false} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-white/10 bg-slate-900/60 p-6 sm:p-8 lg:border-t-0 lg:border-l">
        <p className="text-sm font-semibold text-white">What your counselor can see</p>
        <p className="mt-1 text-sm text-slate-400">Deny-by-default: anything without consent stays hidden.</p>
        <ul className="mt-6 space-y-3" aria-live="polite">
          {consentCategories.map((c) => {
            const on = granted[c.id];
            return (
              <motion.li key={c.id} layout={!reduce} className={cx('rounded-2xl border p-4 transition-colors', on ? 'border-teal-300/30 bg-teal-300/10' : 'border-white/10 bg-white/[0.02]')}>
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                  {on ? <Unlock className="size-3.5 text-teal-300" aria-hidden /> : <Lock className="size-3.5 text-slate-500" aria-hidden />}
                  <span className={on ? 'text-teal-200' : 'text-slate-400'}>{c.label}</span>
                </p>
                <p className={cx('mt-1.5 text-sm', on ? 'text-white' : 'text-slate-500 italic')}>
                  {on ? PREVIEW[c.id] : 'Hidden — no consent given'}
                </p>
              </motion.li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><EyeOff className="size-3.5" aria-hidden /> Counselors’ private notes are never shared, either way.</p>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Animated diagram: the session lifecycle for counselors               */
/* ================================================================== */
const LIFECYCLE = [
  { icon: CalendarCheck, title: 'Request', text: 'A young person books into your availability.' },
  { icon: Check, title: 'Confirm', text: 'You confirm — or suggest another time.' },
  { icon: Video, title: 'Meet', text: 'Online sessions get a Google Meet link.' },
  { icon: FileText, title: 'Record', text: 'Shared notes for them, private notes for you.' },
  { icon: Route, title: 'Plan', text: 'Update goals and tasks in the shared plan.' },
  { icon: ClipboardCheck, title: 'Follow up', text: 'Track tasks and progress until the next session.' },
];

export function LifecycleDiagram() {
  const reduce = !!useReducedMotion();
  return (
    <div className="relative">
      <div aria-hidden className="absolute top-7 right-[8%] left-[8%] hidden h-0.5 lg:block">
        <motion.div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-brand-500 via-sky-500 to-violet-500"
          initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
      </div>
      <div aria-hidden className="absolute top-4 bottom-4 left-7 w-0.5 lg:hidden">
        <motion.div className="h-full w-full origin-top rounded-full bg-gradient-to-b from-brand-500 via-sky-500 to-violet-500"
          initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
      </div>
      <ol className="relative grid gap-6 lg:grid-cols-6 lg:gap-4">
        {LIFECYCLE.map(({ icon: Icon, title, text }, i) => (
          <motion.li
            key={title}
            className="flex gap-4 lg:flex-col lg:items-center lg:text-center"
            initial={{ opacity: 0, y: reduce ? 0 : 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.5, delay: reduce ? 0 : 0.15 + i * 0.18, ease: EASE }}
          >
            <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-brand-700 shadow-sm">
              <Icon className="size-6" aria-hidden />
              <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{i + 1}</span>
            </span>
            <div className="pt-1 lg:pt-0">
              <h4 className="font-semibold text-slate-900">{title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
