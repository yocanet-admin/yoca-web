/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import type { CaseStudy } from '@/lib/workData';
import type { WorkMedia } from '@/lib/workMedia';
import type { PublicResult } from '@/lib/caseResults';
import CaseStudyVideo from '@/components/ui/CaseStudyVideo';
import ProjectCard, { type ProjectCardData } from '@/components/work/ProjectCard';

/**
 * Yoca — project detail, 2026 layout (first used by Prime Wash Car).
 * Large cover (the same image as the card, so the card → detail transition
 * lands on it) → name + facts → client need → our work → delivered →
 * desktop / mobile screens → the site in use → verified results ONLY when
 * approved records exist → next project. All copy comes from the existing
 * case-study content; nothing here invents results, quotes or numbers.
 */

interface CaseDetailProps {
  study: CaseStudy;
  media: WorkMedia;
  t: Dict;
  base: string;
  locale: string;
  statusLabel: string;
  resultsHeading: string;
  metrics: PublicResult[];
  testimonials: PublicResult[];
  next: { card: ProjectCardData; transition: boolean } | null;
}

function Shot({ src, alt, width, height, caption, className = '' }: { src: string; alt: string; width: number; height: number; caption?: string; className?: string }) {
  return (
    <figure className={className} data-reveal="auto">
      <span className="block overflow-hidden rounded-[10px] border border-line bg-surface">
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" className="block h-auto w-full" />
      </span>
      {caption && <figcaption className="mt-3 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{caption}</figcaption>}
    </figure>
  );
}

export default function CaseDetail({ study, media, t, base, locale, statusLabel, resultsHeading, metrics, testimonials, next }: CaseDetailProps) {
  const facts = [
    [t.work.sector, study.sector],
    [t.work.market, study.market],
    [t.work.year, study.year],
    [t.work.servicesLabel, study.services.join(locale === 'ar' ? '، ' : ', ')],
  ].filter(([, value]) => Boolean(value));
  const narrative = [
    { label: t.work.problem, text: study.problem },
    { label: t.work.approach, text: study.approach },
    { label: t.work.solution, text: study.solution },
  ].filter((block) => Boolean(block.text));
  const hasScreens = Boolean(media.desktop?.length || media.mobile?.length || media.interaction);

  return (
    <>
      {/* 1 — Cover: same image as the project card (transition target) */}
      <div className="container-y relative z-[7] pt-[88px] lg:pt-[96px]">
        {media.hero && (
          <div data-cover-target={study.slug} className="relative aspect-[16/10] overflow-hidden rounded-[10px] bg-surface-elevated md:aspect-[2/1]">
            <img
              src={media.hero}
              alt={study.name}
              width={1920}
              height={1200}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}

        {/* 2 — Name and facts */}
        <div className="grid gap-10 pb-16 pt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:pb-24 lg:pt-14">
          <div>
            <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2.5 text-[13px] text-subtle">
              <Link href={base} className="transition-colors hover:text-yoca-lime">
                {t.nav.home}
              </Link>
              <span aria-hidden="true">/</span>
              <Link href={`${base}/work`} className="transition-colors hover:text-yoca-lime">
                {t.nav.work}
              </Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="text-muted">
                {study.name}
              </span>
            </nav>
            <h1 className="mt-6 text-[clamp(48px,7.4vw,124px)] font-extrabold leading-[0.92] tracking-[-0.05em] rtl:leading-[1.15]">{study.name}</h1>
            <span className="slant mt-6 inline-block bg-surface-elevated px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-soft">{statusLabel}</span>
          </div>
          <div className="grid content-end gap-8">
            <p className="text-[18px] leading-relaxed text-soft lg:text-[20px]">{study.summary}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6">
              {facts.map(([label, value]) => (
                <div key={label} className={label === t.work.servicesLabel ? 'col-span-2' : ''}>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">{label}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-soft">{value}</dd>
                </div>
              ))}
            </dl>
            {study.liveUrl && (
              <a href={study.liveUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost w-fit">
                {t.caseView.visitSite} <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 3 — Need → our work → delivered */}
      {narrative.length > 0 && (
        <section className="section-light relative z-[7] py-16 lg:py-28">
          <div className="container-y">
            {narrative.map((block, index) => (
              <div
                key={block.label}
                data-reveal="auto"
                className="grid gap-4 border-t border-[rgba(5,5,5,0.16)] py-10 md:grid-cols-[minmax(200px,1fr)_2fr] md:gap-8 lg:py-14"
              >
                <div>
                  <span className="block text-[clamp(40px,4.6vw,64px)] font-extrabold leading-none tracking-[-0.05em] text-[rgba(5,5,5,0.16)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2 className="mt-3 text-[clamp(20px,2vw,26px)] font-extrabold tracking-[-0.02em]">{block.label}</h2>
                </div>
                <p className="max-w-[62ch] text-[17px] leading-[1.8] text-[rgba(5,5,5,0.78)]">{block.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4 — Screens: desktop, mobile, the site in use */}
      {hasScreens && (
        <section className="relative z-[7] bg-surface-deep py-16 lg:py-28" aria-labelledby="case-screens">
          <div className="container-y grid gap-12 lg:gap-20">
            <h2 id="case-screens" className="eyebrow">
              {t.work.screensLabel}
            </h2>
            {media.desktop?.[0] && <Shot src={media.desktop[0]} alt={`${study.name} — ${t.caseView.desktop}`} width={1920} height={1200} caption={t.caseView.desktop} />}
            {(media.desktop?.[1] || media.mobile?.length) && (
              <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
                {media.desktop?.[1] && <Shot src={media.desktop[1]} alt={`${study.name} — ${t.caseView.desktop} 02`} width={1920} height={1200} caption={t.caseView.desktop} />}
                {media.mobile && media.mobile.length > 0 && (
                  <div>
                    <div className="grid grid-cols-2 items-start gap-4 lg:gap-6">
                      {media.mobile.slice(0, 2).map((src, index) => (
                        <Shot key={src} src={src} alt={`${study.name} — ${t.caseView.mobile} 0${index + 1}`} width={900} height={1800} className={index === 1 ? 'mt-10 lg:mt-16' : ''} />
                      ))}
                    </div>
                    <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{t.caseView.mobile}</p>
                  </div>
                )}
              </div>
            )}
            {media.interaction && (
              <figure data-reveal="auto">
                <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
                  <CaseStudyVideo src={media.interaction.video} poster={media.interaction.poster} alt={`${study.name} — ${t.caseView.inUse}`} />
                </div>
                <figcaption className="mt-3 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{t.caseView.inUse}</figcaption>
              </figure>
            )}
          </div>
        </section>
      )}

      {/* 5 — Verified results / testimonial: only approved, site-scoped records */}
      {metrics.length > 0 && (
        <section className="relative z-[7] border-t border-line bg-surface py-16 lg:py-24">
          <div className="container-y grid gap-10 md:grid-cols-[minmax(200px,1fr)_2fr] md:gap-8">
            <h2 className="text-xl font-extrabold">{resultsHeading}</h2>
            <dl className="grid gap-6">
              {metrics.map((m) => (
                <div key={m.id} className="grid gap-1 border-t border-line pt-4">
                  <dt className="text-[13px] font-bold uppercase tracking-[0.08em] text-subtle">{m.metric_name}</dt>
                  <dd className="text-[clamp(24px,2.6vw,34px)] font-extrabold tabular-nums text-yoca-lime">{m.metric_value}</dd>
                  <dd className="text-[13px] text-muted">
                    {[m.period && `${t.work.resultPeriod}: ${m.period}`, m.baseline && `${t.work.resultBaseline}: ${m.baseline}`, m.source_basis && `${t.work.resultBasis}: ${m.source_basis}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </div>
              ))}
              <p className="text-[12px] text-subtle">{t.work.metricNote}</p>
            </dl>
          </div>
        </section>
      )}
      {testimonials.length > 0 && (
        <section className="relative z-[7] py-16 lg:py-24">
          <div className="container-y grid gap-10 md:grid-cols-[minmax(200px,1fr)_2fr] md:gap-8">
            <h2 className="text-xl font-extrabold">{t.work.quoteLabel}</h2>
            <div className="grid gap-6">
              {testimonials.map((q) => (
                <figure key={q.id} className="glass max-w-[62ch] rounded-md p-8 lg:p-10">
                  <blockquote className="text-xl font-bold leading-[1.6] text-white">“{q.testimonial_text}”</blockquote>
                  {(q.testimonial_author || q.testimonial_author_title) && (
                    <figcaption className="mt-4 text-[14px] font-semibold text-yoca-lime">
                      — {[q.testimonial_author, q.testimonial_author_title].filter(Boolean).join(', ')}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6 — Next project (same card as the grid) */}
      <nav aria-label={t.caseView.nextProject} className="relative z-[7] border-t border-line bg-surface-deep py-16 lg:py-24">
        <div className="container-y">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <p className="eyebrow">{t.caseView.nextProject}</p>
            <Link
              href={`${base}/work`}
              className="rounded-sm border border-line px-4 py-2.5 text-[13px] font-bold text-muted transition-colors hover:border-yoca-lime hover:text-yoca-lime"
            >
              {t.work.allWork}
            </Link>
          </div>
          {next && <ProjectCard project={next.card} href={`${base}/work/${next.card.slug}`} size="wide" tone="dark" viewLabel={t.work.viewCase} transition={next.transition} headingLevel="h2" />}
        </div>
      </nav>
    </>
  );
}
