/**
 * Yoca Giderler — pure rules (unit-tested).
 *
 * One list of "obligations" built from two sources, each counted once:
 *   - source 'fin': a period of a Giderler expense (fin_periods + fin_payments)
 *   - source 'ops': an Operasyon provider-cost period (fin_ops_periods +
 *     fin_ops_payments — the same ops_payments rows the Operasyon screens use)
 * Status is computed from the period amount, its due date and its VALID
 * payments (voided ones ignored, refunds subtract, adjustments are signed).
 * Money is per currency; nothing is converted or mixed.
 */

import { daysUntil } from '@/lib/ops/model';
import { parseAmount, type Minor } from '@/lib/ops/money';

const ZERO = BigInt(0);

export const CATEGORIES = ['rent', 'internet', 'phone', 'accounting', 'software', 'subscription', 'utilities', 'tax', 'personnel', 'services', 'equipment', 'maintenance', 'travel', 'office', 'marketing', 'insurance', 'bank', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category | 'ops', string> = {
  rent: 'Kira', internet: 'İnternet', phone: 'Telefon', accounting: 'Muhasebe', software: 'Yazılım', subscription: 'Abonelik',
  utilities: 'Fatura ve aidat', tax: 'Vergi ve harç', personnel: 'Personel', services: 'Dış hizmet', equipment: 'Ekipman', maintenance: 'Bakım ve onarım', insurance: 'Sigorta', bank: 'Banka, komisyon ve kredi', travel: 'Ulaşım', office: 'Ofis alışverişi',
  marketing: 'Reklam ve tanıtım', other: 'Diğer', ops: 'Operasyon (sağlayıcı)',
};
export const RECURRING_HINT: Category[] = ['rent', 'internet', 'phone', 'accounting', 'software', 'subscription', 'utilities'];

export const RECURRENCES = ['monthly', 'quarterly', 'yearly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const RECURRENCE_LABEL: Record<Recurrence, string> = { monthly: 'Aylık', quarterly: 'Üç aylık', yearly: 'Yıllık' };

export const METHODS = ['bank_transfer', 'card', 'cash', 'direct_debit', 'other'] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Havale / EFT', card: 'Kart', cash: 'Nakit', direct_debit: 'Otomatik talimat', other: 'Diğer' };

export const PAYMENT_KIND_LABEL: Record<string, string> = { payment: 'Ödeme', refund: 'İade', adjustment: 'Düzeltme' };

export interface Expense {
  id: string;
  title: string;
  category: Category;
  kind: 'recurring' | 'once';
  recurrence: Recurrence | null;
  first_due_on: string;
  ends_on: string | null;
  amount: string | null;
  currency: string;
  provider_id: string | null;
  vendor_name: string | null;
  owner_email: string | null;
  pay_account: string | null;
  pay_method: Method | null;
  auto_debit: boolean;
  note: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinPeriod {
  id: string;
  expense_id: string;
  seq: number;
  starts_on: string | null;
  ends_on: string | null;
  due_on: string;
  amount: string | null;
  currency: string;
  status: 'open' | 'cancelled';
  review_note?: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FinPayment {
  id: string;
  period_id: string;
  kind: 'payment' | 'refund' | 'adjustment';
  amount: string;
  currency: string;
  paid_on: string;
  method: string | null;
  account?: string | null;
  reference: string | null;
  note?: string | null;
  voided_at: string | null;
  void_reason: string | null;
  voided_by?: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OpsCostPeriod {
  id: string;
  service_id: string;
  service_name: string;
  service_kind: string;
  provider_id: string | null;
  provider_name: string | null;
  payer_party: string;
  starts_on: string | null;
  ends_on: string | null;
  due_on: string | null;
  status: string;
  amount: string | null;
  currency: string | null;
  service_archived: boolean;
}

export interface FinParty { id: string; name: string }

/* ── Status ─────────────────────────────────────────────────────── */

export type FinState = 'pending' | 'partial' | 'paid' | 'overdue' | 'over' | 'unknown' | 'review' | 'cancelled';
export const FIN_STATE_LABEL: Record<FinState, string> = {
  pending: 'Bekliyor', partial: 'Kısmen ödendi', paid: 'Ödendi', overdue: 'Gecikti', over: 'Fazla ödendi', unknown: 'Tutar bekleniyor', review: 'İnceleme bekliyor', cancelled: 'İptal edildi',
};
export const FIN_STATE_TONE: Record<FinState, 'ok' | 'warn' | 'bad' | 'info' | 'muted'> = {
  pending: 'info', partial: 'warn', paid: 'ok', overdue: 'bad', over: 'warn', unknown: 'muted', review: 'warn', cancelled: 'muted',
};

export interface StateSummary {
  state: FinState;
  /** paid something but not all, and late — shown as "Gecikti (kısmen ödendi)" */
  partialLate: boolean;
  expected: Minor | null;
  paid: Minor;
  remaining: Minor | null;
}

export function obligationState(input: { amount: string | null; currency: string | null; due_on: string | null; cancelled?: boolean; review?: string | null }, payments: FinPayment[], today: string): StateSummary {
  let paid = ZERO;
  for (const p of payments) {
    if (p.voided_at) continue;
    if (input.currency && p.currency !== input.currency) continue; // never mixed (the database refuses it anyway)
    const amt = parseAmount(p.amount);
    if (amt === null || amt === undefined) continue;
    paid += p.kind === 'refund' ? -amt : amt;
  }
  if (input.cancelled) return { state: 'cancelled', partialLate: false, expected: null, paid, remaining: null };
  const expected = parseAmount(input.amount) ?? null;
  if (expected === null || !input.currency) return { state: 'unknown', partialLate: false, expected: null, paid, remaining: null };
  const remaining = expected - paid;
  if (remaining < ZERO) return { state: 'over', partialLate: false, expected, paid, remaining };
  if (remaining === ZERO) return { state: 'paid', partialLate: false, expected, paid, remaining };
  // e.g. imported as "Ödendi" without a payment date: not overdue, not paid — waits for the real date
  if (input.review) return { state: 'review', partialLate: false, expected, paid, remaining };
  const late = Boolean(input.due_on && daysUntil(input.due_on, today) < 0);
  if (late) return { state: 'overdue', partialLate: paid > ZERO, expected, paid, remaining };
  return { state: paid > ZERO ? 'partial' : 'pending', partialLate: false, expected, paid, remaining };
}

export const stateText = (s: StateSummary) => (s.partialLate ? 'Gecikti (kısmen ödendi)' : FIN_STATE_LABEL[s.state]);

/* ── One list from both sources ─────────────────────────────────── */

export interface Item {
  key: string;
  source: 'fin' | 'ops';
  periodId: string;
  expenseId: string | null;
  serviceId: string | null;
  title: string;
  category: Category | 'ops';
  categoryText: string;
  provider: string | null;
  providerId: string | null;
  owner: string | null;
  recurrence: string | null;
  dueOn: string | null;
  periodText: string | null;
  amount: string | null;
  currency: string | null;
  payments: FinPayment[];
  summary: StateSummary;
}

export const OPS_KIND: Record<string, string> = { domain: 'Alan adı', hosting: 'Hosting', vps: 'VPS', server: 'Sunucu', email: 'E-posta', ssl: 'SSL', saas: 'Yazılım', maintenance: 'Bakım', other: 'Diğer' };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${d.slice(0, 4)}`;
export const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** "Kasım 2026" (monthly), "Kasım 2026 – Ocak 2027" (quarterly), "2026–2027" (yearly). */
export function periodLabel(p: { starts_on: string | null; ends_on: string | null }, recurrence: string | null): string | null {
  if (!p.starts_on) return null;
  if (recurrence === 'monthly' || !p.ends_on) return monthYear(p.starts_on);
  if (recurrence === 'yearly' && p.starts_on.slice(5) === '01-01') return p.starts_on.slice(0, 4);
  return `${monthYear(p.starts_on)} – ${monthYear(p.ends_on)}`;
}

export function buildItems(input: {
  expenses: Expense[]; periods: FinPeriod[]; payments: FinPayment[];
  opsPeriods: OpsCostPeriod[]; opsPayments: FinPayment[]; parties: FinParty[]; today: string;
}): Item[] {
  const expBy = new Map(input.expenses.map((e) => [e.id, e] as const));
  const partyBy = new Map(input.parties.map((p) => [p.id, p.name] as const));
  const paysBy = new Map<string, FinPayment[]>();
  for (const p of input.payments) paysBy.set(p.period_id, [...(paysBy.get(p.period_id) ?? []), p]);
  const opsPaysBy = new Map<string, FinPayment[]>();
  for (const p of input.opsPayments) opsPaysBy.set(p.period_id, [...(opsPaysBy.get(p.period_id) ?? []), p]);
  const items: Item[] = [];
  for (const per of input.periods) {
    const e = expBy.get(per.expense_id);
    if (!e) continue;
    const pays = paysBy.get(per.id) ?? [];
    items.push({
      key: `fin:${per.id}`, source: 'fin', periodId: per.id, expenseId: e.id, serviceId: null,
      title: e.title, category: e.category, categoryText: CATEGORY_LABEL[e.category] ?? e.category,
      provider: (e.provider_id ? partyBy.get(e.provider_id) : null) ?? e.vendor_name ?? null, providerId: e.provider_id,
      owner: e.owner_email, recurrence: e.recurrence, dueOn: per.due_on,
      periodText: e.kind === 'recurring' ? periodLabel(per, e.recurrence) : null,
      amount: per.amount, currency: per.currency, payments: pays,
      summary: obligationState({ amount: per.amount, currency: per.currency, due_on: per.due_on, cancelled: per.status === 'cancelled', review: per.review_note ?? null }, pays, input.today),
    });
  }
  for (const op of input.opsPeriods) {
    const pays = opsPaysBy.get(op.id) ?? [];
    items.push({
      key: `ops:${op.id}`, source: 'ops', periodId: op.id, expenseId: null, serviceId: op.service_id,
      title: op.service_name, category: 'ops', categoryText: `Operasyon · ${OPS_KIND[op.service_kind] ?? op.service_kind}`,
      provider: op.provider_name, providerId: op.provider_id, owner: null, recurrence: null, dueOn: op.due_on,
      periodText: op.starts_on || op.ends_on ? `${op.starts_on ? shortDate(op.starts_on) : '?'} – ${op.ends_on ? shortDate(op.ends_on) : '?'}` : null,
      amount: op.amount, currency: op.currency, payments: pays,
      summary: obligationState({ amount: op.amount, currency: op.currency, due_on: op.due_on }, pays, input.today),
    });
  }
  return items.sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.title.localeCompare(b.title, 'tr'));
}

/* ── Filters ────────────────────────────────────────────────────── */

export interface Filter {
  category?: string;      // a Category, 'ops', or '' (all)
  state?: string;         // a FinState, 'open' (not paid / not cancelled), or ''
  provider?: string;      // provider id, or free-text match on the provider name
  from?: string;          // due date ≥
  to?: string;            // due date ≤
  source?: 'fin' | 'ops' | '';
  q?: string;
}

export function filterItems(items: Item[], f: Filter): Item[] {
  const q = (f.q ?? '').trim().toLocaleLowerCase('tr-TR');
  const prov = (f.provider ?? '').trim();
  return items.filter((it) => {
    if (f.category && it.category !== f.category) return false;
    if (f.source && it.source !== f.source) return false;
    if (f.state === 'open') { if (['paid', 'over', 'cancelled'].includes(it.summary.state)) return false; }
    else if (f.state && it.summary.state !== f.state) return false;
    if (prov && it.providerId !== prov && !(it.provider ?? '').toLocaleLowerCase('tr-TR').includes(prov.toLocaleLowerCase('tr-TR'))) return false;
    if (f.from && (!it.dueOn || it.dueOn < f.from)) return false;
    if (f.to && (!it.dueOn || it.dueOn > f.to)) return false;
    if (q && !`${it.title} ${it.provider ?? ''} ${it.categoryText}`.toLocaleLowerCase('tr-TR').includes(q)) return false;
    return true;
  });
}

/* ── Overview (per currency) ────────────────────────────────────── */

export type Totals = Record<string, Minor>;
const add = (t: Totals, cur: string | null, v: Minor | null) => { if (cur && v !== null) t[cur] = (t[cur] ?? ZERO) + v; };

/* Monthly figures belong to ONE month: the selected one (default: this month in
 * Istanbul). A period belongs to the month of its due date; another month's
 * periods (e.g. the December rent created ahead of time) never enter November's
 * totals. Only "Geciken" is a point-in-time figure (as of today, every month). */

export const MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** First and last day of a YYYY-MM month. */
export function monthBounds(month: string): { from: string; to: string } {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** YYYY-MM moved by `by` months. */
export function shiftMonth(month: string, by: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export interface Overview {
  month: string;                  // YYYY-MM (the selected month)
  total: Totals; count: number;   // amounts of the month's periods (cancelled excluded)
  unknownCount: number;           // the month's periods without an amount (counted, never added, never a debt)
  paid: Totals;                   // NET valid payments recorded on the month's periods (refunds subtract, adjustments signed), whatever their payment date
  over: Totals;                   // part of `paid` above the amount of over-paid periods (real values, never trimmed)
  paidUnknown: Totals;            // part of `paid` on periods without an amount (not in `total`)
  remaining: Totals; remainingCount: number;   // still open of the month's periods ("review" excluded)
  review: Totals; reviewCount: number;         // the month's periods waiting for a payment date ("Ödendi" in the source): neither paid nor owed
  overdue: Totals; overdueCount: number;       // as of today, every month (not a monthly figure); "review" and unknown amounts never count as overdue
}
// For the month: total = paid − over − paidUnknown + remaining + review (each figure is the real one; nothing is adjusted to make it add up).

export function overview(items: Item[], today: string, month = today.slice(0, 7)): Overview {
  const o: Overview = { month, total: {}, count: 0, unknownCount: 0, paid: {}, over: {}, paidUnknown: {}, remaining: {}, remainingCount: 0, review: {}, reviewCount: 0, overdue: {}, overdueCount: 0 };
  for (const it of items) {
    const s = it.summary;
    if (s.state === 'cancelled') continue;
    if (s.state === 'overdue') { add(o.overdue, it.currency, s.remaining); o.overdueCount += 1; }
    if (!it.dueOn || it.dueOn.slice(0, 7) !== month) continue;
    o.count += 1;
    if (s.paid !== ZERO) add(o.paid, it.currency, s.paid);
    if (s.state === 'unknown') { o.unknownCount += 1; if (s.paid !== ZERO) add(o.paidUnknown, it.currency, s.paid); continue; }
    add(o.total, it.currency, s.expected);
    if (s.state === 'over') { add(o.over, it.currency, s.remaining === null ? null : -s.remaining); continue; }
    if (s.state === 'paid') continue;
    if (s.state === 'review') { add(o.review, it.currency, s.remaining); o.reviewCount += 1; continue; }
    add(o.remaining, it.currency, s.remaining); o.remainingCount += 1;
  }
  return o;
}

/** Totals of the rows shown in the list (same rules as the overview: no amount → counted only; "review" kept apart from "Kalan"). */
export function listTotals(items: Item[]): { amount: Totals; remaining: Totals; review: Totals; unknown: number } {
  const t = { amount: {} as Totals, remaining: {} as Totals, review: {} as Totals, unknown: 0 };
  for (const it of items) {
    const s = it.summary;
    if (s.state === 'cancelled') continue;
    if (s.expected === null || !it.currency) { t.unknown += 1; continue; }
    add(t.amount, it.currency, s.expected);
    if (s.remaining === null || s.remaining <= ZERO) continue;
    add(s.state === 'review' ? t.review : t.remaining, it.currency, s.remaining);
  }
  return t;
}

/* ── CSV ────────────────────────────────────────────────────────── */

export const CSV_HEADER = ['Kaynak', 'Gider / hizmet', 'Kategori', 'Sağlayıcı / firma', 'Dönem', 'Vade', 'Tutar', 'Para birimi', 'Ödenen', 'Kalan', 'Durum', 'Sorumlu'];

const dec = (v: Minor | null) => {
  if (v === null) return '';
  const neg = v < ZERO; const a = neg ? -v : v;
  return `${neg ? '-' : ''}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, '0')}`;
};

export function csvRows(items: Item[]): string[][] {
  return items.map((it) => [
    it.source === 'ops' ? 'Operasyon' : 'Giderler', it.title, it.categoryText, it.provider ?? '', it.periodText ?? '', it.dueOn ?? '',
    it.amount ?? '', it.currency ?? '', dec(it.summary.paid), dec(it.summary.remaining), stateText(it.summary), it.owner ?? '',
  ]);
}

/* ── Form helpers ───────────────────────────────────────────────── */

/** Default first due date: this month's `day` if not passed yet, otherwise next month's. */
export function defaultFirstDue(today: string, day = 1): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1, d = Number(today.slice(8, 10));
  const pick = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm, Math.min(day, last))).toISOString().slice(0, 10);
  };
  return d <= day ? pick(y, m) : pick(y, m + 1);
}
