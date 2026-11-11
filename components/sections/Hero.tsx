'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import HeroSymbol from '@/components/ui/HeroSymbol';
import SplitWords from '@/components/ui/SplitWords';
import Magnetic from '@/components/ui/Magnetic';
import type { Dict } from '@/lib/i18n';
import { DUR, EASE_YOCA, MOTION } from '@/lib/motion';

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
  const prefersReducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  // Scroll parallax: the mark drifts up and leans as the hero leaves the viewport.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const markY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const markRotate = useTransform(scrollYProgress, [0, 1], [0, -4.83]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  // Pointer displacement of the structural grid — architectural, max ~10px.
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gridX = useSpring(gx, { stiffness: 60, damping: 20 });
  const gridY = useSpring(gy, { stiffness: 60, damping: 20 });
  const onPointer = (event: React.PointerEvent) => {
    if (prefersReducedMotion || event.pointerType !== 'mouse') return;
    const nx = event.clientX / window.innerWidth - 0.5;
    const ny = event.clientY / window.innerHeight - 0.5;
    gx.set(-nx * MOTION.pointer.max * 2);
    gy.set(-ny * MOTION.pointer.max * 2);
  };

  const item = (delay: number) => ({
    'data-reveal': true,
    initial: { opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.slow, delay, ease: EASE_YOCA },
  });

  return (
    <section ref={sectionRef} onPointerMove={onPointer} className="relative z-[7] flex min-h-[100svh] flex-col overflow-hidden bg-surface-deep pt-28 lg:min-h-[92svh] lg:pt-32">
      {/* Grid lines backdrop — fades toward the rail */}
      <motion.div
        aria-hidden="true"
        className="absolute -inset-4 opacity-50"
        style={{
          x: gridX,
          y: gridY,
          backgroundImage:
            'linear-gradient(#1A1E26 1px, transparent 1px), linear-gradient(90deg, #1A1E26 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
        }}
      />

      <div className="container-y relative grid flex-1 items-center gap-10 py-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8 lg:py-8">
        <motion.div style={{ y: prefersReducedMotion ? 0 : copyY }} className="relative z-10">
          <motion.p {...item(0)} className="eyebrow">
            {t.eyebrow}
          </motion.p>
          <motion.h1
            {...item(0.1)}
            className="mt-6 max-w-[16ch] text-[clamp(38px,5vw,76px)] font-extrabold leading-[1.04] tracking-[-0.03em]"
          >
            <SplitWords text={t.title} emphasis={t.emphasis} trigger="load" delay={0.15} />
          </motion.h1>
          <motion.p
            {...item(0.2)}
            className="mt-7 max-w-[52ch] text-[16px] leading-relaxed text-muted lg:text-[18px]"
          >
            {t.description}
          </motion.p>
          <motion.div {...item(0.3)} className="mt-9 flex flex-wrap gap-3.5">
            <Magnetic>
              <Link href={`${base}/contact`} className="btn-primary px-8 py-4 text-base">
                {t.primaryCta}
              </Link>
            </Magnetic>
            <Link href={`${base}/checkup`} className="btn-ghost px-8 py-4 text-base">
              {t.secondaryCta}
            </Link>
          </motion.div>
        </motion.div>

        {/* The mark — allowed to run past the container edge on wide screens */}
        <motion.div
          {...item(0.15)}
          className="relative max-lg:mx-auto max-lg:w-[min(70vw,340px)] lg:-me-[6vw] lg:justify-self-end lg:w-[min(38vw,560px)]"
        >
          <motion.div style={{ y: prefersReducedMotion ? 0 : markY, rotate: prefersReducedMotion ? 0 : markRotate }}>
            <HeroSymbol />
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom rail: index line · system order · scroll hint */}
      <motion.div {...item(0.45)} className="container-y relative">
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
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
            />
          </span>
        </div>
      </motion.div>
    </section>
  );
}
