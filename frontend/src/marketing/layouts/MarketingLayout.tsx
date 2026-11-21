import { Suspense, useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useMotionVariants } from '../animations/variants';

/** Scrolls to top on route change, or to the #hash target when present (retrying while lazy content mounts). */
function useScrollManagement() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
      if (tries++ < 20) timer = window.setTimeout(attempt, 60);
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [pathname, hash]);
}

function PageFallback() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4" aria-busy="true" aria-label="Loading page">
      <span className="size-8 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
    </div>
  );
}

export default function MarketingLayout() {
  const location = useLocation();
  // Capture the outlet element so the exiting page keeps rendering its own route during the transition.
  const outlet = useOutlet();
  const v = useMotionVariants();
  useScrollManagement();
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col overflow-x-clip bg-white font-sans text-slate-800 antialiased">
        <Navbar />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            id="main"
            key={location.pathname}
            tabIndex={-1}
            variants={v.page}
            initial="initial"
            animate="enter"
            exit="exit"
            className="flex-1 outline-none"
          >
            <Suspense fallback={<PageFallback />}>
              {outlet}
            </Suspense>
          </motion.main>
        </AnimatePresence>
        <Footer />
      </div>
    </MotionConfig>
  );
}
