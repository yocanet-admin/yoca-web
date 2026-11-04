'use client';

import { useEffect, useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useVelocity } from 'framer-motion';

/**
 * Yoca — kinetic brand band (motion signature).
 * Two typography tracks on Electric Lime move slowly in opposite directions;
 * scrolling nudges the speed a little (max 1.5×) and it settles back. No skew
 * (it blurred the words), and the loop only runs while the band is on screen. Words come from the localized index line
 * ("Strategy. Identity. Experience. Growth."). Static under reduced motion;
 * direction respects RTL because the tracks are mirrored per row, not per script.
 */

interface BrandBandProps {
  line: string;
}

function Track({ words, direction, velocity, reduced, visible }: { words: string[]; direction: 1 | -1; velocity: ReturnType<typeof useSpring>; reduced: boolean; visible: React.MutableRefObject<boolean> }) {
  const x = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  useAnimationFrame((_, delta) => {
    if (reduced || !visible.current || !ref.current) return;
    const width = ref.current.scrollWidth / 2; // two copies
    const base = 32; // px per second
    const boost = Math.min(0.5, Math.abs(velocity.get()) / 3000) * base;
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
              <span className="px-5 text-[clamp(24px,3.4vw,52px)] font-extrabold leading-none tracking-[-0.03em] lg:px-7">
                {word}.
              </span>
              <span className="slant block h-[0.42em] w-[0.48em] bg-black text-[clamp(24px,3.4vw,52px)]" />
            </span>
          ))}
        </div>
      ))}
    </motion.div>
  );
}

export default function BrandBand({ line }: BrandBandProps) {
  const reduced = useReducedMotion();
  const words = line.split('.').map((w) => w.trim()).filter(Boolean);
  const { scrollY } = useScroll();
  const rawVelocity = useVelocity(scrollY);
  const velocity = useSpring(rawVelocity, { stiffness: 80, damping: 30 });
  const bandRef = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={bandRef} aria-hidden="true" className="relative z-[7] overflow-hidden border-y border-black/20 bg-yoca-lime py-4 text-black lg:py-5" dir="ltr">
      <div className="grid gap-2 lg:gap-2.5">
        <Track words={words} direction={1} velocity={velocity} reduced={!!reduced} visible={visible} />
        <Track words={words} direction={-1} velocity={velocity} reduced={!!reduced} visible={visible} />
      </div>
    </div>
  );
}
