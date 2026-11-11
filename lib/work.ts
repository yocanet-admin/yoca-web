import { cache } from 'react';
import { getSupabase, getSupabaseServiceRole } from '@/lib/supabase';
import type { CaseStudyRow, Locale } from '@/types';
import { mergeWorkSources, rowToCaseStudy, staticCaseStudies, type CaseStudy } from '@/lib/workData';
import { workLookupState, type WorkLookupState, type WorkSourceStatus } from '@/lib/detailRoutes';

/**
 * Yoca — selected work / case studies (server data layer).
 *
 * One content model, merged per slug (lib/workData.ts → mergeWorkSources):
 *  - every active `case_studies` row is shown (ordered by order_index);
 *  - a code project from lib/workData.ts is shown only while its slug has NO
 *    row in the table — a hidden row (is_active = false) hides that slug;
 *  - code projects keep their code position (order_index = code index).
 * Fail closed: when Supabase is configured but the hidden slugs cannot be
 * read (no service-role key, read error), code projects are NOT shown — a
 * project an admin hid must never come back by accident. Only a site with no
 * Supabase at all (local dev) shows the code projects alone.
 */

export type { CaseStudy } from '@/lib/workData';

/**
 * Rows for the merge, or null when Supabase is not configured at all (local dev:
 * code projects only). When Supabase IS configured the merge needs two things,
 * and if either is missing it fails CLOSED — code projects are left out rather
 * than risking re-publishing one that an admin hid:
 *   1. active rows (anon key; with v11 visitors only see active rows), and
 *   2. the slugs of hidden rows, read with the service role (slug + flag only).
 */
export type { WorkSourceStatus } from '@/lib/detailRoutes';

const fetchCaseStudyRows = cache(async (): Promise<{ rows: CaseStudyRow[] | null; status: WorkSourceStatus }> => {
  const supabase = getSupabase();
  if (!supabase) return { rows: null, status: 'not_configured' };
  try {
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true })
      .returns<CaseStudyRow[]>();
    if (error || !data) {
      console.error('[work] case_studies read failed — code projects withheld:', error?.message);
      return { rows: [], status: 'read_failed' };
    }
    const service = getSupabaseServiceRole();
    if (!service) {
      console.error('[work] SUPABASE_SERVICE_ROLE_KEY missing — hidden projects cannot be checked, code projects withheld');
      return { rows: data.filter((row) => row.is_active), status: 'missing_service_role' };
    }
    const hidden = await service.from('case_studies').select('id, slug, is_active, order_index').eq('is_active', false);
    if (hidden.error) {
      console.error('[work] hidden slugs read failed — code projects withheld:', hidden.error.message);
      return { rows: data.filter((row) => row.is_active), status: 'read_failed' };
    }
    const seen = new Set(data.map((row) => row.slug));
    for (const row of (hidden.data ?? []) as Array<Pick<CaseStudyRow, 'id' | 'slug' | 'is_active' | 'order_index'>>) {
      if (!seen.has(row.slug)) data.push({ ...(row as CaseStudyRow), content: {} as CaseStudyRow['content'] });
    }
    return { rows: data, status: 'ok' };
  } catch (error) {
    console.error('[work] case_studies read failed — code projects withheld:', (error as Error).message);
    return { rows: [], status: 'read_failed' };
  }
});

/** Whether code projects may be shown (only when hidden rows could be checked). */
function codeAllowed(status: WorkSourceStatus): boolean {
  return status === 'ok' || status === 'not_configured';
}

/** For the admin/health checks: why code projects are (not) shown. */
export async function getWorkSourceStatus(): Promise<WorkSourceStatus> {
  return (await fetchCaseStudyRows()).status;
}

/** Public merge; code projects only when hidden rows could be checked (fail closed). */
async function publicEntries() {
  const { rows, status } = await fetchCaseStudyRows();
  const allowCode = codeAllowed(status);
  return mergeWorkSources(rows ?? [], { includeHidden: false }).filter((entry) => allowCode || entry.source === 'db');
}

/**
 * Results, metric badges, stats and quotes stored in the case content are NOT
 * public: they carry no client approval. Verified results come only from
 * case_study_results (lib/caseResults.ts, approved + site scope).
 */
function withoutUnverifiedResults(cs: CaseStudy): CaseStudy {
  return { ...cs, results: '', metricBadge: undefined, stats: undefined, quote: undefined, quoteAuthor: undefined };
}

export async function getCaseStudies(locale: Locale): Promise<CaseStudy[]> {
  const code = new Map(staticCaseStudies(locale).map((cs) => [cs.slug, cs]));
  return (await publicEntries())
    .map((entry) => (entry.source === 'db' ? rowToCaseStudy(entry.row, locale) : code.get(entry.slug) ?? null))
    .filter((cs): cs is CaseStudy => cs !== null)
    .map(withoutUnverifiedResults);
}

export async function getCaseStudy(locale: Locale, slug: string): Promise<CaseStudy | null> {
  const all = await getCaseStudies(locale);
  return all.find((cs) => cs.slug === slug) ?? null;
}

/** Detail visibility for the middleware's 404 check (app/api/work-visibility). */
export async function lookupCaseStudy(locale: Locale, slug: string): Promise<WorkLookupState> {
  const study = await getCaseStudy(locale, slug);
  const { status } = await fetchCaseStudyRows();
  return workLookupState(study !== null, status, slug);
}

/** Every publicly visible slug (same merge rule as getCaseStudies). */
export async function getAllSlugs(): Promise<string[]> {
  return (await publicEntries()).map((entry) => entry.slug);
}
