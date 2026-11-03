import { cache } from 'react';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { isPublishableOnSite } from '@/lib/publicRules';

/**
 * Yoca — verified case-study results & testimonials (server read).
 * Table public.case_study_results is admin-only (RLS, v14). The public case
 * page reads it here with the service role and only these columns; the
 * approval evidence (note + private file) is never selected. A record is
 * shown only when approval_status = 'approved', it has an approval date, its
 * publication scope includes 'site' and its locale is 'all' or the page's.
 * Nothing here generates or edits results.
 */

export interface PublicResult {
  id: string;
  case_slug: string;
  locale: string;
  metric_name: string;
  metric_value: string;
  period: string;
  baseline: string;
  source_basis: string;
  testimonial_text: string;
  testimonial_author: string;
  testimonial_author_title: string;
  approval_status: string;
  approval_date: string | null;
  publication_scope: string[];
  sort_order: number;
}

const PUBLIC_COLUMNS = 'id, case_slug, locale, metric_name, metric_value, period, baseline, source_basis, testimonial_text, testimonial_author, testimonial_author_title, approval_status, approval_date, publication_scope, sort_order';

/** The publication rule lives in lib/publicRules.ts (pure; unit-tested). */
export { isPublishableOnSite };

const fetchApproved = cache(async (): Promise<PublicResult[]> => {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return []; // fail closed: no service role → no results shown
  try {
    const { data, error } = await supabase.from('case_study_results').select(PUBLIC_COLUMNS).eq('approval_status', 'approved').order('sort_order', { ascending: true });
    if (error) return [];
    return (data ?? []) as PublicResult[];
  } catch {
    return [];
  }
});

export async function getSiteResults(slug: string, locale: string): Promise<{ metrics: PublicResult[]; testimonials: PublicResult[] }> {
  const rows = (await fetchApproved()).filter((r) => r.case_slug === slug && isPublishableOnSite(r, locale));
  return {
    metrics: rows.filter((r) => r.metric_name.trim() && r.metric_value.trim()),
    testimonials: rows.filter((r) => r.testimonial_text.trim()),
  };
}
