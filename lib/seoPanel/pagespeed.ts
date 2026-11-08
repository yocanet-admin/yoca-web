/**
 * Yoca Kokpit SEO — PageSpeed Insights (server only; fetch is injected).
 *
 * Two kinds of numbers, NEVER mixed:
 *  - LAB   (Lighthouse): one simulated run now — performance score, LCP, CLS,
 *          TBT. "Laboratuvar ölçümü — tek seferlik test".
 *  - FIELD (Chrome UX Report): p75 of real Chrome users over the last 28 days —
 *          LCP, INP, CLS + overall category. "Gerçek kullanıcı verisi (son 28 gün)".
 *          Scope: 'url' (this page), 'origin' (whole site, PSI fell back), or
 *          'none' → "Gerçek kullanıcı verisi yok (yeterli trafik yok)".
 * The API key (PAGESPEED_API_KEY) is optional; without one PSI allows a small
 * keyless quota. Locally, SEO_FIXTURE=1 uses lib/seoPanel/fixture.ts instead.
 */

export const PSI_KEY_ENV = 'PAGESPEED_API_KEY';
export const PSI_MAX_PAGES = 5;
export const LAB_LABEL = 'Laboratuvar ölçümü — tek seferlik test';
export const FIELD_LABEL = 'Gerçek kullanıcı verisi (son 28 gün)';
export const NO_FIELD = 'Gerçek kullanıcı verisi yok (yeterli trafik yok)';
export const FIELD_SCOPE_LABEL = { url: 'Bu sayfanın verisi', origin: 'Sayfaya özel veri yok — tüm sitenin (origin) verisi', none: NO_FIELD } as const;

export type Strategy = 'mobile' | 'desktop';
export interface Lab { perfScore: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null }
export interface Field { scope: 'url' | 'origin' | 'none'; lcpP75Ms: number | null; inpP75Ms: number | null; clsP75: number | null; category: string | null }
export interface PsiResult { url: string; strategy: Strategy; lab: Lab; field: Field }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
type Exp = { id?: string; origin_fallback?: boolean; overall_category?: string; metrics?: Record<string, { percentile?: number; category?: string }> };
const hasMetrics = (e: Exp | undefined) => Boolean(e?.metrics && Object.keys(e.metrics).length);

function fieldOf(e: Exp, scope: 'url' | 'origin'): Field {
  const m = e.metrics ?? {};
  const cls = num(m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
  return { scope, lcpP75Ms: num(m.LARGEST_CONTENTFUL_PAINT_MS?.percentile), inpP75Ms: num(m.INTERACTION_TO_NEXT_PAINT?.percentile), clsP75: cls === null ? null : cls / 100, category: e.overall_category ?? null };
}

/** Parses a runPagespeed v5 response. Field data: page level only when PSI did not fall back to the origin. */
export function parsePsi(json: unknown, url: string, strategy: Strategy): PsiResult {
  const j = (json ?? {}) as { loadingExperience?: Exp; originLoadingExperience?: Exp; lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number }> } };
  const lh = j.lighthouseResult;
  const score = num(lh?.categories?.performance?.score);
  const lab: Lab = {
    perfScore: score === null ? null : Math.round(score * 100),
    lcpMs: num(lh?.audits?.['largest-contentful-paint']?.numericValue),
    cls: num(lh?.audits?.['cumulative-layout-shift']?.numericValue),
    tbtMs: num(lh?.audits?.['total-blocking-time']?.numericValue),
  };
  let field: Field = { scope: 'none', lcpP75Ms: null, inpP75Ms: null, clsP75: null, category: null };
  if (hasMetrics(j.loadingExperience) && !j.loadingExperience?.origin_fallback) field = fieldOf(j.loadingExperience as Exp, 'url');
  else if (hasMetrics(j.originLoadingExperience)) field = fieldOf(j.originLoadingExperience as Exp, 'origin');
  else if (hasMetrics(j.loadingExperience)) field = fieldOf(j.loadingExperience as Exp, 'origin');
  return { url, strategy, lab, field };
}

export function psiUrl(url: string, strategy: Strategy, key?: string): string {
  const q = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) q.set('key', key);
  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q.toString()}`;
}

export async function runPsi(url: string, strategy: Strategy, opts: { fetch: (u: string, i?: RequestInit) => Promise<Response>; key?: string; timeoutMs?: number }): Promise<PsiResult> {
  const res = await opts.fetch(psiUrl(url, strategy, opts.key), { method: 'GET', signal: AbortSignal.timeout(opts.timeoutMs ?? 50_000) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(res.status === 429 ? 'PageSpeed kotası doldu (anahtarsız kota küçüktür; PAGESPEED_API_KEY ekleyin ya da sonra deneyin).' : `PageSpeed yanıtı başarısız (${res.status}).`);
  return parsePsi(json, url, strategy);
}

/** Key pages tested by default (≤ 5). */
export const KEY_PAGES = ['/tr', '/en', '/tr/services', '/tr/products', '/tr/contact'];
