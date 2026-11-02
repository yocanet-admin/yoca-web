import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import CtaSection from '@/components/sections/CtaSection';
import WorkGrid from '@/components/sections/WorkGrid';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { getCaseStudies } from '@/lib/work';
import {
  buildMetadata,
  breadcrumbSchema,
  caseStudySchema,
  getRequestContext,
  jsonLdString,
} from '@/lib/seo';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({
    ctx,
    path: '/work',
    title: t.work.metaTitle,
    description: t.work.metaDescription,
  });
}

export default async function WorkPage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const studies = await getCaseStudies(ctx.locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: base },
              { name: t.nav.work, path: `${base}/work` },
            ]),
          ),
        }}
      />
      {studies.map((study) => (
        <script
          key={study.slug}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString(
              caseStudySchema(ctx.host, {
                name: study.name,
                description: study.summary,
                path: `${base}/work/${study.slug}`,
                year: study.year,
              }),
            ),
          }}
        />
      ))}
      <SiteHeader t={t} path="/work" />
      <main id="main">
        <PageIntro eyebrow={t.work.eyebrow} title={t.work.heading} sub={t.work.sub} compact />

        <section className="section-light relative z-[7] py-16 lg:py-20">
          <div className="container-y">
            <WorkGrid
              studies={studies}
              base={base}
              labels={{
                all: t.work.filterAll,
                clients: t.work.filterClients,
                concepts: t.work.filterConcepts,
                products: t.work.filterProducts,
                viewCase: t.work.viewCase,
                metricNote: t.work.metricNote,
                empty: t.work.empty,
                status: {
                  client: t.work.statusClient,
                  concept: t.work.statusConcept,
                  product: t.work.statusProduct,
                  experimental: t.work.statusExp,
                  venture: t.work.statusVenture,
                },
              }}
            />
          </div>
        </section>

        <CtaSection t={t.cta} base={base} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
