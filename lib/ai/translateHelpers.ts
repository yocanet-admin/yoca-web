/**
 * Yoca — pure helpers for Insight translations (no imports; server + browser;
 * unit-tested in tests/multilang.test.ts).
 */

export const ALL_LOCALES = ['tr', 'en', 'az', 'ar'] as const;
export type TLocale = (typeof ALL_LOCALES)[number];

/** Every locale except the source one, in a fixed order (EN, AZ, AR for a TR source). */
export function targetLocales(source: string): TLocale[] {
  const order: TLocale[] = ['en', 'az', 'ar', 'tr'];
  return order.filter((l) => l !== source);
}

/**
 * Internal links in a translated body point to the target language:
 *   ](/tr/services/x)              → ](/en/services/x)
 *   ](https://yoca.net/tr/contact) → ](/en/contact)
 * Links to another article (/tr/insights/<slug>) stay as they are: that
 * article may not exist in the target language with the same slug, and a
 * working link in the source language is better than a broken one.
 * Image references (yoca-image:<id>) and external links are untouched.
 */
export function localizeInternalLinks(body: string, from: string, to: string): string {
  if (from === to) return body;
  const host = '(?:https?:\\/\\/(?:www\\.)?yoca\\.net)?';
  const re = new RegExp(`\\]\\(${host}\\/${from}(\\/[^)\\s]*)?\\)`, 'g');
  return body.replace(re, (whole, rest: string | undefined) => {
    const path = rest ?? '';
    if (/^\/insights\/[^/]+/.test(path)) return whole;
    return `](/${to}${path})`;
  });
}

const MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', ə: 'e', İ: 'i', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u', Ə: 'e' };

/** URL-safe ASCII slug; '' when nothing Latin is left (e.g. an Arabic-only title). */
export function asciiSlug(input: string): string {
  return input
    .split('')
    .map((ch) => MAP[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '');
}

/** The fields a translation is made from. Pure. */
export interface TranslatableFields {
  title: string;
  excerpt: string;
  body_md: string;
  seo_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  faq: Array<{ q: string; a: string }>;
  tags: string[];
  cover_alt: string | null;
  cover_caption: string | null;
}

/**
 * Canonical text of the source fields; its SHA-256 is stored on each
 * translation (source_hash) so the editor can say "the source changed after
 * this translation". Stable key order, trimmed values.
 */
export function sourceFingerprintText(row: TranslatableFields): string {
  return JSON.stringify([
    row.title.trim(),
    row.excerpt.trim(),
    row.body_md.trim(),
    (row.seo_title ?? '').trim(),
    (row.meta_description ?? '').trim(),
    (row.og_title ?? '').trim(),
    (row.og_description ?? '').trim(),
    (row.faq ?? []).map((f) => [f.q.trim(), f.a.trim()]),
    (row.tags ?? []).map((t) => t.trim()),
    (row.cover_alt ?? '').trim(),
    (row.cover_caption ?? '').trim(),
  ]);
}

/** SHA-256 hex of the fingerprint text (WebCrypto: browser and Node ≥ 19). */
export async function sourceFingerprint(row: TranslatableFields): Promise<string> {
  const data = new TextEncoder().encode(sourceFingerprintText(row));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same slug already used in that language → add -2, -3 … Pure. */
export function uniqueSlug(base: string, taken: Iterable<string>, fallback: string): string {
  const used = new Set(taken);
  const start = base || fallback;
  if (!used.has(start)) return start;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${start}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${start}-${Date.now().toString(36)}`;
}

export interface CostEstimateInput {
  bodyChars: number;
  languages: number;
  price: { input: number; output?: number } | null | undefined;
}

/**
 * Rough USD estimate for "Tüm dilleri oluştur": per language one translation
 * (body in + out), one style review (body in, short out) and one style edit
 * (body in + out). Instructions ≈ 1 500 tokens per call; ~3 characters per
 * token; +25 % margin for reasoning tokens. null when the model has no price.
 */
export function estimateMultilangCost({ bodyChars, languages, price }: CostEstimateInput): number | null {
  if (!price) return null;
  const body = Math.ceil(bodyChars / 3);
  const sys = 1500;
  const perLang = {
    input: 3 * (sys + body),
    output: Math.ceil(body * 1.15) + 400 + body,
  };
  const usd = (languages * (perLang.input * price.input + perLang.output * (price.output ?? price.input))) / 1_000_000;
  return Math.round(usd * 1.25 * 10_000) / 10_000;
}
