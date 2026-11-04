/**
 * Yoca Operasyon — money without floating point (pure; unit-tested).
 *
 * Amounts are handled as integer minor units (kuruş/cent) in BigInt and come
 * from / go to the database as numeric(14,2) strings. Totals are always per
 * currency; there is no conversion and no mixed total. An unknown amount is
 * `null` and is shown as "Tutar bilinmiyor", never as 0.
 */

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'AZN', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Minor = bigint;
// BigInt() instead of bigint literals: the project compiles without an ES2020 target.
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/** "1.234,56", "1234.56", "1 234,5", 1234.5 → 123456n; '' / null → null; invalid → NaN-marker (throws). */
export function toMinor(input: string | number | null | undefined): Minor | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/\s| /g, '');
  if (!s) return null;
  const neg = s.startsWith('-');
  if (neg || s.startsWith('+')) s = s.slice(1);
  // Decimal separator: the last of "," or "." when it is followed by 1–2 digits; others are thousands separators.
  const m = /^(.*?)([.,](\d{1,2}))?$/.exec(s);
  if (!m) throw new Error('Geçersiz tutar');
  let whole = m[1];
  const frac = m[3] ?? '';
  if (/[.,]/.test(whole)) {
    if (!/^\d{1,3}([.,]\d{3})+$/.test(whole)) throw new Error('Geçersiz tutar');
    whole = whole.replace(/[.,]/g, '');
  }
  if (!/^\d+$/.test(whole || '0')) throw new Error('Geçersiz tutar');
  const minor = BigInt(whole || '0') * HUNDRED + BigInt((frac + '00').slice(0, 2));
  return neg ? -minor : minor;
}

/** Like toMinor but returns undefined for invalid text instead of throwing. */
export function parseAmount(input: string | number | null | undefined): Minor | null | undefined {
  try { return toMinor(input); } catch { return undefined; }
}

/** 123456n → "1234.56" (for the database). */
export function minorToDb(value: Minor): string {
  const neg = value < ZERO;
  const abs = neg ? -value : value;
  return `${neg ? '-' : ''}${abs / HUNDRED}.${String(abs % HUNDRED).padStart(2, '0')}`;
}

/** 123456n, 'TRY' → "₺1.234,56" (tr-TR). */
export function formatMinor(value: Minor, currency: string): string {
  const neg = value < ZERO;
  const abs = neg ? -value : value;
  const whole = (abs / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = String(abs % HUNDRED).padStart(2, '0');
  const sym: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£', AZN: '₼' };
  return `${neg ? '−' : ''}${sym[currency] ?? ''}${whole},${frac}${sym[currency] ? '' : ` ${currency}`}`;
}

/** Database value (numeric string / number / null) → display text; null → "Tutar bilinmiyor". */
export function formatAmount(value: string | number | null | undefined, currency: string | null | undefined): string {
  const minor = parseAmount(value);
  if (minor === null || minor === undefined) return 'Tutar bilinmiyor';
  if (!currency) return `${formatMinor(minor, 'XXX').replace(' XXX', '')} (para birimi yok)`;
  return formatMinor(minor, currency);
}

export interface MoneyLine {
  amount: string | number | null | undefined;
  currency: string | null | undefined;
}

/** Totals per currency. Lines with unknown amount or currency are counted, not added. */
export function totalsByCurrency(lines: MoneyLine[]): { totals: Record<string, Minor>; unknown: number } {
  const totals: Record<string, Minor> = {};
  let unknown = 0;
  for (const l of lines) {
    const minor = parseAmount(l.amount);
    if (minor === null || minor === undefined || !l.currency) { unknown += 1; continue; }
    totals[l.currency] = (totals[l.currency] ?? ZERO) + minor;
  }
  return { totals, unknown };
}

export function formatTotals(totals: Record<string, Minor>): string {
  const keys = Object.keys(totals).sort();
  return keys.length ? keys.map((c) => formatMinor(totals[c], c)).join(' · ') : '—';
}
