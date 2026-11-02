import Link from 'next/link';
import type { Metadata } from 'next';
import SectionWrapper from '@/components/SectionWrapper';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Hero from '@/components/sections/Hero';
import SystemPillars from '@/components/sections/SystemPillars';
import BrandBand from '@/components/sections/BrandBand';
import WorkShowcase from '@/components/sections/WorkShowcase';
import ToolsStrip from '@/components/sections/ToolsStrip';
import CheckupSample from '@/components/checkup/CheckupSample';
import TeamSection from '@/components/sections/TeamSection';
import ServicesGrid from '@/components/sections/ServicesGrid';
import CtaSection from '@/components/sections/CtaSection';
import LiveStatus from '@/components/ui/LiveStatus';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, getRequestContext, jsonLdString, breadcrumbSchema } from '@/lib/seo';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({
    ctx,
    path: '/',
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
  });
}

export default async function HomePage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(breadcrumbSchema(ctx.host, [{ name: t.nav.home, path: base }])),
        }}
      />
      <SiteHeader t={t} path="/" />
      <main id="main">
        <SectionWrapper sectionKey="hero">
          <Hero t={t.hero} base={base} rail={t.systems.items.map((system) => system.name)} />
        </SectionWrapper>

        {/* Brand band — the index line as a full-bleed lime strip */}
        <SectionWrapper sectionKey="clients">
          <BrandBand line={t.hero.line} />
        </SectionWrapper>

        {/* System architecture — canonical order: Brand → Growth → Scale */}
        <SectionWrapper sectionKey="bento">
          <SystemPillars t={t.systems} base={base} />
        </SectionWrapper>

        {/* Selected work — typographic index, honest status labels */}
        <SectionWrapper sectionKey="work">
          <WorkShowcase t={t.work} locale={ctx.locale} base={base} />
        </SectionWrapper>

        <SectionWrapper sectionKey="services">
          <ServicesGrid t={t.services} flows={t.servicesPage.flows} ctaLabel={t.cta.button} base={base} />
        </SectionWrapper>

        {/* Digital Check-Up — full-bleed lime band (secondary lead magnet) */}
        <SectionWrapper sectionKey="checkup_banner">
          <section className="relative z-[7] overflow-hidden bg-yoca-lime py-16 text-black lg:py-24">
            <span
              aria-hidden="true"
              className="slant absolute -bottom-10 end-[6%] hidden h-[220px] w-[240px] bg-black/10 lg:block"
            />
            <div className="container-y relative grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
              <div>
                <p className="flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-black/70">
                  <span aria-hidden="true" className="slant block h-2.5 w-3 bg-black" />
                  {t.checkup.eyebrow}
                </p>
                <h2 className="mt-5 max-w-[16ch] text-[clamp(32px,4.4vw,60px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
                  {t.checkup.introTitle}
                </h2>
                <p className="mt-5 max-w-[50ch] text-[16px] leading-relaxed text-black/75 lg:text-[17px]">
                  {t.checkup.description}
                </p>
              </div>
              <div className="grid justify-items-start gap-8 lg:justify-items-end">
                <CheckupSample
                  title={t.checkup.sampleTitle}
                  sampleLabel={t.checkup.sampleLabel}
                  note={t.checkup.sampleNote}
                  total={72}
                  categories={[
                    { label: t.checkup.sections[3]?.label ?? 'Brand', value: 84 },
                    { label: t.checkup.sections[1]?.label ?? 'Website', value: 61 },
                    { label: t.checkup.sections[2]?.label ?? 'Marketing', value: 58 },
                    { label: t.checkup.sections[4]?.label ?? 'Measurement', value: 73 },
                  ]}
                />
                <Link
                  href={`${base}/checkup`}
                  className="inline-flex min-h-12 items-center gap-2 bg-black px-8 py-4 text-[15px] font-bold text-white transition-colors hover:bg-[#1a1a1a]"
                >
                  {t.hero.secondaryCta}
                  <span aria-hidden="true" className="icon-arrow">→</span>
                </Link>
              </div>
            </div>
          </section>
        </SectionWrapper>

        <SectionWrapper sectionKey="partners">
          <ToolsStrip t={t.partners} />
        </SectionWrapper>

        <SectionWrapper sectionKey="team">
          <TeamSection t={t.team} />
        </SectionWrapper>

        <SectionWrapper sectionKey="cta">
          <CtaSection t={t.cta} base={base} />
        </SectionWrapper>
      </main>

      <SectionWrapper sectionKey="clocks">
        <LiveStatus
          locale={ctx.locale}
          heading={t.clocks.heading}
          sub={t.clocks.sub}
          activeLabel={t.clocks.active}
          cityLabels={{
            istanbul: t.clocks.istanbul,
            baku: t.clocks.baku,
            london: t.clocks.london,
            dubai: t.clocks.dubai,
          }}
        />
      </SectionWrapper>

      <SiteFooter t={t} />
    </>
  );
}
