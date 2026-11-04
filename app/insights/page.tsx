import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import CtaSection from '@/components/sections/CtaSection';
import InsightCard from '@/components/insights/InsightCard';
import NewsletterForm from '@/components/newsletter/NewsletterForm';
import { newsletterCopy } from '@/lib/newsletter/copy';
import { getCompanyInfo, getKvkkPublish } from '@/lib/siteSettings';
import { noticeIsFinal } from '@/lib/companyInfo';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';
import { categoryName, getFeaturedInsight, getInsightCategories, hasPublishedInsights, INSIGHTS_PAGE_SIZE, listInsights } from '@/lib/insights';

/** Yoca — Insights journal: featured essay + latest index, lightweight category filter. */

export async function generateMetadata(): Promise<Metadata> {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  const meta = buildMetadata({ ctx, path: '/insights', title: t.insights.metaTitle, description: t.insights.metaDescription });
  // An empty section stays reachable but is not offered to search engines.
  return (await hasPublishedInsights(ctx.locale)) ? meta : { ...meta, robots: { index: false, follow: true } };
}

interface PageProps {
  searchParams: { category?: string; page?: string };
}

export default async function InsightsPage({ searchParams }: PageProps) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const category = searchParams.category;

  const [categories, featured, list, company, kvkk] = await Promise.all([
    getInsightCategories(),
    category ? Promise.resolve(null) : getFeaturedInsight(ctx.locale),
    listInsights(ctx.locale, { category, page }),
    getCompanyInfo(),
    getKvkkPublish(),
  ]);
  const privacyHref = noticeIsFinal(company, kvkk) ? `${base}/privacy` : null;
  const items = list.items.filter((item) => item.id !== featured?.id);
  const totalPages = Math.max(1, Math.ceil(list.total / INSIGHTS_PAGE_SIZE));
  const hasAny = Boolean(featured) || items.length > 0;
  const withCat = (key?: string) => (key ? `${base}/insights?category=${key}` : `${base}/insights`);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbSchema(ctx.host, [{ name: t.nav.home, path: base }, { name: t.nav.insights, path: `${base}/insights` }])) }}
      />
      <SiteHeader t={t} path="/insights" />
      <main id="main">
        <PageIntro
          eyebrow={t.insights.eyebrow}
          title={t.insights.heading}
          sub={t.insights.sub}
          compact
          rail={
            categories.length > 0 && hasAny ? (
              <nav aria-label={t.insights.all} className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold uppercase tracking-[0.12em]">
                <Link href={withCat()} className={!category ? 'text-yoca-lime' : 'text-subtle transition-colors hover:text-white'}>
                  {t.insights.all}
                </Link>
                {categories.map((cat) => (
                  <Link key={cat.key} href={withCat(cat.key)} className={category === cat.key ? 'text-yoca-lime' : 'text-subtle transition-colors hover:text-white'}>
                    {cat.names[ctx.locale] ?? cat.names.en}
                  </Link>
                ))}
              </nav>
            ) : undefined
          }
        />

        <section className="relative z-[7] bg-surface-deep py-12 lg:py-16">
          <div className="container-y">
            {!hasAny && (
              <div className="border-t border-line py-16">
                <p className="max-w-[48ch] text-[clamp(20px,2.2vw,28px)] font-bold leading-snug tracking-[-0.02em] text-soft">{t.insights.empty}</p>
                <Link href={`${base}/services`} className="btn-ghost mt-8">
                  {t.nav.services} <span aria-hidden="true" className="icon-arrow">→</span>
                </Link>
              </div>
            )}

            {featured && (
              <div className="mb-14">
                <p className="eyebrow mb-6">{t.insights.featured}</p>
                <InsightCard item={featured} category={categoryName(categories, featured.category_key, ctx.locale)} base={base} locale={ctx.locale} minRead={t.insights.minRead} featured />
              </div>
            )}

            {items.length > 0 && (
              <div>
                <p className="eyebrow mb-6">{category ? categoryName(categories, category, ctx.locale) : t.insights.latest}</p>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <InsightCard key={item.id} item={item} category={categoryName(categories, item.category_key, ctx.locale)} base={base} locale={ctx.locale} minRead={t.insights.minRead} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center gap-2 text-[13px] font-bold">
                    {Array.from({ length: totalPages }).map((_, index) => {
                      const n = index + 1;
                      const href = `${withCat(category)}${category ? '&' : '?'}page=${n}`;
                      return (
                        <Link key={n} href={href} aria-current={n === page ? 'page' : undefined} className={`min-h-10 min-w-10 border px-3 py-2 text-center transition-colors ${n === page ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-line text-muted hover:border-yoca-lime hover:text-white'}`}>
                          {n}
                        </Link>
                      );
                    })}
                  </nav>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="relative z-[7] bg-surface-deep pb-16 lg:pb-20" aria-label={newsletterCopy(ctx.locale).form.heading}>
          <div className="container-y">
            <NewsletterForm locale={ctx.locale} copy={newsletterCopy(ctx.locale).form} privacyHref={privacyHref} source="insights" />
          </div>
        </section>

        <CtaSection t={t.cta} base={base} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
