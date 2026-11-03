/**
 * Yoca — what the PUBLIC site may show (pure, no imports; unit-tested).
 *
 * 1. Main-navigation rule:
 * Insights link: shown in the header/footer for a locale only when that
 * locale has at least one published (and due) article. With none, the link is
 * removed — also when a CMS-managed menu row lists /insights — and it comes
 * back by itself after the first post is published. The /insights page and
 * the admin editor stay reachable either way (only the menu changes).
 */

export interface NavItem {
  title: string;
  url: string;
  external?: boolean;
}

export function applyInsightsVisibility<T extends NavItem>(items: T[], insightsLive: boolean, insightsItem: T): T[] {
  const withoutInsights = items.filter((item) => item.url !== '/insights');
  if (!insightsLive) return withoutInsights;
  // Keep the CMS position when the menu already lists it; otherwise append.
  return items.some((item) => item.url === '/insights') ? items : [...items, insightsItem];
}

/**
 * 2. Case-study results & testimonials (table case_study_results, v14): a
 * record is shown on the public case page only when the client approved it
 * (status "approved" with an approval date), its publication scope includes
 * the web site, and its locale is "all" or the page's locale.
 */
export interface PublishableResult {
  approval_status: string;
  approval_date: string | null;
  publication_scope: string[];
  locale: string;
}

export function isPublishableOnSite(row: PublishableResult, locale: string): boolean {
  return row.approval_status === 'approved' && Boolean(row.approval_date) && Array.isArray(row.publication_scope) && row.publication_scope.includes('site') && (row.locale === 'all' || row.locale === locale);
}
