import { cache } from 'react';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase';
import type { InsightCategoryRow, InsightRow, Locale } from '@/types';

/**
 * Yoca — Insights read layer (server).
 * Public helpers use the anon client; Row Level Security already restricts
 * results to PUBLISHED rows whose publish_at has passed — drafts and
 * scheduled items can never leak through these functions. Preview reads use
 * the service-role client and require the preview secret (see previewOk).
 */

export const INSIGHTS_PAGE_SIZE = 12;

export interface InsightSummary {
  id: string;
  group_id: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  cover_alt: string | null;
  category_key: string | null;
  publish_at: string | null;
  reading_minutes: number;
  featured: boolean;
  author_name: string;
}

const SUMMARY_COLS = 'id,group_id,locale,slug,title,excerpt,cover_url,cover_alt,category_key,publish_at,reading_minutes,featured,author_name';

export const getInsightCategories = cache(async (): Promise<InsightCategoryRow[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from('insight_categories').select('key,names,sort_order').order('sort_order');
  return (data as InsightCategoryRow[] | null) ?? [];
});

export function categoryName(categories: InsightCategoryRow[], key: string | null, locale: Locale): string {
  const cat = categories.find((c) => c.key === key);
  return cat ? cat.names[locale] ?? cat.names.en : '';
}

/**
 * Does this locale have at least one published (and due) article? Drives the
 * Insights link in the header/footer and the sitemap: an empty section is not
 * advertised, and the link appears by itself once a post is published.
 * Fails closed (false) when Supabase is unreachable. The admin editor is
 * never affected.
 */
export const hasPublishedInsights = cache(async (locale: Locale): Promise<boolean> => {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('insights')
      .select('id')
      .eq('locale', locale)
      .eq('status', 'PUBLISHED')
      .lte('publish_at', new Date().toISOString())
      .limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
});

export async function listInsights(locale: Locale, opts: { category?: string; page?: number } = {}): Promise<{ items: InsightSummary[]; total: number }> {
  const supabase = getSupabase();
  if (!supabase) return { items: [], total: 0 };
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * INSIGHTS_PAGE_SIZE;
  let query = supabase
    .from('insights')
    .select(SUMMARY_COLS, { count: 'exact' })
    .eq('locale', locale)
    .eq('status', 'PUBLISHED')
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false })
    .range(from, from + INSIGHTS_PAGE_SIZE - 1);
  if (opts.category) query = query.eq('category_key', opts.category);
  const { data, count } = await query;
  return { items: (data as InsightSummary[] | null) ?? [], total: count ?? 0 };
}

export async function getFeaturedInsight(locale: Locale): Promise<InsightSummary | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from('insights')
    .select(SUMMARY_COLS)
    .eq('locale', locale)
    .eq('status', 'PUBLISHED')
    .eq('featured', true)
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as InsightSummary | null) ?? null;
}

export async function getInsight(locale: Locale, slug: string): Promise<InsightRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from('insights').select('*').eq('locale', locale).eq('slug', slug).maybeSingle();
  return (data as InsightRow | null) ?? null;
}

/** Preview: any status, service role, gated by INSIGHTS_PREVIEW_SECRET. */
export function previewOk(token: string | undefined | null): boolean {
  const secret = process.env.INSIGHTS_PREVIEW_SECRET;
  return Boolean(secret && token && token === secret);
}

export async function getInsightForPreview(id: string): Promise<InsightRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('insights').select('*').eq('id', id).maybeSingle();
  return (data as InsightRow | null) ?? null;
}

/** Same translation group in other locales (published only) → hreflang. */
export async function getInsightAlternates(groupId: string): Promise<Array<{ locale: Locale; slug: string; source_insight_id?: string | null }>> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const query = (columns: string) =>
    supabase.from('insights').select(columns).eq('group_id', groupId).eq('status', 'PUBLISHED').lte('publish_at', new Date().toISOString());
  const v15 = await query('locale,slug,source_insight_id');
  if (!v15.error) return (v15.data as unknown as Array<{ locale: Locale; slug: string; source_insight_id: string | null }> | null) ?? [];
  const legacy = await query('locale,slug');
  return (legacy.data as unknown as Array<{ locale: Locale; slug: string }> | null) ?? [];
}

export async function getRelatedInsights(article: InsightRow, limit = 3): Promise<InsightSummary[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const now = new Date().toISOString();
  const picked: InsightSummary[] = [];
  if (article.related_insight_id) {
    const { data } = await supabase.from('insights').select(SUMMARY_COLS).eq('id', article.related_insight_id).eq('status', 'PUBLISHED').lte('publish_at', now).maybeSingle();
    if (data) picked.push(data as InsightSummary);
  }
  const { data } = await supabase
    .from('insights')
    .select(SUMMARY_COLS)
    .eq('locale', article.locale)
    .eq('status', 'PUBLISHED')
    .lte('publish_at', now)
    .neq('id', article.id)
    .order('publish_at', { ascending: false })
    .limit(12);
  const pool = ((data as InsightSummary[] | null) ?? []).filter((row) => !picked.some((p) => p.id === row.id));
  const sameCategory = pool.filter((row) => row.category_key && row.category_key === article.category_key);
  const rest = pool.filter((row) => !sameCategory.includes(row));
  return [...picked, ...sameCategory, ...rest].slice(0, limit);
}

/** For the sitemap: every published article per locale with its group. */
export async function getAllPublishedInsights(): Promise<Array<{ locale: Locale; slug: string; group_id: string; updated_at: string; source_insight_id?: string | null }>> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const query = (columns: string) => supabase.from('insights').select(columns).eq('status', 'PUBLISHED').lte('publish_at', new Date().toISOString());
  type Row = { locale: Locale; slug: string; group_id: string; updated_at: string; source_insight_id?: string | null };
  const v15 = await query('locale,slug,group_id,updated_at,source_insight_id');
  if (!v15.error) return (v15.data as unknown as Row[] | null) ?? [];
  const legacy = await query('locale,slug,group_id,updated_at');
  return (legacy.data as unknown as Row[] | null) ?? [];
}

export function formatInsightDate(iso: string | null, locale: Locale): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
