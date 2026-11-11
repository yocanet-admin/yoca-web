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
 * Work slugs are decided on the SERVER (app/api/work-visibility → lib/work.ts),
 * because only the service role can see hidden rows. The answer carries the
 * outcome only — "missing" covers a hidden project and an unknown slug alike,
 * exactly what the public page shows — never whether a hidden row exists.
 *  - found     → a public project;
 *  - missing   → certain: rows (and hidden rows) were read, or there is no
 *                Supabase at all, and the slug is not public;
 *  - uncertain → the data source could not answer (read error, or no service
 *                role while the slug is a code project that may be hidden).
 *                A data-source error is NOT "no project": never a 404.
 */
export type WorkLookupState = 'found' | 'missing' | 'uncertain';
export type WorkSourceStatus = 'ok' | 'not_configured' | 'missing_service_role' | 'read_failed';

export function workLookupState(found: boolean, status: WorkSourceStatus, slug: string): WorkLookupState {
  if (found) return 'found';
  if (status === 'ok' || status === 'not_configured') return 'missing';
  if (status === 'missing_service_role' && !DEFAULT_CASE_STUDY_SLUGS.includes(slug)) return 'missing'; // active rows were read; not a code project
  return 'uncertain';
}

/** Middleware verdict from the API answer: true / false (→ 404) / null (fail open). */
export function workVerdictFromApi(state: unknown): boolean | null {
  if (state === 'found') return true;
  if (state === 'missing') return false;
  return null;
}
