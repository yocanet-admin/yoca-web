import type { GscAdapter } from '@/lib/seoPanel/gsc';
import {
  addDays, aggregate, comparisonQueries, dataThroughFrom, deltas, filtersKey, filtersText, missingDays, normQuery, opportunities, pathOf, presetRange,
  TYPICAL_LAG_DAYS, DEFAULT_FILTERS, type DateRange, type Deltas, type KeywordStatus, type Metrics, type Opportunity, type Preset, type Row, type SeoFilters,
} from '@/lib/seoPanel/model';

/**
 * Yoca Kokpit SEO — performance report (server only; any adapter).
 * Never calls the AI: suggestions are made only by the explicit
 * "AI önerisi iste" request (lib/seoPanel/ai.ts).
 */

export interface KeywordRow { id: string; keyword: string; language: string; country: string; target_path: string; source: string; status: KeywordStatus; note: string; created_at?: string; updated_at?: string }
export interface Period { range: DateRange; filters: SeoFilters; totals: Metrics; daily: Array<{ date: string; clicks: number; impressions: number }>; missingDays: string[]; pendingDays: string[] }
export interface Report {
  source: 'live' | 'fixture';
  property: string;
  dataThrough: string | null;
  lagDays: number | null;
  current: Period;
  previous: Period;
  filtersKey: string;
  filtersText: string;
  deltas: Deltas;
  queries: Array<Row & { prevPosition: number | null; prevClicks: number | null }>;
  pages: Array<Row & { path: string }>;
  /** Metrics per keyword: the keyword's OWN target country (all countries when empty) + the page's device / search type / data state / range; current and comparison period. */
  keywords: Array<KeywordRow & { metrics: Metrics | null; prevMetrics: Metrics | null }>;
  gscQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null; mapped: KeywordStatus | null }>;
  opportunities: Opportunity[];
}

export const TOP_ROWS = 25;
const LOOKUP_LIMIT = 30;

/** The last day with FINAL data (site-wide, chosen search type), from the date dimension of the last 10 days. */
export async function lastFinalDay(adapter: GscAdapter, today: string, searchType: SeoFilters['searchType']): Promise<string | null> {
  const rows = await adapter.query({ range: { start: addDays(today, -10), end: today }, filters: { ...DEFAULT_FILTERS, searchType, dataState: 'final' }, dimensions: ['date'], rowLimit: 20 });
  return dataThroughFrom(rows.filter((r) => r.impressions > 0).map((r) => r.keys?.[0] ?? '').filter(Boolean));
}

async function period(adapter: GscAdapter, range: DateRange, filters: SeoFilters, dataThrough: string | null): Promise<Period> {
  const [totalRows, dailyRows] = await Promise.all([
    adapter.query({ range, filters, dimensions: [], rowLimit: 1 }),
    adapter.query({ range, filters, dimensions: ['date'], rowLimit: 500 }),
  ]);
  const daily = dailyRows.map((r) => ({ date: r.keys?.[0] ?? '', clicks: r.clicks, impressions: r.impressions })).sort((a, b) => a.date.localeCompare(b.date));
  const missing = missingDays(range, daily.filter((d) => d.impressions > 0).map((d) => d.date));
  const limit = dataThrough ?? addDays(range.end, 1);
  return {
    range,
    filters,
    totals: aggregate(totalRows),
    daily,
    // days not final yet (after "son tam veri günü") are listed apart from days that simply had no data
    missingDays: missing.filter((d) => d <= limit),
    pendingDays: filters.dataState === 'final' ? missing.filter((d) => d > limit) : [],
  };
}

/** Exact-match metrics for target keywords: first from the top queries, then (bounded) one equals-filter lookup each. */
export async function keywordMetrics(adapter: GscAdapter, range: DateRange, filters: SeoFilters, keywords: string[], topQueries: Row[]): Promise<Map<string, Metrics | null>> {
  const byQuery = new Map(topQueries.map((r) => [normQuery(r.keys?.[0] ?? ''), r]));
  const out = new Map<string, Metrics | null>();
  const misses: string[] = [];
  for (const k of Array.from(new Set(keywords.map(normQuery)))) {
    const hit = byQuery.get(k);
    if (hit) out.set(k, aggregate([hit]));
    else misses.push(k);
  }
  for (const k of misses.slice(0, LOOKUP_LIMIT)) {
    const rows = await adapter.query({ range, filters, dimensions: ['query'], rowLimit: 5, equals: [{ dimension: 'query', expression: k }] });
    const exact = rows.filter((r) => normQuery(r.keys?.[0] ?? '') === k);
    out.set(k, exact.length && aggregate(exact).impressions ? aggregate(exact) : null);
  }
  for (const k of misses.slice(LOOKUP_LIMIT)) out.set(k, null);
  return out;
}

/** Filters used for one keyword: its target country replaces the page's country; everything else is the page's. */
export const keywordFilters = (filters: SeoFilters, country: string): SeoFilters => ({ ...filters, country: /^[a-z]{3}$/.test(country) ? country : '' });
export const kwKey = (country: string, keyword: string) => `${/^[a-z]{3}$/.test(country) ? country : ''}|${normQuery(keyword)}`;

/** Exact-match metrics per (target country, keyword): one top-query fetch per country, then bounded lookups. */
export async function keywordMetricsByCountry(adapter: GscAdapter, range: DateRange, filters: SeoFilters, keywords: Array<{ keyword: string; country: string }>, topRows = 1000): Promise<Map<string, Metrics | null>> {
  const byCountry = new Map<string, string[]>();
  for (const k of keywords) {
    const c = keywordFilters(filters, k.country).country;
    byCountry.set(c, [...(byCountry.get(c) ?? []), k.keyword]);
  }
  const out = new Map<string, Metrics | null>();
  for (const [country, list] of Array.from(byCountry.entries())) {
    const f = keywordFilters(filters, country);
    const top = await adapter.query({ range, filters: f, dimensions: ['query'], rowLimit: topRows });
    const m = await keywordMetrics(adapter, range, f, list, top);
    for (const [k, v] of Array.from(m.entries())) out.set(`${country}|${k}`, v);
  }
  return out;
}

export async function buildReport(
  adapter: GscAdapter,
  opts: { today: string; filters: SeoFilters; preset?: Preset; range?: DateRange; keywords: KeywordRow[] },
): Promise<Report> {
  const filters = opts.filters;
  const dataThrough = await lastFinalDay(adapter, opts.today, filters.searchType);
  // final data (default): the preset ends on "son tam veri günü"; fresh data may include yesterday
  const end = filters.dataState === 'all' ? addDays(opts.today, -1) : dataThrough ?? addDays(opts.today, -TYPICAL_LAG_DAYS);
  const range = opts.range ?? presetRange(opts.preset ?? 28, end);
  const { current, previous } = comparisonQueries(range, filters);

  const [cur, prev, queryRows, prevQueryRows, pageRows] = await Promise.all([
    period(adapter, current.range, current.filters, dataThrough),
    period(adapter, previous.range, previous.filters, dataThrough),
    adapter.query({ range: current.range, filters: current.filters, dimensions: ['query'], rowLimit: 1000 }),
    adapter.query({ range: previous.range, filters: previous.filters, dimensions: ['query'], rowLimit: 1000 }),
    adapter.query({ range: current.range, filters: current.filters, dimensions: ['page'], rowLimit: 1000 }),
  ]);

  const active = opts.keywords.filter((k) => k.status === 'active');
  const kwList = active.map((k) => ({ keyword: k.keyword, country: k.country }));
  const [km, kmPrev] = await Promise.all([
    keywordMetricsByCountry(adapter, current.range, current.filters, kwList),
    keywordMetricsByCountry(adapter, previous.range, previous.filters, kwList),
  ]);
  const keywords = opts.keywords.map((k) => ({
    ...k,
    metrics: k.status === 'active' ? km.get(kwKey(k.country, k.keyword)) ?? null : null,
    prevMetrics: k.status === 'active' ? kmPrev.get(kwKey(k.country, k.keyword)) ?? null : null,
  }));

  const prevByQuery = new Map(prevQueryRows.map((r) => [r.keys?.[0] ?? '', r]));
  // status of the same keyword in the mapping (active wins over paused over proposed)
  const weight: Record<KeywordStatus, number> = { active: 3, paused: 2, proposed: 1 };
  const mapped = new Map<string, KeywordStatus>();
  for (const k of opts.keywords) {
    const n = normQuery(k.keyword);
    const cur = mapped.get(n);
    if (!cur || weight[k.status] > weight[cur]) mapped.set(n, k.status);
  }

  return {
    source: adapter.source,
    property: adapter.property,
    dataThrough,
    lagDays: dataThrough ? Math.round((Date.parse(opts.today) - Date.parse(dataThrough)) / 86_400_000) : null,
    current: cur,
    previous: prev,
    filtersKey: filtersKey(filters),
    filtersText: filtersText(filters),
    deltas: deltas(cur.totals, prev.totals),
    queries: queryRows.slice(0, TOP_ROWS).map((r) => {
      const p = prevByQuery.get(r.keys?.[0] ?? '');
      return { ...r, prevPosition: p?.position ?? null, prevClicks: p ? p.clicks : null };
    }),
    pages: pageRows.slice(0, TOP_ROWS).map((r) => ({ ...r, path: pathOf(r.keys?.[0] ?? '') })),
    keywords,
    gscQueries: queryRows.slice(0, 50).map((r) => ({ query: r.keys?.[0] ?? '', clicks: r.clicks, impressions: r.impressions, position: r.position ?? null, mapped: mapped.get(normQuery(r.keys?.[0] ?? '')) ?? null })),
    opportunities: opportunities({ queries: queryRows, pages: pageRows, keywords: keywords.map((k) => ({ id: k.id, keyword: k.keyword, targetPath: k.target_path, status: k.status, metrics: k.metrics })) }),
  };
}
