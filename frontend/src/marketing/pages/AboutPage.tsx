import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { Accessibility, ArrowRight, Eye, HandHeart, Lock, Repeat, ShieldCheck, Sprout, Compass, Unplug, HelpCircle, Check } from 'lucide-react';
import { Seo } from '../components/Seo';
import { AnimatedItem, AnimatedSection, SectionHeading } from '../components/AnimatedSection';
import { CTASection } from '../components/CTASection';
import { ButtonLink } from '../components/ButtonLink';
import { useMotionVariants, EASE } from '../animations/variants';

const values = [
  { icon: HandHeart, title: 'Respect', text: 'Young people are the experts on their own lives. We listen first and never judge.' },
  { icon: Lock, title: 'Privacy', text: 'Sensitive information is deny-by-default and shared only with consent.' },
  { icon: Eye, title: 'Transparency', text: 'We explain how matching works and why a suggestion appears.' },
  { icon: Accessibility, title: 'Accessibility', text: 'Clear language, keyboard-friendly design and online options lower the barriers.' },
  { icon: Repeat, title: 'Continuity', text: 'Support should continue beyond the first conversation — plans, goals and follow-up.' },
  { icon: ShieldCheck, title: 'Safety', text: 'Verification, moderation and clear urgent-help routes keep the space careful.' },
];

const problems = [
  { icon: HelpCircle, title: 'Finding the right support is confusing', text: 'Counselors, programs and services are scattered, and it is hard to know which one fits — or where to begin.' },
  { icon: Unplug, title: 'Support often stops after first contact', text: 'Without a shared plan or follow-up, momentum fades and young people are left to figure out the next step alone.' },
  { icon: Lock, title: 'Young people worry about privacy', text: 'Many hold back because they are not sure who will see what they share, or how it might be used.' },
];

/** Decorative scene: scattered dots gathering into one connected path. */
function ConnectIllustration() {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 30, reduce ? 0 : -30]);
  const nodes = [[60, 200], [150, 110], [250, 170], [340, 90], [430, 150]];
  return (
    <div ref={ref} aria-hidden className="relative">
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-brand-100 via-sky-100 to-violet-100" />
      <motion.svg style={{ y }} viewBox="0 0 490 280" className="relative h-auto w-full">
        <defs>
          <linearGradient id="about-line" x1="0" x2="1"><stop offset="0" stopColor="#14a3a0" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        </defs>
        <motion.path
          d="M60 200 C 100 120, 120 110, 150 110 S 220 170, 250 170 S 310 90, 340 90 S 410 140, 430 150"
          fill="none" stroke="url(#about-line)" strokeWidth="4" strokeLinecap="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 1.8, ease: 'easeInOut' }}
        />
        {nodes.map(([cx, cy], i) => (
          <motion.g key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.25, duration: 0.5 }}>
            <circle cx={cx} cy={cy} r="18" fill="#fff" stroke="#e2e8f0" />
            <circle cx={cx} cy={cy} r="7" fill={['#14a3a0', '#0ea5e9', '#0e8583', '#6366f1', '#7c3aed'][i]} />
          </motion.g>
        ))}
        {[[40, 60], [110, 240], [200, 40], [300, 240], [390, 40], [460, 240]].map(([x, yy], i) => (
          <circle key={i} cx={x} cy={yy} r="4" fill="#94a3b8" opacity=".35" />
        ))}
      </motion.svg>
    </div>
  );
}

export default function AboutPage() {
  const v = useMotionVariants();
  return (
    <>
      <Seo title="About Us" description="Why Sathi exists: helping young people find the right support early, keep it going, and stay in control of their privacy." />

      {/* Intro */}
      <section aria-labelledby="about-title" className="relative isolate -mt-16 overflow-hidden px-4 pt-32 pb-20 sm:px-6 lg:-mt-[4.5rem] lg:px-8 lg:pt-40 lg:pb-28">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/80 via-white to-white" />
        <div aria-hidden className="absolute -top-32 right-0 -z-10 size-[30rem] rounded-full bg-sky-200/40 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <AnimatedSection>
            <AnimatedItem><p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">About Sathi</p></AnimatedItem>
            <AnimatedItem>
              <h1 id="about-title" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance text-slate-900 sm:text-5xl lg:text-6xl">
                A companion for the journey to feeling better.
              </h1>
            </AnimatedItem>
            <AnimatedItem>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
                “Sathi” means companion. Sathi is a youth wellbeing, early-support and service-coordination platform that helps young people find trusted support,
                connect with verified counselors and organizations, and keep that support going over time.
              </p>
            </AnimatedItem>
            <AnimatedItem>
              <ul className="mt-8 flex flex-wrap gap-2">
                {['Not a diagnostic tool', 'Not an emergency service', 'Not a replacement for professionals'].map((t) => (
                  <li key={t} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-600">{t}</li>
                ))}
              </ul>
            </AnimatedItem>
          </AnimatedSection>
          <AnimatedItem standalone kind="scaleIn"><ConnectIllustration /></AnimatedItem>
        </div>
      </section>

      {/* Why created */}
      <section aria-labelledby="why-title" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <AnimatedSection>
            <AnimatedItem><p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Why it was created</p></AnimatedItem>
            <AnimatedItem><h2 id="why-title" className="mt-3 text-3xl font-semibold tracking-tight text-balance text-slate-900 sm:text-4xl">Getting help early should feel possible, not overwhelming.</h2></AnimatedItem>
            <AnimatedItem>
              <p className="mt-6 text-lg leading-relaxed text-slate-600">
                Reaching out is a big step. When young people finally do, they often meet a maze — different services, unclear options and long gaps between
                conversations. Sathi was created to make that first step simpler and the next steps clearer, by bringing the people and tools that support wellbeing
                into one place.
              </p>
            </AnimatedItem>
            <AnimatedItem>
              <blockquote className="mt-10 border-l-4 border-brand-500 pl-6 text-xl font-medium tracking-tight text-slate-800 sm:text-2xl">
                From finding support to staying supported.
              </blockquote>
            </AnimatedItem>
          </AnimatedSection>
        </div>
      </section>

      {/* Problem */}
      <section aria-labelledby="problem-title" className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading id="problem-title" eyebrow="The problem" title="Three gaps we kept seeing" lead="These are the moments where support most often breaks down — and the moments Sathi is designed around." />
          <AnimatedSection className="mt-14 grid gap-6 md:grid-cols-3" step={0.1}>
            {problems.map(({ icon: Icon, title, text }, i) => (
              <motion.article key={title} variants={v.fadeUp} className="relative rounded-3xl bg-white p-7 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.3)]">
                <span aria-hidden className="absolute top-6 right-7 text-5xl font-semibold text-slate-100">0{i + 1}</span>
                <Icon className="relative size-7 text-brand-600" aria-hidden />
                <h3 className="relative mt-5 text-lg font-semibold text-slate-900">{title}</h3>
                <p className="relative mt-2 leading-relaxed text-slate-600">{text}</p>
              </motion.article>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Mission & vision */}
      <section aria-labelledby="mission-title" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <h2 id="mission-title" className="sr-only">Mission and vision</h2>
        <AnimatedSection className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2" step={0.12}>
          <AnimatedItem kind="slideInLeft" className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 to-teal-900 p-8 text-white sm:p-12">
            <div aria-hidden className="absolute -right-16 -bottom-16 size-64 rounded-full bg-teal-400/30 blur-3xl" />
            <Compass className="relative size-8 text-teal-200" aria-hidden />
            <h3 className="relative mt-6 text-sm font-semibold tracking-wide text-teal-200 uppercase">Our mission</h3>
            <p className="relative mt-3 text-2xl leading-snug font-semibold tracking-tight sm:text-3xl">
              To help every young person find the right support early, and to keep that support connected, respectful and private.
            </p>
          </AnimatedItem>
          <AnimatedItem kind="slideInRight" className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 sm:p-12">
            <div aria-hidden className="absolute -top-16 -right-16 size-64 rounded-full bg-violet-200/50 blur-3xl" />
            <Sprout className="relative size-8 text-violet-600" aria-hidden />
            <h3 className="relative mt-6 text-sm font-semibold tracking-wide text-violet-700 uppercase">Our vision</h3>
            <p className="relative mt-3 text-2xl leading-snug font-semibold tracking-tight text-slate-900 sm:text-3xl">
              A world where asking for help is easy, support doesn’t stop after one conversation, and young people stay in control of their own story.
            </p>
          </AnimatedItem>
        </AnimatedSection>
      </section>

      {/* Values */}
      <section aria-labelledby="values-title" className="bg-gradient-to-b from-white to-slate-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading id="values-title" eyebrow="Core values" title="What guides every decision" />
          <AnimatedSection className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" step={0.07}>
            {values.map(({ icon: Icon, title, text }) => (
              <AnimatedItem key={title} className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-brand-700 shadow-sm ring-1 ring-slate-200"><Icon className="size-5" aria-hidden /></span>
                <div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 leading-relaxed text-slate-600">{text}</p>
                </div>
              </AnimatedItem>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* How it supports young people */}
      <section aria-labelledby="supports-title" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5 lg:sticky lg:top-28 lg:self-start">
            <SectionHeading align="left" id="supports-title" eyebrow="How Sathi supports young people" title="Small steps, real continuity" lead="Sathi doesn’t replace the people who help. It makes them easier to reach and keeps everyone on the same page." />
            <AnimatedItem standalone className="mt-8"><ButtonLink to="/features" variant="secondary">See how it works <ArrowRight className="size-4" aria-hidden /></ButtonLink></AnimatedItem>
          </div>
          <ol className="relative space-y-6 lg:col-span-7">
            <span aria-hidden className="absolute top-2 bottom-2 left-5 w-px bg-gradient-to-b from-brand-500 via-sky-400 to-violet-400" />
            {[
              ['Notice', 'Private check-ins help young people notice how they are doing and spot patterns early.'],
              ['Understand', 'A step-by-step assessment describes support needs in their own words — without labels or diagnosis.'],
              ['Choose', 'Explainable matching shows why a counselor might fit, so the choice stays with the young person.'],
              ['Work together', 'Sessions, shared plans, goals and tasks turn conversations into steady progress.'],
              ['Keep going', 'Progress charts, milestones, programs and a moderated community help support continue.'],
            ].map(([t, d], i) => (
              <motion.li
                key={t}
                className="relative pl-16"
                initial={{ opacity: 0, x: v.reduce ? 0 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.6, ease: EASE }}
              >
                <span className="absolute top-0 left-0 grid size-10 place-items-center rounded-full bg-white text-sm font-semibold text-brand-700 shadow ring-1 ring-slate-200">{i + 1}</span>
                <div className="rounded-3xl border border-slate-200/80 bg-white p-6">
                  <h3 className="font-semibold text-slate-900">{t}</h3>
                  <p className="mt-1.5 leading-relaxed text-slate-600">{d}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Privacy & accessible support */}
      <section aria-labelledby="matters-title" className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
          <SectionHeading align="left" tone="dark" id="matters-title" eyebrow="Why it matters" title="Privacy and accessible support go hand in hand" lead="Young people open up when they trust the space. Accessible support means support people can actually use — online or in person, in a language they’re comfortable with, at a pace that suits them." />
          <AnimatedSection className="grid gap-4 sm:grid-cols-2" step={0.08}>
            {[
              ['Deny-by-default sharing', 'Sensitive data stays private until consent is given.'],
              ['Withdraw any time', 'Consent can be changed in the Privacy center whenever you like.'],
              ['Online or in person', 'Google Meet sessions make support reachable from home.'],
              ['Plain language', 'No jargon, no labels — just clear next steps.'],
            ].map(([t, d]) => (
              <AnimatedItem key={t} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <Check className="size-5 text-teal-300" aria-hidden />
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{d}</p>
              </AnimatedItem>
            ))}
          </AnimatedSection>
        </div>
      </section>

      <CTASection title="Ready when you are." text="Create an account to explore Sathi at your own pace — or get in touch if you have questions first." />
    </>
  );
}
