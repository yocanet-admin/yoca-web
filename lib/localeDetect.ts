/**
 * Yoca — language for a request WITHOUT a locale prefix (edge-safe, pure).
 * Order: saved choice (yoca_locale cookie, set by the language switcher) →
 * the browser's preferred languages (Accept-Language, in q order; regional
 * variants match: tr-TR → tr, en-US → en, az-Latn-AZ → az) → the visitor's
 * country as a fallback (Vercel's x-vercel-ip-country request header; no
 * location prompt, no paid API) → English. A missing signal is simply skipped.
 *
 * A request WITH a prefix (/en, /tr, /az, /ar) is never changed by any of this.
 */

export const APP_LOCALES = ['en', 'tr', 'az', 'ar'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const LOCALE_COOKIE = 'yoca_locale';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value);
}

/**
 * Country → language, only where it is clear (the fallback signal).
 * Yoca is based in Türkiye and works across the Caucasus and MENA (site copy;
 * the working-region clocks are Istanbul, Baku, London, Dubai):
 *   TR → Turkish · AZ → Azerbaijani
 *   Gulf (AE, SA, QA, KW, BH, OM) and the nearby Arabic-speaking MENA markets
 *   (JO, IQ, EG) → Arabic
 * Everything else — including the UK and Europe, and multilingual markets
 * where the right language is not clear — stays English.
 */
export const COUNTRY_LOCALE: Readonly<Record<string, AppLocale>> = {
  TR: 'tr',
  AZ: 'az',
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar', IQ: 'ar', EG: 'ar',
};

/** Accept-Language → supported locales in the browser's order (q desc, then position). */
export function localesFromAcceptLanguage(header: string | null | undefined): AppLocale[] {
  if (!header) return [];
  const items = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { primary: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((item) => item.primary && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const out: AppLocale[] = [];
  for (const { primary } of items) if (isAppLocale(primary) && !out.includes(primary)) out.push(primary);
  return out;
}

export function localeFromCountry(country: string | null | undefined): AppLocale | null {
  const code = (country ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? COUNTRY_LOCALE[code] ?? null : null;
}

export type LocaleSource = 'cookie' | 'browser' | 'country' | 'default';

export function pickLocale(input: { cookie?: string | null; acceptLanguage?: string | null; country?: string | null }): { locale: AppLocale; source: LocaleSource } {
  if (isAppLocale(input.cookie)) return { locale: input.cookie, source: 'cookie' };
  const browser = localesFromAcceptLanguage(input.acceptLanguage)[0];
  if (browser) return { locale: browser, source: 'browser' };
  const country = localeFromCountry(input.country);
  if (country) return { locale: country, source: 'country' };
  return { locale: 'en', source: 'default' };
}
