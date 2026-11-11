'use client';

import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';

/**
 * Yoca — living system diagram (hero visual).
 *
 * Modular square nodes derived from the fragmented-Y geometry cycle through
 * four calm phases on a slow loop:
 *   1. scattered modules → 2. connected system (Brand → Identity → Experience
 *   → Growth → Scale, with signal pulses) → 3. a brief fragmented-Y
 *   composition → 4. back to the modular system.
 * SVG + Framer Motion only; fully static under prefers-reduced-motion.
 */

interface NodeSpec {
  id: string;
  size: number;
  fill: string;
  label: string;
  /** [x, y] per phase: scattered, system, Y-composition (back to system after). */
  scattered: [number, number];
  system: [number, number];
  y: [number, number];
}

// Y composition follows the real mark: lime module (top-left), green module
// (stacked below it, offset by the logo's 4.83° slant), and three white nodes
// tracing the Y stroke — upper arm, junction, descending leg.
const NODES: NodeSpec[] = [
  { id: 'brand', size: 26, fill: '#A2FF00', label: 'Brand', scattered: [14, 96], system: [30, 40], y: [150, 12] },
  { id: 'identity', size: 22, fill: '#FFFFFF', label: 'Identity', scattered: [96, 18], system: [120, 92], y: [268, 12] },
  { id: 'experience', size: 22, fill: '#FFFFFF', label: 'Experience', scattered: [210, 118], system: [210, 44], y: [214, 84] },
  { id: 'growth', size: 26, fill: '#40C401', label: 'Growth', scattered: [300, 26], system: [296, 108], y: [170, 48] },
  { id: 'scale', size: 30, fill: '#A2FF00', label: 'Scale', scattered: [368, 112], system: [372, 40], y: [206, 132] },
];

const LINKS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
];

// Slow, refined loop: scattered → system (long hold) → Y → system.
const CYCLE = 18; // seconds
const TIMES = [0, 0.16, 0.52, 0.62, 0.78, 0.88, 1];

function keyframesFor(node: NodeSpec, axis: 0 | 1): number[] {
  const s = node.scattered[axis];
  const m = node.system[axis];
  const y = node.y[axis];
  return [s, m, m, y, y, m, m];
}

export default function HeroSystemDiagram() {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion) {
    // Static: the connected system state, no motion.
    return (
      <div aria-hidden="true" className="relative mx-auto w-full max-w-[460px] select-none">
        <svg viewBox="0 0 430 190" className="h-auto w-full overflow-visible">
          {LINKS.map(([from, to], index) => {
            const a = NODES[from];
            const b = NODES[to];
            return (
              <line
                key={index}
                x1={a.system[0] + a.size / 2}
                y1={a.system[1] + a.size / 2}
                x2={b.system[0] + b.size / 2}
                y2={b.system[1] + b.size / 2}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1.5"
              />
            );
          })}
          {NODES.map((node) => (
            <g key={node.id}>
              <rect x={node.system[0]} y={node.system[1]} width={node.size} height={node.size} fill={node.fill} />
              <text
                x={node.system[0] + node.size / 2}
                y={node.system[1] + node.size + 16}
                textAnchor="middle"
                fill="rgba(255,255,255,0.55)"
                fontSize="10"
                fontWeight="700"
                letterSpacing="0.08em"
              >
                {node.label.toUpperCase()}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[460px] select-none">
      <svg viewBox="0 0 430 190" className="h-auto w-full overflow-visible">
        {/* Dot grid backdrop */}
        {Array.from({ length: 6 }).map((_, row) =>
          Array.from({ length: 13 }).map((__, col) => (
            <rect
              key={`${row}-${col}`}
              x={10 + col * 34}
              y={8 + row * 32}
              width="2"
              height="2"
              fill="rgba(255,255,255,0.10)"
            />
          )),
        )}

        {/* Connectors + signal pulses — visible only during the system phase */}
        <motion.g
          animate={{ opacity: [0, 1, 1, 0, 0, 1, 1] }}
          transition={{ duration: CYCLE, times: TIMES, repeat: Infinity, ease: 'linear' }}
        >
          {LINKS.map(([from, to], index) => {
            const a = NODES[from];
            const b = NODES[to];
            const ax = a.system[0] + a.size / 2;
            const ay = a.system[1] + a.size / 2;
            const bx = b.system[0] + b.size / 2;
            const by = b.system[1] + b.size / 2;
            return (
              <g key={index}>
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                <motion.rect
                  width="5"
                  height="5"
                  fill="#A2FF00"
                  initial={{ x: ax - 2.5, y: ay - 2.5, opacity: 0 }}
                  animate={{
                    x: [ax - 2.5, bx - 2.5],
                    y: [ay - 2.5, by - 2.5],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{
                    duration: 1.6,
                    delay: index * 0.9,
                    repeat: Infinity,
                    repeatDelay: LINKS.length * 0.9 - 1.6 + 0.9,
                    ease: 'easeInOut',
                  }}
                />
              </g>
            );
          })}
        </motion.g>

        {/* Nodes travel: scattered → system → Y → system */}
        {NODES.map((node) => (
          <g key={node.id}>
            <motion.rect
              width={node.size}
              height={node.size}
              fill={node.fill}
              initial={false}
              animate={{ x: keyframesFor(node, 0), y: keyframesFor(node, 1) }}
              transition={{ duration: CYCLE, times: TIMES, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.text
              textAnchor="middle"
              fill="rgba(255,255,255,0.55)"
              fontSize="10"
              fontWeight="700"
              letterSpacing="0.08em"
              initial={false}
              animate={{
                x: keyframesFor(node, 0).map((v) => v + node.size / 2),
                y: keyframesFor(node, 1).map((v) => v + node.size + 16),
                // Labels fade out while the Y composition forms
                opacity: [0, 1, 1, 0, 0, 1, 1],
              }}
              transition={{ duration: CYCLE, times: TIMES, repeat: Infinity, ease: 'easeInOut' }}
            >
              {node.label.toUpperCase()}
            </motion.text>
          </g>
        ))}
      </svg>
    </div>
  );
}
