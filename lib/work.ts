import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { CaseStudyRow, Locale } from '@/types';
import { staticCaseStudies, type CaseStudy, localizeMarket, localizeServices } from '@/lib/workData';

/**
 * Yoca — selected work / case studies (server data layer).
 * Content is managed from the admin panel (Supabase `case_studies` table);
 * the localized defaults in lib/workData.ts act as the fallback when the
 * table is empty or Supabase is unreachable.
 */

export type { CaseStudy } from '@/lib/workData';

/** Fetch active case studies once per request (deduped via React cache). */
const fetchCaseStudyRows = cache(async (): Promise<CaseStudyRow[] | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true })
      .returns<CaseStudyRow[]>();
    if (error || !data || data.length === 0) return null;
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
  const rows = await fetchCaseStudyRows();
  if (!rows) return staticCaseStudies(locale);
  const mapped = rows
    .map((row) => rowToCaseStudy(row, locale))
    .filter((cs): cs is CaseStudy => cs !== null);
  return mapped.length > 0 ? mapped : staticCaseStudies(locale);
}

export async function getCaseStudy(locale: Locale, slug: string): Promise<CaseStudy | null> {
  const all = await getCaseStudies(locale);
  return all.find((cs) => cs.slug === slug) ?? null;
}

export async function getAllSlugs(): Promise<string[]> {
  const rows = await fetchCaseStudyRows();
  if (!rows) return staticCaseStudies('en').map((cs) => cs.slug);
  return rows.map((row) => row.slug);
}
