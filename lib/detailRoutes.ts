import { SERVICE_PAGES } from '@/lib/servicePages';
import { DEFAULT_CASE_STUDY_SLUGS } from '@/lib/workData';

/**
 * Yoca — "does this detail page exist?" pre-checks for the edge middleware
 * (pure; unit-tested in tests/detail-routes.test.ts).
 *
 * Why: the root app/loading.tsx makes every page stream, so a notFound()
 * thrown inside /services/[slug] or /work/[slug] arrives after the 200 status
 * line (the branded 404 page is shown with noindex, but the status is 200).
 * The middleware therefore answers the obvious misses itself by rewriting to
 * an unknown path (real 404), exactly like it already does for insights.
 *
 * Verdicts: true = exists, false = definitely missing (→ 404), null = unknown
 * (fail open: the request goes to the page, which still decides with
 * notFound()). A false is only returned when it is certain, so a real page
 * can never be answered with a 404.
 */

function slugFrom(path: string, section: 'services' | 'work'): string | null {
  const m = (section === 'services' ? /^\/services\/([^/]+)\/?$/ : /^\/work\/([^/]+)\/?$/).exec(path);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]); // the page receives the decoded param
  } catch {
    return null;
  }
}

export const serviceSlugFromPath = (path: string) => slugFrom(path, 'services');
export const workSlugFromPath = (path: string) => slugFrom(path, 'work');

/** Service slugs are a fixed, locale-independent list (lib/servicePages.ts). */
export function serviceExists(slug: string): boolean {
  return SERVICE_PAGES.some((entry) => entry.slug === slug);
}

/**
 * Work slugs (same merge rule as lib/work.ts): a project is public when it has
 * an active case_studies row, or when it is a code project without a row.
 *  - activeRow: result of the anon lookup for an ACTIVE row with this slug
 *    (true / false), or null when the lookup failed or Supabase is not set.
 *  - An active row → exists.
 *  - A code project slug → unknown: a hidden row (invisible to the anon key)
 *    may hide it, and code projects may be withheld (fail closed in
 *    lib/work.ts), so only the page can decide.
 *  - Otherwise no active row and not a code project → definitely missing.
 */
export function workVerdict(slug: string, activeRow: boolean | null): boolean | null {
  if (activeRow === true) return true;
  if (DEFAULT_CASE_STUDY_SLUGS.includes(slug)) return null;
  return activeRow === false ? false : null;
}
