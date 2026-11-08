/**
 * Yoca Kokpit SEO — LOCAL FIXTURE data (synthetic, deterministic).
 *
 * Used only when SEO_FIXTURE=1 (refused on Vercel production) and in tests.
 * Every number here is invented; the UI shows the "Örnek veri" badge whenever
 * this source is used. Nothing here calls Google, PageSpeed or yoca.net.
 */
import { addDays, aggregate, type DateRange, type Row, type SeoFilters, eachDay } from '@/lib/seoPanel/model';

/** Final data ends 3 days before "today"; the 2 days after it are fresh (not final) data; today has none. */
export const FIXTURE_LAG_DAYS = 3;
export const fixtureFirstIncomplete = (today: string) => addDays(today, -(FIXTURE_LAG_DAYS - 1));

const QUERIES: Array<{ q: string; page: string; impr: number; ctr: number; pos: number }> = [
  { q: 'yoca', page: '/tr', impr: 22, ctr: 0.42, pos: 1.6 },
  { q: 'yoca net', page: '/en', impr: 9, ctr: 0.48, pos: 1.2 },
  { q: 'yoca ajans', page: '/tr', impr: 6, ctr: 0.35, pos: 2.1 },
  { q: 'yoca agency', page: '/en', impr: 4, ctr: 0.3, pos: 2.8 },
  { q: 'yoca dijital', page: '/tr', impr: 3, ctr: 0.25, pos: 3.4 },
  { q: 'marka kimliği tasarımı', page: '/tr/services/brand-strategy-identity', impr: 4.2, ctr: 0.012, pos: 13.8 },
  { q: 'kurumsal kimlik tasarımı', page: '/tr/services/brand-strategy-identity', impr: 2.4, ctr: 0.0, pos: 18.6 },
  { q: 'brand identity agency istanbul', page: '/en/services/brand-strategy-identity', impr: 1.4, ctr: 0.0, pos: 11.9 },
  { q: 'qr menü sistemi', page: '/tr/products', impr: 6.5, ctr: 0.004, pos: 6.2 },
  { q: 'web tasarım ajansı istanbul', page: '/tr/services/web-digital-experiences', impr: 1.1, ctr: 0.0, pos: 38.4 },
  { q: 'yocaserve', page: '/tr/products', impr: 1.2, ctr: 0.5, pos: 1.4 },
  { q: 'dijital check-up', page: '/tr/checkup', impr: 0.9, ctr: 0.05, pos: 9.4 },
];
const COUNTRIES: Array<[string, number]> = [['tur', 0.72], ['aze', 0.12], ['usa', 0.1], ['deu', 0.06]];
const DEVICES: Array<[string, number]> = [['mobile', 0.58], ['desktop', 0.38], ['tablet', 0.04]];

const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
/** A fixed handful of days without any data (shown as "veri olmayan günler"). */
export const fixtureEmptyDay = (d: string) => dayNo(d) % 13 === 5;
const noise = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

interface Fact { date: string; query: string; page: string; country: string; device: string; clicks: number; impressions: number; position: number }

function factsFor(date: string, today: string, state: SeoFilters['dataState']): Fact[] {
  if (date >= today || fixtureEmptyDay(date)) return [];
  const fresh = date >= fixtureFirstIncomplete(today);
  if (fresh && state !== 'all') return []; // not final yet: only with dataState "all"
  const partial = fresh ? 0.5 : 1;
  const n = dayNo(date);
  const growth = 1 + Math.max(0, n - dayNo('2026-08-18')) / 120; // slow growth since the first data day
  if (date < '2026-08-18') return [];
  const out: Fact[] = [];
  QUERIES.forEach((row, qi) => {
    COUNTRIES.forEach(([country, cs], ci) => {
      DEVICES.forEach(([device, ds], di) => {
        const r = noise(n * 31 + qi * 7 + ci * 3 + di);
        const impressions = Math.round(row.impr * growth * cs * ds * (0.6 + r * 0.9) * 0.5 * partial);
        if (!impressions) return;
        const clicks = Math.min(impressions, Math.round(impressions * row.ctr * (0.7 + noise(n + qi) * 0.6)));
        out.push({ date, query: row.q, page: `https://yoca.net${row.page}`, country, device, clicks, impressions, position: Math.max(1, row.pos + (r - 0.5) * 2) });
      });
    });
  });
  return out;
}

export interface FixtureQuery { range: DateRange; filters: SeoFilters; dimensions: string[]; rowLimit?: number; equals?: Array<{ dimension: 'query' | 'page'; expression: string }> }

/** Search Analytics semantics on the synthetic fact table (filters, grouping, impression-weighted position, sort by clicks). */
export function fixtureQuery(q: FixtureQuery, today: string): Row[] {
  if (q.filters.searchType !== 'web') return []; // the fixture only has web search
  const groups = new Map<string, Fact[]>();
  for (const date of eachDay(q.range)) {
    for (const f of factsFor(date, today, q.filters.dataState)) {
      if (q.filters.country && f.country !== q.filters.country) continue;
      if (q.filters.device && f.device !== q.filters.device) continue;
      if (q.equals?.some((e) => (e.dimension === 'query' ? f.query !== e.expression.toLocaleLowerCase('tr') : f.page !== e.expression))) continue;
      const keys = q.dimensions.map((d) => String((f as unknown as Record<string, unknown>)[d] ?? ''));
      const k = JSON.stringify(keys);
      const list = groups.get(k) ?? [];
      list.push(f);
      groups.set(k, list);
    }
  }
  const rows: Row[] = Array.from(groups.entries()).map(([k, facts]) => {
    const m = aggregate(facts);
    return { keys: JSON.parse(k) as string[], clicks: m.clicks, impressions: m.impressions, ctr: m.ctr, position: m.position };
  });
  rows.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  return rows.slice(0, q.rowLimit ?? 1000);
}

/**
 * Search Console's response metadata (searchanalytics.query): `first_incomplete_date`
 * is returned only with dataState "all", the date dimension, and a range that
 * contains incomplete data. `finality: 'unknown'` simulates a response without it.
 */
export function fixtureMeta(q: FixtureQuery, today: string, finality: 'known' | 'unknown' = 'known'): { firstIncompleteDate?: string } {
  if (finality === 'unknown' || q.filters.dataState !== 'all' || !q.dimensions.includes('date')) return {};
  const first = fixtureFirstIncomplete(today);
  return q.range.end >= first ? { firstIncompleteDate: first } : {};
}

/* ── Technical audit fixture: a tiny synthetic site served by an injected fetch ── */

const page = (o: { lang: string; title?: string; desc?: string; canonical?: string; h1?: number; noindex?: boolean; jsonld?: string; alternates?: Array<[string, string]> }) => `<!doctype html><html${o.lang ? ` lang="${o.lang}"` : ''}><head>
${o.title !== undefined ? `<title>${o.title}</title>` : ''}
${o.desc !== undefined ? `<meta name="description" content="${o.desc}">` : ''}
${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ''}
${(o.alternates ?? []).map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${h}">`).join('\n')}
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
${o.jsonld ? `<script type="application/ld+json">${o.jsonld}</script>` : ''}
</head><body>${'<h1>Başlık</h1>'.repeat(o.h1 ?? 1)}<p>Örnek içerik.</p></body></html>`;

const Y = 'https://yoca.net';
const alt = (path: string): Array<[string, string]> => [['en', `${Y}/en${path}`], ['tr', `${Y}/tr${path}`], ['az', `${Y}/az${path}`], ['ar', `${Y}/ar${path}`], ['x-default', `${Y}/en${path}`]];
const ORG = '{"@context":"https://schema.org","@type":"Organization","name":"Yoca","url":"https://yoca.net"}';

/** Synthetic pages: mostly fine, with one example of each problem. */
export function fixtureSite(): Record<string, { status: number; body?: string; location?: string; type?: string }> {
  const site: Record<string, { status: number; body?: string; location?: string; type?: string }> = {};
  const good = (loc: string, path: string, title: string) => {
    site[`${Y}/${loc}${path}`] = { status: 200, body: page({ lang: loc, title, desc: 'Yoca: marka, web ve dijital ürünler için yaratıcı ajans. Strateji, tasarım ve geliştirme tek ekipte.', canonical: `${Y}/${loc}${path}`, alternates: alt(path), jsonld: ORG }) };
  };
  for (const loc of ['en', 'tr', 'az', 'ar']) {
    good(loc, '', `Yoca — Your Own Creative Agency (${loc.toUpperCase()})`);
    good(loc, '/services', `Hizmetler — Yoca (${loc.toUpperCase()})`);
    good(loc, '/products', `Ürünler — Yoca (${loc.toUpperCase()})`);
    good(loc, '/contact', `İletişim — Yoca (${loc.toUpperCase()})`);
    for (let i = 1; i <= 10; i += 1) good(loc, `/work/ornek-proje-${i}`, `Örnek proje ${i} — Yoca Work (${loc.toUpperCase()})`);
  }
  // problems (synthetic)
  site[`${Y}/tr/about`] = { status: 200, body: page({ lang: 'tr', title: 'Hakkımızda', canonical: `${Y}/tr/about`, alternates: alt('/about').filter(([l]) => l !== 'en'), h1: 2, jsonld: '{"@context":"https://schema.org","@type":"Organization",' }) };
  site[`${Y}/en/about`] = { status: 200, body: page({ lang: 'en', title: 'About Yoca — a creative agency for brands, web and digital products built by one senior team', desc: 'Short.', canonical: `${Y}/en/about`, alternates: alt('/about'), jsonld: ORG }) };
  site[`${Y}/tr/overview`] = { status: 200, body: page({ lang: 'en', title: 'Genel bakış — Yoca', desc: 'Yoca hakkında genel bakış: ekip, yaklaşım, çalışma biçimi ve yaptığımız işlerden seçmeler.', canonical: `${Y}/en/overview`, alternates: alt('/overview'), h1: 0 }) };
  site[`${Y}/tr/checkup`] = { status: 200, body: page({ lang: 'tr', title: 'Dijital Check-Up — Yoca', desc: 'Sitenizin ve dijital varlıklarınızın ücretsiz kontrolü: hız, görünürlük, içerik ve dönüşüm.', canonical: `${Y}/tr/checkup`, alternates: alt('/checkup'), noindex: true }) };
  site[`${Y}/tr/work`] = { status: 301, location: `${Y}/tr/work/` };
  site[`${Y}/tr/work/`] = { status: 308, location: `${Y}/tr/work/ornek-proje-1` };
  site[`${Y}/en/work`] = { status: 302, location: 'https://example.com/elsewhere' };
  site[`${Y}/tr/eski-sayfa`] = { status: 404, body: page({ lang: 'tr', title: 'Sayfa bulunamadı' }) };
  site[`${Y}/tr/insights/taslak`] = { status: 200, body: page({ lang: 'tr', title: 'Taslak' }) };
  // project pages last, so the default 50-page limit cuts some of them ("kısmi tarama")
  const urls = Object.keys(site).filter((u) => !u.endsWith('/work/')).sort((x, y) => Number(x.includes('ornek-proje')) - Number(y.includes('ornek-proje')));
  urls.push('https://cdn.example.org/not-allowed');
  site[`${Y}/sitemap.xml`] = { status: 200, type: 'application/xml', body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>` };
  site[`${Y}/robots.txt`] = { status: 200, type: 'text/plain', body: `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /tr/insights/taslak\n\nSitemap: ${Y}/sitemap.xml\n` };
  return site;
}

/** fetch() over fixtureSite(): honours `redirect: 'manual'` like the real one. */
export function fixtureFetch(delayMs = 0): (url: string, init?: RequestInit) => Promise<Response> {
  const site = fixtureSite();
  return async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') throw new Error('fixture: GET only');
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const hit = site[url];
    if (!hit) return new Response('not found', { status: 404 });
    const headers: Record<string, string> = { 'content-type': hit.type ?? 'text/html; charset=utf-8' };
    if (hit.location) headers.location = hit.location;
    return new Response(hit.status >= 300 && hit.status < 400 ? null : hit.body ?? '', { status: hit.status, headers });
  };
}

/* ── PageSpeed Insights fixture (shape of the v5 API response) ── */

export function fixturePsi(url: string, strategy: 'mobile' | 'desktop'): unknown {
  const mobile = strategy === 'mobile';
  const seed = url.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + (mobile ? 7 : 0);
  const r = noise(seed);
  const metric = (p: number, category: string) => ({ percentile: p, category });
  const lab = {
    categories: { performance: { score: Math.round((mobile ? 0.62 + r * 0.25 : 0.86 + r * 0.12) * 100) / 100 } },
    audits: {
      'largest-contentful-paint': { numericValue: mobile ? 2900 + r * 1800 : 900 + r * 700 },
      'cumulative-layout-shift': { numericValue: Math.round((0.02 + r * 0.08) * 1000) / 1000 },
      'total-blocking-time': { numericValue: mobile ? 180 + r * 400 : 20 + r * 90 },
    },
  };
  const fieldMetrics = { LARGEST_CONTENTFUL_PAINT_MS: metric(mobile ? 2600 : 1700, mobile ? 'AVERAGE' : 'FAST'), INTERACTION_TO_NEXT_PAINT: metric(mobile ? 240 : 110, mobile ? 'AVERAGE' : 'FAST'), CUMULATIVE_LAYOUT_SHIFT_SCORE: metric(4, 'FAST') };
  // Home page: URL-level field data; other pages: origin fallback; contact: no field data at all.
  if (/\/contact$/.test(url)) return { id: url, lighthouseResult: lab };
  if (/\/(tr|en)$/.test(url)) return { id: url, loadingExperience: { id: url, metrics: fieldMetrics, overall_category: mobile ? 'AVERAGE' : 'FAST' }, originLoadingExperience: { id: 'https://yoca.net', metrics: fieldMetrics, overall_category: 'AVERAGE' }, lighthouseResult: lab };
  return { id: url, loadingExperience: { id: 'https://yoca.net', origin_fallback: true, metrics: fieldMetrics, overall_category: 'AVERAGE' }, originLoadingExperience: { id: 'https://yoca.net', metrics: fieldMetrics, overall_category: 'AVERAGE' }, lighthouseResult: lab };
}
