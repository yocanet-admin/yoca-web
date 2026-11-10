/**
 * Yoca — the service detail pages (/services/[slug], all four locales).
 * One list for the page itself and the sitemap, so a new service is never
 * live but missing from the sitemap.
 * slug → [service item index, umbrella group index] in the i18n dictionary.
 */
export const SERVICE_PAGES: ReadonlyArray<{ slug: string; item: number; group: number }> = [
  { slug: 'brand-strategy-identity', item: 0, group: 0 },
  { slug: 'web-digital-experiences', item: 1, group: 1 },
  { slug: 'growth-performance', item: 2, group: 1 },
  { slug: 'creative-production', item: 3, group: 0 },
  { slug: 'ai-automation', item: 4, group: 2 },
  { slug: 'digital-product-development', item: 5, group: 2 },
];
