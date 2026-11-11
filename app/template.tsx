'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_YOCA } from '@/lib/motion';
// Loaded first so framer's skipAnimations follows "reduce motion" before this
// template's own wipe / fade are created (lib/reducedMotion.ts).
import '@/lib/reducedMotion';

/**
 * Yoca — page transition (App Router template).
 * A slanted Electric Lime wipe (the mark's 4.83° lean) sweeps off the page
 * toward the end edge while the content rises in beneath it. Header stays
 * outside the wipe; nothing under prefers-reduced-motion.
 *
 * Reduced motion is honoured in CSS (`motion-reduce:` variants), NOT by a
 * JS branch: the server cannot know the preference, so returning a different
 * tree on the client (as `useReducedMotion()` did) broke hydration on every
 * page for those visitors (React #418/#423) and showed the full-screen wipe
 * until the client re-render. Server and client now render the same tree;
 * under reduce the wipe is display:none from the first paint and the content
 * wrapper is pinned to opacity 1 / no transform (!important beats the inline
 * animation style), so nothing moves.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const [wipeDone, setWipeDone] = useState(false);

  // Safety net: the wipe is removed from the DOM once it finishes — and no
  // later than 1.2s regardless (background tabs pause rAF-driven animation).
  useEffect(() => {
    const timer = window.setTimeout(() => setWipeDone(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {!wipeDone && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[95] bg-yoca-lime motion-reduce:hidden"
          initial={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
          animate={{ clipPath: 'polygon(100% 0, 108% 0, 100% 100%, 92% 100%)' }}
          transition={{ duration: 0.48, ease: EASE_YOCA }}
          onAnimationComplete={() => setWipeDone(true)}
          style={{ willChange: 'clip-path' }}
        />
      )}
      <motion.div
        className="motion-reduce:!transform-none motion-reduce:!opacity-100"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.14, ease: EASE_YOCA }}
      >
        {children}
      </motion.div>
    </>
  );
}
