'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — the hero mark.
 * The real Yoca "Y" (exact logo geometry, never redrawn) at architectural
 * scale. On load its three fragments travel in from off-axis positions and
 * lock into the mark — ideas becoming a system. Once assembled the mark
 * breathes very slowly and leans toward the pointer on separate depth layers.
 * Fully static under prefers-reduced-motion.
 */

/** Exact geometry of the Yoca mark (logo file, viewBox 0 0 250 69.05 → symbol crop). */
export const MARK = {
  lime: '0,16.71 1.36,0.62 17.54,0.62 16.18,16.71',
  green: '9.31,16.71 25.49,16.71 24.13,32.8 7.95,32.8',
  y: '50.92,0.62 67.43,0.62 42.59,69.04 26.18,69.04 33.49,48.91 15.43,48.91 16.66,32.8 39.56,32.8',
} as const;

interface FragmentSpec {
  points: string;
  fill: string;
  /** Parallax depth — larger moves more. */
  depth: number;
  /** Entry offset (x, y, rotate) before locking into place. */
  from: { x: number; y: number; r: number };
  delay: number;
}

const FRAGMENTS: FragmentSpec[] = [
  { points: MARK.y, fill: '#FFFFFF', depth: 10, from: { x: 26, y: -18, r: 6 }, delay: 0 },
  { points: MARK.lime, fill: '#A2FF00', depth: 30, from: { x: -34, y: -26, r: -10 }, delay: 0.32 },
  { points: MARK.green, fill: '#40C401', depth: 44, from: { x: -30, y: 30, r: 8 }, delay: 0.5 },
];

export default function HeroSymbol() {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 20, mass: 0.7 });
  const sy = useSpring(my, { stiffness: 50, damping: 20, mass: 0.7 });

  const handlePointer = (event: React.PointerEvent) => {
    if (prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
    my.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointer}
      onPointerLeave={reset}
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[560px] select-none"
    >
      <svg viewBox="-6 -4 80 78" className="h-auto w-full overflow-visible">
        {/* Construction guides — the mark's own slant, drawn once as hairlines */}
        <g stroke="rgba(255,255,255,0.09)" strokeWidth="0.35" fill="none">
          <line x1="-6" y1="16.71" x2="74" y2="16.71" />
          <line x1="-6" y1="32.8" x2="74" y2="32.8" />
          <line x1="-6" y1="48.91" x2="74" y2="48.91" />
          <line x1="-6" y1="69.04" x2="74" y2="69.04" />
          <line x1="1.36" y1="-4" x2="-4.6" y2="74" />
          <line x1="67.43" y1="-4" x2="61.4" y2="74" />
        </g>
        {FRAGMENTS.map((fragment, index) => (
          <Fragment
            key={index}
            fragment={fragment}
            sx={sx}
            sy={sy}
            reduced={!!prefersReducedMotion}
          />
        ))}
      </svg>
    </div>
  );
}

function Fragment({
  fragment,
  sx,
  sy,
  reduced,
}: {
  fragment: FragmentSpec;
  sx: ReturnType<typeof useSpring>;
  sy: ReturnType<typeof useSpring>;
  reduced: boolean;
}) {
  const x = useTransform(sx, [-1, 1], [fragment.depth / 14, -fragment.depth / 14]);
  const y = useTransform(sy, [-1, 1], [fragment.depth / 18, -fragment.depth / 18]);

  // Same markup with or without reduced motion (hydration-safe): reduced
  // motion simply starts in the assembled state and does not follow the pointer.
  return (
    <motion.g style={reduced ? undefined : { x, y }}>
      <motion.polygon
        points={fragment.points}
        fill={fragment.fill}
        initial={reduced ? false : { opacity: 0, x: fragment.from.x, y: fragment.from.y, rotate: fragment.from.r }}
        animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
        transition={{ duration: 1.1, delay: 0.25 + fragment.delay, ease: EASE_YOCA }}
        style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
      />
    </motion.g>
  );
}
