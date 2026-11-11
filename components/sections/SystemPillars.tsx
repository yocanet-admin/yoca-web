'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import type { Dict } from '@/lib/i18n';
import { EASE_YOCA } from '@/lib/motion';
import SplitWords from '@/components/ui/SplitWords';
import { brandText } from '@/components/ui/BrandText';

/**
 * Yoca — "One methodology. Three connected systems." (soft-white break)
 *
 * Canonical order never changes: 01 Yoca Brand System™ → 02 Yoca Growth
 * Engine™ → 03 Yoca Scale Framework™.
 *
 * Model: three numbered rows (name · tagline · body · short points) and, on
 * desktop, ONE quiet sticky "spine" beside them — three blocks on a single
 * connector, 01 → 02 → 03. The block of the active system (the row centred
 * in the viewport, or hovered / focused) is highlighted; everything else
 * rests. No diagram, no micro-labels, no looping motion. Mobile: rows only.
 */

interface SystemPillarsProps {
  t: Dict['systems'];
  base: string;
}

const ANCHORS = ['brand', 'growth', 'scale'];
const TONE = ['bg-[#050505]', 'bg-yoca-green', 'bg-yoca-lime'];

export default function SystemPillars({ t, base }: SystemPillarsProps) {
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(0);
  const active = hovered ?? scrolled;
  const items = t.items.slice(0, 3);

  return (
    <section className="section-light relative z-[7] py-20 lg:py-32" aria-label={t.heading}>
      <div className="container-y">
        {/* Head — heading first, support copy second */}
        <div className="grid gap-6 border-b border-[rgba(5,5,5,0.16)] pb-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <h2 className="max-w-[16ch] text-[clamp(34px,4.6vw,64px)] font-extrabold leading-[1.08] tracking-[-0.03em]">
            <SplitWords text={t.heading} />
          </h2>
          <p className="light-muted max-w-[46ch] text-[16px] leading-relaxed lg:justify-self-end lg:text-[17px]">
            {t.sub}
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          {/* ── Rows ─────────────────────────────────────────────── */}
          <ol>
            {items.map((system, index) => {
              const isActive = active === index;
              return (
                <li key={system.name} className="border-b border-[rgba(5,5,5,0.16)]">
                  <motion.div onViewportEnter={() => setScrolled(index)} viewport={{ margin: '-45% 0px -45% 0px' }}>
                    <Link
                      href={`${base}/services#${ANCHORS[index]}`}
                      onMouseEnter={() => setHovered(index)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(index)}
                      onBlur={() => setHovered(null)}
                      aria-current={isActive ? 'true' : undefined}
                      className="group grid gap-6 py-10 md:grid-cols-[88px_minmax(0,1fr)] md:gap-8 lg:py-12"
                    >
                      <span
                        aria-hidden="true"
                        className={`block text-[clamp(44px,5vw,72px)] font-extrabold leading-[0.9] tracking-[-0.05em] transition-colors duration-300 ${
                          isActive ? 'text-[#050505]' : 'text-[rgba(5,5,5,0.16)]'
                        }`}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3 className="text-[clamp(22px,2.2vw,30px)] font-extrabold leading-tight tracking-[-0.02em]">{system.name}</h3>
                        <p className="light-subtle mt-1.5 text-[12px] font-bold uppercase tracking-[0.14em]">{brandText(system.tagline)}</p>
                        <p className="light-muted mt-4 max-w-[52ch] text-[16px] leading-relaxed">{system.body}</p>
                        <ul className="mt-5 flex flex-wrap gap-2">
                          {system.points.map((point) => (
                            <li
                              key={point}
                              className={`border px-3 py-1.5 text-[13px] font-bold transition-colors duration-300 ${
                                isActive ? 'border-[#050505] text-[#050505]' : 'border-[rgba(5,5,5,0.2)] text-[rgba(5,5,5,0.7)]'
                              }`}
                            >
                              {point}
                            </li>
                          ))}
                        </ul>
                        <span className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#267800]">
                          {String(index + 1).padStart(2, '0')} <span aria-hidden="true" className="icon-arrow">→</span>
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                </li>
              );
            })}
          </ol>

          {/* ── Spine (desktop): three blocks, one connector, 01 → 02 → 03 ── */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <ol className="relative grid gap-4 ps-8" aria-hidden="true">
                {/* connector */}
                <span className="absolute inset-y-6 start-[9px] w-px bg-[rgba(5,5,5,0.16)]">
                  <motion.span
                    className="absolute inset-x-0 top-0 bg-yoca-green"
                    initial={false}
                    animate={{ height: reduced ? '100%' : `${(active / 2) * 100}%` }}
                    transition={{ duration: 0.4, ease: EASE_YOCA }}
                  />
                </span>
                {items.map((system, index) => {
                  const on = reduced ? true : active === index;
                  const done = !reduced && active > index;
                  return (
                    <li key={system.name} className="relative">
                      {/* node on the connector */}
                      <span
                        className={`slant absolute -start-8 top-6 block h-[15px] w-[18px] transition-colors duration-300 ${
                          on || done ? TONE[index] : 'bg-[rgba(5,5,5,0.16)]'
                        }`}
                      />
                      <motion.div
                        initial={false}
                        animate={{
                          backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                          borderColor: on ? 'rgba(5,5,5,0.9)' : 'rgba(5,5,5,0.14)',
                        }}
                        transition={{ duration: 0.35, ease: EASE_YOCA }}
                        className="border p-5"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span className={`text-[12px] font-extrabold tracking-[0.1em] ${on ? 'text-[#267800]' : 'text-[rgba(5,5,5,0.4)]'}`}>
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${on ? 'text-[rgba(5,5,5,0.6)]' : 'text-[rgba(5,5,5,0.35)]'}`}>
                            {system.tagline}
                          </span>
                        </div>
                        <p className={`mt-2 text-[17px] font-extrabold tracking-[-0.02em] transition-colors duration-300 ${on ? 'text-[#050505]' : 'text-[rgba(5,5,5,0.45)]'}`}>
                          {system.name}
                        </p>
                        <motion.div
                          initial={false}
                          animate={{ height: on ? 'auto' : 0, opacity: on ? 1 : 0 }}
                          transition={{ duration: 0.35, ease: EASE_YOCA }}
                          className="overflow-hidden"
                        >
                          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                            {system.points.map((point) => (
                              <li key={point} className="flex items-center gap-2 text-[13px] font-semibold text-[rgba(5,5,5,0.75)]">
                                <span className={`slant block h-2 w-2.5 flex-none ${TONE[index]}`} />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      </motion.div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
