'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import HeroSymbol from '@/components/ui/HeroSymbol';
import SplitWords from '@/components/ui/SplitWords';
import type { Dict } from '@/lib/i18n';
import { DUR, EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — homepage hero.
 * Full-viewport, type-led. Staggered copy on the start side; the real Yoca
 * mark at architectural scale on the end side, assembling itself on load.
 * A bottom rail carries the three-system order (01 → 02 → 03) and a scroll
 * pulse; the index line lives in the lime brand band directly below.
 * CTA hierarchy: Start a Project (solid lime, → contact) is primary;
 * the free Digital Check-Up (border) is the secondary lead magnet.
 */

interface HeroProps {
  t: Dict['hero'];
  /** Locale base path, e.g. "/tr". */
  base: string;
  /** System names for the bottom rail (01 → 02 → 03). */
  rail?: string[];
}

export default function Hero({ t, base, rail = [] }: HeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  // Scroll: the mark drifts up a little as the hero leaves — no rotation, no
  // pointer-driven grid (both were decorative and competed with the type).
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const markY = useTransform(scrollYProgress, [0, 1], [0, -72]);

  // One short, ordered intro (~0.9 s in total): eyebrow → title → copy → actions → rail.
  const item = (delay: number) => ({
    initial: { opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.reveal, delay, ease: EASE_YOCA },
  });

  return (
    <section ref={sectionRef} className="relative z-[7] flex flex-col overflow-hidden bg-surface-deep pt-24 lg:min-h-[92svh] lg:pt-32">
      {/* Grid lines backdrop — static, fades toward the rail */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(#1A1E26 1px, transparent 1px), linear-gradient(90deg, #1A1E26 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
        }}
      />

      <div className="container-y relative grid flex-1 items-center gap-12 py-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8 lg:py-10">
        <div className="relative z-10">
          <motion.p {...item(0)} className="eyebrow">
            {t.eyebrow}
          </motion.p>
          <h1 className="mt-6 max-w-[16ch] text-[clamp(38px,5vw,76px)] font-extrabold leading-[1.02] tracking-[-0.035em] rtl:leading-[1.25]">
            <SplitWords text={t.title} emphasis={t.emphasis} trigger="load" delay={0.08} stagger={0.035} />
          </h1>
          <motion.p
            {...item(0.28)}
            className="mt-7 max-w-[44ch] text-[16px] leading-[1.65] text-muted lg:text-[18px]"
          >
            {t.description}
          </motion.p>
          <motion.div {...item(0.36)} className="mt-9 grid gap-3 sm:flex sm:flex-wrap">
            <Link href={`${base}/contact`} className="btn-primary h-[52px] px-7 text-base">
              <span className="roll">
                <span>{t.primaryCta}</span>
                <span aria-hidden="true">{t.primaryCta}</span>
              </span>
              <span aria-hidden="true" className="icon-arrow">→</span>
            </Link>
            <Link href={`${base}/checkup`} className="btn-ghost h-[52px] px-7 text-base">
              <span className="roll">
                <span>{t.secondaryCta}</span>
                <span aria-hidden="true">{t.secondaryCta}</span>
              </span>
            </Link>
          </motion.div>
        </div>

        {/* The mark — sits inside the container (no clash with the viewport edge); smaller on phones */}
        <motion.div
          {...item(0.12)}
          className="relative max-lg:ms-auto max-lg:w-[min(48vw,220px)] lg:justify-self-end lg:w-[min(33vw,470px)]"
        >
          <motion.div style={{ y: prefersReducedMotion ? 0 : markY }}>
            <HeroSymbol />
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom rail: index line · system order · scroll hint */}
      <motion.div {...item(0.44)} className="container-y relative">
        <div className="module-rule" />
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-6">
          {rail.length > 0 && (
            <ol className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">
              {rail.map((name, index) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="text-yoca-lime">{String(index + 1).padStart(2, '0')}</span>
                  <span>{name}</span>
                  {index < rail.length - 1 && (
                    <span aria-hidden="true" className="ms-4 block h-px w-6 bg-line" />
                  )}
                </li>
              ))}
            </ol>
          )}
          <span aria-hidden="true" className="hidden h-8 w-px overflow-hidden bg-line lg:block">
            <motion.span
              className="block h-full w-full bg-yoca-lime"
              animate={prefersReducedMotion ? undefined : { y: ['-100%', '100%'] }}
              transition={{ duration: 1.6, repeat: 2, ease: 'easeInOut', repeatDelay: 0.8, delay: 1 }}
            />
          </span>
        </div>
      </motion.div>
    </section>
  );
}
