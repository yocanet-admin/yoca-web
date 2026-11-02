/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import InsightCard from '@/components/insights/InsightCard';
import { Markdown } from '@/lib/markdown';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { SERVICE_SLUGS } from '@/lib/serviceSlugs';
import { absoluteLocalizedUrl, absoluteUrl, HREFLANG } from '@/lib/domains';
import { articleSchema, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';
import {
  categoryName,
  formatInsightDate,
  getInsight,
  getInsightAlternates,
  getInsightCategories,
  getInsightForPreview,
  getRelatedInsights,
  previewOk,
} from '@/lib/insights';
import type { InsightRow } from '@/types';
import { categoryOgImage } from '@/lib/visuals';

/**
 * Yoca — Insight article. Editorial reading page: category · H1 · lead ·
 * meta · optional cover · prose body · optional sources / FAQ · restrained
 * related-service/product CTA · related insights. Drafts are only reachable
 * with the preview secret (?preview=<id>&token=…) and are noindex.
 */

interface PageProps {
  params: { slug: string };
  searchParams: { preview?: string; token?: string };
}

async function load(locale: InsightRow['locale'], slug: string, sp: PageProps['searchParams']): Promise<{ article: InsightRow | null; preview: boolean }> {
  if (sp.preview && previewOk(sp.token)) {
    const draft = await getInsightForPreview(sp.preview);
    if (draft && draft.slug === slug) return { article: draft, preview: true };
  }
  return { article: await getInsight(locale, slug), preview: false };
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  const { article, preview } = await load(ctx.locale, params.slug, searchParams);
  if (!article) return { title: t.insights.metaTitle, robots: { index: false } };
  const path = `/insights/${article.slug}`;
  const canonical = article.canonical_override || absoluteLocalizedUrl(ctx.host, ctx.locale, path);
  const alternates = preview ? [] : await getInsightAlternates(article.group_id);
  const languages: Record<string, string> = {};
  for (const alt of alternates) languages[HREFLANG[alt.locale]] = absoluteLocalizedUrl(ctx.host, alt.locale, `/insights/${alt.slug}`);
  const title = article.seo_title || `${article.title} | Yoca`;
  const description = article.meta_description || article.excerpt;
  const fallbackOg = categoryOgImage(article.category_key);
  const ogImage = article.og_image || article.cover_url || absoluteUrl(ctx.host, fallbackOg ?? '/brand/og-default.png');
  return {
    title,
    description,
    alternates: { canonical, languages },
    robots: preview || article.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'article',
      title: article.og_title || title,
      description: article.og_description || description,
      url: canonical,
      images: [{ url: ogImage.startsWith('http') ? ogImage : absoluteUrl(ctx.host, ogImage) }],
      publishedTime: article.publish_at ?? undefined,
      modifiedTime: article.updated_at,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function InsightPage({ params, searchParams }: PageProps) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const { article, preview } = await load(ctx.locale, params.slug, searchParams);
  if (!article) notFound();

  const [categories, related] = await Promise.all([getInsightCategories(), preview ? Promise.resolve([]) : getRelatedInsights(article)]);
  const category = categoryName(categories, article.category_key, ctx.locale);
  const serviceIndex = article.related_service ? (SERVICE_SLUGS as readonly string[]).indexOf(article.related_service) : -1;
  const service = serviceIndex >= 0 ? t.services.items[serviceIndex] : null;
  const product = article.related_product ? t.products.items.find((p) => p.key === article.related_product) ?? null : null;

  const cta = (() => {
    switch (article.cta_type) {
      case 'contact': return { label: t.insights.ctaContact, href: `${base}/contact` };
      case 'checkup': return { label: t.insights.ctaCheckup, href: `${base}/checkup` };
      case 'service': return service ? { label: `${t.insights.exploreService}: ${service.name}`, href: `${base}/services/${article.related_service}` } : null;
      case 'product': return product ? { label: `${t.insights.exploreProduct}: ${product.name}`, href: `${base}/products#${product.key}` } : null;
      default: return null;
    }
  })();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            articleSchema(ctx.host, {
              headline: article.title,
              description: article.meta_description || article.excerpt,
              path: `${base}/insights/${article.slug}`,
              datePublished: article.publish_at ?? article.created_at,
              dateModified: article.updated_at,
              author: article.author_name,
              image: article.og_image || article.cover_url,
              locale: ctx.locale,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: base },
              { name: t.nav.insights, path: `${base}/insights` },
              { name: article.title, path: `${base}/insights/${article.slug}` },
            ]),
          ),
        }}
      />
      <SiteHeader t={t} path={`/insights/${article.slug}`} />
      <main id="main">
        {preview && (
          <p className="relative z-[8] bg-yellow-300 px-4 py-2 text-center text-[13px] font-bold text-black">
            Preview — {article.status}
          </p>
        )}
        <PageIntro
          crumbs={[
            { label: t.nav.home, href: base },
            { label: t.nav.insights, href: `${base}/insights` },
            { label: category || t.nav.insights },
          ]}
          eyebrow={category || undefined}
          title={article.title}
          sub={article.excerpt}
          titleMax="max-w-[22ch]"
          compact
          rail={[
            <span key="date" className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">
              {formatInsightDate(article.publish_at ?? article.created_at, ctx.locale)}
            </span>,
            <span key="read" className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">
              {article.reading_minutes} {t.insights.minRead}
            </span>,
            <span key="author" className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">
              {t.insights.by} {article.author_name}
              {article.author_role ? ` · ${article.author_role}` : ''}
            </span>,
          ]}
        />

        {article.cover_url && (
          <div className="container-y relative z-[7] pt-4">
            <figure className="overflow-hidden border border-line bg-surface">
              <img src={article.cover_url} alt={article.cover_alt ?? ''} width={1600} height={1000} className="block h-auto w-full" />
              {article.cover_caption && <figcaption className="px-4 py-3 text-[12px] text-subtle">{article.cover_caption}</figcaption>}
            </figure>
          </div>
        )}

        <article className="relative z-[7] py-12 lg:py-20">
          <div className="container-y">
            <Markdown md={article.body_md} className="prose-yoca mx-auto" />

            {article.faq && article.faq.length > 0 && (
              <section className="prose-yoca mx-auto mt-14 border-t border-line pt-10" aria-label={t.insights.faq}>
                <h2>{t.insights.faq}</h2>
                {article.faq.map((item, index) => (
                  <details key={index} className="group border-b border-line py-4">
                    <summary className="cursor-pointer list-none text-[17px] font-bold text-soft [&::-webkit-details-marker]:hidden">
                      {item.q}
                    </summary>
                    <p className="mt-3 !text-[16px]">{item.a}</p>
                  </details>
                ))}
              </section>
            )}

            {article.sources && article.sources.length > 0 && (
              <section className="prose-yoca mx-auto mt-14 border-t border-line pt-10" aria-label={t.insights.sources}>
                <h2 className="!text-[15px] !uppercase !tracking-[0.12em] !text-subtle">{t.insights.sources}</h2>
                <ol className="!mt-4 !text-[14px]">
                  {article.sources.map((source, index) => (
                    <li key={index}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">
                        {source.title || source.domain}
                      </a>
                      {source.domain && <span className="text-subtle"> — {source.domain}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {cta && (
              <aside className="mx-auto mt-16 max-w-[72ch] border border-line bg-surface p-7 lg:p-9">
                <p className="text-[clamp(18px,1.8vw,22px)] font-extrabold leading-snug tracking-[-0.02em]">{t.insights.ctaLine}</p>
                <Link href={cta.href} className="btn-primary mt-6">
                  {cta.label} <span aria-hidden="true" className="icon-arrow">→</span>
                </Link>
              </aside>
            )}
          </div>
        </article>

        {related.length > 0 && (
          <section className="relative z-[7] border-t border-line bg-surface-deep py-16 lg:py-24">
            <div className="container-y">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <p className="eyebrow">{t.insights.related}</p>
                <Link href={`${base}/insights`} className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted transition-colors hover:text-yoca-lime">
                  {t.insights.back} <span aria-hidden="true" className="icon-arrow">→</span>
                </Link>
              </div>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <InsightCard key={item.id} item={item} category={categoryName(categories, item.category_key, ctx.locale)} base={base} locale={ctx.locale} minRead={t.insights.minRead} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter t={t} />
    </>
  );
}
