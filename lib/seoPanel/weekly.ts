import type { GscAdapter } from '@/lib/seoPanel/gsc';
import { addDays, aggregate, completedWeeks, TYPICAL_LAG_DAYS, dataThroughFrom, filtersKey, pathOf, weekRange, WEEKLY_FILTERS } from '@/lib/seoPanel/model';
import { keywordFilters, keywordMetricsByCountry, lastFinalDay } from '@/lib/seoPanel/report';

/**
 * Yoca Kokpit SEO — weekly record (server only).
 *
 * One record per COMPLETED week (Monday–Sunday), FINAL data, one fixed filter
 * set (all countries, all devices, web): site totals, top 250 queries, top 250
 * pages and every active target keyword (exact query match, with the
 * keyword's own target country; all countries when it has none). Each row carries
 * days_with_data and data_through. Upserted on
 * (site_id, week_start, dimension, key, filters): running it again for the same
 * week replaces the same rows, never adds new ones (idempotent). A week whose
 * Sunday is after the last final data day is skipped, never stored half.
 *
 * Not stored: daily raw data, rows outside the top 250, anonymised queries.
 * No notification, no e-mail.
 */

export const WEEKLY_TOP = 250;
export interface WeeklyRow { site_id: string; week_start: string; dimension: 'total' | 'query' | 'page' | 'keyword'; key: string; filters: string; clicks: number; impressions: number; ctr: number; position: number | null; days_with_data: number; data_through: string | null; fetched_at: string }
export interface WeeklyStore { upsert(rows: WeeklyRow[]): Promise<void> }
export type WeekOutcome = { week: string; status: 'saved'; rows: number; daysWithData: number; dataThrough: string | null } | { week: string; status: 'not_final'; dataThrough: string | null };

const round = (n: number | null, d: number) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export async function snapshotWeek(adapter: GscAdapter, store: WeeklyStore, siteId: string, monday: string, activeKeywords: Array<{ keyword: string; country: string }>, finalThrough: string | null, now = new Date()): Promise<WeekOutcome> {
  const range = weekRange(monday);
  if (!finalThrough || finalThrough < range.end) return { week: monday, status: 'not_final', dataThrough: finalThrough };
  const f = WEEKLY_FILTERS;
  const [total, daily, queries, pages] = await Promise.all([
    adapter.query({ range, filters: f, dimensions: [], rowLimit: 1 }),
    adapter.query({ range, filters: f, dimensions: ['date'], rowLimit: 10 }),
    adapter.query({ range, filters: f, dimensions: ['query'], rowLimit: WEEKLY_TOP }),
    adapter.query({ range, filters: f, dimensions: ['page'], rowLimit: WEEKLY_TOP }),
  ]);
  const days = daily.filter((r) => r.impressions > 0).map((r) => r.keys?.[0] ?? '');
  const daysWithData = days.length;
  const dataThrough = dataThroughFrom(days);
  const base = { site_id: siteId, week_start: monday, filters: filtersKey(f), days_with_data: daysWithData, data_through: dataThrough, fetched_at: now.toISOString() };
  const row = (dimension: WeeklyRow['dimension'], key: string, m: { clicks: number; impressions: number; ctr: number; position: number | null }): WeeklyRow => ({
    ...base, dimension, key, clicks: m.clicks, impressions: m.impressions, ctr: round(m.ctr, 6) ?? 0, position: round(m.position, 3),
  });
  const rows: WeeklyRow[] = [row('total', '', aggregate(total))];
  const seen = new Set<string>();
  for (const q of queries.slice(0, WEEKLY_TOP)) {
    const key = q.keys?.[0] ?? '';
    if (!key || seen.has(`q:${key}`)) continue;
    seen.add(`q:${key}`);
    rows.push(row('query', key, aggregate([q])));
  }
  for (const p of pages.slice(0, WEEKLY_TOP)) {
    const key = pathOf(p.keys?.[0] ?? '');
    if (seen.has(`p:${key}`)) continue;
    seen.add(`p:${key}`);
    rows.push(row('page', key, aggregate([p])));
  }
  // active keywords: each with its OWN target country (all countries when empty); stored with that filter set
  const km = await keywordMetricsByCountry(adapter, range, f, activeKeywords, WEEKLY_TOP);
  for (const [ck, m] of Array.from(km.entries())) {
    const [country, k] = [ck.slice(0, ck.indexOf('|')), ck.slice(ck.indexOf('|') + 1)];
    rows.push({ ...row('keyword', k, m ?? { clicks: 0, impressions: 0, ctr: 0, position: null }), filters: filtersKey(keywordFilters(f, country)) });
  }
  await store.upsert(rows);
  return { week: monday, status: 'saved', rows: rows.length, daysWithData, dataThrough };
}

/** The last two completed weeks (late final data is caught up the following week). */
export async function snapshotRecent(adapter: GscAdapter, store: WeeklyStore, siteId: string, activeKeywords: Array<{ keyword: string; country: string }>, today: string, count = 2): Promise<WeekOutcome[]> {
  // No row in the last 10 days (very small site): assume the typical lag + 1 day of safety.
  const finalThrough = (await lastFinalDay(adapter, today, 'web')) ?? addDays(today, -(TYPICAL_LAG_DAYS + 1));
  const out: WeekOutcome[] = [];
  for (const week of completedWeeks(today, count)) out.push(await snapshotWeek(adapter, store, siteId, week, activeKeywords, finalThrough));
  return out;
}

/** Supabase store (user client for the manual run, service role for the cron). */
export function supabaseStore(client: { from(t: string): { upsert(rows: unknown[], o: { onConflict: string }): PromiseLike<{ error: { message: string } | null }> } }): WeeklyStore {
  return {
    async upsert(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await client.from('seo_weekly').upsert(rows.slice(i, i + 200), { onConflict: 'site_id,week_start,dimension,key,filters' });
        if (error) throw new Error(`Haftalık kayıt yazılamadı: ${error.message}`);
      }
    },
  };
}
