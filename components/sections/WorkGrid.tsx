'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import type { CaseStudy } from '@/lib/workData';
import { DUR, EASE_YOCA } from '@/lib/motion';
import ProjectCover from '@/components/work/ProjectCover';
import { getWorkMedia } from '@/lib/workMedia';

/**
 * Yoca — editorial Work grid (soft-white section).
 * Asymmetric desktop layout: the first card renders as a featured wide tile,
 * the rest alternate between standard and vertical scales. Every card carries
 * an honest status label (Client Case Study / Concept Project / Yoca Product /
 * Experimental); metric badges appear ONLY when verified data exists.
 */

interface WorkGridProps {
  studies: CaseStudy[];
  base: string;
  labels: {
    all: string;
    clients: string;
    concepts: string;
    products: string;
    viewCase: string;
    metricNote: string;
    empty: string;
    status: Record<CaseStudy['kind'], string>;
  };
}

type Filter = 'all' | 'client' | 'concept' | 'product';

/**
 * Editorial layout pattern (desktop, 5-col grid):
 *   1st — full-width featured · 2nd/3rd — 60/40 asymmetric pair ·
 *   4th — wide horizontal · then the pattern repeats.
 */
// Editorial rhythm: featured wide → 60/40 pair → wide. Tiles are typographic
// while authentic media is unavailable; when a real capture is registered in
// lib/workMedia.ts it appears above the tile automatically.
const LAYOUT: Array<{ span: string; variant: 'landscape' | 'portrait' }> = [
  { span: 'md:col-span-5', variant: 'landscape' },
  { span: 'md:col-span-3', variant: 'landscape' },
  { span: 'md:col-span-2', variant: 'portrait' },
  { span: 'md:col-span-5', variant: 'landscape' },
];

const STATUS_STYLE: Record<CaseStudy['kind'], string> = {
  client: 'bg-yoca-lime text-black',
  concept: 'bg-[#050505] text-white',
  product: 'bg-yoca-green text-black',
  experimental: 'bg-[#E4E4DF] text-[#050505]',
  venture: 'bg-[#E4E4DF] text-[#050505]',
};

export default function WorkGrid({ studies, base, labels }: WorkGridProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [hovered, setHovered] = useState<string | null>(null);
  // Slugs whose hover clip failed to play: keep showing the cover image for them.
  const [noVideo, setNoVideo] = useState<string[]>([]);
  const dropVideo = (slug: string) => setNoVideo((list) => (list.includes(slug) ? list : [...list, slug]));
  // Contextual cursor ("View Project ↗") — pointer devices only, inside the grid.
  const gridRef = useRef<HTMLDivElement>(null);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const sx = useSpring(cx, { stiffness: 320, damping: 28, mass: 0.4 });
  const sy = useSpring(cy, { stiffness: 320, damping: 28, mass: 0.4 });
  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse' || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    cx.set(event.clientX - rect.left);
    cy.set(event.clientY - rect.top);
  };

  const filtered = studies.filter((study) => {
    if (filter === 'all') return true;
    if (filter === 'client') return study.kind === 'client';
    if (filter === 'concept') return study.kind === 'concept';
    return study.kind === 'product' || study.kind === 'experimental' || study.kind === 'venture';
  });

  // Only show filters that actually have content — no empty "Client Case
  // Studies" tab while every project is a concept.
  const hasClient = studies.some((study) => study.kind === 'client');
  const hasConcept = studies.some((study) => study.kind === 'concept');
  const hasProduct = studies.some((study) => study.kind === 'product' || study.kind === 'experimental' || study.kind === 'venture');
  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: labels.all },
    ...(hasClient ? [{ key: 'client' as Filter, label: labels.clients }] : []),
    ...(hasConcept ? [{ key: 'concept' as Filter, label: labels.concepts }] : []),
    ...(hasProduct ? [{ key: 'product' as Filter, label: labels.products }] : []),
  ];

  const hasVerifiedMetrics = filtered.some((study) => study.metricBadge);

  return (
    <div>
      {/* Filter bar — only when there is more than one real category to filter */}
      {tabs.length > 2 && (
      <div
        role="tablist"
        aria-label={labels.all}
        className="mb-10 flex flex-wrap gap-1 rounded-sm border border-[rgba(5,5,5,0.18)] p-1 sm:w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={`min-h-[44px] flex-1 rounded-sm px-5 py-2 text-[13px] font-bold transition-colors sm:flex-none ${
              filter === tab.key
                ? 'bg-[#050505] text-white'
                : 'light-muted hover:text-[#050505]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {filtered.length === 0 ? (
        <p className="light-muted py-10 text-[15px]">{labels.empty}</p>
      ) : (
        <div ref={gridRef} onPointerMove={onPointerMove} className="relative grid gap-8 md:grid-cols-5">
          {/* Contextual cursor label */}
          <motion.span
            aria-hidden="true"
            className="hover-preview pointer-events-none absolute start-0 top-0 z-20 whitespace-nowrap bg-yoca-lime px-3.5 py-2 text-[12px] font-extrabold uppercase tracking-[0.1em] text-black"
            style={{ x: sx, y: sy, translateX: 14, translateY: 14 }}
            animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.8 }}
            transition={{ duration: DUR.micro, ease: EASE_YOCA }}
          >
            {labels.viewCase} ↗
          </motion.span>
          <AnimatePresence mode="popLayout">
            {filtered.map((study, index) => {
              const slot = LAYOUT[index % LAYOUT.length];
              const featured = index % LAYOUT.length === 0;
              const media = getWorkMedia(study.slug);
              return (
                <motion.div
                  key={study.slug}
                  layout
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: DUR.ui, ease: EASE_YOCA }}
                  className={`${slot.span} h-full`}
                >
                  <Link
                    href={`${base}/work/${study.slug}`}
                    className="group flex h-full flex-col"
                    aria-label={`${study.name} — ${labels.viewCase}`}
                    onMouseEnter={() => setHovered(study.slug)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Authentic media only — rendered when a real capture is registered */}
                    {media.hero && (
                      <span className="relative mb-5 block aspect-[16/10] overflow-hidden rounded-sm border border-[rgba(5,5,5,0.14)] bg-white">
                        <span className="absolute inset-0 block transition-transform duration-700 ease-out group-hover:scale-[1.03]">
                          <ProjectCover slug={study.slug} name={study.name} sector={study.sector} index={index} priority={featured} />
                        </span>
                        {hovered === study.slug && !noVideo.includes(study.slug) && (study.videoUrl || media.interaction) && (
                          <video
                            poster={media.interaction?.poster}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="none"
                            // If the clip can't play, drop it so the cover image stays visible.
                            onError={() => dropVideo(study.slug)}
                            className="hover-preview absolute inset-0 h-full w-full object-cover"
                          >
                            {study.videoUrl ? (
                              <source src={study.videoUrl} onError={() => dropVideo(study.slug)} />
                            ) : (
                              <>
                                <source src={media.interaction!.video} type="video/webm" />
                                <source src={media.interaction!.video.replace(/\.webm$/, '.mp4')} type="video/mp4" onError={() => dropVideo(study.slug)} />
                              </>
                            )}
                          </video>
                        )}
                      </span>
                    )}

                    {/* Typographic tile — the honest treatment while authentic media is unavailable */}
                    <span
                      className={`light-card relative flex flex-1 flex-col justify-between overflow-hidden rounded-sm transition-colors duration-300 group-hover:border-[#050505] ${
                        featured ? 'min-h-[300px] p-8 lg:min-h-[360px] lg:p-12' : slot.variant === 'portrait' ? 'min-h-[300px] p-7 lg:p-8' : 'min-h-[260px] p-7 lg:p-9'
                      }`}
                    >
                      {/* Subtle system grid detail */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 opacity-[0.55]"
                        style={{
                          backgroundImage: 'linear-gradient(rgba(5,5,5,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(5,5,5,0.06) 1px, transparent 1px)',
                          backgroundSize: '48px 48px',
                          maskImage: 'linear-gradient(180deg, #000 20%, transparent 100%)',
                          WebkitMaskImage: 'linear-gradient(180deg, #000 20%, transparent 100%)',
                        }}
                      />
                      <span className="relative flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[13px] font-extrabold tracking-[0.1em] text-[#267800]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className={`slant inline-block px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] ${STATUS_STYLE[study.kind]}`}>
                          {labels.status[study.kind]}
                        </span>
                      </span>
                      <span className="relative mt-10">
                        <span
                          className={`block font-extrabold leading-[1.02] tracking-[-0.03em] transition-transform duration-500 ease-out group-hover:translate-x-1 rtl:group-hover:-translate-x-1 ${
                            featured ? 'text-[clamp(34px,4.6vw,64px)]' : slot.variant === 'portrait' ? 'text-[clamp(26px,2.6vw,34px)]' : 'text-[clamp(28px,3vw,42px)]'
                          }`}
                        >
                          {study.name}
                        </span>
                        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-[0.1em] light-subtle">
                          {[study.sector, study.services.join(' · '), study.year]
                            .filter(Boolean)
                            .map((part, partIndex) => (
                              <span key={part} className="flex items-center gap-x-3">
                                {partIndex > 0 && <span aria-hidden="true" className="h-3 w-px bg-[rgba(5,5,5,0.2)]" />}
                                <span>{part}</span>
                              </span>
                            ))}
                        </span>
                        {slot.variant !== 'portrait' && (
                          <span className={`light-muted mt-4 block text-[15px] leading-relaxed ${featured ? 'max-w-[56ch] lg:text-[16px]' : 'max-w-[44ch]'}`}>
                            {study.summary}
                          </span>
                        )}
                        {study.metricBadge && (
                          <span className="slant mt-4 inline-block bg-yoca-lime px-3 py-1 text-[12px] font-extrabold text-black">
                            {study.metricBadge}
                          </span>
                        )}
                      </span>
                      <span className="relative mt-8 inline-flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#267800]">
                        {labels.viewCase}
                        <span aria-hidden="true" className="icon-arrow">→</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 start-0 h-[3px] w-0 bg-yoca-lime transition-all duration-300 group-hover:w-full"
                      />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Source footnote only when verified metrics are displayed */}
      {hasVerifiedMetrics && <p className="light-subtle mt-10 text-[12px]">{labels.metricNote}</p>}
    </div>
  );
}
