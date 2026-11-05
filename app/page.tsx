import type { Metadata } from 'next';
import SectionWrapper from '@/components/SectionWrapper';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import HomeHero, { type HeroReelData } from '@/components/sections/HomeHero';
import SelectedWork from '@/components/sections/SelectedWork';
import HomeServices, { type ServiceItem } from '@/components/sections/HomeServices';
import { HomeCheckup, HomeClosing, HomeInsights, HomeProcess } from '@/components/sections/HomeBlocks';
import RevealOnScroll from '@/components/ui/RevealOnScroll';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { getFormCopy } from '@/lib/siteSettings';
import { getCaseStudies } from '@/lib/work';
import { localizeServices } from '@/lib/workData';
import { getWorkMedia } from '@/lib/workMedia';
import { hasNewCaseLayout, toCardData } from '@/lib/projectCards';
import { categoryName, getInsightCategories, listInsights } from '@/lib/insights';
import { SERVICE_SLUGS } from '@/lib/serviceSlugs';
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

/** Raw service tags (lib/workData BASE / case_studies.services) that show real work next to a service. */
const SERVICE_EVIDENCE: Partial<Record<(typeof SERVICE_SLUGS)[number], string[]>> = {
  'brand-strategy-identity': ['Brand', 'Identity'],
  'web-digital-experiences': ['Web'],
};

/**
 * Yoca — home page (2026 redesign).
 * Hero → selected projects → services → process → Check-Up → Insights →
 * closing. Existing admin visibility keys are kept for the sections that
 * existed before (hero, work, services, checkup_banner, cta); the new
 * process / insights blocks have their own keys (visible by default).
 */
export default async function HomePage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const [copy, studies, insights, categories] = await Promise.all([
    getFormCopy(ctx.locale),
    getCaseStudies(ctx.locale),
    listInsights(ctx.locale).catch(() => ({ items: [], total: 0 })),
    getInsightCategories().catch(() => []),
  ]);

  // Real captures only: projects with a registered cover, in the admin's order.
  const withCover = studies.map(toCardData).filter((card) => Boolean(card.cover));
  const projects = withCover.slice(0, 5).map((card) => ({ ...card, transition: hasNewCaseLayout(card.slug) }));

  const reelSource = withCover.find((card) => card.clip);
  const reel: HeroReelData | null = reelSource?.clip
    ? { slug: reelSource.slug, name: reelSource.name, services: reelSource.services, video: reelSource.clip.video, poster: reelSource.clip.poster }
    : null;

  // Services: show related real work only where a project actually carries that scope.
  const used = new Set<string>();
  const services: ServiceItem[] = t.services.items.map((item, index) => {
    const slug = SERVICE_SLUGS[index];
    const tags = SERVICE_EVIDENCE[slug];
    let related: ServiceItem['related'] = [];
    if (tags) {
      const labels = new Set(localizeServices(tags, ctx.locale));
      const matches = withCover.filter((card) => card.services.some((s) => labels.has(s)));
      const fresh = matches.filter((card) => !used.has(card.slug));
      related = (fresh.length >= 2 ? fresh : matches).slice(0, 2).map((card) => ({ slug: card.slug, name: card.name, cover: getWorkMedia(card.slug).hero ?? card.cover! }));
      related.forEach((r) => used.add(r.slug));
    }
    return { slug, name: item.name, desc: item.desc, changes: item.changes, related };
  });

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
          <HomeHero t={t.hero} home={t.home} base={base} reel={reel} />
        </SectionWrapper>

        <SectionWrapper sectionKey="work">
          <SelectedWork home={t.home} viewLabel={t.work.viewCase} base={base} projects={projects} />
        </SectionWrapper>

        <SectionWrapper sectionKey="services">
          <HomeServices
            eyebrow={t.home.servicesTitle}
            heading={t.services.heading}
            sub={t.services.sub}
            items={services}
            labels={{ related: t.home.relatedWork, link: t.home.serviceLink, all: t.nav.services }}
            base={base}
          />
        </SectionWrapper>

        <SectionWrapper sectionKey="process">
          <HomeProcess home={t.home} />
        </SectionWrapper>

        <SectionWrapper sectionKey="checkup_banner">
          <HomeCheckup t={t.checkup} home={t.home} description={copy.checkupDescription} ctaLabel={t.hero.secondaryCta} base={base} />
        </SectionWrapper>

        <SectionWrapper sectionKey="insights">
          <HomeInsights
            items={insights.items.slice(0, 3)}
            categoryOf={(key) => categoryName(categories, key, ctx.locale)}
            t={t.insights}
            home={t.home}
            base={base}
            locale={ctx.locale}
          />
        </SectionWrapper>

        <SectionWrapper sectionKey="cta">
          <HomeClosing t={t.cta} home={t.home} base={base} />
        </SectionWrapper>
      </main>
      <RevealOnScroll />
      <SiteFooter t={t} />
    </>
  );
}
