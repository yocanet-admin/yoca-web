import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import {
  absoluteLocalizedUrl,
  canonicalHostFor,
  DEFAULT_LOCALE,
  HREFLANG,
  LOCALES,
} from '@/lib/domains';
import { getAllSlugs } from '@/lib/work';
import { getAllPublishedInsights } from '@/lib/insights';
import { getCompanyInfo, getKvkkPublish } from '@/lib/siteSettings';
import { noticeIsFinal } from '@/lib/companyInfo';

/**
 * Yoca — sitemap for path-based i18n.
 * Every logical page is listed once per locale (/en, /tr, /az, /ar) with
 * full cross-locale hreflang alternates.
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = canonicalHostFor(headers().get('host'));
  const lastModified = new Date();
  const slugs = await getAllSlugs();

  const PATHS: Array<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/overview', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/services', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/work', priority: 0.9, changeFrequency: 'weekly' },
    ...slugs.map((slug) => ({
      path: `/work/${slug}`,
      priority: 0.7,
      changeFrequency: 'monthly' as const,
    })),
    { path: '/products', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/checkup', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.8, changeFrequency: 'monthly' },
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const { path, priority, changeFrequency } of PATHS) {
    const languages: Record<string, string> = {};
    for (const locale of LOCALES) {
      languages[HREFLANG[locale]] = absoluteLocalizedUrl(host, locale, path);
    }
    languages['x-default'] = absoluteLocalizedUrl(host, DEFAULT_LOCALE, path);

    for (const locale of LOCALES) {
      entries.push({
        url: absoluteLocalizedUrl(host, locale, path),
        lastModified,
        changeFrequency,
        priority: locale === DEFAULT_LOCALE ? priority : Math.max(0.1, priority - 0.1),
        alternates: { languages },
      });
    }
  }

  // Published insights: one entry per row, hreflang only across the same
  // translation group (drafts / scheduled rows never reach this query).
  const insights = await getAllPublishedInsights();
  for (const row of insights) {
    const siblings = insights.filter((r) => r.group_id === row.group_id);
    const languages: Record<string, string> = {};
    for (const sib of siblings) languages[HREFLANG[sib.locale]] = absoluteLocalizedUrl(host, sib.locale, `/insights/${sib.slug}`);
    entries.push({
      url: absoluteLocalizedUrl(host, row.locale, `/insights/${row.slug}`),
      lastModified: new Date(row.updated_at),
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: { languages },
    });
  }

  // Insights index only for locales that have at least one published post.
  const liveLocales = Array.from(new Set(insights.map((row) => row.locale)));
  for (const locale of liveLocales) {
    entries.push({ url: absoluteLocalizedUrl(host, locale, '/insights'), lastModified, changeFrequency: 'weekly', priority: locale === DEFAULT_LOCALE ? 0.8 : 0.7 });
  }

  // Privacy notice only once the owner published it as final (the draft is noindex).
  const [company, kvkk] = await Promise.all([getCompanyInfo(), getKvkkPublish()]);
  if (noticeIsFinal(company, kvkk)) {
    for (const locale of LOCALES) entries.push({ url: absoluteLocalizedUrl(host, locale, '/privacy'), lastModified, changeFrequency: 'monthly', priority: 0.3 });
  }
  return entries;
}
