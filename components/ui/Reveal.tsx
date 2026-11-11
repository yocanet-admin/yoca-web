'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { DUR, EASE_YOCA, RISE, VIEWPORT_ONCE } from '@/lib/motion';

/**
 * Yoca — shared scroll reveal (the ONLY entry animation primitive).
 * mode="rise" (default): fade + modular upward shift.
 * mode="mask": geometric wipe — content emerges from structure.
 * All timing/easing comes from lib/motion.ts.
 * Under "reduce motion" `data-reveal` (app/globals.css) shows the content in
 * place from the first paint; framer's skipAnimations (lib/reducedMotion.ts)
 * keeps it still after hydration.
 */

interface RevealProps {
  children: ReactNode;
  /** Extra delay in seconds (use multiples of STAGGER for siblings). */
  delay?: number;
  mode?: 'rise' | 'mask';
  className?: string;
}

export default function Reveal({ children, delay = 0, mode = 'rise', className }: RevealProps) {
  if (mode === 'mask') {
    return (
      <motion.div
        data-reveal
        initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0.4 }}
        whileInView={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
        viewport={VIEWPORT_ONCE}
        transition={{ duration: DUR.slow, delay, ease: EASE_YOCA }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      data-reveal
      initial={{ opacity: 0, y: RISE }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: DUR.reveal, delay, ease: EASE_YOCA }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
