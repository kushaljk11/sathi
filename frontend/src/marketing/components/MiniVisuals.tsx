/**
 * Small decorative UI vignettes used inside feature cards and diagrams.
 * They are illustrations (aria-hidden) — never interactive controls.
 */
import { useId } from 'react';
import { motion } from 'motion/react';
import { Check, Clock, Lock, ShieldCheck, Users, Video } from 'lucide-react';
import { cx } from '../../components/ui';
import { EASE } from '../animations/variants';
import { matchingFactors } from '../data/features';

const surface = 'rounded-2xl border border-slate-100 bg-slate-50/70 p-4';

export function FactorBars({ compact, className }: { compact?: boolean; className?: string }) {
  const sample = [0.95, 0.8, 1, 0.85, 0.6, 1];
  return (
    <div aria-hidden className={cx(surface, className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Why this match?</span>
        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">91/100</span>
      </div>
      <ul className="space-y-2">
        {matchingFactors.slice(0, compact ? 4 : 6).map((f, i) => (
          <li key={f.id} className="grid grid-cols-[6.5rem_1fr_2.25rem] items-center gap-2 text-[11px]">
            <span className="truncate text-slate-600">{f.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
              <motion.span
                className={cx('block h-full w-full origin-left rounded-full', sample[i] >= 0.8 ? 'bg-brand-500' : 'bg-amber-400')}
                initial={{ scaleX: 0 }} whileInView={{ scaleX: sample[i] }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 + i * 0.08, ease: EASE }}
              />
            </span>
            <span className="text-right font-medium text-slate-500 tabular-nums">{Math.round(sample[i] * f.weight)}/{f.weight}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MeetMini() {
  return (
    <div aria-hidden className={cx(surface, 'flex items-center gap-3')}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Video className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">Online session</p>
        <p className="flex items-center gap-1 truncate text-[11px] text-slate-500"><Clock className="size-3" /> Today · 4:00 PM</p>
      </div>
      <span className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">Join meeting</span>
    </div>
  );
}

export function TaskList() {
  const tasks = [
    { t: 'Wind down without screens', done: true },
    { t: 'Try a 5-minute breathing break', done: true },
    { t: 'Note one good thing each day', done: false },
  ];
  return (
    <div aria-hidden className={surface}>
      <p className="text-xs font-semibold text-slate-800">Goal · Better sleep routine</p>
      <ul className="mt-3 space-y-2">
        {tasks.map((x, i) => (
          <motion.li key={x.t} className="flex items-center gap-2 text-[11px] text-slate-600"
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.1 }}>
            <span className={cx('grid size-4 shrink-0 place-items-center rounded-md border', x.done ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white')}>
              {x.done && <Check className="size-3" />}
            </span>
            <span className={x.done ? 'text-slate-400 line-through' : ''}>{x.t}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function ProgramMini() {
  return (
    <div aria-hidden className={cx(surface, 'space-y-3')}>
      {[{ t: 'Managing exam stress', f: 'Group · Online', c: 0.7 }, { t: 'Creative wellbeing workshop', f: 'In person', c: 0.4 }].map((p) => (
        <div key={p.t}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-800">{p.t}</span>
            <span className="text-slate-500">{p.f}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
            <motion.div className="h-full w-full origin-left rounded-full bg-sky-500" initial={{ scaleX: 0 }} whileInView={{ scaleX: p.c }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Places filling up</p>
        </div>
      ))}
    </div>
  );
}

export function ChatMini() {
  return (
    <div aria-hidden className={cx(surface, 'space-y-2 text-[11px]')}>
      <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500"><Lock className="size-3" /> Private conversation</p>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-slate-700 shadow-sm">How did the breathing exercise go this week?</div>
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-brand-600 px-3 py-2 text-white">Better than I expected — I tried it before my exam.</div>
    </div>
  );
}

export function CommunityMini() {
  return (
    <div aria-hidden className={cx(surface, 'space-y-2.5')}>
      {[{ n: 'quiet_river', t: 'Anyone else find mornings hardest? Small wins help me.', s: 'Published' }, { n: 'blue_kite', t: 'Sharing a study routine that worked for me…', s: 'In review' }].map((p) => (
        <div key={p.n} className="rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 font-semibold text-slate-700"><Users className="size-3 text-violet-500" />{p.n}</span>
            <span className={cx('rounded-full px-1.5 py-0.5 font-medium', p.s === 'Published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{p.s}</span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600">{p.t}</p>
        </div>
      ))}
    </div>
  );
}

export function TrendMini({ className }: { className?: string }) {
  const pts = '0,46 30,40 60,42 90,30 120,33 150,22 180,18 210,12';
  const gid = `trend-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <div aria-hidden className={cx(surface, className)}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-800">Check-in trend</span>
        <span className="text-slate-500">Last 8 weeks</span>
      </div>
      <svg viewBox="0 0 210 52" preserveAspectRatio="none" className="mt-3 h-16 w-full">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14a3a0" stopOpacity=".22" /><stop offset="1" stopColor="#14a3a0" stopOpacity="0" /></linearGradient></defs>
        <polygon points={`${pts} 210,52 0,52`} fill={`url(#${gid})`} />
        <motion.polyline points={pts} fill="none" stroke="#0e8583" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE }} />
      </svg>
    </div>
  );
}

export function EmojiScale({ selected = 3 }: { selected?: number }) {
  return (
    <div aria-hidden className={surface}>
      <p className="text-xs font-semibold text-slate-800">How are you feeling today?</p>
      <div className="mt-3 flex justify-between">
        {['😞', '😕', '😐', '🙂', '😄'].map((m, i) => (
          <span key={m} className={cx('grid size-9 place-items-center rounded-full text-lg', i === selected && 'bg-brand-100 ring-2 ring-brand-500')}>{m}</span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
        {['Sleep', 'Stress', 'Energy'].map((l, i) => (
          <span key={l} className="rounded-lg bg-white px-2 py-1.5 text-center shadow-sm">{l} <b className="text-slate-700">{[4, 2, 3][i]}/5</b></span>
        ))}
      </div>
    </div>
  );
}

export function QuestionMini() {
  return (
    <div aria-hidden className={surface}>
      <div className="flex items-center justify-between text-[11px] text-slate-500"><span>Question 4 of 6</span><span>Saved</span></div>
      <div className="mt-2 h-1 rounded-full bg-slate-200"><div className="h-1 w-2/3 rounded-full bg-sky-500" /></div>
      <p className="mt-3 text-xs font-semibold text-slate-800">Which session format feels most comfortable?</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        {['Online', 'In person', 'Either'].map((o, i) => (
          <span key={o} className={cx('rounded-lg border px-2 py-1.5 text-center', i === 0 ? 'border-sky-500 bg-sky-50 font-semibold text-sky-700' : 'border-slate-200 bg-white text-slate-600')}>{o}</span>
        ))}
      </div>
    </div>
  );
}

export function ConsentMini() {
  return (
    <div aria-hidden className={cx(surface, 'space-y-2')}>
      {[['Assessment summary', true], ['Check-in trends', false]].map(([l, on]) => (
        <div key={String(l)} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[11px] shadow-sm">
          <span className="flex items-center gap-1.5 text-slate-700"><ShieldCheck className="size-3.5 text-brand-600" />{l}</span>
          <span className={cx('relative h-4 w-7 rounded-full', on ? 'bg-brand-600' : 'bg-slate-300')}><span className={cx('absolute top-0.5 left-0.5 size-3 rounded-full bg-white', on && 'translate-x-3')} /></span>
        </div>
      ))}
    </div>
  );
}
