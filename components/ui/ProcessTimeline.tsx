'use client';

import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';

/**
 * Yoca — process journey (Understand → Define → Build → Launch → Grow).
 * Desktop: five steps on one rail whose fill follows scroll; the active step
 * (by scroll position) sharpens, its marker fills lime. Mobile: vertical rail.
 * Scroll-linked only — no pinning.
 */
interface ProcessTimelineProps {
  steps: Array<{ name: string; desc: string }>;
}

export default function ProcessTimeline({ steps }: ProcessTimelineProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 45%'] });
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(steps.length - 1, Math.floor(v * steps.length));
    if (next !== active) setActive(next);
  });

  return (
    <ol ref={ref} className="relative mt-14 grid gap-10 sm:grid-cols-2 lg:mt-20 lg:grid-cols-5 lg:gap-6">
      {/* Rail (desktop): hairline + scroll-linked fill */}
      <span aria-hidden="true" className="absolute inset-x-0 top-[9px] hidden h-px overflow-hidden bg-[rgba(5,5,5,0.16)] lg:block">
        <motion.span className="absolute inset-0 origin-left bg-yoca-green rtl:origin-right" style={{ scaleX: reduced ? 1 : fill }} />
      </span>
      {steps.map((step, index) => {
        const isActive = reduced ? true : index <= active;
        return (
          // Steps are never hidden: only the rail fill and the active marker follow scroll.
          <li key={step.name} className="relative">
            <motion.span
              aria-hidden="true"
              className="slant relative z-10 block h-[19px] w-[22px]"
              animate={{ backgroundColor: isActive ? (index === steps.length - 1 ? '#A2FF00' : '#40C401') : 'rgba(5,5,5,0.18)' }}
              transition={{ duration: 0.35 }}
            />
            <motion.span
              className="mt-6 block text-[clamp(44px,5vw,72px)] font-extrabold leading-none tracking-[-0.05em]"
              animate={{ color: isActive ? 'rgba(5,5,5,0.9)' : 'rgba(5,5,5,0.14)' }}
              transition={{ duration: 0.4 }}
            >
              {String(index + 1).padStart(2, '0')}
            </motion.span>
            <h3 className="mt-3 text-[20px] font-extrabold tracking-[-0.02em]">{step.name}</h3>
            <p className="light-muted mt-2 max-w-[30ch] text-[14px] leading-relaxed">{step.desc}</p>
          </li>
        );
      })}
    </ol>
  );
}
