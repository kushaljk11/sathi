import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../../lib/auth';
import { homeFor } from '../../pages/Auth';
import { useMotionVariants } from '../animations/variants';
import { ButtonLink } from './ButtonLink';

/** Strong closing call-to-action band. */
export function CTASection({
  title = 'Take the first step — at your own pace.',
  text = 'Create an account to check in, explore support options and find a counselor who fits. You stay in control of what you share.',
}: { title?: string; text?: string }) {
  const { user } = useAuth();
  const v = useMotionVariants();
  return (
    <section aria-labelledby="cta-title" className="px-4 py-20 sm:px-6 lg:py-28">
      <motion.div
        variants={v.scaleIn}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 via-teal-800 to-slate-900 px-6 py-16 text-center shadow-2xl shadow-brand-900/20 sm:px-12 lg:py-20"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-20 size-72 rounded-full bg-teal-400/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-28 size-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative">
          <h2 id="cta-title" className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">{title}</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-teal-50/90 sm:text-lg">{text}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {user ? (
              <ButtonLink to={homeFor(user.role)} variant="light" size="lg">Go to dashboard <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            ) : (
              <>
                <ButtonLink to="/register" variant="light" size="lg">Get Started <ArrowRight className="size-4" aria-hidden /></ButtonLink>
                <ButtonLink to="/features" variant="glass" size="lg">See all features</ButtonLink>
              </>
            )}
          </div>
          <p className="mt-8 text-sm text-teal-100/80">
            Sathi is not an emergency service. If you are in danger, <Link to="/safety" className="font-semibold text-white underline underline-offset-4 hover:no-underline">get urgent help</Link>.
          </p>
        </div>
      </motion.div>
    </section>
  );
}
