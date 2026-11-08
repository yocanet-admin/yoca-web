import { accessToken, GoogleAuthError, GSC_ENV, readServiceAccount, type FetchLike } from '@/lib/seoPanel/googleAuth';
import { fixtureQuery } from '@/lib/seoPanel/fixture';
import type { DateRange, Row, SeoFilters } from '@/lib/seoPanel/model';

/**
 * Yoca Kokpit SEO — Search Console Search Analytics adapter (server only).
 *
 *   live     service account configured (lib/seoPanel/googleAuth.ts)
 *   fixture  SEO_FIXTURE=1 — synthetic data, "Örnek veri" badge; refused on
 *            Vercel production, never turns itself on
 *   none     not configured → "Search Console bağlantısı kurulmadı" + the
 *            missing step; nothing is fetched
 */

export type Dimension = 'date' | 'query' | 'page' | 'country' | 'device';
export interface GscQuery { range: DateRange; filters: SeoFilters; dimensions: Dimension[]; rowLimit?: number; equals?: Array<{ dimension: 'query' | 'page'; expression: string }> }
export interface GscAdapter { source: 'live' | 'fixture'; property: string; query(q: GscQuery): Promise<Row[]> }

export const FIXTURE_ENV = 'SEO_FIXTURE';
export const SETUP_STEPS = [
  'Google Cloud’da bir proje açın ve “Google Search Console API”yi etkinleştirin.',
  'Bu projede bir servis hesabı oluşturun ve JSON anahtarı indirin.',
  'Servis hesabının e-posta adresini Search Console’da https://yoca.net/ mülküne kullanıcı (Kısıtlı yeterli) olarak ekleyin.',
  `Vercel → Settings → Environment Variables: ${GSC_ENV.serviceAccount} = JSON dosyasının tamamı (Sensitive, Production). İsteğe bağlı: ${GSC_ENV.property}.`,
];

export type GscStatus =
  | { mode: 'live'; property: string }
  | { mode: 'fixture'; property: string }
  | { mode: 'none'; property: string; message: string; step: string };

export class FixtureRefusedError extends Error {}

export function fixtureEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env[FIXTURE_ENV] !== '1') return false;
  if (env.VERCEL_ENV === 'production') throw new FixtureRefusedError(`${FIXTURE_ENV} production ortamında kullanılamaz; Vercel Production ayarlarından kaldırın.`);
  return true;
}

export function gscStatus(defaultProperty: string, env: Record<string, string | undefined> = process.env): GscStatus {
  const property = (env[GSC_ENV.property] || defaultProperty).trim();
  if (fixtureEnabled(env)) return { mode: 'fixture', property };
  const sa = readServiceAccount(env);
  if (sa.ok) return { mode: 'live', property };
  return sa.missing === 'env'
    ? { mode: 'none', property, message: 'Search Console bağlantısı kurulmadı.', step: `Eksik adım: ${GSC_ENV.serviceAccount} tanımlı değil. ${SETUP_STEPS.join(' ')}` }
    : { mode: 'none', property, message: 'Search Console bağlantısı kurulmadı.', step: `Eksik adım: ${sa.message} Anahtarı yeniden indirip değişkene dosyanın tamamını yapıştırın.` };
}

const DEVICE_EXPR: Record<string, string> = { desktop: 'DESKTOP', mobile: 'MOBILE', tablet: 'TABLET' };

/** The exact request body sent to searchAnalytics.query (pure; the comparison differs only in dates). */
export function requestBody(q: GscQuery): Record<string, unknown> {
  const filters: Array<{ dimension: string; operator: 'equals'; expression: string }> = [];
  if (q.filters.country) filters.push({ dimension: 'country', operator: 'equals', expression: q.filters.country });
  if (q.filters.device) filters.push({ dimension: 'device', operator: 'equals', expression: DEVICE_EXPR[q.filters.device] });
  for (const e of q.equals ?? []) filters.push({ dimension: e.dimension, operator: 'equals', expression: e.expression });
  return {
    startDate: q.range.start,
    endDate: q.range.end,
    dimensions: q.dimensions,
    type: q.filters.searchType,
    dataState: q.filters.dataState,
    rowLimit: Math.min(25_000, Math.max(1, q.rowLimit ?? 1000)),
    ...(filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {}),
  };
}

export class GscError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function liveAdapter(property: string, fetchImpl: FetchLike = fetch): GscAdapter {
  return {
    source: 'live',
    property,
    async query(q) {
      const sa = readServiceAccount();
      if (!sa.ok) throw new GscError('Search Console bağlantısı kurulmadı.', 503);
      let token: string;
      try {
        token = await accessToken(sa.account, fetchImpl);
      } catch (e) {
        throw new GscError(e instanceof GoogleAuthError ? e.message : 'Google erişim anahtarı alınamadı.', 502);
      }
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
      const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody(q)), signal: AbortSignal.timeout(20_000) });
      const json = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: { message?: string } };
      if (res.status === 403) throw new GscError(`Servis hesabının ${property} mülküne erişimi yok: e-postasını Search Console’da kullanıcı olarak ekleyin.`, 502);
      if (!res.ok) throw new GscError(`Search Console yanıtı başarısız (${res.status}).`, 502);
      return (json.rows ?? []).map((r) => ({ keys: r.keys ?? [], clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? null }));
    },
  };
}

export function fixtureAdapter(property: string, today: string): GscAdapter {
  return { source: 'fixture', property, query: async (q) => fixtureQuery(q, today) };
}

/** The adapter for the current environment, or null when not configured. */
export function adapterFor(status: GscStatus, today: string): GscAdapter | null {
  if (status.mode === 'fixture') return fixtureAdapter(status.property, today);
  if (status.mode === 'live') return liveAdapter(status.property);
  return null;
}
