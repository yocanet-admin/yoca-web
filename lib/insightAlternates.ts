import type { Locale } from '@/types';

/**
 * Yoca — language versions of one Insight (pure; unit-tested in
 * tests/multilang.test.ts). Used by the article page (hreflang, x-default,
 * og:locale:alternate, language menu) and by the sitemap.
 */

export interface InsightAlternate {
  locale: Locale;
  slug: string;
  /** v15: null on the source article; undefined before v15. */
  source_insight_id?: string | null;
}

const ALL: Locale[] = ['en', 'tr', 'az', 'ar'];

/**
 * x-default: the English version when it is published (the site's default
 * language), otherwise the source article, otherwise the current one.
 */
export function insightXDefault(alternates: InsightAlternate[], current: Locale): Locale {
  if (alternates.some((a) => a.locale === 'en')) return 'en';
  const source = alternates.find((a) => a.source_insight_id === null);
  if (source) return source.locale;
  return alternates.some((a) => a.locale === current) || alternates.length === 0 ? current : alternates[0].locale;
}

/**
 * Where the language menu goes from this article, per locale: the published
 * translation, or that language's Insights index when there is none.
 */
export function insightLocalePaths(alternates: InsightAlternate[], current: { locale: Locale; slug: string }): Record<Locale, string> {
  const out = {} as Record<Locale, string>;
  for (const locale of ALL) {
    const alt = locale === current.locale ? current : alternates.find((a) => a.locale === locale);
    out[locale] = alt ? `/insights/${alt.slug}` : '/insights';
  }
  return out;
}

/** "/insights/<slug>" (one segment, no trailing parts) → slug, else null. */
export function insightSlugFromPath(path: string): string | null {
  const m = /^\/insights\/([^/]+)\/?$/.exec(path);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
