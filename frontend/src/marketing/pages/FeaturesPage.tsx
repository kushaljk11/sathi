import { useEffect, useState, type MouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Building2, GraduationCap, ShieldCheck, Stethoscope } from 'lucide-react';
import { cx } from '../../components/ui';
import { Seo } from '../components/Seo';
import { AnimatedItem, AnimatedSection, SectionHeading } from '../components/AnimatedSection';
import { FeatureCard, type FeatureTone } from '../components/FeatureCard';
import { CTASection } from '../components/CTASection';
import { ButtonLink } from '../components/ButtonLink';
import { ConsentDemo, LifecycleDiagram, MatchDemo } from '../components/Demos';
import { featureGroups, type FeatureGroup } from '../data/features';

const GROUP_META: Record<FeatureGroup['id'], { icon: typeof GraduationCap; tone: FeatureTone }> = {
  youth: { icon: GraduationCap, tone: 'brand' },
  counselors: { icon: Stethoscope, tone: 'sky' },
  organizations: { icon: Building2, tone: 'violet' },
  safety: { icon: ShieldCheck, tone: 'brand' },
};

/** Tracks which section is currently in view for the sticky sub-navigation. */
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const IDS = featureGroups.map((g) => g.id);

function SubNav() {
  const active = useScrollSpy(IDS);
  const reduce = useReducedMotion();
  const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(history.state, '', `#${id}`);
    el.focus({ preventScroll: true });
  };
  return (
    <nav aria-label="Feature sections" className="sticky top-16 z-30 border-y border-slate-200/70 bg-white/80 backdrop-blur-xl lg:top-[4.5rem]">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 lg:justify-center lg:px-8">
        {featureGroups.map((g) => {
          const on = active === g.id;
          const Icon = GROUP_META[g.id].icon;
          return (
            <li key={g.id} className="relative shrink-0">
              <a
                href={`#${g.id}`}
                onClick={(e) => go(e, g.id)}
                aria-current={on ? 'true' : undefined}
                className={cx('relative z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors', on ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900')}
              >
                <Icon className="size-4" aria-hidden /> {g.label}
              </a>
              {on && <motion.span layoutId="features-subnav" aria-hidden className="absolute inset-0 rounded-full bg-brand-50 ring-1 ring-brand-100" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function GroupSection({ group, children, dark }: { group: FeatureGroup; children?: React.ReactNode; dark?: boolean }) {
  const meta = GROUP_META[group.id];
  return (
    <section
      id={group.id}
      tabIndex={-1}
      aria-labelledby={`${group.id}-title`}
      className={cx('scroll-mt-32 px-4 py-20 outline-none sm:px-6 lg:scroll-mt-36 lg:px-8 lg:py-28', dark ? 'relative overflow-hidden bg-slate-950' : group.id === 'counselors' ? 'bg-slate-50' : 'bg-white')}
    >
      {dark && <div aria-hidden className="pointer-events-none absolute -top-40 left-1/3 size-[36rem] rounded-full bg-teal-500/15 blur-3xl" />}
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading align="left" tone={dark ? 'dark' : 'light'} id={`${group.id}-title`} eyebrow={group.eyebrow} title={group.title} lead={group.intro} />
        <AnimatedSection className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" step={0.05} amount={0.05}>
          {group.features.map((f) => (
            <FeatureCard
              key={f.id}
              icon={f.icon}
              title={f.title}
              summary={f.summary}
              how={f.how}
              tone={meta.tone}
              className={dark ? 'border-white/10 bg-white/[0.97]' : undefined}
            />
          ))}
        </AnimatedSection>
        {children}
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  const [youth, counselors, orgs, safety] = featureGroups;
  return (
    <>
      <Seo title="Features" description="Explore Sathi's features for young people, counselors and organizations — check-ins, explainable matching, Google Meet sessions, support plans, programs and privacy controls." />

      <section aria-labelledby="features-page-title" className="relative isolate -mt-16 overflow-hidden px-4 pt-32 pb-16 text-center sm:px-6 lg:-mt-[4.5rem] lg:px-8 lg:pt-40 lg:pb-20">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50/80 via-white to-white" />
        <div aria-hidden className="absolute -top-24 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-teal-200/40 via-sky-200/40 to-violet-200/40 blur-3xl" />
        <AnimatedSection className="mx-auto max-w-3xl">
          <AnimatedItem><p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Features</p></AnimatedItem>
          <AnimatedItem>
            <h1 id="features-page-title" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance text-slate-900 sm:text-5xl lg:text-6xl">
              Built around the whole support journey
            </h1>
          </AnimatedItem>
          <AnimatedItem>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              From a first check-in to lasting progress — tools for young people, counselors and organizations, with privacy and safety designed in from the start.
            </p>
          </AnimatedItem>
          <AnimatedItem className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/register" size="lg">Get Started <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            <ButtonLink href="#match-demo" variant="secondary" size="lg">Try the matching demo</ButtonLink>
          </AnimatedItem>
        </AnimatedSection>
      </section>

      <SubNav />

      <GroupSection group={youth}>
        <div id="match-demo" className="mt-20 scroll-mt-36">
          <SectionHeading align="left" eyebrow="Interactive demo" title="See how explainable matching works" lead="Sathi scores counselors on six factors with fixed, published weights — and shows you the reasoning instead of a mystery number." />
          <AnimatedItem standalone className="mt-10"><MatchDemo /></AnimatedItem>
        </div>
      </GroupSection>

      <GroupSection group={counselors}>
        <div className="mt-20">
          <SectionHeading align="left" eyebrow="Session lifecycle" title="From request to follow-up, in one flow" />
          <div className="mt-10 rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-10"><LifecycleDiagram /></div>
        </div>
      </GroupSection>

      <GroupSection group={orgs} />

      <GroupSection group={safety} dark>
        <div className="mt-20">
          <SectionHeading align="left" tone="dark" eyebrow="Interactive demo" title="Consent you can see working" lead="Toggle a category and watch what a counselor would — and wouldn’t — be able to see." />
          <AnimatedItem standalone className="mt-10"><ConsentDemo /></AnimatedItem>
        </div>
      </GroupSection>

      <CTASection />
    </>
  );
}
