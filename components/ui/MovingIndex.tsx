'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';

/**
 * Yoca — moving index line.
 * Splits "Strategy. Identity. Experience. Growth." into words and highlights
 * each one in Electric Lime in turn (every ~2.4s). Static under
 * prefers-reduced-motion. Works with any locale (splits on the period).
 */

export default function MovingIndex({ line }: { line: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const words = line
    .split('.')
    .map((word) => word.trim())
    .filter(Boolean);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion || words.length < 2) return;
    const timer = setInterval(() => {
      setActive((current) => (current + 1) % words.length);
    }, 2400);
    return () => clearInterval(timer);
  }, [prefersReducedMotion, words.length]);

  return (
    <p className="flex flex-wrap gap-x-2 gap-y-1 text-[13px] font-bold uppercase tracking-[0.16em]">
      {words.map((word, index) => (
        <span
          key={word + index}
          className={`transition-colors duration-500 ${
            !prefersReducedMotion && index === active ? 'text-yoca-lime' : 'text-subtle'
          }`}
        >
          {word}.
        </span>
      ))}
    </p>
  );
}
