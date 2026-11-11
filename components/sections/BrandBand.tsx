'use client';

import { useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue, useScroll, useSpring, useTransform, useVelocity } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';

/**
 * Yoca — kinetic brand band (motion signature).
 * Two large typography tracks on Electric Lime move slowly in opposite
 * directions; scroll velocity nudges their speed and it settles back when
 * scrolling stops. Words come from the localized index line
 * ("Strategy. Identity. Experience. Growth."). Static under reduced motion;
 * direction respects RTL because the tracks are mirrored per row, not per script.
 */

interface BrandBandProps {
  line: string;
}

function Track({ words, direction, velocity, reduced }: { words: string[]; direction: 1 | -1; velocity: ReturnType<typeof useSpring>; reduced: boolean }) {
  const x = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  useAnimationFrame((_, delta) => {
    if (reduced || !ref.current) return;
    const width = ref.current.scrollWidth / 2; // two copies
    const base = 40; // px per second
    const boost = Math.min(4, Math.abs(velocity.get()) / 400) * base;
    let next = x.get() + direction * ((base + boost) * delta) / 1000 * -1;
    if (next <= -width) next += width;
    if (next > 0) next -= width;
    x.set(next);
  });
  const sequence = [...words, ...words, ...words, ...words];
  return (
    <motion.div ref={ref} style={{ x: reduced ? 0 : x }} className="flex w-max items-center">
      {[0, 1].map((copy) => (
        <div key={copy} className="flex shrink-0 items-center">
          {sequence.map((word, index) => (
            <span key={`${copy}-${index}`} className="flex items-center">
              <span className="px-5 text-[clamp(26px,4vw,60px)] font-extrabold leading-none tracking-[-0.03em] lg:px-8">
                {word}.
              </span>
              <span className="slant block h-[0.5em] w-[0.55em] bg-black text-[clamp(26px,4vw,60px)]" />
            </span>
          ))}
        </div>
      ))}
    </motion.div>
  );
}

export default function BrandBand({ line }: BrandBandProps) {
  const reduced = usePrefersReducedMotion();
  const words = line.split('.').map((w) => w.trim()).filter(Boolean);
  const { scrollY } = useScroll();
  const rawVelocity = useVelocity(scrollY);
  const velocity = useSpring(rawVelocity, { stiffness: 80, damping: 30 });
  const skew = useTransform(velocity, [-2000, 0, 2000], [-2, 0, 2]);

  return (
    <div aria-hidden="true" className="relative z-[7] overflow-hidden border-y border-black/20 bg-yoca-lime py-4 text-black lg:py-6" dir="ltr">
      <motion.div style={{ skewX: reduced ? 0 : skew }} className="grid gap-2 lg:gap-3">
        <Track words={words} direction={1} velocity={velocity} reduced={!!reduced} />
        <Track words={words} direction={-1} velocity={velocity} reduced={!!reduced} />
      </motion.div>
    </div>
  );
}
