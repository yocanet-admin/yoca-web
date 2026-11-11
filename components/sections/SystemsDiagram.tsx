'use client';

import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import { EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — the one diagram behind the three systems.
 * Driven by `active` (0 · 1 · 2), set by scroll position or hover of the
 * system rows: 01 the brand core · 02 the growth loop wraps it ·
 * 03 the scale layers stack beneath — final state reads
 * BRAND → GROWTH → SCALE. Each transition is a short crossfade/draw; the
 * diagram is otherwise still. Reduced motion shows the final state.
 */
interface SystemsDiagramProps {
  active: number;
  labels: [string, string, string];
}

const INK = '#050505';
const FAINT = 'rgba(5,5,5,0.14)';

export default function SystemsDiagram({ active, labels }: SystemsDiagramProps) {
  const reduced = usePrefersReducedMotion();
  const level = reduced ? 2 : active;
  const t = { duration: 0.6, ease: EASE_YOCA };

  return (
    <svg viewBox="0 0 520 380" className="h-auto w-full" aria-hidden="true">
      {/* 03 — scale layers */}
      <motion.g initial={false} animate={{ opacity: level >= 2 ? 1 : 0.08, y: level >= 2 ? 0 : 14 }} transition={t}>
        {[300, 262, 224].map((y, index) => (
          <g key={y}>
            <rect x="40" y={y} width="440" height="26" fill="none" stroke={FAINT} strokeWidth="1.5" />
            <rect x="40" y={y} width="4" height="26" fill={index === 2 ? '#A2FF00' : index === 1 ? '#40C401' : INK} />
            {Array.from({ length: index + 1 }).map((_, block) => (
              <rect key={block} x={464 - block * 22} y={y + 6} width="14" height="14" fill={index === 2 ? '#A2FF00' : index === 1 ? '#40C401' : INK} />
            ))}
          </g>
        ))}
      </motion.g>

      {/* 02 — growth loop */}
      <motion.g initial={false} animate={{ opacity: level >= 1 ? 1 : 0.08 }} transition={t}>
        <motion.path
          d="M 260 40 L 430 190 L 90 190 Z"
          fill="none"
          stroke="rgba(5,5,5,0.22)"
          strokeWidth="1.5"
          initial={false}
          animate={{ pathLength: level >= 1 ? 1 : 0 }}
          transition={{ duration: 0.9, ease: EASE_YOCA }}
        />
        <rect x="420" y="180" width="20" height="20" fill={INK} />
        <rect x="80" y="180" width="20" height="20" fill="#40C401" />
        {[0, 1, 2, 3].map((index) => (
          <rect key={index} x={150 + index * 12} y={150 - index * 6} width="8" height={14 + index * 6} fill={index === 3 ? '#40C401' : FAINT} />
        ))}
      </motion.g>

      {/* 01 — brand core (the mark's modules + block) */}
      <motion.g initial={false} animate={{ opacity: 1, scale: level === 0 ? 1.04 : 1 }} transition={t} style={{ transformOrigin: '266px 96px' }}>
        <polygon points="236,72 239.4,32 279.6,32 276.2,72" fill="#A2FF00" />
        <polygon points="259,72 299,72 295.6,112 255.6,112" fill="#40C401" />
        <rect x="236" y="120" width="40" height="40" fill={INK} />
      </motion.g>

      {/* Caption: 01 BRAND ─── 02 GROWTH ─── 03 SCALE (fills with progress) */}
      <g>
        {labels.map((label, index) => {
          const on = level >= index;
          const x = index === 0 ? 40 : index === 1 ? 260 : 480;
          const anchor = index === 0 ? 'start' : index === 1 ? 'middle' : 'end';
          return (
            <motion.text
              key={label}
              x={x}
              y="362"
              textAnchor={anchor}
              fontSize="11"
              fontWeight="800"
              letterSpacing="1.5"
              initial={false}
              animate={{ fill: on ? 'rgba(5,5,5,1)' : 'rgba(5,5,5,0.3)' }}
              transition={t}
            >
              {`0${index + 1} ${label}`}
            </motion.text>
          );
        })}
        <line x1="40" y1="372" x2="480" y2="372" stroke={FAINT} strokeWidth="1" />
        <motion.line x1="40" y1="372" x2="480" y2="372" stroke="#40C401" strokeWidth="1.5" initial={false} animate={{ pathLength: level / 2 }} transition={{ duration: 0.8, ease: EASE_YOCA }} />
      </g>
    </svg>
  );
}
