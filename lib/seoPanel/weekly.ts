import type { GscAdapter } from '@/lib/seoPanel/gsc';
import { aggregate, completedWeeks, filtersKey, pathOf, weekIsFinal, weekRange, WEEKLY_FILTERS, type Freshness } from '@/lib/seoPanel/model';
import { freshnessOf, keywordFilters, keywordMetricsByCountry } from '@/lib/seoPanel/report';

/**
 * Yoca Kokpit SEO — weekly record (server only).
 *
 * One record per COMPLETED week (Monday–Sunday), FINAL data, one fixed filter
 * set (all countries, all devices, web): site totals, top 250 queries, top 250
 * pages and every active target keyword (exact query match, with the
 * keyword's own target country; all countries when it has none). Each row carries
 * days_with_data (days with impressions) and data_through (confirmed final
 * through = the week's Sunday). The week's WHOLE set is replaced in one
 * transaction (RPC seo_weekly_replace): running it again gives the same rows,
 * rows that dropped out of the top 250 disappear, and a failed write leaves
 * the previous set intact. A week is stored only when Search Console confirms
 * it final (metadata.first_incomplete_date after its Sunday); when finality
 * cannot be determined nothing is stored (status "skipped", reason given).
 *
 * Not stored: daily raw data, rows outside the top 250, anonymised queries.
 * No notification, no e-mail.
 */

export const WEEKLY_TOP = 250;
export interface WeeklyRow { site_id: string; week_start: string; dimension: 'total' | 'query' | 'page' | 'keyword'; key: string; filters: string; clicks: number; impressions: number; ctr: number; position: number | null; days_with_data: number; data_through: string | null; fetched_at: string }
/** Replaces the WHOLE stored set of (site, week) in one transaction (RPC seo_weekly_replace). */
export interface WeeklyStore { replaceWeek(siteId: string, week: string, rows: WeeklyRow[]): Promise<number> }
export type WeekOutcome =
  | { week: string; status: 'saved'; rows: number; daysWithData: number; dataThrough: string }
  | { week: string; status: 'not_final'; firstIncompleteDate: string | null }
  | { week: string; status: 'skipped'; reason: 'finality_unknown' };

const round = (n: number | null, d: number) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export async function snapshotWeek(adapter: GscAdapter, store: WeeklyStore, siteId: string, monday: string, activeKeywords: Array<{ keyword: string; country: string }>, fresh: Freshness, now = new Date()): Promise<WeekOutcome> {
  const range = weekRange(monday);
  if (!fresh.known) return { week: monday, status: 'skipped', reason: 'finality_unknown' };
  if (!weekIsFinal(monday, fresh)) return { week: monday, status: 'not_final', firstIncompleteDate: fresh.firstIncompleteDate };
  const f = WEEKLY_FILTERS;
  const [total, daily, queries, pages] = await Promise.all([
    adapter.query({ range, filters: f, dimensions: [], rowLimit: 1 }),
    adapter.query({ range, filters: f, dimensions: ['date'], rowLimit: 10 }),
    adapter.query({ range, filters: f, dimensions: ['query'], rowLimit: WEEKLY_TOP }),
    adapter.query({ range, filters: f, dimensions: ['page'], rowLimit: WEEKLY_TOP }),
  ]);
  const days = daily.filter((r) => r.impressions > 0).map((r) => r.keys?.[0] ?? '');
  const daysWithData = days.length;
  // the whole week is confirmed final (Search Console's first incomplete date is after its Sunday)
  const dataThrough = range.end;
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
  const saved = await store.replaceWeek(siteId, monday, rows);
  return { week: monday, status: 'saved', rows: saved, daysWithData, dataThrough };
}

/** The last two completed weeks (late final data is caught up the following week). */
export async function snapshotRecent(adapter: GscAdapter, store: WeeklyStore, siteId: string, activeKeywords: Array<{ keyword: string; country: string }>, today: string, count = 2): Promise<WeekOutcome[]> {
  // finality from Search Console; unknown → nothing is stored (skipped with the reason)
  const fresh = await freshnessOf(adapter, today, 'web');
  const out: WeekOutcome[] = [];
  for (const week of completedWeeks(today, count)) out.push(await snapshotWeek(adapter, store, siteId, week, activeKeywords, fresh));
  return out;
}

/** Supabase store (user client for the manual run, service role for the cron). */
export function supabaseStore(client: { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }): WeeklyStore {
  return {
    async replaceWeek(siteId, week, rows) {
      // one call = one transaction: old set deleted + new set inserted, or nothing changes
      const payload = rows.map(({ site_id: _s, week_start: _w, ...r }) => r);
      const { data, error } = await client.rpc('seo_weekly_replace', { p_site_id: siteId, p_week_start: week, p_rows: payload });
      if (error) throw new Error(`Haftalık kayıt yazılamadı (önceki kayıt korunur): ${error.message}`);
      return Number(data) || 0;
    },
  };
}
