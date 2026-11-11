'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import type { CaseStudy } from '@/lib/workData';
import { EASE_YOCA, VIEWPORT_ONCE } from '@/lib/motion';
import ProjectCover from '@/components/work/ProjectCover';
import { getWorkMedia } from '@/lib/workMedia';

/**
 * Yoca — work index rows (client half of WorkIndex).
 * Rows draw their hairline in from the start edge as they enter; on pointer
 * devices a project preview follows the cursor across the row, tilted by the
 * mark's 4.83° and settling flat as it appears.
 */

interface WorkIndexListProps {
  studies: CaseStudy[];
  base: string;
  viewCase: string;
  status: Record<CaseStudy['kind'], string>;
}

export default function WorkIndexList({ studies, base, viewCase, status }: WorkIndexListProps) {
  const reduced = usePrefersReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 260, damping: 26, mass: 0.5 });
  const sy = useSpring(py, { stiffness: 260, damping: 26, mass: 0.5 });

  const onMove = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse' || !listRef.current) return;
    const rect = listRef.current.getBoundingClientRect();
    px.set(event.clientX - rect.left);
    py.set(event.clientY - rect.top);
  };

  const active = studies.find((study) => study.slug === hovered);

  return (
    <ol
      ref={listRef}
      onPointerMove={onMove}
      onPointerLeave={() => setHovered(null)}
      className="relative mt-12 lg:mt-16"
    >
      {studies.map((study, index) => (
        <li key={study.slug} className="relative">
          {/* Hairline draws in from the start edge */}
          <motion.span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px origin-[0_50%] bg-line rtl:origin-[100%_50%]"
            initial={reduced ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={VIEWPORT_ONCE}
            transition={{ duration: 0.8, delay: index * 0.08, ease: EASE_YOCA }}
          />
          <Link
            href={`${base}/work/${study.slug}`}
            onPointerEnter={() => setHovered(study.slug)}
            onFocus={() => setHovered(study.slug)}
            onBlur={() => setHovered(null)}
            className="group relative grid items-center gap-x-8 gap-y-3 py-7 md:grid-cols-[56px_minmax(0,1fr)_auto] lg:py-9"
            aria-label={`${study.name} — ${viewCase}`}
          >
            <span className="text-[13px] font-extrabold tracking-[0.1em] text-yoca-lime">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <motion.span
                className="block text-[clamp(28px,4vw,56px)] font-extrabold leading-[1.02] tracking-[-0.03em] text-soft transition-colors duration-300 group-hover:text-white"
                initial={reduced ? false : { opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={VIEWPORT_ONCE}
                transition={{ duration: 0.6, delay: 0.1 + index * 0.08, ease: EASE_YOCA }}
              >
                {study.name}
              </motion.span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">
                {[study.sector, study.services.join(' · '), study.year]
                  .filter(Boolean)
                  .map((part, partIndex) => (
                    <span key={part} className="flex items-center gap-x-3">
                      {partIndex > 0 && <span aria-hidden="true" className="h-3 w-px bg-line" />}
                      <span>{part}</span>
                    </span>
                  ))}
              </span>
            </span>
            <span className="flex items-center gap-4 md:justify-self-end">
              <span className="slant bg-surface-elevated px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-soft">
                {status[study.kind]}
              </span>
              <span aria-hidden="true" className="icon-arrow text-xl text-subtle transition-colors group-hover:text-yoca-lime">
                →
              </span>
            </span>
          </Link>
        </li>
      ))}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-line" />

      {/* Cursor-following preview (pointer devices, desktop) */}
      <motion.span
        aria-hidden="true"
        className="hover-preview pointer-events-none absolute start-0 top-0 z-10 w-[260px] overflow-hidden border border-line shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%' }}
        animate={active && getWorkMedia(active.slug).hero && !reduced ? { opacity: 1, rotate: 0, scale: 1 } : { opacity: 0, rotate: -4.83, scale: 0.92 }}
        transition={{ duration: 0.35, ease: EASE_YOCA }}
      >
        {active && getWorkMedia(active.slug).hero && (
          <span className="block aspect-[16/10] w-full">
            <ProjectCover slug={active.slug} name={active.name} sector={active.sector} />
          </span>
        )}
      </motion.span>
    </ol>
  );
}
