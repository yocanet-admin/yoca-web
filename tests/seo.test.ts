/**
 * Kokpit SEO (Faz 0): ranges + same-filter comparison, data lag and missing
 * days, weekly idempotency, wording, audit allowlist / limits / robots,
 * PageSpeed lab vs field, admin-only routes, AI only on request + budget.
 * Synthetic data only; no request leaves the process.
 * Run: npx tsx --test tests/seo.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
  addDays, aggregate, comparisonQueries, completedWeeks, customRange, dayCount, DEFAULT_FILTERS, deltas, filtersKey, filtersText, missingDays, mondayOf, NO_DATA,
  normalizeFilters, opportunities, keywordFiltersText, classifyDays, freshnessFrom, weekIsFinal, FINALITY_UNKNOWN, POSITION_LABEL, POSITION_NOTE, positionText, presetRange, previousRange, sitePath, validateKeyword, weekRange, ctrText,
} from '../lib/seoPanel/model';
import { fixtureAdapter, gscStatus, parseFirstIncomplete, requestBody, fixtureEnabled, type GscAdapter, type GscQuery } from '../lib/seoPanel/gsc';
import { fixtureEmptyDay, fixtureFetch, fixtureFirstIncomplete, fixturePsi, fixtureQuery } from '../lib/seoPanel/fixture';
import { buildReport, freshnessOf } from '../lib/seoPanel/report';
import { snapshotRecent, snapshotWeek, supabaseStore, type WeeklyRow, type WeeklyStore } from '../lib/seoPanel/weekly';
import { AUDIT_LIMITS, auditHosts, clampPages, fetchAllowed, hostAllowed, parseRobots, robotsAllows, runAudit, USER_AGENT, type AuditResult } from '../lib/seoPanel/audit';
import { FIELD_LABEL, LAB_LABEL, NO_FIELD, parsePsi, psiUrl } from '../lib/seoPanel/pagespeed';
import { readServiceAccount, signedAssertion, GSC_SCOPE } from '../lib/seoPanel/googleAuth';
import { suggest, type SuggestDeps } from '../lib/seoPanel/ai';
import { acquireRun, ALREADY_RUNNING, AUDIT_RUN_TIMEOUT_S, saveResult, type AuditDb } from '../lib/seoPanel/auditStore';
import { heartbeat, heartbeatUrl, pingBody, seoOutcome } from '../lib/cockpit/heartbeat';
import { formatTr, longTr, monthGrid, monthTitle, moveFocus, parseTr, validateTyped, weekday } from '../lib/admin/calendar';
import { OpenAIError } from '../lib/ai/openai';
import { mockStructured } from '../lib/ai/mock';
import { defaultAiSettings } from '../lib/ai/settings';

const TODAY = '2026-11-08'; // Sunday
const HOSTS = ['yoca.net', 'www.yoca.net'];
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
/** Source without comments (the rules are explained in comments; only code and UI text count). */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Records every query an adapter receives. */
function recording(inner: GscAdapter) {
  const calls: GscQuery[] = [];
  return { calls, adapter: { ...inner, query: (q: GscQuery) => { calls.push(q); return inner.query(q); } } as GscAdapter };
}

/* ── ranges + comparison ───────────────────────────────────────── */

test('presets end on the last final day; previous period has the same length right before', () => {
  const r = presetRange(28, '2026-11-05');
  assert.deepEqual(r, { start: '2026-10-09', end: '2026-11-05' });
  assert.equal(dayCount(r), 28);
  assert.deepEqual(previousRange(r), { start: '2026-09-11', end: '2026-10-08' });
  assert.equal(dayCount(presetRange(7, '2026-11-05')), 7);
  assert.equal(dayCount(previousRange(presetRange(90, '2026-11-05'))), 90);
});

test('custom range: valid dates, ordered, not in the future, inside 16 months', () => {
  assert.equal(customRange('2026-10-01', '2026-10-31', TODAY).ok, true);
  assert.equal(customRange('2026-10-31', '2026-10-01', TODAY).ok, false);
  assert.equal(customRange('2026-10-01', '2026-11-30', TODAY).ok, false);
  assert.equal(customRange('2024-01-01', '2024-02-01', TODAY).ok, false);
  assert.equal(customRange('2026-02-30', '2026-03-01', TODAY).ok, false);
  assert.equal(customRange('x', '2026-03-01', TODAY).ok, false);
});

test('comparison: current and previous use IDENTICAL country / device / searchType / dataState; request bodies differ only in dates', () => {
  const f = normalizeFilters({ country: 'TUR', device: 'mobile', searchType: 'web', dataState: 'final' });
  const { current, previous } = comparisonQueries(presetRange(28, '2026-11-05'), f);
  assert.deepEqual(current.filters, previous.filters);
  assert.notEqual(current.filters, previous.filters, 'separate copies (no shared mutation)');
  const a = requestBody({ range: current.range, filters: current.filters, dimensions: ['query'], rowLimit: 1000 });
  const b = requestBody({ range: previous.range, filters: previous.filters, dimensions: ['query'], rowLimit: 1000 });
  const strip = (x: Record<string, unknown>) => ({ ...x, startDate: undefined, endDate: undefined });
  assert.deepEqual(strip(a), strip(b));
  assert.equal(a.type, 'web');
  assert.equal(a.dataState, 'final');
  assert.deepEqual(a.dimensionFilterGroups, [{ groupType: 'and', filters: [{ dimension: 'country', operator: 'equals', expression: 'tur' }, { dimension: 'device', operator: 'equals', expression: 'MOBILE' }] }]);
});

test('report: every period query carries the same filters; the filter text is shown next to the comparison', async () => {
  const { adapter, calls } = recording(fixtureAdapter('https://yoca.net/', TODAY));
  const f = normalizeFilters({ country: 'tur', device: 'desktop' });
  const r = await buildReport(adapter, { today: TODAY, filters: f, preset: 28, keywords: [] });
  const periodCalls = calls.filter((c) => c.range.end !== TODAY); // all but the data-lag probe
  assert.ok(periodCalls.length >= 6);
  for (const c of periodCalls) assert.deepEqual(c.filters, f);
  assert.ok(periodCalls.some((c) => c.range.start === r.previous.range.start));
  assert.equal(r.filtersText, filtersText(f));
  assert.match(r.filtersText, /Ülke: Türkiye · Cihaz: Masaüstü · Arama türü: Web · Veri: Kesin veri/);
  assert.equal(filtersKey(DEFAULT_FILTERS), 'country=all;device=all;type=web;state=final');
});

test('defaults: final data, web, all countries and devices', () => {
  assert.deepEqual(normalizeFilters({}), { country: '', device: '', searchType: 'web', dataState: 'final' });
  assert.deepEqual(normalizeFilters({ country: 'turkey', device: 'phone', searchType: 'x', dataState: 'fresh' }), DEFAULT_FILTERS);
});

/* ── data freshness: finality from Search Console, zero-data vs not-final days ── */

const emptyAdapter = (firstIncompleteDate: string | null = null): GscAdapter => ({ source: 'fixture', property: 'x', query: async () => [], queryWithMeta: async () => ({ rows: [], firstIncompleteDate }) });

test('finality is read from Search Console metadata (dataState "all" + date dimension), not from the last day with impressions', async () => {
  const { adapter } = recording(fixtureAdapter('https://yoca.net/', TODAY));
  const seen: GscQuery[] = [];
  const spy: GscAdapter = { ...adapter, queryWithMeta: (q) => { seen.push(q); return adapter.queryWithMeta(q); } };
  const f = await freshnessOf(spy, TODAY, 'web');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].filters.dataState, 'all');
  assert.deepEqual(seen[0].dimensions, ['date']);
  assert.equal(seen[0].range.end, TODAY);
  assert.deepEqual(f, { known: true, firstIncompleteDate: fixtureFirstIncomplete(TODAY), finalThrough: addDays(fixtureFirstIncomplete(TODAY), -1), estimate: null });
  const r = await buildReport(spy, { today: TODAY, filters: DEFAULT_FILTERS, preset: 7, keywords: [] });
  assert.equal(r.current.range.end, f.finalThrough, 'presets end on the verified last final day');
  assert.equal(r.rangeEstimated, false);
  // the live adapter reads metadata.first_incomplete_date / firstIncompleteDate; anything else = unknown
  assert.equal(parseFirstIncomplete({ first_incomplete_date: '2026-11-06' }), '2026-11-06');
  assert.equal(parseFirstIncomplete({ firstIncompleteDate: '2026-11-06' }), '2026-11-06');
  assert.equal(parseFirstIncomplete({}), null);
  assert.equal(parseFirstIncomplete({ firstIncompleteDate: '6.11.2026' }), null);
  assert.equal(parseFirstIncomplete(undefined), null);
  // a day with impressions but not final yet is NOT "final": with no data the last impression day says nothing
  const sparse = await buildReport(emptyAdapter('2026-11-06'), { today: TODAY, filters: DEFAULT_FILTERS, preset: 7, keywords: [] });
  assert.equal(sparse.freshness.finalThrough, '2026-11-05');
  assert.deepEqual(sparse.current.zeroDays.length, 7, 'final days without rows = zero-data days');
});

test('finality unknown → "Kesinleşme tarihi belirlenemedi", estimate only labelled, nothing classified as zero or pending', async () => {
  assert.equal(FINALITY_UNKNOWN, 'Kesinleşme tarihi belirlenemedi');
  const a = fixtureAdapter('https://yoca.net/', TODAY, 'unknown');
  const r = await buildReport(a, { today: TODAY, filters: DEFAULT_FILTERS, preset: 7, keywords: [] });
  assert.equal(r.freshness.known, false);
  assert.equal(r.freshness.finalThrough, null);
  assert.equal(r.freshness.estimate, addDays(TODAY, -3));
  assert.equal(r.rangeEstimated, true);
  assert.equal(r.current.range.end, addDays(TODAY, -3));
  assert.deepEqual(r.current.zeroDays, []);
  assert.deepEqual(r.current.pendingDays, []);
  const page = read('components/admin/seo/Performance.tsx');
  assert.match(page, /FINALITY_UNKNOWN/);
  assert.match(page, /tahmini<\/Badge>/);
});

test('fresh data ("all") ends yesterday and includes not-final days (listed as pending, with partial rows)', async () => {
  const a = fixtureAdapter('https://yoca.net/', TODAY);
  const r = await buildReport(a, { today: TODAY, filters: { ...DEFAULT_FILTERS, dataState: 'all' }, preset: 7, keywords: [] });
  assert.equal(r.current.range.end, addDays(TODAY, -1));
  assert.deepEqual(r.current.pendingDays, [fixtureFirstIncomplete(TODAY), addDays(TODAY, -1)]);
  assert.ok(r.current.daily.some((d) => d.date === addDays(TODAY, -1) && d.impressions > 0), 'fresh rows present');
  const fin = await buildReport(a, { today: TODAY, filters: DEFAULT_FILTERS, range: { start: addDays(TODAY, -6), end: addDays(TODAY, -1) }, keywords: [] });
  assert.ok(!fin.current.daily.some((d) => d.date >= fixtureFirstIncomplete(TODAY)), 'final data never contains not-final days');
});

test('zero-data days (final, no impressions) and not-final days are listed separately', async () => {
  assert.deepEqual(missingDays({ start: '2026-11-01', end: '2026-11-04' }, ['2026-11-01', '2026-11-03']), ['2026-11-02', '2026-11-04']);
  const f = freshnessFrom('2026-11-06', TODAY);
  assert.deepEqual(classifyDays({ start: '2026-11-03', end: '2026-11-07' }, ['2026-11-03', '2026-11-05'], f), { zeroDays: ['2026-11-04'], pendingDays: ['2026-11-06', '2026-11-07'], unknownDays: [] });
  assert.deepEqual(classifyDays({ start: '2026-11-03', end: '2026-11-05' }, ['2026-11-03'], freshnessFrom(null, TODAY)), { zeroDays: [], pendingDays: [], unknownDays: ['2026-11-04', '2026-11-05'] });
  const a = fixtureAdapter('https://yoca.net/', TODAY);
  const r = await buildReport(a, { today: TODAY, filters: DEFAULT_FILTERS, range: { start: '2026-10-01', end: '2026-11-07' }, keywords: [] });
  const expectedZero = [] as string[];
  for (let d = '2026-10-01'; d < fixtureFirstIncomplete(TODAY); d = addDays(d, 1)) if (fixtureEmptyDay(d)) expectedZero.push(d);
  assert.ok(expectedZero.length >= 2);
  assert.deepEqual(r.current.zeroDays, expectedZero);
  assert.deepEqual(r.current.pendingDays, ['2026-11-06', '2026-11-07']);
});

/* ── weekly record ────────────────────────────────────────────── */

/** In-memory model of seo_weekly_replace: the week's whole set is swapped, or nothing changes. */
function memoryStore(opts: { failOn?: (rows: WeeklyRow[]) => boolean } = {}) {
  const rows = new Map<string, WeeklyRow>();
  const calls: number[] = [];
  const store: WeeklyStore = {
    async replaceWeek(siteId, week, list) {
      if (opts.failOn?.(list)) throw new Error('Haftalık kayıt yazılamadı (önceki kayıt korunur): simulated');
      const staged = new Map(Array.from(rows.entries()).filter(([, r]) => !(r.site_id === siteId && r.week_start === week)));
      for (const r of list) {
        const k = [r.site_id, r.week_start, r.dimension, r.key, r.filters].join('|');
        if (staged.has(k)) throw new Error('duplicate key');
        staged.set(k, r);
      }
      rows.clear();
      for (const [k, r] of Array.from(staged.entries())) rows.set(k, r);
      calls.push(list.length);
      return list.length;
    },
  };
  return { rows, store, calls };
}

test('weeks start on Monday; only completed weeks', () => {
  assert.equal(mondayOf('2026-11-08'), '2026-11-02');
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');
  assert.deepEqual(completedWeeks('2026-11-08'), ['2026-10-26', '2026-10-19']);
  assert.deepEqual(completedWeeks('2026-11-09'), ['2026-11-02', '2026-10-26']);
  assert.deepEqual(weekRange('2026-11-02'), { start: '2026-11-02', end: '2026-11-08' });
});

test('weekly snapshot is idempotent: the same week twice gives the same rows, never duplicates', async () => {
  const a = fixtureAdapter('https://yoca.net/', '2026-11-12');
  const { rows, store } = memoryStore();
  const kws = [{ keyword: 'marka kimliği tasarımı', country: 'tur' }, { keyword: 'mvp geliştirme', country: 'tur' }, { keyword: 'brand identity agency istanbul', country: '' }];
  const first = await snapshotRecent(a, store, 'site-1', kws, '2026-11-12');
  const snap1 = JSON.stringify(Array.from(rows.values()).map(({ fetched_at: _f, ...r }) => r).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
  const second = await snapshotRecent(a, store, 'site-1', kws, '2026-11-12');
  const snap2 = JSON.stringify(Array.from(rows.values()).map(({ fetched_at: _f, ...r }) => r).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
  assert.equal(snap2, snap1, 'identical result on a rerun');
  assert.deepEqual(first.map((w) => w.week), ['2026-11-02', '2026-10-26']);
  assert.deepEqual(second.map((w) => w.status), ['saved', 'saved']);
  const total = Array.from(rows.values()).filter((r) => r.dimension === 'total');
  assert.equal(total.length, 2);
  for (const t of total) {
    assert.equal(t.filters, 'country=all;device=all;type=web;state=final');
    assert.ok(t.days_with_data >= 0 && t.days_with_data <= 7);
    assert.equal(t.data_through, addDays(t.week_start, 6), 'confirmed final through the Sunday');
  }
  const kw = Array.from(rows.values()).filter((r) => r.dimension === 'keyword' && r.week_start === '2026-11-02');
  assert.deepEqual(kw.map((r) => r.key).sort(), ['brand identity agency istanbul', 'marka kimliği tasarımı', 'mvp geliştirme']);
  // each active keyword is stored with ITS target country; a keyword without one with all countries
  assert.equal(kw.find((r) => r.key === 'marka kimliği tasarımı')?.filters, 'country=tur;device=all;type=web;state=final');
  assert.equal(kw.find((r) => r.key === 'brand identity agency istanbul')?.filters, 'country=all;device=all;type=web;state=final');
  const turOnly = fixtureQuery({ range: weekRange('2026-11-02'), filters: { ...DEFAULT_FILTERS, country: 'tur' }, dimensions: ['query'], equals: [{ dimension: 'query', expression: 'marka kimliği tasarımı' }] }, '2026-11-12')[0];
  assert.equal(kw.find((r) => r.key === 'marka kimliği tasarımı')?.impressions, turOnly.impressions);
  assert.equal(kw.find((r) => r.key === 'mvp geliştirme')?.position, null, 'no data → position null, not 0');
});

test('weekly snapshot: a shrinking top list leaves no stale rows (whole week replaced)', async () => {
  const a = fixtureAdapter('https://yoca.net/', '2026-11-12');
  const { rows, store } = memoryStore();
  const fresh = freshnessFrom('2026-11-10', '2026-11-12');
  await snapshotWeek(a, store, 'site-1', '2026-11-02', [{ keyword: 'x eski kelime', country: 'tur' }], fresh);
  const before = Array.from(rows.values()).filter((r) => r.dimension === 'query').length;
  // the same week again, but Search Console now returns only the top 3 queries and the keyword was removed
  const small: GscAdapter = { ...a, query: async (q) => (q.dimensions[0] === 'query' && !q.equals ? (await a.query(q)).slice(0, 3) : a.query(q)) };
  await snapshotWeek(small, store, 'site-1', '2026-11-02', [], fresh);
  const after = Array.from(rows.values()).filter((r) => r.week_start === '2026-11-02');
  assert.ok(before > 3);
  assert.equal(after.filter((r) => r.dimension === 'query').length, 3, 'dropped queries do not linger');
  assert.equal(after.filter((r) => r.dimension === 'keyword').length, 0, 'removed keyword does not linger');
});

test('weekly snapshot: a failed write keeps the previous complete set', async () => {
  const a = fixtureAdapter('https://yoca.net/', '2026-11-12');
  let fail = false;
  const { rows, store } = memoryStore({ failOn: () => fail });
  const fresh = freshnessFrom('2026-11-10', '2026-11-12');
  await snapshotWeek(a, store, 'site-1', '2026-11-02', [], fresh);
  const before = JSON.stringify(Array.from(rows.entries()));
  fail = true;
  await assert.rejects(snapshotWeek(a, store, 'site-1', '2026-11-02', [], fresh), /önceki kayıt korunur/);
  assert.equal(JSON.stringify(Array.from(rows.entries())), before);
  // the Supabase store goes through ONE RPC call per week (one transaction), never row-by-row upserts
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const db = { rpc: async (fn: string, args: Record<string, unknown>) => { rpcCalls.push([fn, args]); return { data: 7, error: null }; } };
  assert.equal(await supabaseStore(db).replaceWeek('site-1', '2026-11-02', [{ site_id: 'site-1', week_start: '2026-11-02', dimension: 'total', key: '', filters: 'f', clicks: 1, impressions: 2, ctr: 0.5, position: 1, days_with_data: 7, data_through: '2026-11-08', fetched_at: 'x' }]), 7);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0][0], 'seo_weekly_replace');
  assert.deepEqual(Object.keys(rpcCalls[0][1]).sort(), ['p_rows', 'p_site_id', 'p_week_start']);
  const failing = { rpc: async () => ({ data: null, error: { message: 'check constraint' } }) };
  await assert.rejects(supabaseStore(failing).replaceWeek('s', '2026-11-02', []), /önceki kayıt korunur/);
});

test('weekly snapshot: only weeks Search Console confirms final; unknown finality → skipped with a reason; top lists capped at 250', async () => {
  const a = fixtureAdapter('https://yoca.net/', TODAY);
  const { rows, store } = memoryStore();
  const out = await snapshotWeek(a, store, 'site-1', '2026-11-02', [], freshnessFrom('2026-11-06', TODAY));
  assert.equal(out.status, 'not_final');
  assert.equal(rows.size, 0);
  assert.equal(weekIsFinal('2026-10-26', freshnessFrom('2026-11-02', TODAY)), true);
  assert.equal(weekIsFinal('2026-10-26', freshnessFrom('2026-11-01', TODAY)), false, 'the Sunday itself not final');
  const unknown = await snapshotRecent(fixtureAdapter('https://yoca.net/', '2026-11-12', 'unknown'), store, 'site-1', [], '2026-11-12');
  assert.deepEqual(unknown.map((w) => w.status), ['skipped', 'skipped']);
  assert.ok(unknown.every((w) => w.status === 'skipped' && w.reason === 'finality_unknown'));
  assert.equal(rows.size, 0);
  const calls: GscQuery[] = [];
  const spy: GscAdapter = { ...a, query: (q) => { calls.push(q); return a.query(q); } };
  await snapshotWeek(spy, store, 'site-1', '2026-10-26', [], freshnessFrom('2026-11-06', TODAY));
  for (const c of calls.filter((x) => x.dimensions[0] === 'query' || x.dimensions[0] === 'page')) assert.ok((c.rowLimit ?? 0) <= 250);
  for (const c of calls) assert.deepEqual(c.filters, DEFAULT_FILTERS);
});

/* ── wording ──────────────────────────────────────────────────── */

test('wording: "Ortalama pozisyon" with an average note; no data = "Seçilen dönemde veri yok"', () => {
  assert.equal(POSITION_LABEL, 'Ortalama pozisyon');
  assert.match(POSITION_NOTE, /ortalama/i);
  assert.match(POSITION_NOTE, /kesin sıra değildir/);
  assert.equal(NO_DATA, 'Seçilen dönemde veri yok');
  assert.equal(positionText(null), NO_DATA);
  assert.equal(positionText(8.44), '8,4');
  assert.equal(ctrText(0, 0), NO_DATA);
  assert.equal(aggregate([]).position, null);
  assert.equal(deltas(aggregate([]), aggregate([])).positionDiff, null);
});

test('wording: no rank / "Google’da görünmüyor" anywhere in the SEO panel', () => {
  const files = ['lib/seoPanel/model.ts', 'lib/seoPanel/report.ts', 'app/admin/seo/page.tsx', ...fs.readdirSync(path.join(root, 'components/admin/seo')).map((f) => `components/admin/seo/${f}`)];
  for (const f of files) {
    const src = code(f);
    assert.doesNotMatch(src, /görünmüyor/i, f);
    // the only allowed use is the note itself: "kesin sıra değildir" (it is NOT a rank)
    assert.doesNotMatch(src.replace(/kesin sıra değildir/g, ''), /\brank\b|sıra\b|sıralama|sırada/i, f);
  }
});

/* ── keyword mapping ──────────────────────────────────────────── */

test('target page must be a yoca.net path; other hosts are refused', () => {
  assert.equal(sitePath('/tr/services/brand-strategy-identity', HOSTS), '/tr/services/brand-strategy-identity');
  assert.equal(sitePath('https://yoca.net/en/products/', HOSTS), '/en/products');
  assert.equal(sitePath('https://www.yoca.net/tr', HOSTS), '/tr');
  assert.equal(sitePath('https://example.com/tr', HOSTS), null);
  assert.equal(sitePath('//evil.example/x', HOSTS), null);
  assert.equal(sitePath('tr/products', HOSTS), null);
  const ok = validateKeyword({ keyword: '  Marka   kimliği ', language: 'tr', country: 'TUR', targetPath: '/tr', status: 'paused', source: 'gsc' }, HOSTS);
  assert.ok(ok.ok && ok.value.keyword === 'Marka kimliği' && ok.value.country === 'tur' && ok.value.status === 'paused' && ok.value.source === 'gsc');
  assert.equal(validateKeyword({ keyword: 'x', language: 'de', targetPath: '/tr' }, HOSTS).ok, false);
  assert.equal(validateKeyword({ keyword: 'x', language: 'tr', country: 'tr', targetPath: '/tr' }, HOSTS).ok, false);
  assert.equal(validateKeyword({ keyword: 'x', language: 'tr', targetPath: 'https://example.com/' }, HOSTS).ok, false);
});

test('seeded suggestions: proposed (inactive), "hacim bilinmiyor", paths are real locale routes', () => {
  const sql = read('supabase/upgrade-v27-seo.sql');
  const services = read('lib/serviceSlugs.ts');
  const rows = Array.from(sql.matchAll(/\('([^']+)', '(tr|en)', '(tur|)', '(\/[^']*)'\)/g));
  assert.ok(rows.length >= 20);
  for (const [, , lang, country, p] of rows) {
    assert.equal(country, lang === 'tr' ? 'tur' : '');
    assert.ok(p === `/${lang}` || p === `/${lang}/products` || p.startsWith(`/${lang}/services/`), p);
    if (p.includes('/services/')) assert.ok(services.includes(`'${p.split('/').pop()}'`), p);
  }
  assert.match(sql, /'suggested', 'proposed', 'hacim bilinmiyor'/);
});

test('keyword metrics: exact query match; active target without rows → "no data", never invented', async () => {
  const a = fixtureAdapter('https://yoca.net/', TODAY);
  const kw = (id: string, keyword: string, status: 'active' | 'proposed' = 'active') => ({ id, keyword, language: 'tr', country: 'tur', target_path: '/tr', source: 'manual', status, note: '' });
  const r = await buildReport(a, { today: TODAY, filters: DEFAULT_FILTERS, preset: 28, keywords: [kw('1', 'Marka Kimliği Tasarımı'), kw('2', 'marka kimliği'), kw('3', 'yoca', 'proposed')] });
  assert.ok(r.keywords[0].metrics && r.keywords[0].metrics.impressions > 0, 'case-insensitive exact match');
  assert.equal(r.keywords[1].metrics, null, 'a prefix is not a match');
  assert.equal(r.keywords[2].metrics, null, 'proposed keywords are not measured');
  assert.ok(r.opportunities.some((o) => o.kind === 'target_no_data' && o.subject === 'marka kimliği'));
});

test('keyword metrics use the keyword\'s OWN target country (+ page device / type / state / range), in both periods', async () => {
  const { adapter, calls } = recording(fixtureAdapter('https://yoca.net/', TODAY));
  const kw = (id: string, keyword: string, country: string) => ({ id, keyword, language: 'tr', country, target_path: '/tr', source: 'manual', status: 'active' as const, note: '' });
  // page filter: USA + mobile; keyword 1 targets Türkiye, keyword 2 has no target country (all countries)
  const page = normalizeFilters({ country: 'usa', device: 'mobile' });
  const r = await buildReport(adapter, { today: TODAY, filters: page, preset: 28, keywords: [kw('1', 'marka kimliği tasarımı', 'tur'), kw('2', 'yoca', '')] });
  const exact = (range: { start: string; end: string }, country: string, q: string) => fixtureQuery({ range, filters: { ...page, country }, dimensions: ['query'], equals: [{ dimension: 'query', expression: q }] }, TODAY)[0];
  assert.equal(r.keywords[0].metrics?.impressions, exact(r.current.range, 'tur', 'marka kimliği tasarımı').impressions, 'Türkiye, not the page\'s USA');
  assert.equal(r.keywords[0].prevMetrics?.impressions, exact(r.previous.range, 'tur', 'marka kimliği tasarımı').impressions, 'comparison period: same keyword filters');
  assert.equal(r.keywords[1].metrics?.impressions, exact(r.current.range, '', 'yoca').impressions, 'no target country → all countries');
  assert.notEqual(r.keywords[0].metrics?.impressions, exact(r.current.range, 'usa', 'marka kimliği tasarımı')?.impressions);
  // every keyword query keeps the page's device / search type / data state
  const kwCalls = calls.filter((c) => c.dimensions[0] === 'query' && c.filters.country !== 'usa');
  assert.ok(kwCalls.length >= 4);
  for (const c of kwCalls) assert.deepEqual({ ...c.filters, country: '' }, { ...page, country: '' });
  assert.ok(kwCalls.some((c) => c.range.start === r.previous.range.start));
  // the page's own totals still use the page filter (USA)
  assert.equal(r.current.filters.country, 'usa');
  assert.equal(keywordFiltersText(page, '9 Eki–5 Kas'), 'Kelime değerleri: kelimenin hedef ülkesi (boşsa tüm ülkeler) · Mobil · Web · Kesin veri · 9 Eki–5 Kas');
});

test('opportunities: striking distance, low CTR, untargeted page, active target without data', () => {
  const o = opportunities({
    queries: [{ keys: ['a'], clicks: 1, impressions: 40, position: 12 }, { keys: ['b'], clicks: 0, impressions: 80, position: 5 }, { keys: ['c'], clicks: 1, impressions: 5, position: 12 }],
    pages: [{ keys: ['https://yoca.net/tr/x'], clicks: 0, impressions: 30 }, { keys: ['https://yoca.net/tr'], clicks: 9, impressions: 90 }],
    keywords: [{ id: '1', keyword: 'z', targetPath: '/tr', status: 'active', metrics: null }],
  });
  assert.deepEqual(o.map((x) => `${x.kind}:${x.subject}`), ['striking:a', 'low_ctr:b', 'untargeted_page:/tr/x', 'target_no_data:z']);
});

/* ── audit ────────────────────────────────────────────────────── */

test('audit allowlist: default yoca.net + www.yoca.net, env-configurable; everything else refused', () => {
  assert.deepEqual(auditHosts({}), ['yoca.net', 'www.yoca.net']);
  assert.deepEqual(auditHosts({ SEO_AUDIT_HOSTS: 'yoca.net, staging.yoca.net' }), ['yoca.net', 'staging.yoca.net']);
  assert.equal(hostAllowed('https://yoca.net/tr', HOSTS), true);
  assert.equal(hostAllowed('https://evil.yoca.net.example.com/', HOSTS), false);
  assert.equal(hostAllowed('https://user:pw@yoca.net/', HOSTS), false);
  assert.equal(hostAllowed('https://yoca.net:8443/', HOSTS), false);
  assert.equal(hostAllowed('file:///etc/passwd', HOSTS), false);
  assert.equal(hostAllowed('http://169.254.169.254/', HOSTS), false);
});

test('audit limits: default 50 pages, hard max 100', () => {
  assert.equal(clampPages(undefined), 50);
  assert.equal(clampPages(10), 10);
  assert.equal(clampPages(500), 100);
  assert.equal(clampPages(-3), 50);
  assert.deepEqual([AUDIT_LIMITS.budgetMs, AUDIT_LIMITS.timeoutMs, AUDIT_LIMITS.concurrency], [40_000, 8_000, 3]);
});

test('robots.txt: own group wins over "*", longest match wins, Allow on a tie', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: YocaKokpitSEO\nDisallow: /private\nAllow: /private/ok\n');
  assert.equal(robotsAllows(r, 'https://yoca.net/tr'), true);
  assert.equal(robotsAllows(r, 'https://yoca.net/private/x'), false);
  assert.equal(robotsAllows(r, 'https://yoca.net/private/ok/1'), true);
  const star = parseRobots('User-agent: *\nDisallow: /admin\nDisallow: /*.pdf$\nSitemap: https://yoca.net/sitemap.xml');
  assert.equal(robotsAllows(star, 'https://yoca.net/admin/x'), false);
  assert.equal(robotsAllows(star, 'https://yoca.net/a.pdf'), false);
  assert.equal(robotsAllows(star, 'https://yoca.net/a.pdf?x'), true);
  assert.deepEqual(star.sitemaps, ['https://yoca.net/sitemap.xml']);
});

test('audit run (fixture site): GET only, own User-Agent, robots honoured, no off-allowlist request, ≤ 3 in flight, partial at the page limit', async () => {
  const inner = fixtureFetch();
  const seen: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const spy = async (url: string, init?: RequestInit) => {
    assert.equal(init?.method, 'GET');
    assert.equal((init?.headers as Record<string, string>)['User-Agent'], USER_AGENT);
    assert.equal(init?.redirect, 'manual');
    seen.push(url);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight -= 1;
    return inner(url, init);
  };
  const r = await runAudit({ origin: 'https://yoca.net', hosts: HOSTS, fetch: spy });
  assert.equal(r.status, 'partial');
  assert.match(r.limitReason ?? '', /Sayfa sınırı/);
  assert.equal(r.pagesPlanned, 50);
  assert.ok(maxInFlight <= 3, `max in flight ${maxInFlight}`);
  assert.ok(seen.every((u) => hostAllowed(u, HOSTS)), 'never left the allowlist');
  assert.ok(!seen.includes('https://yoca.net/tr/insights/taslak'), 'robots-disallowed URL not fetched');
  assert.ok(!seen.some((u) => u.includes('example')));
  const by = (check: string, url: string) => r.findings.filter((f) => f.check === check && f.url === `https://yoca.net${url}`).map((f) => f.severity);
  assert.deepEqual(by('redirect', '/en/work'), ['error']);
  assert.deepEqual(by('redirect', '/tr/work'), ['warning']);
  assert.deepEqual(by('noindex', '/tr/checkup'), ['error']);
  assert.deepEqual(by('jsonld', '/tr/about'), ['error']);
  assert.deepEqual(by('h1', '/tr/about'), ['warning']);
  assert.deepEqual(by('canonical', '/tr/overview'), ['warning']);
  assert.deepEqual(by('lang', '/tr/overview'), ['warning']);
  assert.deepEqual(by('hreflang', '/en/about'), ['warning']);
  assert.deepEqual(by('status', '/tr/eski-sayfa'), ['error']);
  assert.ok(r.findings.some((f) => f.check === 'allowlist' && f.url.includes('cdn.example.org')));
  assert.ok(r.findings.some((f) => f.check === 'robots' && f.url.endsWith('/tr/insights/taslak')));
});

test('audit: time budget stops the run as partial; a non-allowlisted origin makes no request at all', async () => {
  let t = 0;
  const r = await runAudit({ origin: 'https://yoca.net', hosts: HOSTS, fetch: fixtureFetch(), now: () => (t += 1500) });
  assert.equal(r.status, 'partial');
  assert.match(r.limitReason ?? '', /Süre sınırı \(40 sn\)/);
  assert.ok(r.pagesChecked < 50);
  let calls = 0;
  const none = await runAudit({ origin: 'https://example.com', hosts: HOSTS, fetch: async () => { calls += 1; return new Response(''); } });
  assert.equal(none.status, 'failed');
  assert.equal(calls, 0);
});

test('audit: redirects are followed only inside the allowlist', async () => {
  const fetches: string[] = [];
  const f = async (url: string) => { fetches.push(url); return url === 'https://yoca.net/a' ? new Response(null, { status: 301, headers: { location: 'https://attacker.example/x' } }) : new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }); };
  const r = await fetchAllowed('https://yoca.net/a', { hosts: HOSTS, fetch: f, timeoutMs: 8000 });
  assert.match(r.refused ?? '', /attacker\.example/);
  assert.deepEqual(fetches, ['https://yoca.net/a']);
});

/* ── PageSpeed ────────────────────────────────────────────────── */

test('PSI: lab and field parsed separately; field scope url / origin / none', () => {
  const home = parsePsi(fixturePsi('https://yoca.net/tr', 'mobile'), 'https://yoca.net/tr', 'mobile');
  assert.equal(home.field.scope, 'url');
  assert.equal(home.field.lcpP75Ms, 2600);
  assert.equal(home.field.inpP75Ms, 240);
  assert.equal(home.field.clsP75, 0.04);
  assert.equal(home.field.category, 'AVERAGE');
  assert.ok(home.lab.perfScore !== null && home.lab.perfScore >= 0 && home.lab.perfScore <= 100);
  assert.ok(home.lab.lcpMs !== null && home.lab.tbtMs !== null && home.lab.cls !== null);
  const origin = parsePsi(fixturePsi('https://yoca.net/tr/products', 'desktop'), 'u', 'desktop');
  assert.equal(origin.field.scope, 'origin', 'origin_fallback is not page data');
  const none = parsePsi(fixturePsi('https://yoca.net/tr/contact', 'mobile'), 'u', 'mobile');
  assert.deepEqual(none.field, { scope: 'none', lcpP75Ms: null, inpP75Ms: null, clsP75: null, category: null });
  assert.ok(none.lab.perfScore !== null, 'lab still present without field data');
  assert.equal(parsePsi({}, 'u', 'mobile').lab.perfScore, null);
  assert.equal(NO_FIELD, 'Gerçek kullanıcı verisi yok (yeterli trafik yok)');
  assert.equal(LAB_LABEL, 'Laboratuvar ölçümü — tek seferlik test');
  assert.equal(FIELD_LABEL, 'Gerçek kullanıcı verisi (son 28 gün)');
  assert.ok(!psiUrl('https://yoca.net/tr', 'mobile').includes('key='), 'key optional');
  assert.ok(psiUrl('https://yoca.net/tr', 'mobile', 'k').includes('key=k'));
});

/* ── access: admin only ───────────────────────────────────────── */

test('every SEO admin route checks requireAdmin first; the cron route checks CRON_SECRET first', () => {
  for (const f of ['app/api/admin/seo/route.ts', 'app/api/admin/seo/audit/route.ts', 'app/api/admin/seo/pagespeed/route.ts', 'app/api/admin/seo/suggest/route.ts']) {
    const src = read(f);
    for (const m of Array.from(src.matchAll(/export async function (GET|POST)\(request: NextRequest\) \{\n([^\n]*)\n([^\n]*)/g))) {
      assert.match(m[2], /const admin = await requireAdmin\(request\);/, `${f} ${m[1]}`);
      assert.match(m[3], /if \(!admin\) return .*401/, `${f} ${m[1]}`);
    }
  }
  assert.match(read('app/api/cron/seo/route.ts'), /export async function GET\(request: NextRequest\) \{\n\s+const auth = cronAuth\(request\);\n\s+if \(!auth\.ok\)/);
});

test('finance role: SEO is not a finance path (menu hidden + redirect), it sits in Genel next to Trafik; RLS is admin-only', () => {
  const shell = read('components/admin/AdminShell.tsx');
  assert.match(shell, /\{ href: '\/admin\/traffic', label: 'Trafik', icon: '↗' \},\n\s+\{ href: '\/admin\/seo', label: 'SEO'/);
  assert.match(shell, /const FINANCE_ROOTS = \['\/admin\/finance', '\/admin\/expenses'\];/);
  const sql = read('supabase/upgrade-v27-seo.sql');
  assert.match(sql, /using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.doesNotMatch(sql, /can_finance/);
  assert.match(sql, /revoke all on public\.%I from anon/);
});

/* ── AI: only on request, budget-gated ────────────────────────── */

function deps(log: string[], opts: { budget?: boolean } = {}): SuggestDeps {
  return {
    startRun: (async () => { log.push('start'); if (opts.budget) throw new OpenAIError('Aylık bütçe doldu.', 402, 'budget'); return { kind: 'started', runId: 'r1' }; }) as unknown as SuggestDeps['startRun'],
    callOpenAI: (async (o: { schema?: { name: string }; user: string }) => { log.push('call'); return { data: mockStructured(o.schema?.name ?? '', o.user), usage: {}, mock: true }; }) as unknown as SuggestDeps['callOpenAI'],
    finishRun: (async (_id: string, out: { status: string }) => { log.push(`finish:${out.status}`); return { estCostUsd: 0 }; }) as unknown as SuggestDeps['finishRun'],
  };
}
const ctx = { requestKey: 'abcdef12-3456', createdBy: 'admin@test.local', settings: defaultAiSettings(), model: 'm', mock: true };

test('AI suggestion: budget reached → refused BEFORE any model call', async () => {
  const log: string[] = [];
  await assert.rejects(suggest({ kind: 'striking', subject: 'marka kimliği tasarımı', language: 'tr' }, { ...ctx, mock: false }, deps(log, { budget: true })), (e: OpenAIError) => e.code === 'budget');
  assert.deepEqual(log, ['start']);
});

test('AI suggestion: one request → ledger start, one call, finish; title / meta / outline returned', async () => {
  const log: string[] = [];
  const r = await suggest({ kind: 'low_ctr', subject: 'qr menü sistemi', page: '/tr/products', language: 'tr', metrics: { clicks: 1, impressions: 200, ctr: 0.005, position: 6.2 } }, ctx, deps(log));
  assert.deepEqual(log, ['start', 'call', 'finish:mock']);
  assert.ok(r.suggestion.title && r.suggestion.metaDescription && r.suggestion.outline.length > 0);
  await assert.rejects(suggest({ kind: 'striking', subject: 'x', language: 'tr' }, { ...ctx, requestKey: '' }, deps([])));
});

test('AI suggestion: nothing else calls the AI (report, weekly, overview route, cron); the suggest route never writes site content', () => {
  for (const f of ['lib/seoPanel/report.ts', 'lib/seoPanel/weekly.ts', 'app/api/admin/seo/route.ts', 'app/api/cron/seo/route.ts', 'app/api/admin/seo/audit/route.ts', 'app/api/admin/seo/pagespeed/route.ts']) {
    const src = code(f);
    assert.doesNotMatch(src, /lib\/ai\/|lib\/seoPanel\/ai|callOpenAI|startRun/, f);
  }
  const route = read('app/api/admin/seo/suggest/route.ts');
  const tables = Array.from(route.matchAll(/\.from\('([a-z_]+)'\)/g)).map((m) => m[1]);
  assert.deepEqual(Array.from(new Set(tables)), ['seo_ai_suggestions']);
  assert.match(read('components/admin/seo/Opportunities.tsx'), /onClick=\{\(\) => ask\(o\)\}/);
});

/* ── Google auth (names only; synthetic key) ──────────────────── */

test('Google auth: not configured → "Search Console bağlantısı kurulmadı" + missing step; values never echoed', () => {
  const s = gscStatus('https://yoca.net/', {});
  assert.equal(s.mode, 'none');
  assert.ok(s.mode === 'none' && s.message === 'Search Console bağlantısı kurulmadı.' && s.step.includes('GSC_SERVICE_ACCOUNT_JSON'));
  const secret = '{"type":"service_account","client_email":"x@y","private_key":"SECRET-123"}';
  const bad = readServiceAccount({ GSC_SERVICE_ACCOUNT_JSON: secret });
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && !bad.message.includes('SECRET-123'));
  const broken = gscStatus('https://yoca.net/', { GSC_SERVICE_ACCOUNT_JSON: '{nope SECRET-456' });
  assert.ok(broken.mode === 'none' && !broken.step.includes('SECRET-456'));
  assert.equal(gscStatus('https://yoca.net/', { SEO_FIXTURE: '1' }).mode, 'fixture');
  assert.throws(() => fixtureEnabled({ SEO_FIXTURE: '1', VERCEL_ENV: 'production' }));
  assert.equal(gscStatus('https://yoca.net/', { GSC_PROPERTY: 'sc-domain:yoca.net', SEO_FIXTURE: '1' }).property, 'sc-domain:yoca.net');
});

test('Google auth: signed JWT asks for webmasters.readonly only and verifies with the key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const sa = readServiceAccount({ GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'seo@test-project.iam.gserviceaccount.com', private_key: pem }) });
  assert.ok(sa.ok);
  if (!sa.ok) return;
  const jwt = signedAssertion(sa.account, 1_800_000_000);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.scope, GSC_SCOPE);
  assert.equal(GSC_SCOPE, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(claims.exp - claims.iat, 3600);
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(sig, 'base64url')));
});

/* ── audit persistence: DB lock + checked writes ─────────────── */

type Call = { op: string; table?: string; values?: unknown; id?: string };
function fakeAuditDb(opts: { acquire?: unknown; acquireError?: string; insertErrorAt?: number; updateError?: (values: Record<string, unknown>) => string | null } = {}) {
  const calls: Call[] = [];
  let inserts = 0;
  const db: AuditDb = {
    rpc: async (fn, args) => { calls.push({ op: `rpc:${fn}`, values: args }); return { data: opts.acquire ?? null, error: opts.acquireError ? { message: opts.acquireError } : null }; },
    from: (table) => ({
      insert: async (rows) => { inserts += 1; calls.push({ op: 'insert', table, values: rows.length }); return { error: opts.insertErrorAt === inserts ? { message: 'insert failed' } : null }; },
      update: (values) => ({ eq: async (_c, id) => { calls.push({ op: 'update', table, values, id }); const e = opts.updateError?.(values); return { error: e ? { message: e } : null }; } }),
    }),
  };
  return { db, calls };
}
const result = (n: number): AuditResult => ({ status: 'done', pagesPlanned: n, pagesChecked: n, limitReason: null, summary: { ok: n }, findings: Array.from({ length: n }, (_, i) => ({ url: `https://yoca.net/p${i}`, check: 'title', severity: 'ok' as const, message: 'ok' })) });

test('audit acquire: one running run per site decided by the database; null → "zaten çalışıyor" (409), timeout 3 min > maxDuration', async () => {
  assert.ok(AUDIT_RUN_TIMEOUT_S * 1000 > 60_000 && AUDIT_RUN_TIMEOUT_S === 180);
  const busy = await acquireRun(fakeAuditDb({ acquire: null }).db, 'site', 'fixture', 'a@b');
  assert.deepEqual(busy, { ok: false, status: 409, error: ALREADY_RUNNING });
  assert.match(ALREADY_RUNNING, /zaten çalışıyor/);
  const { db, calls } = fakeAuditDb({ acquire: '0b6f3d1e-0000-4000-8000-000000000001' });
  assert.deepEqual(await acquireRun(db, 'site', 'live', 'a@b'), { ok: true, runId: '0b6f3d1e-0000-4000-8000-000000000001' });
  assert.equal(calls[0].op, 'rpc:seo_audit_acquire');
  assert.equal((calls[0].values as { p_timeout_seconds: number }).p_timeout_seconds, 180);
  assert.equal((await acquireRun(fakeAuditDb({ acquireError: 'boom' }).db, 's', 'live', 'x')).ok, false);
  // the route has no per-instance flag any more and stores nothing outside saveResult
  const route = code('app/api/admin/seo/audit/route.ts');
  assert.doesNotMatch(route, /let running/);
  assert.match(route, /acquireRun\(/);
  const sql = read('supabase/upgrade-v27-seo.sql');
  assert.match(sql, /create unique index if not exists seo_audit_runs_one_running on public\.seo_audit_runs \(site_id\) where status = 'running'/);
  assert.match(sql, /on conflict \(site_id\) where status = 'running' do nothing/);
});

test('audit save: every write checked; a failed findings insert or run update → error + run marked failed', async () => {
  const ok = fakeAuditDb();
  assert.deepEqual(await saveResult(ok.db, 'run-1', result(650)), { ok: true });
  assert.deepEqual(ok.calls.filter((c) => c.op === 'insert').map((c) => c.values), [300, 300, 50]);
  assert.equal((ok.calls.at(-1)?.values as { status: string }).status, 'done');

  const bad = fakeAuditDb({ insertErrorAt: 2 });
  const r = await saveResult(bad.db, 'run-2', result(650));
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /kaydedilemedi/.test(r.error));
  const last = bad.calls.at(-1) as Call;
  assert.equal(last.op, 'update');
  assert.equal((last.values as { status: string }).status, 'failed', 'run marked failed, never left running');
  assert.equal(bad.calls.filter((c) => c.op === 'insert').length, 2, 'stops at the first failed insert');

  const upd = fakeAuditDb({ updateError: (v) => (v.status === 'done' ? 'update failed' : null) });
  const u = await saveResult(upd.db, 'run-3', result(3));
  assert.equal(u.ok, false);
  assert.equal(((upd.calls.at(-1) as Call).values as { status: string }).status, 'failed');
});

/* ── Healthchecks for /api/cron/seo ──────────────────────────── */

test('SEO heartbeat: success only when saved (count body); skipped → /log with reason; error → fail', () => {
  assert.deepEqual(seoOutcome({ kind: 'saved', weeks: [{ week: '2026-11-02', status: 'saved', rows: 300 }, { week: '2026-10-26', status: 'saved', rows: 212 }] }), { phase: 'success', body: 'kaydedildi: 512 satır, 2 hafta (2026-11-02, 2026-10-26)' });
  assert.equal(seoOutcome({ kind: 'saved', weeks: [{ week: '2026-11-02', status: 'not_final' }] }).phase, 'log');
  for (const reason of ['not_configured', 'migration_pending', 'no_service_role', 'not_final', 'finality_unknown'] as const) {
    const o = seoOutcome({ kind: 'skipped', reason });
    assert.equal(o.phase, 'log', reason);
    assert.match(o.body, /^atlandı: /);
  }
  assert.deepEqual(seoOutcome({ kind: 'error', message: 'Search Console verisi alınamadı' }), { phase: 'fail', body: 'hata: Search Console verisi alınamadı' });
  assert.equal(heartbeatUrl('https://hc-ping.com/abc', 'log'), 'https://hc-ping.com/abc/log');
  assert.equal(pingBody('kaydedildi: 5 satır <script>"x"</script>'), 'kaydedildi: 5 satır script x /script');
  assert.equal(pingBody('x'.repeat(500))?.length, 120);
});

test('SEO heartbeat: body only for the SEO job (POST text/plain); other jobs stay content-free; unset env sends nothing', async () => {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => { sent.push({ url, init }); return new Response('OK'); }) as unknown as typeof fetch;
  const prev = { seo: process.env.HEALTHCHECKS_URL_SEO, ops: process.env.HEALTHCHECKS_URL_OPS };
  try {
    delete process.env.HEALTHCHECKS_URL_SEO;
    assert.equal(await heartbeat('seo', 'success', f, 'kaydedildi: 1 satır'), 'skipped');
    process.env.HEALTHCHECKS_URL_SEO = 'http://127.0.0.1:8000/ping/seo-test';
    process.env.HEALTHCHECKS_URL_OPS = 'http://127.0.0.1:8000/ping/ops-test';
    await heartbeat('seo', 'log', f, 'atlandı: kesinleşme tarihi belirlenemedi');
    await heartbeat('ops', 'success', f, 'ignored body');
    assert.equal(sent[0].url, 'http://127.0.0.1:8000/ping/seo-test/log');
    assert.equal(sent[0].init.method, 'POST');
    assert.equal(sent[0].init.body, 'atlandı: kesinleşme tarihi belirlenemedi');
    assert.equal(sent[1].init.method, 'GET');
    assert.equal(sent[1].init.body, undefined);
  } finally {
    if (prev.seo === undefined) delete process.env.HEALTHCHECKS_URL_SEO; else process.env.HEALTHCHECKS_URL_SEO = prev.seo;
    if (prev.ops === undefined) delete process.env.HEALTHCHECKS_URL_OPS; else process.env.HEALTHCHECKS_URL_OPS = prev.ops;
  }
  const cron = code('app/api/cron/seo/route.ts');
  assert.match(cron, /const auth = cronAuth\(request\);\n\s+if \(!auth\.ok\) return[^\n]*\n\s+await heartbeat\('seo', 'start'\);/, 'unauthorized calls send no ping');
  assert.doesNotMatch(cron, /sendMail|sendTelegram|notify/);
});

/* ── Turkish calendar (pure) ──────────────────────────────────── */

test('calendar: dd.MM.yyyy format / parse / validation; Monday-first 6-week grid', () => {
  assert.equal(formatTr('2026-11-05'), '05.11.2026');
  assert.equal(parseTr('05.11.2026'), '2026-11-05');
  assert.equal(parseTr('5.11.2026'), '2026-11-05');
  assert.equal(parseTr('31.02.2026'), null);
  assert.equal(parseTr('2026-11-05'), null);
  assert.equal(longTr('2026-11-05'), '5 Kasım 2026 Perşembe');
  assert.deepEqual(validateTyped('09.11.2026', { max: '2026-11-08' }), { ok: false, error: 'En geç 08.11.2026 seçilebilir.' });
  assert.deepEqual(validateTyped('01.10.2026', { min: '2026-10-05', max: '2026-11-08' }), { ok: false, error: 'En erken 05.10.2026 seçilebilir.' });
  assert.equal(validateTyped('abc', {}).ok, false);
  const g = monthGrid('2026-11-15');
  assert.equal(g.length, 6);
  assert.equal(g[0][0].date, '2026-10-26', 'Monday before 1 Nov 2026 (a Sunday)');
  assert.equal(weekday(g[0][0].date), 0);
  assert.equal(g[0][6].date, '2026-11-01');
  assert.equal(monthTitle('2026-11-15'), 'Kasım 2026');
});

test('calendar keyboard: arrows ±1/±7, PageUp/PageDown ±month, Home/End week start/end, clamped to min/max', () => {
  const b = { min: '2026-10-01', max: '2026-11-08' };
  assert.equal(moveFocus('2026-11-05', 'ArrowLeft', b), '2026-11-04');
  assert.equal(moveFocus('2026-11-05', 'ArrowRight', b), '2026-11-06');
  assert.equal(moveFocus('2026-11-05', 'ArrowUp', b), '2026-10-29');
  assert.equal(moveFocus('2026-11-05', 'ArrowDown', b), '2026-11-08', 'clamped to max (today)');
  assert.equal(moveFocus('2026-11-05', 'PageUp', b), '2026-10-05');
  assert.equal(moveFocus('2026-10-31', 'PageDown', {}), '2026-11-30', 'month end kept valid');
  assert.equal(moveFocus('2026-11-05', 'Home', b), '2026-11-02', 'Monday');
  assert.equal(moveFocus('2026-11-05', 'End', {}), '2026-11-08', 'Sunday');
  assert.equal(moveFocus('2026-10-02', 'PageUp', b), '2026-10-01', 'clamped to min (range start)');
  assert.equal(moveFocus('2026-11-05', 'x', b), null);
  const src = code('components/admin/DateField.tsx');
  assert.doesNotMatch(src, /type="date"/);
  assert.match(src, /role="dialog"/);
  assert.match(src, /role="grid"/);
  assert.match(src, /aria-selected=\{selected\}/);
  assert.match(src, /aria-current=\{isToday \? 'date' : undefined\}/);
  assert.doesNotMatch(read('components/admin/seo/Performance.tsx'), /type="date"/);
});
