import { cache } from 'react';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase';
import type { CaseStudyRow, Locale } from '@/types';
import { mergeWorkSources, staticCaseStudies, type CaseStudy, localizeMarket, localizeServices } from '@/lib/workData';

/**
 * Yoca — selected work / case studies (server data layer).
 *
 * One content model, merged per slug (lib/workData.ts → mergeWorkSources):
 *  - every active `case_studies` row is shown (ordered by order_index);
 *  - a code project from lib/workData.ts is shown only while its slug has NO
 *    row in the table — a hidden row (is_active = false) hides that slug;
 *  - code projects keep their code position (order_index = code index).
 * When Supabase is unreachable the code projects are shown as they are.
 */

export type { CaseStudy } from '@/lib/workData';

/**
 * Fetch every case-study row — hidden ones too, because a hidden row must
 * hide the code project with the same slug. Once per request (React cache).
 * null = Supabase not configured or the read failed.
 */
const fetchCaseStudyRows = cache(async (): Promise<CaseStudyRow[] | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .order('order_index', { ascending: true })
      .order('id', { ascending: true })
      .returns<CaseStudyRow[]>();
    if (error || !data) return null;
    // With supabase/upgrade-v11 visitors (anon key) only see ACTIVE rows, so the
    // slugs of hidden rows are read server-side with the service role — only the
    // slug and the flag, never their content — to keep their code project hidden.
    const seen = new Set(data.map((row) => row.slug));
    const admin = getSupabaseAdmin();
    if (admin) {
      const hidden = await admin.from('case_studies').select('id, slug, is_active, order_index').eq('is_active', false);
      for (const row of (hidden.data ?? []) as Array<Pick<CaseStudyRow, 'id' | 'slug' | 'is_active' | 'order_index'>>) {
        if (!seen.has(row.slug)) data.push({ ...(row as CaseStudyRow), content: {} as CaseStudyRow['content'] });
      }
    }
    return data;
  } catch {
    return null;
  }
});

function rowToCaseStudy(row: CaseStudyRow, locale: Locale): CaseStudy | null {
  const localized = row.content?.[locale] ?? row.content?.en;
  if (!localized) return null;
  return {
    slug: row.slug,
    year: row.year,
    market: localizeMarket(row.market ?? '', locale),
    image: row.image_url,
    services: localizeServices(row.services ?? [], locale),
    kind: (['client', 'concept', 'product', 'experimental', 'venture'] as const).includes(row.kind)
      ? row.kind
      : 'client',
    videoUrl: row.video_url,
    liveUrl: row.live_url,
    ...localized,
  };
}

export async function getCaseStudies(locale: Locale): Promise<CaseStudy[]> {
  const rows = (await fetchCaseStudyRows()) ?? [];
  const code = new Map(staticCaseStudies(locale).map((cs) => [cs.slug, cs]));
  return mergeWorkSources(rows, { includeHidden: false })
    .map((entry) => (entry.source === 'db' ? rowToCaseStudy(entry.row, locale) : code.get(entry.slug) ?? null))
    .filter((cs): cs is CaseStudy => cs !== null);
}

export async function getCaseStudy(locale: Locale, slug: string): Promise<CaseStudy | null> {
  const all = await getCaseStudies(locale);
  return all.find((cs) => cs.slug === slug) ?? null;
}

/** Every publicly visible slug (same merge rule as getCaseStudies). */
export async function getAllSlugs(): Promise<string[]> {
  const rows = (await fetchCaseStudyRows()) ?? [];
  return mergeWorkSources(rows, { includeHidden: false }).map((entry) => entry.slug);
}
