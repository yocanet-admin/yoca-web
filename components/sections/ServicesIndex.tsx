'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import type { Dict } from '@/lib/i18n';
import { EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — interactive services index (client).
 * Six hairline rows; on pointer devices (≥ lg) a sticky preview panel shows
 * the active service's number, title and a LITERAL preview — brand system,
 * browser + phone, growth journey (localized words), content formats,
 * automation flow (words), product frames. One 350 ms crossfade, then still.
 * Every row's description and "what changes" line stay visible on all
 * devices, so nothing is hover-only. Keyboard focus drives the preview too.
 */

const SERVICE_SLUGS = ['brand-strategy-identity', 'web-digital-experiences', 'growth-performance', 'creative-production', 'ai-automation', 'digital-product-development'];

interface ServicesIndexProps {
  t: Dict['services'];
  /** Localized step flows per service (servicesPage.flows). */
  flows: string[][];
  base: string;
}

/** Six literal previews — each must read as its service in under a second.
 *  Word-based ones use the localized flow labels; none animate while idle. */
function Preview({ index, reduced, flow }: { index: number; reduced: boolean; flow: string[] }) {
  const swap = {
    initial: reduced ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.35, ease: EASE_YOCA },
  };
  const W = 'rgba(255,255,255,0.35)';
  const F = 'rgba(255,255,255,0.14)';

  const flowNodes = (labels: string[]) => (
    <ol className="grid gap-2">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-3">
          <span className={`slant block h-[15px] w-[18px] flex-none ${i === labels.length - 1 ? 'bg-yoca-lime' : i === 0 ? 'bg-white' : 'bg-yoca-green'}`} aria-hidden="true" />
          <span className="text-[14px] font-extrabold tracking-[-0.01em] text-soft">{label}</span>
          {i < labels.length - 1 && <span aria-hidden="true" className="ms-auto h-px w-6 bg-line" />}
        </li>
      ))}
    </ol>
  );

  return (
    <AnimatePresence mode="wait">
      <motion.div key={index} {...swap}>
        {index === 0 && (
          /* Brand: the real mark, type scale, colour tokens */
          <div className="grid gap-5">
            <div className="flex items-end gap-6">
              <svg viewBox="-1 -0.5 70 70.5" className="h-16 w-auto" aria-hidden="true">
                <path d="M0,16.71L1.36.62h16.18l-1.36,16.09H0Z" fill="#A2FF00" />
                <path d="M25.49,16.71l-1.36,16.09H7.95l1.36-16.09h16.18Z" fill="#40C401" />
                <path d="M42.59,69.04h-16.41l7.31-20.13h-18.06l1.23-16.09h22.9L50.92.62h16.51l-24.83,68.42Z" fill="#FFFFFF" />
              </svg>
              <span className="text-[56px] font-extrabold leading-none tracking-[-0.04em] text-white">Aa</span>
              <span className="text-[28px] font-bold leading-none text-muted">Aa</span>
              <span className="text-[16px] font-semibold leading-none text-subtle">Aa</span>
            </div>
            <div className="flex gap-2" aria-hidden="true">
              {['#A2FF00', '#40C401', '#F4F4F1', '#B4B7BF', '#2A2E37', '#050505'].map((c) => (
                <span key={c} className="h-8 flex-1 border border-line" style={{ background: c }} />
              ))}
            </div>
            <div className="grid gap-1.5" aria-hidden="true">
              <span className="h-2 w-3/4 bg-white/60" />
              <span className="h-2 w-1/2 bg-white/30" />
              <span className="h-2 w-2/3 bg-white/30" />
            </div>
          </div>
        )}
        {index === 1 && (
          /* Web: browser + phone */
          <svg viewBox="0 0 320 200" className="h-auto w-full" aria-hidden="true">
            <rect x="12" y="20" width="210" height="150" fill="none" stroke={W} strokeWidth="1.5" />
            <rect x="12" y="20" width="210" height="16" fill={F} />
            <circle cx="22" cy="28" r="2.5" fill={W} /><circle cx="31" cy="28" r="2.5" fill={W} /><circle cx="40" cy="28" r="2.5" fill={W} />
            <rect x="30" y="54" width="110" height="12" fill="#FFFFFF" />
            <rect x="30" y="74" width="150" height="6" fill={W} />
            <rect x="30" y="86" width="130" height="6" fill={W} />
            <rect x="30" y="112" width="60" height="20" fill="#A2FF00" />
            <rect x="120" y="106" width="86" height="50" fill={F} />
            <rect x="244" y="44" width="64" height="130" rx="6" fill="none" stroke={W} strokeWidth="1.5" />
            <rect x="254" y="66" width="44" height="9" fill="#FFFFFF" />
            <rect x="254" y="82" width="34" height="5" fill={W} />
            <rect x="254" y="92" width="40" height="5" fill={W} />
            <rect x="254" y="110" width="44" height="30" fill={F} />
            <rect x="254" y="150" width="44" height="14" fill="#A2FF00" />
          </svg>
        )}
        {index === 2 && flowNodes(flow)}
        {index === 3 && (
          /* Creative production: content formats 1:1 · 9:16 · 16:9 */
          <div className="grid grid-cols-[1fr_0.62fr_1.5fr] items-end gap-3" aria-hidden="true">
            <div className="grid gap-2">
              <span className="block aspect-square w-full border border-line bg-surface-elevated" />
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">1:1</span>
            </div>
            <div className="grid gap-2">
              <span className="block aspect-[9/16] w-full border border-line bg-yoca-lime" />
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">9:16</span>
            </div>
            <div className="grid gap-2">
              <span className="relative block aspect-video w-full border border-line bg-surface-elevated">
                <span className="absolute start-1/2 top-1/2 block h-0 w-0 -translate-x-1/2 -translate-y-1/2 border-y-[7px] border-s-[12px] border-y-transparent border-s-white" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">16:9</span>
            </div>
          </div>
        )}
        {index === 4 && flowNodes(flow)}
        {index === 5 && (
          /* Product: wireframe → interface → product (three frames) + flow words */
          <div className="grid gap-5">
            <div className="grid grid-cols-3 gap-3" aria-hidden="true">
              <span className="grid aspect-[4/3] content-start gap-1.5 border border-dashed border-line p-2">
                <span className="h-1.5 w-2/3 bg-white/40" /><span className="h-1.5 w-1/2 bg-white/25" /><span className="mt-1 h-4 w-1/2 border border-line" />
              </span>
              <span className="grid aspect-[4/3] content-start gap-1.5 border border-line bg-surface-elevated p-2">
                <span className="h-1.5 w-2/3 bg-white/70" /><span className="h-1.5 w-1/2 bg-white/35" /><span className="mt-1 h-4 w-1/2 bg-white/20" />
              </span>
              <span className="grid aspect-[4/3] content-start gap-1.5 border border-line bg-surface-elevated p-2">
                <span className="h-1.5 w-2/3 bg-white" /><span className="h-1.5 w-1/2 bg-white/40" /><span className="mt-1 h-4 w-1/2 bg-yoca-lime" />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-extrabold text-soft">
              {flow.map((label, i) => (
                <span key={label} className="flex items-center gap-3">
                  {label}
                  {i < flow.length - 1 && <span aria-hidden="true" className="icon-arrow text-subtle">→</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function ServicesIndex({ t, flows, base }: ServicesIndexProps) {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  return (
    <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
      <ol className="border-t border-line">
        {t.items.map((service, index) => (
          <li key={service.name} className="border-b border-line">
            <Link
              href={`${base}/services/${SERVICE_SLUGS[index] ?? ''}`}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              className={`group relative grid items-start gap-3 py-6 ps-6 pe-2 transition-colors duration-300 hover:bg-surface md:grid-cols-[56px_minmax(0,1fr)_auto] md:gap-6 md:py-7 ${active === index ? 'lg:bg-surface' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 start-0 w-px bg-line transition-all duration-300 group-hover:w-[3px] group-hover:bg-yoca-lime ${active === index ? 'lg:w-[3px] lg:bg-yoca-lime' : ''}`}
              />
              <span className="text-[13px] font-extrabold tracking-[0.1em] text-yoca-lime md:pt-1.5">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                <span className="block text-[clamp(20px,2vw,28px)] font-extrabold leading-tight tracking-[-0.02em] transition-colors duration-300 group-hover:text-white">
                  {service.name}
                </span>
                <span className="mt-2 block text-[14px] leading-relaxed text-muted">{service.desc}</span>
                <span className="mt-2 flex items-start gap-2 text-[13px] font-bold leading-relaxed text-soft">
                  <span aria-hidden="true" className="slant mt-[6px] block h-2 w-2.5 flex-none bg-yoca-lime" />
                  {service.changes}
                </span>
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-subtle transition-colors duration-300 group-hover:text-yoca-lime md:justify-self-end">
                {t.explore}
                <span aria-hidden="true" className="icon-arrow">↗</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {/* Sticky preview — desktop pointer devices */}
      <div className="hover-preview lg:sticky lg:top-28 lg:self-start">
        <div className="border border-line bg-surface p-6">
          {/* Zero ambiguity: number + title of the active service, then its preview */}
          <div className="mb-5 border-b border-line pb-4">
            <span className="text-[12px] font-extrabold tracking-[0.1em] text-yoca-lime">{String(active + 1).padStart(2, '0')}</span>
            <span className="mt-1 block text-[18px] font-extrabold tracking-[-0.02em] text-white">{t.items[active]?.name}</span>
          </div>
          <Preview index={active} reduced={!!reduced} flow={flows[active] ?? []} />
        </div>
      </div>
    </div>
  );
}
