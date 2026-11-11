'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CaseStudy } from '@/lib/workData';
import { DUR, EASE_YOCA } from '@/lib/motion';
import ProjectCard from '@/components/work/ProjectCard';
import { hasNewCaseLayout, toCardData } from '@/lib/projectCards';

/**
 * Yoca — Work grid (soft-white section) using the shared ProjectCard:
 * first project full width, then two per row. Name, scope and link are
 * always visible; non-client work carries its honest status as the first
 * tag. No custom cursor — the native pointer stays.
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

export default function WorkGrid({ studies, base, labels }: WorkGridProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const reduced = useReducedMotion();

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
        <ul className="grid gap-x-6 gap-y-14 md:grid-cols-2 lg:gap-x-8 lg:gap-y-20">
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.map((study, index) => {
              const rest = filtered.length - 1;
              const wide = index === 0 || (rest % 2 === 1 && index === filtered.length - 1);
              const card = toCardData(study);
              if (study.kind !== 'client') card.services = [labels.status[study.kind], ...card.services];
              return (
                <motion.li
                  key={study.slug}
                  layout={!reduced}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DUR.ui, ease: EASE_YOCA }}
                  className={wide ? 'md:col-span-2' : ''}
                >
                  <ProjectCard
                    project={card}
                    href={`${base}/work/${study.slug}`}
                    size={wide ? 'wide' : 'half'}
                    viewLabel={labels.viewCase}
                    transition={hasNewCaseLayout(study.slug)}
                    priority={index === 0}
                    headingLevel="h2"
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
