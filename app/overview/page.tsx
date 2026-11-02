import type { Metadata } from 'next';
import OverviewShell from '@/components/overview/OverviewShell';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { COMPANY } from '@/lib/company';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';

/**
 * Yoca — Overview: an 11-scene guided brand presentation (~60–90 s).
 * Server page → passes ONLY the copy the scenes need to one isolated client
 * shell (scroll-snap, keyboard, progress, menu, analytics). No site header /
 * footer: reduced presentation chrome with an exit back to the full site.
 */

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({ ctx, path: '/overview', title: t.overview.metaTitle, description: t.overview.metaDescription });
}

export default async function OverviewPage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbSchema(ctx.host, [{ name: t.nav.home, path: base }, { name: t.overview.title, path: `${base}/overview` }])) }}
      />
      <OverviewShell
        locale={ctx.locale}
        base={base}
        t={{
          overview: t.overview,
          hero: { title: t.hero.title, line: t.hero.line, primaryCta: t.hero.primaryCta },
          systems: t.systems,
          services: { items: t.services.items.map((s) => ({ name: s.name, changes: s.changes })) },
          process: t.servicesPage.process,
          products: t.products.items.map((p) => ({ key: p.key, name: p.name, category: p.category })),
          clocks: t.clocks,
          nav: t.nav,
          workLabels: {
            client: t.work.statusClient,
            concept: t.work.statusConcept,
            product: t.work.statusProduct,
            experimental: t.work.statusExp,
            venture: t.work.statusVenture,
          },
        }}
        address={COMPANY.address.line}
      />
    </>
  );
}
