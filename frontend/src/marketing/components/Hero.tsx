import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { ArrowRight, BadgeCheck, CalendarCheck, Check, ClipboardList, HeartPulse, ShieldCheck, Sparkles, TrendingUp, Video } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { homeFor } from '../../pages/Auth';
import { EASE } from '../animations/variants';
import { ButtonLink } from './ButtonLink';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

const glass = 'rounded-2xl border border-white/70 bg-white/80 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_20px_50px_-20px_rgba(15,23,42,0.25)] backdrop-blur-xl';

function StepTag({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
      <span className="grid size-4 place-items-center rounded-full bg-brand-600 text-[9px] text-white">{n}</span>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Journey cards (decorative; the illustration is aria-hidden)         */
/* ------------------------------------------------------------------ */
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
function MoodCard({ animate }: { animate: boolean }) {
  const [sel, setSel] = useState(3);
  useEffect(() => {
    if (!animate) return;
    const seq = [2, 3, 4, 3];
    let i = 0;
    const t = window.setInterval(() => setSel(seq[i++ % seq.length]), 2600);
    return () => window.clearInterval(t);
  }, [animate]);
  return (
    <div className={`${glass} p-3.5`}>
      <StepTag n={1}>Check-in</StepTag>
      <p className="mt-2 text-[13px] font-semibold text-slate-900">How are you feeling today?</p>
      <div className="mt-3 flex justify-between gap-1">
        {MOODS.map((m, i) => (
          <span key={m} className="relative grid size-8 place-items-center rounded-full text-base">
            {i === sel && (
              <motion.span layoutId="hero-mood" className="absolute inset-0 rounded-full bg-brand-100 ring-2 ring-brand-500" transition={{ type: 'spring', stiffness: 300, damping: 26 }} />
            )}
            <span className="relative">{m}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function AssessmentCard() {
  return (
    <div className={`${glass} p-3.5`}>
      <StepTag n={2}>Assessment</StepTag>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-slate-900">Support needs</p>
        <span className="text-[11px] font-medium text-slate-500">Step 4 of 6</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-brand-500 to-sky-500"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 0.66 }}
          transition={{ duration: 1.2, delay: 0.9, ease: EASE }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['Stress', 'Sleep', 'Online'].map((t) => (
          <span key={t} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">{t}</span>
        ))}
      </div>
    </div>
  );
}

const MATCH_FACTORS = [
  { label: 'Concerns', v: 0.95 },
  { label: 'Language', v: 1 },
  { label: 'Availability', v: 0.86 },
  { label: 'Format', v: 0.8 },
];
function MatchCard() {
  return (
    <div className={`${glass} p-4`}>
      <StepTag n={3}>Matching</StepTag>
      <div className="mt-2.5 flex items-center gap-3">
        <div className="relative grid size-12 shrink-0 place-items-center">
          <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
            <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="4" />
            <motion.circle
              cx="24" cy="24" r="20" fill="none" stroke="url(#hero-ring)" strokeWidth="4" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 0.91 }} transition={{ duration: 1.4, delay: 1.1, ease: EASE }}
            />
            <defs>
              <linearGradient id="hero-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#14a3a0" /><stop offset="1" stopColor="#0284c7" /></linearGradient>
            </defs>
          </svg>
          <span className="text-[13px] font-bold text-slate-900">91</span>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[13px] font-semibold text-slate-900">Your top match <BadgeCheck className="size-3.5 text-brand-600" /></p>
          <p className="text-[11px] text-slate-500">91/100 · Why this match?</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {MATCH_FACTORS.map((f, i) => (
          <li key={f.label} className="grid grid-cols-[4.75rem_1fr] items-center gap-2">
            <span className="text-[10px] font-medium text-slate-600">{f.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <motion.span
                className="block h-full w-full origin-left rounded-full bg-brand-500"
                initial={{ scaleX: 0 }} animate={{ scaleX: f.v }} transition={{ duration: 0.9, delay: 1.3 + i * 0.12, ease: EASE }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionCard() {
  return (
    <div className={`${glass} p-3.5`}>
      <StepTag n={4}>Support</StepTag>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><Video className="size-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900">Online session</p>
          <p className="truncate text-[11px] text-slate-500">Thu · 4:00 PM · Google Meet</p>
        </div>
      </div>
      <span className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-[12px] font-semibold text-white shadow-md shadow-brand-600/25">
        <Video className="size-3.5" /> Join meeting
      </span>
    </div>
  );
}

function ProgressCard() {
  const pts = '4,44 26,38 48,40 70,28 92,30 114,18 136,12';
  return (
    <div className={`${glass} p-3.5`}>
      <div className="flex items-center justify-between">
        <StepTag n={5}>Progress</StepTag>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><TrendingUp className="size-3" /> Steady</span>
      </div>
      <svg viewBox="0 0 140 52" className="mt-2 h-14 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14a3a0" stopOpacity=".25" /><stop offset="1" stopColor="#14a3a0" stopOpacity="0" /></linearGradient>
        </defs>
        <motion.polygon points={`${pts} 136,52 4,52`} fill="url(#hero-area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 2 }} />
        <motion.polyline
          points={pts} fill="none" stroke="#0e8583" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 1.6, ease: EASE }}
        />
      </svg>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600"><Check className="size-3.5 text-brand-600" /> Sleep routine · 3 of 4 tasks done</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop / tablet illustration: positioned cards + animated path     */
/* ------------------------------------------------------------------ */
// Coordinates are in a 600 × 560 space; the container keeps that aspect ratio so % positions line up with the SVG.
const PATH = 'M150 70 C 300 40, 360 120, 450 150 S 330 250, 190 285 S 300 390, 455 370 S 380 470, 250 495';

function Floating({ children, className, depth, mx, my, delay, float, duration }: {
  children: ReactNode; className: string; depth: number; mx: MotionValue<number>; my: MotionValue<number>; delay: number; float: boolean; duration: number;
}) {
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth);
  return (
    <motion.div className={`absolute ${className}`} style={{ x, y }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay, ease: EASE }}
      >
        <motion.div
          animate={float ? { y: [0, -8, 0] } : undefined}
          transition={float ? { duration, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.8 } : undefined}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function JourneyIllustration() {
  const reduce = !!useReducedMotion();
  const fine = useMedia('(hover: hover) and (pointer: fine)');
  const wide = useMedia('(min-width: 1024px)');
  const interactive = !reduce && fine && wide;
  const float = !reduce && wide;
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0), rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 60, damping: 18, mass: 0.6 });
  const my = useSpring(rawY, { stiffness: 60, damping: 18, mass: 0.6 });

  useEffect(() => {
    if (!interactive) { rawX.set(0); rawY.set(0); return; }
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      rawX.set(Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2))));
      rawY.set(Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2))));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [interactive, rawX, rawY]);

  const common = { mx, my, float };
  return (
    <div ref={ref} className="relative mx-auto aspect-[15/14] w-full max-w-[600px]">
      {/* connecting journey path */}
      <svg viewBox="0 0 600 560" className="absolute inset-0 h-full w-full overflow-visible" fill="none">
        <defs>
          <linearGradient id="hero-path" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#14a3a0" />
            <stop offset=".55" stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
          <filter id="hero-glow" x="-200%" y="-200%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={PATH} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
        <motion.path
          d={PATH} stroke="url(#hero-path)" strokeWidth="3" strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 2.2, delay: 0.5, ease: 'easeInOut' }}
        />
        {!reduce && (
          <circle r="6" fill="#fff" stroke="#14a3a0" strokeWidth="3" filter="url(#hero-glow)" opacity="0">
            <animate attributeName="opacity" from="0" to="1" begin="2.7s" dur="0.4s" fill="freeze" />
            <animateMotion dur="7s" begin="2.7s" repeatCount="indefinite" path={PATH} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
          </circle>
        )}
      </svg>

      <Floating {...common} className="top-[2%] left-0 w-[46%]" depth={-10} delay={0.25} duration={6}><MoodCard animate={!reduce} /></Floating>
      <Floating {...common} className="top-[16%] right-0 w-[42%]" depth={14} delay={0.4} duration={7}><AssessmentCard /></Floating>
      <Floating {...common} className="top-[35%] left-[3%] w-[50%]" depth={-18} delay={0.55} duration={6.5}><MatchCard /></Floating>
      <Floating {...common} className="top-[56%] right-0 w-[42%]" depth={12} delay={0.7} duration={7.5}><SessionCard /></Floating>
      <Floating {...common} className="bottom-0 left-[16%] w-[48%]" depth={-8} delay={0.85} duration={6.8}><ProgressCard /></Floating>
    </div>
  );
}

/** Simplified mobile illustration: stacked cards on a vertical journey rail, no loops or parallax. */
function MobileIllustration() {
  return (
    <div className="relative mx-auto max-w-sm pl-6">
      <div aria-hidden className="absolute top-4 bottom-4 left-2 w-px bg-gradient-to-b from-brand-500 via-sky-400 to-violet-400" />
      {[<MoodCard key="m" animate={false} />, <MatchCard key="x" />, <SessionCard key="s" />].map((card, i) => (
        <motion.div
          key={i}
          className="relative mb-3 last:mb-0"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 + i * 0.12, ease: EASE }}
        >
          <span aria-hidden className="absolute top-6 -left-[1.36rem] size-3 rounded-full border-2 border-white bg-brand-500 shadow" />
          {card}
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
export function Hero() {
  const { user } = useAuth();
  const reduce = !!useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const orbY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const orbY2 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);
  const sm = useMedia('(min-width: 640px)');

  const item = (d: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay: d, ease: EASE },
  });

  return (
    <section ref={sectionRef} aria-labelledby="hero-title" className="relative isolate -mt-16 overflow-hidden pt-16 lg:-mt-[4.5rem] lg:pt-[4.5rem]">
      {/* background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/80 via-white to-white" />
      <motion.div aria-hidden style={{ y: orbY }} className="pointer-events-none absolute -top-40 -left-32 -z-10 size-[32rem] rounded-full bg-teal-300/30 blur-3xl" />
      <motion.div aria-hidden style={{ y: orbY2 }} className="pointer-events-none absolute top-10 -right-40 -z-10 size-[34rem] rounded-full bg-sky-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 -z-10 size-[26rem] rounded-full bg-violet-300/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(rgba(15,23,42,0.07)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pt-12 pb-20 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:pt-20 lg:pb-28">
        <div className="text-center lg:text-left">
          <motion.p {...item(0)} className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm backdrop-blur sm:text-sm">
            <Sparkles className="size-4" aria-hidden /> Wellbeing check-ins · matching · ongoing support
          </motion.p>
          <motion.h1 {...item(0.08)} id="hero-title" className="mt-6 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-slate-900 sm:text-6xl lg:text-[4.25rem]">
            Your Wellbeing Journey Deserves the{' '}
            <span className="bg-gradient-to-r from-brand-700 via-sky-700 to-violet-700 bg-clip-text text-transparent">Right Support.</span>
          </motion.h1>
          <motion.p {...item(0.16)} className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-slate-600 lg:mx-0 lg:text-xl">
            Sathi helps young people discover trusted support, connect with counselors, explore wellbeing programs and track their progress — all in one supportive platform.
          </motion.p>
          <motion.div {...item(0.24)} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            {user ? (
              <ButtonLink to={homeFor(user.role)} size="lg">Go to dashboard <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            ) : (
              <ButtonLink to="/register" size="lg">Get Started <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            )}
            <ButtonLink href="#how-it-works" variant="secondary" size="lg">Explore Sathi</ButtonLink>
          </motion.div>
          <motion.ul {...item(0.32)} className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-600 lg:justify-start">
            {[
              { icon: BadgeCheck, t: 'Verified counselors' },
              { icon: ShieldCheck, t: 'Consent you control' },
              { icon: Sparkles, t: 'Explainable matching' },
            ].map(({ icon: I, t }) => (
              <li key={t} className="flex items-center gap-2"><I className="size-4 text-brand-600" aria-hidden />{t}</li>
            ))}
          </motion.ul>
        </div>

        <div role="img" aria-label="Illustration of the Sathi journey: a wellbeing check-in, a support assessment, an explained counselor match, an online session and a progress chart.">
          <div aria-hidden>{sm ? <JourneyIllustration /> : <MobileIllustration />}</div>
        </div>
      </div>

      {/* quick journey strip */}
      <div className="mx-auto hidden max-w-5xl px-8 pb-16 md:block">
        <ol className="flex items-center justify-between gap-2 text-sm text-slate-500">
          {[
            { i: HeartPulse, t: 'Check in' }, { i: ClipboardList, t: 'Assess' }, { i: Sparkles, t: 'Match' }, { i: CalendarCheck, t: 'Get support' }, { i: TrendingUp, t: 'Track progress' },
          ].map(({ i: I, t }, idx, arr) => (
            <li key={t} className="flex flex-1 items-center gap-2 last:flex-none">
              <span className="flex items-center gap-2 font-medium text-slate-700"><I className="size-4 text-brand-600" aria-hidden />{t}</span>
              {idx < arr.length - 1 && <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
