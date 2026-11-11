'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — page transition (App Router template).
 * A slanted Electric Lime wipe (the mark's 4.83° lean) sweeps off the page
 * toward the end edge on in-site navigation. Header stays outside the wipe;
 * nothing under prefers-reduced-motion.
 *
 * Fixes (kept independent of any redesign):
 * - Content is never wrapped in an opacity-0 / translated container, so the
 *   page is readable before JavaScript hydrates and the router's scroll-to-top
 *   lands at the real top of the new page.
 * - The server and the first client render are identical (the wipe is only
 *   added after mount), so reduced motion no longer causes hydration errors.
 * - The wipe runs on client-side navigations only, not on the first load.
 */
let firstLoad = true;

export default function Template({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const [wipe, setWipe] = useState(false);

  useEffect(() => {
    if (firstLoad) {
      firstLoad = false;
      return;
    }
    setWipe(true);
    // Safety net: removed no later than 1.2s (background tabs pause animation).
    const timer = window.setTimeout(() => setWipe(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {wipe && !prefersReducedMotion && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[95] bg-yoca-lime"
          initial={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
          animate={{ clipPath: 'polygon(100% 0, 108% 0, 100% 100%, 92% 100%)' }}
          transition={{ duration: 0.48, ease: EASE_YOCA }}
          onAnimationComplete={() => setWipe(false)}
          style={{ willChange: 'clip-path' }}
        />
      )}
      {children}
    </>
  );
}
