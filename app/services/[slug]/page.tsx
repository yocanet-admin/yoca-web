import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import FlowDiagram from '@/components/ui/FlowDiagram';
import PageVisual from '@/components/ui/PageVisual';
import CtaSection from '@/components/sections/CtaSection';
import Reveal from '@/components/ui/Reveal';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';

/**
 * Yoca — service detail pages (all four locales).
 * Slugs are locale-independent; content comes from the i18n dictionary:
 * the service item (desc, deliverables, "what it changes") plus its umbrella
 * group (problem, tech stack, system name).
 */

/** slug → [service item index, umbrella group index] */
const SERVICES: Array<{ slug: string; item: number; group: number }> = [
  { slug: 'brand-strategy-identity', item: 0, group: 0 },
  { slug: 'web-digital-experiences', item: 1, group: 1 },
  { slug: 'growth-performance', item: 2, group: 1 },
  { slug: 'creative-production', item: 3, group: 0 },
  { slug: 'ai-automation', item: 4, group: 2 },
  { slug: 'digital-product-development', item: 5, group: 2 },
];

interface PageProps {
  params: { slug: string };
}

function resolve(slug: string) {
  return SERVICES.find((entry) => entry.slug === slug) ?? null;
}

export function generateMetadata({ params }: PageProps): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  const entry = resolve(params.slug);
  if (!entry) {
    return buildMetadata({
      ctx,
      path: '/services',
      title: t.servicesPage.metaTitle,
      description: t.servicesPage.metaDescription,
    });
  }
  const service = t.services.items[entry.item];
  return buildMetadata({
    ctx,
    path: `/services/${params.slug}`,
    title: `${service.name} — ${t.nav.services} | Yoca`,
    description: service.desc,
    ogImagePath: `/visuals/og/${params.slug}.jpg`,
  });
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const entry = resolve(params.slug);
  if (!entry) notFound();

  const service = t.services.items[entry.item];
  const group = t.servicesPage.groups[entry.group];
  const related = SERVICES.filter(
    (item) => item.group === entry.group && item.slug !== entry.slug,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: base },
              { name: t.nav.services, path: `${base}/services` },
              { name: service.name, path: `${base}/services/${entry.slug}` },
            ]),
          ),
        }}
      />
      <SiteHeader t={t} path={`/services/${entry.slug}`} />
      <main id="main">
        <PageIntro
          crumbs={[
            { label: t.nav.home, href: base },
            { label: t.nav.services, href: `${base}/services` },
            { label: service.name },
          ]}
          eyebrow={`${String(entry.group + 1).padStart(2, '0')} · ${group.system}`}
          title={service.name}
          sub={service.desc}
          titleMax="max-w-[20ch]"
          compact
        />

        <PageVisual src={`/visuals/services/${entry.slug}.webp`} priority />

        {/* Problem → What changes — soft-white editorial spread */}
        <section className="section-light relative z-[7] py-16 lg:py-28">
          <div className="container-y grid gap-12 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <div>
                <p className="flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[rgba(5,5,5,0.55)]">
                  <span aria-hidden="true" className="slant block h-2.5 w-3 bg-[#050505]" />
                  {t.servicesPage.tabs.problem}
                </p>
                <p className="mt-6 max-w-[40ch] text-[clamp(22px,2.4vw,32px)] font-bold leading-[1.35] tracking-[-0.02em]">
                  {service.problem ?? group.problem}
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="lg:border-s lg:border-[rgba(5,5,5,0.16)] lg:ps-16">
                <p className="flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#267800]">
                  <span aria-hidden="true" className="slant block h-2.5 w-3 bg-yoca-green" />
                  {t.servicesPage.tabs.changes}
                </p>
                <p className="mt-6 max-w-[40ch] text-[clamp(22px,2.4vw,32px)] font-bold leading-[1.35] tracking-[-0.02em]">
                  {service.changes}
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* How this becomes real — one localized flow, animates once */}
        {t.servicesPage.flows?.[entry.item] && (
          <section className="relative z-[7] border-t border-line bg-surface py-16 lg:py-24">
            <div className="container-y">
              <h2 className="max-w-[16ch] text-[clamp(26px,3vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
                {t.servicesPage.flowTitle}
              </h2>
              <div className="mt-10 lg:mt-14">
                <FlowDiagram steps={t.servicesPage.flows[entry.item]} />
              </div>
            </div>
          </section>
        )}

        {/* Deliverables index + stack */}
        <section className="relative z-[7] bg-surface-deep py-16 lg:py-28">
          <div className="container-y grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-20">
            <Reveal>
              <div>
                <h2 className="text-[clamp(26px,3vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
                  {t.servicesPage.tabs.deliverables}
                </h2>
                <ol className="mt-8 border-t border-line">
                  {service.points.map((point, index) => (
                    <li key={point} className="group relative grid grid-cols-[48px_minmax(0,1fr)] items-baseline gap-4 border-b border-line py-5 ps-5">
                      <span aria-hidden="true" className="absolute inset-y-0 start-0 w-px bg-line transition-all duration-300 group-hover:w-[3px] group-hover:bg-yoca-lime" />
                      <span className="text-[13px] font-extrabold tracking-[0.1em] text-yoca-lime">{String(index + 1).padStart(2, '0')}</span>
                      <span className="text-[clamp(17px,1.6vw,22px)] font-bold tracking-[-0.01em] text-soft">{point}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div>
                <h2 className="text-[clamp(26px,3vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
                  {t.servicesPage.tabs.stack}
                </h2>
                <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-semibold text-muted">
                  {(service.stack ?? group.stack).map((tool) => (
                    <span key={tool}>{tool}</span>
                  ))}
                </p>
                <p className="mt-4 text-[13px] text-subtle">{t.servicesPage.stackNote}</p>

                {related.length > 0 && (
                  <div className="mt-10 border-t border-line pt-6">
                    <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">
                      {group.title}
                    </h3>
                    <ul className="mt-3 grid gap-2">
                      {related.map((item) => (
                        <li key={item.slug}>
                          <Link
                            href={`${base}/services/${item.slug}`}
                            className="group inline-flex items-center gap-2 text-[15px] font-bold text-muted transition-colors hover:text-yoca-lime"
                          >
                            <span aria-hidden="true" className="icon-arrow">→</span> {t.services.items[item.item].name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        <CtaSection t={t.cta} base={base} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
