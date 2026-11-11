'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useId, useState } from 'react';

/**
 * Yoca — home services (2026).
 * A short numbered list of the six existing services. Desktop: the chosen
 * service opens in a sticky panel beside the list, with the real Yoca
 * project(s) in that area when there are any (never invented). Mobile: the
 * same list is an accessible accordion (button + aria-expanded/controls).
 */

export interface ServiceItem {
  slug: string;
  name: string;
  desc: string;
  changes: string;
  related: Array<{ slug: string; name: string; cover: string }>;
}

interface HomeServicesProps {
  eyebrow: string;
  heading: string;
  sub: string;
  items: ServiceItem[];
  labels: { related: string; link: string; all: string };
  base: string;
}

function Detail({ item, labels, base, compact }: { item: ServiceItem; labels: HomeServicesProps['labels']; base: string; compact?: boolean }) {
  return (
    <div className="grid gap-6">
      <p className={`leading-relaxed text-muted ${compact ? 'text-[15px]' : 'text-[17px]'}`}>{item.desc}</p>
      <p className="flex gap-3 text-[15px] font-semibold leading-relaxed text-soft">
        <span aria-hidden="true" className="slant mt-1.5 block h-3 w-3.5 flex-none bg-yoca-lime" />
        {item.changes}
      </p>
      {item.related.length > 0 && (
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{labels.related}</p>
          <ul className={`mt-3 grid gap-4 ${compact ? 'grid-cols-2' : 'grid-cols-2'}`}>
            {item.related.map((project) => (
              <li key={project.slug}>
                <Link href={`${base}/work/${project.slug}`} className="group block">
                  <span className="block aspect-[16/10] overflow-hidden rounded-md bg-surface-elevated">
                    <img
                      src={project.cover}
                      alt=""
                      width={1920}
                      height={1200}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                  </span>
                  <span className="mt-2 block text-[14px] font-bold transition-colors duration-200 group-hover:text-yoca-lime">
                    {project.name} <span aria-hidden="true" className="icon-arrow">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href={`${base}/services/${item.slug}`} className="inline-flex w-fit items-center gap-2 text-[14px] font-extrabold uppercase tracking-[0.08em] text-yoca-lime">
        {labels.link} <span aria-hidden="true" className="icon-arrow">→</span>
      </Link>
    </div>
  );
}

export default function HomeServices({ eyebrow, heading, sub, items, labels, base }: HomeServicesProps) {
  const uid = useId();
  // Mobile accordion may close everything; the desktop panel always shows one.
  const [open, setOpen] = useState<number | null>(0);
  const [active, setActive] = useState(0);
  const select = (index: number) => {
    setActive(index);
    // Desktop shows the choice in the side panel (never "closes"); below lg it is an accordion.
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    setOpen((current) => (current === index && !desktop ? null : index));
  };

  return (
    <section className="relative z-[7] bg-surface-deep py-20 lg:py-32" aria-labelledby={`${uid}-title`}>
      <div className="container-y">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16" data-reveal="auto">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={`${uid}-title`} className="mt-5 max-w-[18ch] text-[clamp(32px,4.2vw,58px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
              {heading}
            </h2>
          </div>
          <p className="max-w-[46ch] text-[16px] leading-relaxed text-muted lg:justify-self-end lg:text-[17px]">{sub}</p>
        </div>

        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-16">
          <ul className="border-t border-line">
            {items.map((item, index) => {
              const isOpen = open === index;
              const isActive = active === index;
              const panelId = `${uid}-panel-${index}`;
              return (
                <li key={item.slug} className="border-b border-line">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => select(index)}
                      className={`group flex min-h-[64px] w-full items-center gap-5 py-5 text-start transition-colors duration-200 lg:py-6 ${
                        isActive ? 'lg:text-white' : 'lg:text-white/55 lg:hover:text-white'
                      }`}
                    >
                      <span className={`w-7 flex-none text-[13px] font-extrabold tracking-[0.1em] ${isActive ? 'text-yoca-lime' : 'text-subtle'}`}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 text-[clamp(20px,2.2vw,30px)] font-extrabold leading-tight tracking-[-0.02em]">{item.name}</span>
                      <span
                        aria-hidden="true"
                        className={`relative block h-4 w-4 flex-none transition-transform duration-200 lg:hidden ${isOpen ? 'rotate-45' : ''}`}
                      >
                        <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-yoca-lime" />
                        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-yoca-lime" />
                      </span>
                      <span aria-hidden="true" className={`hidden flex-none text-yoca-lime transition-opacity duration-200 lg:block ${isActive ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="icon-arrow">→</span>
                      </span>
                    </button>
                  </h3>
                  {/* Mobile / tablet: inline accordion panel */}
                  <div id={panelId} role="region" aria-label={item.name} hidden={!isOpen} className="pb-8 ps-12 lg:hidden">
                    <Detail item={item} labels={labels} base={base} compact />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: sticky detail panel for the selected service */}
          <div className="hidden lg:block" aria-live="polite">
            <div className="sticky top-28 rounded-[10px] border border-line bg-surface p-10">
              <div key={active} className="fade-swap">
                <p className="text-[13px] font-extrabold tracking-[0.1em] text-yoca-lime">{String(active + 1).padStart(2, '0')}</p>
                <p className="mb-6 mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{items[active]?.name}</p>
                {items[active] && <Detail item={items[active]} labels={labels} base={base} />}
              </div>
            </div>
          </div>
        </div>

        <Link href={`${base}/services`} className="btn-ghost mt-12">
          {labels.all} <span aria-hidden="true" className="icon-arrow">→</span>
        </Link>
      </div>
    </section>
  );
}
