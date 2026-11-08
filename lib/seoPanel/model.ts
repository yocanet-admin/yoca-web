/**
 * Yoca Kokpit — SEO, Faz 0 (pure, client-safe; unit-tested).
 *
 * Search Console performance for yoca.net: date ranges, the comparison period
 * (ALWAYS the same filters), data lag ("son tam veri günü") and missing days,
 * metric aggregation, wording rules, weekly snapshot weeks, target keyword
 * validation and rule-based content opportunities.
 *
 * Wording rules (never broken in the UI):
 *  - position is "Ortalama pozisyon" — an average over impressions, not a rank;
 *  - no rows for a keyword / page = "Seçilen dönemde veri yok" (never "Google'da görünmüyor").
 */

export const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover', 'googleNews'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export const DEVICES = ['', 'desktop', 'mobile', 'tablet'] as const;
export type Device = (typeof DEVICES)[number];
export type DataState = 'final' | 'all';

export interface SeoFilters {
  /** ISO 3166-1 alpha-3, lower case ('tur'), as Search Console reports it; '' = all countries. */
  country: string;
  device: Device;
  searchType: SearchType;
  dataState: DataState;
}

export const DEFAULT_FILTERS: SeoFilters = { country: '', device: '', searchType: 'web', dataState: 'final' };
/** The one fixed filter set of the weekly record. */
export const WEEKLY_FILTERS: SeoFilters = { ...DEFAULT_FILTERS };

export function normalizeFilters(input: Partial<Record<keyof SeoFilters, unknown>> | null | undefined): SeoFilters {
  const v = input ?? {};
  const country = typeof v.country === 'string' && /^[a-z]{3}$/i.test(v.country.trim()) ? v.country.trim().toLowerCase() : '';
  const device = (DEVICES as readonly string[]).includes(String(v.device ?? '').toLowerCase()) ? (String(v.device ?? '').toLowerCase() as Device) : '';
  const searchType = (SEARCH_TYPES as readonly string[]).includes(String(v.searchType ?? '')) ? (v.searchType as SearchType) : 'web';
  const dataState: DataState = v.dataState === 'all' ? 'all' : 'final';
  return { country, device, searchType, dataState };
}

/** Canonical text of a filter set (stored with every weekly row; shown next to the comparison). */
export function filtersKey(f: SeoFilters): string {
  return `country=${f.country || 'all'};device=${f.device || 'all'};type=${f.searchType};state=${f.dataState}`;
}

const COUNTRY_TR: Record<string, string> = { tur: 'Türkiye', usa: 'ABD', aze: 'Azerbaycan', deu: 'Almanya', gbr: 'Birleşik Krallık', are: 'BAE', sau: 'Suudi Arabistan', nld: 'Hollanda', fra: 'Fransa' };
export const COUNTRY_OPTIONS = Object.keys(COUNTRY_TR);
export const countryLabel = (c: string) => (c ? COUNTRY_TR[c] ?? c.toUpperCase() : 'Tüm ülkeler');
export const DEVICE_LABEL: Record<Device, string> = { '': 'Tüm cihazlar', desktop: 'Masaüstü', mobile: 'Mobil', tablet: 'Tablet' };
export const SEARCH_TYPE_LABEL: Record<SearchType, string> = { web: 'Web', image: 'Görsel', video: 'Video', news: 'Haberler', discover: 'Discover', googleNews: 'Google Haberler' };
export const DATA_STATE_LABEL: Record<DataState, string> = { final: 'Kesin veri', all: 'Taze veri (kesinleşmemiş günler dahil)' };

/** "Ülke: Tüm ülkeler · Cihaz: Tüm cihazlar · Arama türü: Web · Veri: Kesin veri" */
export function filtersText(f: SeoFilters): string {
  return `Ülke: ${countryLabel(f.country)} · Cihaz: ${DEVICE_LABEL[f.device]} · Arama türü: ${SEARCH_TYPE_LABEL[f.searchType]} · Veri: ${DATA_STATE_LABEL[f.dataState]}`;
}

/** Shown above the keyword table: the exact filter set behind every keyword value. */
export function keywordFiltersText(f: SeoFilters, rangeLabel: string): string {
  return `Kelime değerleri: kelimenin hedef ülkesi (boşsa tüm ülkeler) · ${DEVICE_LABEL[f.device]} · ${SEARCH_TYPE_LABEL[f.searchType]} · ${DATA_STATE_LABEL[f.dataState]} · ${rangeLabel}`;
}

/* ── Dates (ISO YYYY-MM-DD, UTC arithmetic — Search Console days are Pacific Time days; shown as given) ── */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const isIsoDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(at(d)) && iso(at(d)) === d;
export const addDays = (d: string, n: number) => iso(at(d) + n * DAY);
export const dayCount = (r: DateRange) => Math.round((at(r.end) - at(r.start)) / DAY) + 1;
export function eachDay(r: DateRange): string[] {
  const out: string[] = [];
  for (let t = at(r.start); t <= at(r.end); t += DAY) out.push(iso(t));
  return out;
}

export interface DateRange { start: string; end: string }
export const PRESETS = [7, 28, 90] as const;
export type Preset = (typeof PRESETS)[number];
/** Search Console keeps 16 months. */
export const MAX_HISTORY_DAYS = 486;
/** Typical lag of final data (2–3 days); used only when no data tells us better. */
export const TYPICAL_LAG_DAYS = 3;

/** A preset ends on the last day that has data ("son tam veri günü"), like the Search Console report. */
export function presetRange(preset: Preset, dataThrough: string): DateRange {
  return { start: addDays(dataThrough, -(preset - 1)), end: dataThrough };
}

/** Custom range: valid ISO dates, start ≤ end, not before the 16-month window, not after today. */
export function customRange(start: unknown, end: unknown, today: string): { ok: true; range: DateRange } | { ok: false; error: string } {
  if (!isIsoDate(start) || !isIsoDate(end)) return { ok: false, error: 'Geçerli bir başlangıç ve bitiş tarihi seçin.' };
  if (start > end) return { ok: false, error: 'Başlangıç tarihi bitişten sonra olamaz.' };
  if (end > today) return { ok: false, error: 'Bitiş tarihi bugünden sonra olamaz.' };
  if (start < addDays(today, -MAX_HISTORY_DAYS)) return { ok: false, error: 'Search Console verisi en fazla 16 ay geriye gider.' };
  return { ok: true, range: { start, end } };
}

/** The comparison period: the same number of days immediately before. */
export function previousRange(r: DateRange): DateRange {
  const n = dayCount(r);
  return { start: addDays(r.start, -n), end: addDays(r.start, -1) };
}

export interface PeriodQuery { range: DateRange; filters: SeoFilters }
/** Current and previous period built from ONE filter set: country, device, search type and data state are identical by construction. */
export function comparisonQueries(range: DateRange, filters: SeoFilters): { current: PeriodQuery; previous: PeriodQuery } {
  const f = normalizeFilters(filters);
  return { current: { range, filters: { ...f } }, previous: { range: previousRange(range), filters: { ...f } } };
}

/** The last day that has data, or null. */
export function dataThroughFrom(dates: string[]): string | null {
  return dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null;
}
/** Days of the range without any row (listed in the UI, never silently skipped). */
export function missingDays(range: DateRange, datesWithData: string[]): string[] {
  const have = new Set(datesWithData);
  return eachDay(range).filter((d) => !have.has(d));
}

/* ── Metrics ───────────────────────────────────────────────────── */

export interface Row { keys?: string[]; clicks: number; impressions: number; ctr?: number; position?: number | null }
export interface Metrics { clicks: number; impressions: number; ctr: number; position: number | null }

/** Sum clicks / impressions; CTR = clicks / impressions; position averaged over impressions (null without impressions). */
export function aggregate(rows: Row[]): Metrics {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const r of rows) {
    clicks += r.clicks || 0;
    impressions += r.impressions || 0;
    if (r.position !== null && r.position !== undefined && r.impressions) weighted += r.position * r.impressions;
  }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? weighted / impressions : null };
}

export interface Deltas { clicksPct: number | null; impressionsPct: number | null; ctrPoints: number | null; positionDiff: number | null }
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
export function deltas(cur: Metrics, prev: Metrics): Deltas {
  return {
    clicksPct: pct(cur.clicks, prev.clicks),
    impressionsPct: pct(cur.impressions, prev.impressions),
    ctrPoints: prev.impressions && cur.impressions ? Math.round((cur.ctr - prev.ctr) * 1000) / 10 : null,
    // lower is better: a negative difference is an improvement
    // on the shown (1-decimal) values, so "4,0 → 4,0" never reads as a change
    positionDiff: cur.position !== null && prev.position !== null ? Math.round((Math.round(cur.position * 10) - Math.round(prev.position * 10))) / 10 : null,
  };
}

/* ── Wording ───────────────────────────────────────────────────── */

export const POSITION_LABEL = 'Ortalama pozisyon';
export const POSITION_NOTE = 'Gösterimlerin ortalamasıdır; kesin sıra değildir, sorguya, konuma ve cihaza göre değişir.';
export const NO_DATA = 'Seçilen dönemde veri yok';
export const DATA_LAG_NOTE = 'Search Console kesin veriyi genellikle 2–3 gün gecikmeyle verir.';
export const HISTORY_SCOPE = 'Geçmiş: tamamlanmış haftaların haftalık toplamları (site toplamı, ilk 250 sorgu, ilk 250 sayfa: tüm ülkeler, tüm cihazlar, web, kesin veri; etkin hedef kelimeler: kelimenin hedef ülkesi (boşsa tüm ülkeler), tüm cihazlar, web, kesin veri). Günlük ham veri, ilk 250 dışındaki satırlar ve anonimleştirilmiş sorgular saklanmaz. Search Console verisi 16 ay tutar.';

const nf1 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "8,4" or the no-data text — never a rank. */
export function positionText(p: number | null | undefined): string {
  return p === null || p === undefined || Number.isNaN(p) ? NO_DATA : nf1(p);
}
export function ctrText(ctr: number, impressions: number): string {
  return impressions ? `%${nf1(ctr * 100)}` : NO_DATA;
}

/* ── Keywords ──────────────────────────────────────────────────── */

export const normQuery = (q: string) => q.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
export const KEYWORD_LANGS = ['tr', 'en', 'az', 'ar'] as const;
export type KeywordLang = (typeof KEYWORD_LANGS)[number];
export type KeywordSource = 'gsc' | 'suggested' | 'manual';
export type KeywordStatus = 'proposed' | 'active' | 'paused';
export const SOURCE_LABEL: Record<KeywordSource, string> = { gsc: 'Search Console sorgusu', suggested: 'Önerilen', manual: 'Manuel' };
export const STATUS_LABEL: Record<KeywordStatus, string> = { proposed: 'Öneri (etkin değil)', active: 'Aktif', paused: 'Duraklatıldı' };

export interface KeywordInput { keyword: string; language: KeywordLang; country: string; targetPath: string; source: KeywordSource; status: KeywordStatus; note: string }

/** Target page must be on the site: a path ("/tr/…") or a full URL on an allowed host (stored as its path). */
export function sitePath(input: string, hosts: string[]): string | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith('/')) return /^\/[^\s?#]*$/.test(s) && !s.startsWith('//') ? s.replace(/(.)\/$/, '$1') : null;
  try {
    const u = new URL(s);
    if (!['https:', 'http:'].includes(u.protocol) || !hosts.includes(u.hostname.toLowerCase())) return null;
    return (u.pathname || '/').replace(/(.)\/$/, '$1');
  } catch {
    return null;
  }
}

export function validateKeyword(v: Partial<Record<keyof KeywordInput, unknown>>, hosts: string[]): { ok: true; value: KeywordInput } | { ok: false; error: string } {
  const keyword = typeof v.keyword === 'string' ? v.keyword.replace(/\s+/g, ' ').trim() : '';
  if (!keyword || keyword.length > 200) return { ok: false, error: 'Anahtar kelime boş olamaz (en çok 200 karakter).' };
  const language = (KEYWORD_LANGS as readonly string[]).includes(String(v.language)) ? (v.language as KeywordLang) : null;
  if (!language) return { ok: false, error: 'Dil seçin (tr, en, az, ar).' };
  const country = typeof v.country === 'string' && v.country.trim() ? v.country.trim().toLowerCase() : '';
  if (country && !/^[a-z]{3}$/.test(country)) return { ok: false, error: 'Ülke 3 harfli ISO kodu olmalı (ör. tur) veya boş (tüm ülkeler).' };
  const targetPath = sitePath(String(v.targetPath ?? ''), hosts);
  if (!targetPath) return { ok: false, error: `Hedef sayfa yoca.net üzerinde bir yol olmalı (ör. /tr/services/brand-strategy-identity).` };
  const source: KeywordSource = v.source === 'gsc' || v.source === 'suggested' ? v.source : 'manual';
  const status: KeywordStatus = v.status === 'active' || v.status === 'paused' ? v.status : v.status === 'proposed' ? 'proposed' : 'active';
  const note = typeof v.note === 'string' ? v.note.trim().slice(0, 1000) : '';
  return { ok: true, value: { keyword, language, country, targetPath, source, status, note } };
}

/** Path of a Search Console page URL ("https://yoca.net/tr/products" → "/tr/products"). */
export function pathOf(url: string): string {
  try { return (new URL(url).pathname || '/').replace(/(.)\/$/, '$1'); } catch { return url; }
}

/* ── Weekly record ─────────────────────────────────────────────── */

/** Monday of the ISO week of a date. */
export function mondayOf(d: string): string {
  const dow = (new Date(at(d)).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}
/** The last `count` COMPLETED weeks (Monday starts; the week's Sunday is before today), newest first. */
export function completedWeeks(today: string, count = 2): string[] {
  const thisMonday = mondayOf(today);
  return Array.from({ length: count }, (_, i) => addDays(thisMonday, -7 * (i + 1)));
}
export const weekRange = (monday: string): DateRange => ({ start: monday, end: addDays(monday, 6) });

/* ── Opportunities (rule-based) ────────────────────────────────── */

export type OpportunityKind = 'striking' | 'low_ctr' | 'untargeted_page' | 'target_no_data';
export interface Opportunity { kind: OpportunityKind; subject: string; page?: string; title: string; detail: string; metrics?: Metrics }
export const OPPORTUNITY_RULES = { strikingMin: 8, strikingMax: 20, strikingImpr: 20, lowCtrImpr: 50, lowCtrMax: 0.02, pageImpr: 10 };
export const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = {
  striking: 'Ortalama pozisyon 8–20, anlamlı gösterim',
  low_ctr: 'Yüksek gösterim, düşük TO',
  untargeted_page: 'Gösterim alan, hedef kelimesi olmayan sayfa',
  target_no_data: 'Aktif hedef kelimede veri yok',
};

export interface KeywordWithMetrics { id: string; keyword: string; targetPath: string; status: KeywordStatus; metrics: Metrics | null }

export function opportunities(input: { queries: Row[]; pages: Row[]; keywords: KeywordWithMetrics[] }, rules = OPPORTUNITY_RULES): Opportunity[] {
  const out: Opportunity[] = [];
  const m = (r: Row): Metrics => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? r.clicks / r.impressions : 0, position: r.position ?? null });
  for (const r of input.queries) {
    const q = r.keys?.[0] ?? '';
    const p = r.position ?? null;
    if (p !== null && p >= rules.strikingMin && p <= rules.strikingMax && r.impressions >= rules.strikingImpr) {
      out.push({ kind: 'striking', subject: q, title: q, detail: `${POSITION_LABEL} ${positionText(p)}, ${r.impressions} gösterim: içerik ve iç bağlantıyla ilk sayfaya yaklaşabilir.`, metrics: m(r) });
    } else if (r.impressions >= rules.lowCtrImpr && (r.impressions ? r.clicks / r.impressions : 0) < rules.lowCtrMax) {
      out.push({ kind: 'low_ctr', subject: q, title: q, detail: `${r.impressions} gösterim, TO ${ctrText(r.clicks / r.impressions, r.impressions)}: başlık ve açıklama tıklamayı çekmiyor olabilir.`, metrics: m(r) });
    }
  }
  const targeted = new Set(input.keywords.filter((k) => k.status === 'active').map((k) => k.targetPath));
  for (const r of input.pages) {
    const path = pathOf(r.keys?.[0] ?? '');
    if (r.impressions >= rules.pageImpr && !targeted.has(path)) out.push({ kind: 'untargeted_page', subject: path, page: path, title: path, detail: `${r.impressions} gösterim alıyor; bu sayfaya bağlı aktif hedef kelime yok.`, metrics: m(r) });
  }
  for (const k of input.keywords) {
    if (k.status === 'active' && (!k.metrics || !k.metrics.impressions)) out.push({ kind: 'target_no_data', subject: k.keyword, page: k.targetPath, title: k.keyword, detail: `${NO_DATA} (tam eşleşen sorgu). Hedef sayfa: ${k.targetPath}.` });
  }
  return out;
}
