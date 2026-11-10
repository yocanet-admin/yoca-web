import { SERVICE_PAGES } from '@/lib/servicePages';

/**
 * Yoca — the logical pages listed in the sitemap (each once per locale).
 * Pure, so the list can be tested; app/sitemap.ts adds hosts, locales,
 * hreflang, insights and the privacy notice.
 */
export type SitemapPath = { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' };

export function sitemapPaths(workSlugs: string[]): SitemapPath[] {
  return [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/overview', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/services', priority: 0.9, changeFrequency: 'monthly' },
    // service detail pages: live, indexable, self-canonical (were missing before)
    ...SERVICE_PAGES.map(({ slug }) => ({ path: `/services/${slug}`, priority: 0.8, changeFrequency: 'monthly' as const })),
    { path: '/work', priority: 0.9, changeFrequency: 'weekly' },
    ...workSlugs.map((slug) => ({ path: `/work/${slug}`, priority: 0.7, changeFrequency: 'monthly' as const })),
    { path: '/products', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/checkup', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.8, changeFrequency: 'monthly' },
  ];
}
