import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'motion/react';
import {
  ArrowRight, Check, Compass, EyeOff, Flag, HeartHandshake, KeyRound, LifeBuoy, MessagesSquare, Route, ShieldCheck, Sparkles, TrendingUp, Users, Video,
  GraduationCap, Building2, Stethoscope,
} from 'lucide-react';
import { cx } from '../../components/ui';
import { useMotionVariants, EASE } from '../animations/variants';
import { Seo } from '../components/Seo';
import { Hero } from '../components/Hero';
import { AnimatedItem, AnimatedSection, SectionHeading } from '../components/AnimatedSection';
import { FeatureCard } from '../components/FeatureCard';
import { CTASection } from '../components/CTASection';
import { JourneyDiagram } from '../components/JourneyDiagram';
import { ButtonLink } from '../components/ButtonLink';
import { ChatMini, CommunityMini, FactorBars, MeetMini, ProgramMini, TaskList, TrendMini } from '../components/MiniVisuals';
import { audiences, counters, highlights } from '../data/features';

export default function HomePage() {
  return (
    <>
      <Seo
        title="Sathi — Your wellbeing journey deserves the right support"
        description="Sathi helps young people discover trusted support, connect with verified counselors, explore wellbeing programs and track their progress — all in one supportive platform."
      />
      <Hero />
      <Overview />
      <HowItWorks />
      <CoreFeatures />
      <Audiences />
      <Highlights />
      <PrivacySafety />
      <CTASection />
    </>
  );
}

/* ------------------------------------------------------------------ */
function Overview() {
  const pillars = [
    { icon: Compass, title: 'Discover', text: 'Understand what kind of support could help, without having to know the system first.' },
    { icon: HeartHandshake, title: 'Connect', text: 'Choose a verified counselor or program with clear reasons — and book in a few steps.' },
    { icon: Route, title: 'Stay supported', text: 'Shared plans, small goals and visible progress keep support going after the first session.' },
  ];
  return (
    <section aria-labelledby="overview-title" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:gap-16">
        <AnimatedSection className="lg:col-span-5">
          <AnimatedItem><p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Why Sathi</p></AnimatedItem>
          <AnimatedItem>
            <h2 id="overview-title" className="mt-3 text-3xl font-semibold tracking-tight text-balance text-slate-900 sm:text-4xl lg:text-5xl lg:leading-[1.08]">
              Finding support is hard. <span className="text-slate-400">Staying supported shouldn’t be.</span>
            </h2>
          </AnimatedItem>
        </AnimatedSection>
        <AnimatedSection className="lg:col-span-7" delay={0.1}>
          <AnimatedItem>
            <p className="text-lg leading-relaxed text-slate-600">
              Sathi is a youth wellbeing, early-support and service-coordination platform. It brings check-ins, assessments, counselors, programs and progress
              together, so young people can find the right help sooner — and keep it.
            </p>
          </AnimatedItem>
          <AnimatedItem>
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              Sathi is not a diagnostic tool, not an emergency service and not a replacement for professional care. It is a supportive space that helps you reach the
              people who provide that care.
            </p>
          </AnimatedItem>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {pillars.map(({ icon: Icon, title, text }) => (
              <AnimatedItem key={title} className="border-t border-slate-200 pt-5">
                <Icon className="size-6 text-brand-600" aria-hidden />
                <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
              </AnimatedItem>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-slate-50 to-white px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div aria-hidden className="pointer-events-none absolute top-0 left-1/2 h-px w-[80%] -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="how-title" eyebrow="How Sathi works" title="Five calm steps from “I’m not sure” to real progress" lead="Each step builds on the last — and you can pause, revisit or skip ahead whenever you need to." />
        <div className="mt-14"><JourneyDiagram /></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function CoreFeatures() {
  return (
    <section aria-labelledby="features-title" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading id="features-title" eyebrow="Core features" title="Everything support needs, in one place" lead="Thoughtful tools for every part of the journey — designed with privacy and clarity first." />
        <AnimatedSection className="mt-14 grid gap-5 md:grid-cols-6" step={0.07} amount={0.1}>
          <FeatureCard className="md:col-span-4" icon={Sparkles} title="Explainable counselor matching" summary="Suggestions are scored on six transparent factors, and each one tells you exactly why it fits — and where it only partly does." visual={<FactorBars className="max-w-xl" />} />
          <FeatureCard className="md:col-span-2" icon={Video} tone="violet" title="Google Meet sessions" summary="Online sessions come with a meeting link right on the appointment." visual={<MeetMini />} />
          <FeatureCard className="md:col-span-2" icon={Route} title="Support plans, goals & tasks" summary="Build a plan with your counselor and break it into small, doable steps." visual={<TaskList />} />
          <FeatureCard className="md:col-span-2" icon={Compass} tone="sky" title="Program discovery" summary="Find and book wellbeing programs from verified organizations." visual={<ProgramMini />} />
          <FeatureCard className="md:col-span-2" icon={MessagesSquare} title="Private counselor chat" summary="Message your counselor privately between sessions." visual={<ChatMini />} />
          <FeatureCard className="md:col-span-3" icon={Users} tone="violet" title="Moderated peer community" summary="Share and support each other under a pseudonym. Posts are reviewed before they go live." visual={<CommunityMini />} />
          <FeatureCard className="md:col-span-3" icon={TrendingUp} tone="sky" title="Progress you can see" summary="Check-in trends, completed tasks and milestones show how far you have come." visual={<TrendMini />} />
        </AnimatedSection>
        <div className="mt-10 flex justify-center">
          <ButtonLink to="/features" variant="secondary">Explore all features <ArrowRight className="size-4" aria-hidden /></ButtonLink>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const AUD_ICONS = { youth: GraduationCap, counselors: Stethoscope, organizations: Building2 } as const;

function Audiences() {
  const [tab, setTab] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduce = !!useReducedMotion();
  const a = audiences[tab];
  const Icon = AUD_ICONS[a.id];
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = audiences.length;
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = (map[e.key] + n) % n;
    setTab(next);
    refs.current[next]?.focus();
  };
  return (
    <section aria-labelledby="audience-title" className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading id="audience-title" eyebrow="Built for everyone" title="One platform, three ways to help" lead="Young people, counselors and organizations each get tools designed around what they actually do." />
        <div className="mt-12 flex justify-center">
          <div role="tablist" aria-label="Audiences" className="inline-flex rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
            {audiences.map((x, i) => (
              <button
                key={x.id}
                ref={(el) => { refs.current[i] = el; }}
                role="tab"
                id={`aud-tab-${x.id}`}
                aria-selected={tab === i}
                aria-controls="aud-panel"
                tabIndex={tab === i ? 0 : -1}
                onClick={() => setTab(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={cx('relative rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-6', tab === i ? 'text-white' : 'text-slate-600 hover:text-slate-900')}
              >
                {tab === i && <motion.span layoutId="aud-pill" aria-hidden className="absolute inset-0 rounded-full bg-brand-600 shadow-md shadow-brand-600/25" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className="relative">{x.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div id="aud-panel" role="tabpanel" aria-labelledby={`aud-tab-${a.id}`} className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -10 }} transition={{ duration: 0.4, ease: EASE }}
              className="grid items-center gap-10 rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.35)] sm:p-10 lg:grid-cols-2"
            >
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{a.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-600">{a.text}</p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {a.benefits.map((b, i) => (
                    <motion.li key={b} className="flex items-start gap-2.5 text-sm text-slate-700" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.05 }}>
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Check className="size-3.5" aria-hidden /></span>
                      {b}
                    </motion.li>
                  ))}
                </ul>
                <ButtonLink to={a.cta.to} className="mt-8">{a.cta.label} <ArrowRight className="size-4" aria-hidden /></ButtonLink>
              </div>
              <AudienceVisual id={a.id} Icon={Icon} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function AudienceVisual({ id, Icon }: { id: (typeof audiences)[number]['id']; Icon: typeof GraduationCap }) {
  const rows = {
    youth: [['Today’s check-in', 'Done'], ['Next session', 'Thu · 4 PM'], ['Plan progress', '3 of 4 tasks']],
    counselors: [['Requests to confirm', '2'], ['Sessions this week', '6'], ['Plans to review', '3']],
    organizations: [['Programs published', '4'], ['Places booked', '38 / 45'], ['On waitlist', '5']],
  }[id];
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-100 via-sky-100 to-violet-100 opacity-70 blur-2xl" />
      <div className="relative rounded-3xl border border-white bg-white/90 p-6 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white"><Icon className="size-5" /></span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Your dashboard</p>
            <p className="text-xs text-slate-500">Example view</p>
          </div>
        </div>
        <ul className="mt-5 divide-y divide-slate-100">
          {rows.map(([l, v]) => (
            <li key={l} className="flex items-center justify-between py-3 text-sm">
              <span className="text-slate-600">{l}</span>
              <span className="font-semibold text-slate-900">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  // Real value by default (crawlers, screenshots, no-JS-animation); count up only once actually visible.
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, value, { duration: 1.1, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, reduce, value]);
  return <span ref={ref} className="tabular-nums" aria-label={String(value)}>{shown}</span>;
}

function Highlights() {
  const v = useMotionVariants();
  return (
    <section aria-labelledby="highlights-title" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeading align="left" id="highlights-title" eyebrow="Platform highlights" title="Clear by design" lead="No black boxes. Sathi shows its reasoning, asks before it shares and keeps the community safe." />
          </div>
          <AnimatedSection className="grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:col-span-8" step={0.08}>
            {highlights.map(({ icon: Icon, title, text }) => (
              <motion.div key={title} variants={v.fadeIn} className="bg-white p-7">
                <Icon className="size-6 text-brand-600" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
        <AnimatedSection className="mt-12 grid gap-6 rounded-3xl bg-gradient-to-r from-brand-50 via-sky-50 to-violet-50 p-8 sm:grid-cols-3 sm:p-10" step={0.1}>
          {counters.map((c) => (
            <AnimatedItem key={c.label} className="text-center sm:text-left">
              <p className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl"><Counter value={c.value} /></p>
              <p className="mt-2 text-sm font-medium text-slate-600">{c.label}</p>
            </AnimatedItem>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function PrivacySafety() {
  const items = [
    { icon: ShieldCheck, title: 'Consent per category', text: 'Assessment summaries, check-in trends and support history stay hidden from counselors until you grant consent — and you can withdraw it any time.' },
    { icon: EyeOff, title: 'Private notes stay private', text: 'A counselor’s private session notes are never shared. Shared notes are clearly marked.' },
    { icon: Flag, title: 'Moderation before publishing', text: 'Community posts are screened for spam, bullying and risk signals and reviewed before they appear.' },
    { icon: KeyRound, title: 'Secure by default', text: 'Passwords are stored hashed and connected-account credentials are encrypted at rest.' },
    { icon: LifeBuoy, title: 'Not an emergency service', text: 'Sathi does not provide crisis response. Urgent help information is always one click away.' },
  ];
  const v = useMotionVariants();
  return (
    <section aria-labelledby="privacy-title" className="relative overflow-hidden bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/4 size-[36rem] rounded-full bg-teal-500/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-32 bottom-0 size-[28rem] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading align="left" tone="dark" id="privacy-title" eyebrow="Privacy & safety" title="Your story is yours to share" lead="Sathi is built around consent. You decide who sees what, and you can change your mind at any time." />
          <AnimatedSection className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <AnimatedItem><ButtonLink to="/features#safety" variant="light">How we keep you safe <ArrowRight className="size-4" aria-hidden /></ButtonLink></AnimatedItem>
            <AnimatedItem><ButtonLink to="/safety" variant="glass">Urgent help</ButtonLink></AnimatedItem>
          </AnimatedSection>
        </div>
        <AnimatedSection className="grid gap-4 sm:grid-cols-2 lg:col-span-7" step={0.08} amount={0.1}>
          {items.map(({ icon: Icon, title, text }, i) => (
            <motion.div
              key={title}
              variants={v.fadeUp}
              className={cx('rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur', i === items.length - 1 && 'sm:col-span-2 border-rose-300/20 bg-rose-400/[0.06]')}
            >
              <Icon className={cx('size-6', i === items.length - 1 ? 'text-rose-300' : 'text-teal-300')} aria-hidden />
              <h3 className="mt-4 font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{text}</p>
              {i === items.length - 1 && (
                <Link to="/safety" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-rose-200 underline-offset-4 hover:underline">
                  See urgent help options <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </motion.div>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}
