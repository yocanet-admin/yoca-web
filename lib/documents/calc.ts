/**
 * Yoca — Teklifler ve Belgeler: amounts (pure, no floating point; unit-tested).
 *
 * The application computes every amount; the AI never does. Rules:
 *  - Money is integer minor units (kuruş / cent) in BigInt.
 *  - Quantity: up to 3 decimals; percentages (discount, tax, payment): up to 2.
 *  - Rounding: half up (0,005 → 0,01), on minor units, at these points only:
 *      line gross  = quantity × unit price           (rounded per line)
 *      line discount = line gross × discount %       (rounded per line)
 *      tax          = Σ line nets of one rate × rate  (rounded once per rate)
 *      payment step = grand total × step %           (rounded per step)
 *  - When every payment step is a percentage and they add up to exactly 100 %,
 *    the last step takes the rounding remainder, so the plan always equals the
 *    grand total to the kuruş. Any other plan must add up exactly or it is
 *    reported as a problem (and the document cannot be finalized).
 *  - A line without a price is "missing": the document has no grand total and
 *    the line is listed by name. It is never counted as 0.
 */

import type { DocContent, LineItem, PaymentStep } from '@/lib/documents/model';

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

export type Scaled = bigint;

/** Divide with half-up rounding (both operands ≥ 0 or numerator < 0 handled symmetric). */
export function divRound(n: bigint, d: bigint): bigint {
  if (d === ZERO) throw new Error('division by zero');
  const neg = (n < ZERO) !== (d < ZERO);
  const an = n < ZERO ? -n : n;
  const ad = d < ZERO ? -d : d;
  const q = an / ad;
  const r = an % ad;
  const up = r * TWO >= ad ? q + ONE : q;
  return neg ? -up : up;
}

const pow10 = (n: number) => { let p = ONE; for (let i = 0; i < n; i += 1) p *= TEN; return p; };

/**
 * Plain decimal ("1,5", "2.25", "20") with at most `scale` decimals → scaled integer.
 * No thousands separators. '' → null. Invalid → undefined.
 */
export function parseScaled(input: string, scale: number): Scaled | null | undefined {
  const s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  const m = /^(\d{1,12})(?:[.,](\d+))?$/.exec(s);
  if (!m) return undefined;
  const frac = m[2] ?? '';
  if (frac.length > scale) return undefined;
  return BigInt(m[1]) * pow10(scale) + BigInt((frac + '0'.repeat(scale)).slice(0, scale) || '0');
}

/**
 * Money text → minor units. Accepts "12500", "12.500", "12.500,50", "12500.5",
 * "12,500.50". A separator followed by exactly 1–2 digits at the end is the
 * decimal separator; other separators must group thousands. '' → null; invalid → undefined.
 */
export function parseMoney(input: string): bigint | null | undefined {
  const s = input.trim().replace(/[\s\u00a0₺$€£₼]/g, '').replace(/(TRY|TL|USD|EUR|GBP|AZN)$/i, '');
  if (!s) return null;
  const m = /^(.*?)(?:([.,])(\d{1,2}))?$/.exec(s);
  if (!m) return undefined;
  let whole = m[1];
  const frac = m[3] ?? '';
  if (/[.,]/.test(whole)) {
    if (!/^\d{1,3}([.,]\d{3})+$/.test(whole)) return undefined;
    const seps = whole.replace(/\d/g, '');
    if (new Set(seps.split('')).size > 1) return undefined;
    if (m[2] && seps.includes(m[2])) return undefined;
    whole = whole.replace(/[.,]/g, '');
  }
  if (!/^\d{1,13}$/.test(whole || (frac ? '0' : ''))) return undefined;
  return BigInt(whole || '0') * BigInt(100) + BigInt((frac + '00').slice(0, 2));
}

export interface LineResult {
  id: string;
  index: number;
  label: string;
  /** null when the price (or quantity) is missing / invalid. */
  gross: bigint | null;
  discount: bigint | null;
  net: bigint | null;
  taxRateBp: bigint | null;
  error: string | null;
  missingPrice: boolean;
}

export interface TaxRow {
  /** Rate in basis points (2000 = %20). */
  rateBp: bigint;
  base: bigint;
  tax: bigint;
}

export interface Totals {
  lines: LineResult[];
  /** Σ gross (before discounts) of priced lines. */
  subtotal: bigint;
  discount: bigint;
  net: bigint;
  taxes: TaxRow[];
  tax: bigint;
  /** null when any line is missing a price or has an error. */
  grand: bigint | null;
  complete: boolean;
  missingPrices: string[];
  errors: string[];
}

const isBlankLine = (i: LineItem) => !i.title.trim() && !i.description.trim() && !i.unitPrice.trim();

export function computeLine(item: LineItem, index: number): LineResult {
  const label = item.title.trim() || `${index + 1}. kalem`;
  const base: LineResult = { id: item.id, index, label, gross: null, discount: null, net: null, taxRateBp: null, error: null, missingPrice: false };
  const qty = parseScaled(item.quantity || '1', 3);
  if (qty === undefined || qty === null) return { ...base, error: `${label}: miktar geçersiz (en çok 3 ondalık, örn. 1,5).` };
  if (qty <= ZERO) return { ...base, error: `${label}: miktar sıfırdan büyük olmalı.` };
  const disc = parseScaled(item.discountPct || '0', 2);
  if (disc === undefined || disc === null || disc > BigInt(10000)) return { ...base, error: `${label}: indirim oranı 0–100 arasında olmalı.` };
  const rate = parseScaled(item.taxRate || '0', 2);
  if (rate === undefined || rate === null || rate > BigInt(10000)) return { ...base, error: `${label}: vergi oranı 0–100 arasında olmalı.` };
  const price = parseMoney(item.unitPrice);
  if (price === null) return { ...base, taxRateBp: rate, missingPrice: true };
  if (price === undefined) return { ...base, error: `${label}: birim fiyat okunamadı (örn. 12.500,00).` };
  const gross = divRound(qty * price, BigInt(1000));
  const discount = divRound(gross * disc, BigInt(10000));
  return { ...base, gross, discount, net: gross - discount, taxRateBp: rate };
}

export function computeTotals(items: LineItem[]): Totals {
  const lines = items.map((it, i) => ({ it, i })).filter(({ it }) => !isBlankLine(it)).map(({ it, i }) => computeLine(it, i));
  let subtotal = ZERO;
  let discount = ZERO;
  let net = ZERO;
  const byRate = new Map<string, TaxRow>();
  const missingPrices: string[] = [];
  const errors: string[] = [];
  for (const l of lines) {
    if (l.error) { errors.push(l.error); continue; }
    if (l.missingPrice) { missingPrices.push(l.label); continue; }
    subtotal += l.gross as bigint;
    discount += l.discount as bigint;
    net += l.net as bigint;
    const key = String(l.taxRateBp);
    const row = byRate.get(key) ?? { rateBp: l.taxRateBp as bigint, base: ZERO, tax: ZERO };
    row.base += l.net as bigint;
    byRate.set(key, row);
  }
  const taxes = Array.from(byRate.values()).sort((a, b) => (a.rateBp < b.rateBp ? -1 : a.rateBp > b.rateBp ? 1 : 0));
  let tax = ZERO;
  for (const t of taxes) { t.tax = divRound(t.base * t.rateBp, BigInt(10000)); tax += t.tax; }
  const complete = lines.length > 0 && !missingPrices.length && !errors.length;
  return { lines, subtotal, discount, net, taxes, tax, grand: complete ? net + tax : null, complete, missingPrices, errors };
}

export interface PaymentRow {
  id: string;
  label: string;
  due: string;
  mode: 'percent' | 'amount';
  pctBp: bigint | null;
  amount: bigint | null;
  error: string | null;
}

export interface PaymentPlan {
  rows: PaymentRow[];
  sum: bigint;
  /** Human text when the plan does not match the grand total; null when fine or empty. */
  problem: string | null;
  /** The last step absorbed this many minor units of rounding (0 = none). */
  adjusted: bigint;
}

export function computePayment(steps: PaymentStep[], grand: bigint | null, fmt: (m: bigint) => string = (m) => String(m)): PaymentPlan {
  const used = steps.filter((s) => s.value.trim() || s.label.trim());
  if (!used.length) return { rows: [], sum: ZERO, problem: null, adjusted: ZERO };
  const rows: PaymentRow[] = used.map((s, i) => {
    const label = s.label.trim() || `${i + 1}. ödeme`;
    if (s.mode === 'percent') {
      const pct = parseScaled(s.value, 2);
      if (pct === undefined || pct === null || pct <= ZERO || pct > BigInt(10000)) return { id: s.id, label, due: s.due, mode: s.mode, pctBp: null, amount: null, error: `${label}: yüzde 0–100 arasında olmalı.` };
      return { id: s.id, label, due: s.due, mode: s.mode, pctBp: pct, amount: grand === null ? null : divRound(grand * pct, BigInt(10000)), error: null };
    }
    const amount = parseMoney(s.value);
    if (amount === undefined || amount === null || amount <= ZERO) return { id: s.id, label, due: s.due, mode: s.mode, pctBp: null, amount: null, error: `${label}: tutar okunamadı.` };
    return { id: s.id, label, due: s.due, mode: s.mode, pctBp: null, amount, error: null };
  });
  const firstError = rows.find((r) => r.error)?.error ?? null;
  if (firstError) return { rows, sum: ZERO, problem: firstError, adjusted: ZERO };
  const pctSum = rows.reduce((a, r) => a + (r.pctBp ?? ZERO), ZERO);
  if (pctSum > BigInt(10000)) return { rows, sum: ZERO, problem: `Ödeme planındaki yüzdeler toplamı %100’ü aşıyor (%${fmtPct(pctSum)}).`, adjusted: ZERO };
  if (grand === null) return { rows, sum: ZERO, problem: 'Genel toplam hesaplanamadığı için ödeme planı kontrol edilemedi (fiyatı eksik kalem var).', adjusted: ZERO };
  let adjusted = ZERO;
  if (rows.every((r) => r.mode === 'percent') && pctSum === BigInt(10000)) {
    const head = rows.slice(0, -1).reduce((a, r) => a + (r.amount as bigint), ZERO);
    const last = rows[rows.length - 1];
    const exact = grand - head;
    adjusted = exact - (last.amount as bigint);
    last.amount = exact;
  }
  const sum = rows.reduce((a, r) => a + (r.amount as bigint), ZERO);
  if (sum !== grand) {
    const diff = grand - sum;
    return { rows, sum, problem: `Ödeme planı genel toplamla uyuşmuyor: plan ${fmt(sum)}, toplam ${fmt(grand)} (fark ${fmt(diff < ZERO ? -diff : diff)} ${diff > ZERO ? 'eksik' : 'fazla'}).`, adjusted };
  }
  return { rows, sum, problem: null, adjusted };
}

export function fmtPct(bp: bigint, locale: 'tr' | 'en' = 'tr'): string {
  const whole = bp / BigInt(100);
  const frac = bp % BigInt(100);
  if (frac === ZERO) return String(whole);
  const f = String(frac).padStart(2, '0').replace(/0$/, '');
  return `${whole}${locale === 'tr' ? ',' : '.'}${f}`;
}

export function fmtQty(input: string, locale: 'tr' | 'en' = 'tr'): string {
  const q = parseScaled(input || '1', 3);
  if (q === null || q === undefined) return input;
  const whole = q / BigInt(1000);
  const frac = String(q % BigInt(1000)).padStart(3, '0').replace(/0+$/, '');
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'tr' ? '.' : ',');
  return frac ? `${w}${locale === 'tr' ? ',' : '.'}${frac}` : w;
}

// AZN has no symbol: the embedded font has no ₼ glyph, so it is written as a code.
const SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

/** 123456n, 'TRY', 'tr' → "₺1.234,56"; en → "₺1,234.56". */
export function fmtMoney(minor: bigint, currency: string, locale: 'tr' | 'en' = 'tr', withSymbol = true): string {
  const neg = minor < ZERO;
  const abs = neg ? -minor : minor;
  const whole = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'tr' ? '.' : ',');
  const frac = String(abs % BigInt(100)).padStart(2, '0');
  const num = `${whole}${locale === 'tr' ? ',' : '.'}${frac}`;
  const sym = SYMBOL[currency];
  if (!withSymbol) return `${neg ? '−' : ''}${num}`;
  return sym ? `${neg ? '−' : ''}${sym}${num}` : `${neg ? '−' : ''}${num} ${currency}`;
}

/** Everything the panel and the PDF need about the money of one document. */
export function computeDocument(c: DocContent) {
  const totals = computeTotals(c.items);
  const fmt = (m: bigint) => fmtMoney(m, c.currency, c.locale);
  const payment = computePayment(c.payment, totals.grand, fmt);
  return { totals, payment, fmt };
}

/** Plain JSON copy of the totals (strings) for storing in a version snapshot. */
export function totalsJson(c: DocContent) {
  const { totals, payment } = computeDocument(c);
  const s = (v: bigint | null) => (v === null ? null : v.toString());
  return {
    currency: c.currency,
    subtotal: s(totals.subtotal), discount: s(totals.discount), net: s(totals.net), tax: s(totals.tax), grand: s(totals.grand),
    taxes: totals.taxes.map((t) => ({ rateBp: t.rateBp.toString(), base: t.base.toString(), tax: t.tax.toString() })),
    lines: totals.lines.map((l) => ({ id: l.id, gross: s(l.gross), discount: s(l.discount), net: s(l.net), taxRateBp: s(l.taxRateBp) })),
    payment: payment.rows.map((r) => ({ id: r.id, label: r.label, due: r.due, pctBp: s(r.pctBp), amount: s(r.amount) })),
    paymentAdjusted: payment.adjusted.toString(),
  };
}

/** Minor units → numeric(14,2) text for the list column. */
export function minorToNumeric(m: bigint): string {
  const neg = m < ZERO;
  const a = neg ? -m : m;
  return `${neg ? '-' : ''}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, '0')}`;
}
