'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import { DUR, EASE_YOCA } from '@/lib/motion';
import SplitWords from '@/components/ui/SplitWords';
import { brandText } from '@/components/ui/BrandText';

/**
 * Yoca — inner-page intro (shared by every non-home page).
 * Same choreography as the homepage hero: staggered rise for eyebrow →
 * title → sub → meta, the display type scale, the stacked brand modules at
 * the top-end corner (.intro-slab) and a module rule closing the block.
 * Static under prefers-reduced-motion.
 */

interface Crumb {
  label: string;
  href?: string;
}

interface PageIntroProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  /** "muted" (default) or "lime" for a manifesto-style all-caps line. */
  subTone?: 'muted' | 'lime';
  crumbs?: Crumb[];
  /** Extra content under the sub (status labels, meta lists…). */
  children?: ReactNode;
  /** Content for the closing rail (start side). */
  rail?: ReactNode;
  /** Tight bottom spacing when the next section is visually attached. */
  compact?: boolean;
  titleMax?: string;
}

export default function PageIntro({
  eyebrow,
  title,
  sub,
  subTone = 'muted',
  crumbs,
  children,
  rail,
  compact = false,
  titleMax = 'max-w-[18ch]',
}: PageIntroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const item = (delay: number) => ({
    initial: { opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.slow, delay, ease: EASE_YOCA },
  });

  return (
    <section className={`intro-slab relative z-[7] bg-surface-deep pt-32 lg:pt-40 ${compact ? 'pb-8' : 'pb-12 lg:pb-16'}`}>
      <div className="container-y">
        {crumbs && crumbs.length > 0 && (
          <motion.nav {...item(0)} aria-label="Breadcrumb" className="flex flex-wrap gap-2.5 text-[13px] text-subtle">
            {crumbs.map((crumb, index) => (
              <span key={crumb.label + index} className="flex gap-2.5">
                {crumb.href ? (
                  <Link href={crumb.href} className="transition-colors hover:text-yoca-lime">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-muted">
                    {crumb.label}
                  </span>
                )}
                {index < crumbs.length - 1 && <span aria-hidden="true">/</span>}
              </span>
            ))}
          </motion.nav>
        )}
        {eyebrow && (
          <motion.p {...item(0.05)} className={`eyebrow ${crumbs ? 'mt-6' : ''}`}>
            {brandText(eyebrow)}
          </motion.p>
        )}
        <h1 className={`mt-6 ${titleMax} text-[clamp(36px,4.8vw,72px)] font-extrabold leading-[1.04] tracking-[-0.03em]`}>
          <SplitWords text={title} trigger="load" delay={0.12} />
        </h1>
        {sub && (
          <motion.p
            {...item(0.2)}
            className={
              subTone === 'lime'
                ? 'mt-6 max-w-[40ch] text-[15px] font-extrabold uppercase tracking-[0.14em] text-yoca-lime sm:text-[17px]'
                : 'mt-6 max-w-[58ch] text-[17px] leading-relaxed text-muted lg:text-[18px]'
            }
          >
            {brandText(sub)}
          </motion.p>
        )}
        {children && <motion.div {...item(0.28)}>{children}</motion.div>}
        <motion.div {...item(0.36)} className={compact ? 'mt-8' : 'mt-12 lg:mt-16'}>
          <div className="module-rule" />
          {rail && <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-5">{rail}</div>}
        </motion.div>
      </div>
    </section>
  );
}
