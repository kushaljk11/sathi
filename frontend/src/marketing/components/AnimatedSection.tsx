import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useMotionVariants } from '../animations/variants';

type Kind = 'fadeUp' | 'fadeIn' | 'scaleIn' | 'slideInLeft' | 'slideInRight';

/**
 * Scroll-reveal container. Children wrapped in <AnimatedItem> animate in sequence
 * (stagger) the first time the block enters the viewport.
 */
export function AnimatedSection({ children, className, step = 0.08, delay = 0, amount = 0.2, id }: { children: ReactNode; className?: string; step?: number; delay?: number; amount?: number; id?: string }) {
  const v = useMotionVariants();
  return (
    <motion.div id={id} className={className} variants={v.stagger(step, delay)} initial="hidden" whileInView="show" viewport={{ once: true, amount }}>
      {children}
    </motion.div>
  );
}

/** A single revealed element; animate standalone with `standalone`, or as a child of AnimatedSection. */
export function AnimatedItem({ children, className, kind = 'fadeUp', standalone }: { children: ReactNode; className?: string; kind?: Kind; standalone?: boolean }) {
  const v = useMotionVariants();
  const extra = standalone ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount: 0.2 } } : {};
  return (
    <motion.div className={className} variants={v[kind]} {...extra}>
      {children}
    </motion.div>
  );
}

/** Consistent section heading block (eyebrow + h2 + lead). */
export function SectionHeading({ eyebrow, title, lead, align = 'center', id, tone = 'light' }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; align?: 'center' | 'left'; id?: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <AnimatedSection className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && (
        <AnimatedItem>
          <p className={`text-sm font-semibold tracking-wide uppercase ${dark ? 'text-teal-300' : 'text-brand-700'}`}>{eyebrow}</p>
        </AnimatedItem>
      )}
      <AnimatedItem>
        <h2 id={id} className={`mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1] ${dark ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
      </AnimatedItem>
      {lead && (
        <AnimatedItem>
          <p className={`mt-4 text-base leading-relaxed text-pretty sm:text-lg ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{lead}</p>
        </AnimatedItem>
      )}
    </AnimatedSection>
  );
}
