'use client';

import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import { EASE_YOCA, VIEWPORT_ONCE } from '@/lib/motion';

/**
 * Yoca — "How this becomes real" flow.
 * Localized steps on one connector: the line draws once as the section
 * enters, labels reveal in sequence, then everything rests. Horizontal on
 * desktop, vertical on small screens; RTL-aware via logical properties.
 */
interface FlowDiagramProps {
  steps: string[];
  tone?: 'dark' | 'light';
}

export default function FlowDiagram({ steps, tone = 'dark' }: FlowDiagramProps) {
  const reduced = usePrefersReducedMotion();
  const line = tone === 'light' ? 'bg-[rgba(5,5,5,0.16)]' : 'bg-line';
  const fill = tone === 'light' ? 'bg-yoca-green' : 'bg-yoca-lime';
  const label = tone === 'light' ? 'text-[#050505]' : 'text-soft';
  const num = tone === 'light' ? 'text-[#267800]' : 'text-yoca-lime';

  return (
    <motion.ol
      className="relative grid gap-8 md:grid-flow-col md:auto-cols-fr md:gap-4"
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
    >
      {/* Connector: horizontal on md+, vertical below */}
      <span aria-hidden="true" className={`absolute start-[9px] top-2 bottom-2 w-px md:inset-x-2 md:top-[9px] md:bottom-auto md:h-px md:w-auto ${line}`}>
        <motion.span
          className={`absolute inset-0 origin-top md:origin-left rtl:md:origin-right ${fill}`}
          variants={{ hidden: { scaleY: reduced ? 1 : 0, scaleX: reduced ? 1 : 0 }, visible: { scaleY: 1, scaleX: 1 } }}
          transition={{ duration: 1.1, ease: EASE_YOCA }}
        />
      </span>
      {steps.map((step, index) => (
        <motion.li
          key={step}
          className="relative ps-8 md:ps-0 md:pt-8"
          variants={{ hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.45, delay: 0.15 + index * (0.9 / steps.length), ease: EASE_YOCA }}
        >
          <span
            aria-hidden="true"
            className={`slant absolute start-0 top-0 block h-[17px] w-[20px] md:start-2 ${index === steps.length - 1 ? 'bg-yoca-lime' : index === 0 ? (tone === 'light' ? 'bg-[#050505]' : 'bg-white') : 'bg-yoca-green'}`}
          />
          <span className={`block text-[11px] font-extrabold tracking-[0.12em] ${num}`}>{String(index + 1).padStart(2, '0')}</span>
          <span className={`mt-1 block text-[clamp(16px,1.5vw,20px)] font-extrabold tracking-[-0.01em] ${label}`}>{step}</span>
        </motion.li>
      ))}
    </motion.ol>
  );
}
