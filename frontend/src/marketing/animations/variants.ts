import { useReducedMotion, type Transition, type Variants } from 'motion/react';

/** Shared easing: a soft ease-out used across the marketing site. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const baseTransition: Transition = { duration: 0.6, ease: EASE };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: baseTransition },
};
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
};
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
};
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -28 },
  show: { opacity: 1, x: 0, transition: baseTransition },
};
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: baseTransition },
};
export const stagger = (step = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: EASE } },
};

/** Opacity-only twins used when the visitor prefers reduced motion (no transforms). */
const fadeOnly: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } };
const pageFade: Variants = { initial: { opacity: 0 }, enter: { opacity: 1, transition: { duration: 0.3 } }, exit: { opacity: 0, transition: { duration: 0.15 } } };

/**
 * Returns the variant set appropriate for the visitor's motion preference.
 * With reduced motion every variant collapses to a plain fade (no translate / scale / parallax).
 */
export function useMotionVariants() {
  const reduce = !!useReducedMotion();
  return {
    reduce,
    fadeUp: reduce ? fadeOnly : fadeUp,
    fadeIn: reduce ? fadeOnly : fadeIn,
    scaleIn: reduce ? fadeOnly : scaleIn,
    slideInLeft: reduce ? fadeOnly : slideInLeft,
    slideInRight: reduce ? fadeOnly : slideInRight,
    page: reduce ? pageFade : pageTransition,
    stagger: (step?: number, delay?: number) => stagger(reduce ? 0 : step, reduce ? 0 : delay),
  };
}
