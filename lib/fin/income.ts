/**
 * Yoca Finans — Gelirler (receivables / collections) and the cash view. Pure
 * rules (unit-tested).
 *
 * One list of expected income from two sources, each counted once:
 *   - source 'fin': a manual receivable (fin_receivables + fin_collections)
 *   - source 'ops': an Operasyon customer collection period (fin_ops_receivables
 *     + fin_ops_collections — the same ops_payments rows the Operasyon screens use)
 *
 * Two views, never mixed:
 *   - Dönem takibi (period): the income / expense that BELONGS to the selected
 *     month (receivable: its period month; Operasyon: the month of its collection
 *     due date; expense: the month of its due date) and how much of it is
 *     collected / paid, whatever the payment date.
 *   - Nakit hareketi (cash): money that really came in / went out in the
 *     selected month, by the real payment / collection date. Refunds subtract;
 *     adjustments are corrections, not money, and are listed apart.
 * Money is per currency; nothing is converted or added across currencies.
 * The net cash difference is NOT profit.
 */

import { parseAmount, type Minor } from '@/lib/ops/money';
import { OPS_KIND, monthYear, obligationState, shortDate, type FinPayment, type FinState, type Item, type StateSummary, type Totals } from '@/lib/fin/model';

const ZERO = BigInt(0);
const add = (t: Totals, cur: string | null, v: Minor | null) => { if (cur && v !== null) t[cur] = (t[cur] ?? ZERO) + v; };

export const INCOME_CATEGORIES = ['service', 'project', 'retainer', 'hosting', 'consulting', 'reimbursement', 'interest', 'other'] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export const INCOME_CATEGORY_LABEL: Record<IncomeCategory | 'ops', string> = {
  service: 'Hizmet satışı', project: 'Proje', retainer: 'Aylık hizmet / bakım', hosting: 'Alan adı / barındırma', consulting: 'Danışmanlık',
  reimbursement: 'Masraf yansıtma', interest: 'Faiz / finansal gelir', other: 'Diğer', ops: 'Operasyon (müşteri)',
};

export const INCOME_STATE_LABEL: Record<FinState, string> = {
  pending: 'Bekleniyor', partial: 'Kısmen tahsil edildi', paid: 'Tahsil edildi', overdue: 'Gecikti', over: 'Fazla tahsilat',
  unknown: 'Tutar bekleniyor', review: 'İnceleme bekliyor', cancelled: 'İptal edildi',
};
export const incomeStateText = (s: StateSummary) => (s.partialLate ? 'Gecikti (kısmen tahsil edildi)' : INCOME_STATE_LABEL[s.state]);
export const COLLECTION_KIND_LABEL: Record<string, string> = { payment: 'Tahsilat', refund: 'İade (müşteriye)', adjustment: 'Düzeltme' };

export interface Receivable {
  id: string;
  title: string;
  category: IncomeCategory;
  client_id: string | null;
  payer_name: string | null;
  period_month: string;
  due_on: string | null;
  amount: string | null;
  currency: string;
  owner_email: string | null;
  pay_account: string | null;
  pay_method: string | null;
  note: string | null;
  amount_note?: string | null;          // reason of the last amount correction
  amount_corrected_by?: string | null;
  amount_corrected_at?: string | null;
  status: 'open' | 'cancelled';
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** fin_collections row; `receivable_id` is mapped to `period_id` so the shared payment pieces work. */
export type Collection = FinPayment;

export interface OpsReceivable {
  id: string;
  service_id: string;
  service_name: string;
  service_kind: string;
  client_names: string | null;
  starts_on: string | null;
  ends_on: string | null;
  due_on: string | null;
  status: string;
  amount: string | null;
  currency: string | null;
  service_archived: boolean;
}

export interface FinClient { id: string; name: string }

export interface IncomeItem {
  key: string;
  source: 'fin' | 'ops';
  id: string;                    // receivable id, or Operasyon period id
  serviceId: string | null;
  title: string;
  category: IncomeCategory | 'ops';
  categoryText: string;
  party: string | null;          // customer / payer
  clientId: string | null;
  month: string | null;          // the month it belongs to (period view)
  dueOn: string | null;
  periodText: string | null;
  amount: string | null;
  currency: string | null;
  payments: Collection[];
  summary: StateSummary;
}

export function buildIncomeItems(input: {
  receivables: Receivable[]; collections: Collection[]; opsReceivables: OpsReceivable[]; opsCollections: Collection[]; clients: FinClient[]; today: string;
}): IncomeItem[] {
  const clientBy = new Map(input.clients.map((c) => [c.id, c.name] as const));
  const group = (rows: Collection[]) => { const m = new Map<string, Collection[]>(); for (const p of rows) m.set(p.period_id, [...(m.get(p.period_id) ?? []), p]); return m; };
  const finBy = group(input.collections);
  const opsBy = group(input.opsCollections);
  const items: IncomeItem[] = [];
  for (const r of input.receivables) {
    const pays = finBy.get(r.id) ?? [];
    items.push({
      key: `fin:${r.id}`, source: 'fin', id: r.id, serviceId: null,
      title: r.title, category: r.category, categoryText: INCOME_CATEGORY_LABEL[r.category] ?? r.category,
      party: (r.client_id ? clientBy.get(r.client_id) : null) ?? r.payer_name ?? null, clientId: r.client_id,
      month: r.period_month, dueOn: r.due_on, periodText: monthYear(`${r.period_month}-01`),
      amount: r.amount, currency: r.currency, payments: pays,
      summary: obligationState({ amount: r.amount, currency: r.currency, due_on: r.due_on, cancelled: r.status === 'cancelled' }, pays, input.today),
    });
  }
  for (const op of input.opsReceivables) {
    const pays = opsBy.get(op.id) ?? [];
    items.push({
      key: `ops:${op.id}`, source: 'ops', id: op.id, serviceId: op.service_id,
      title: op.service_name, category: 'ops', categoryText: `Operasyon · ${OPS_KIND[op.service_kind] ?? op.service_kind}`,
      party: op.client_names, clientId: null,
      month: op.due_on ? op.due_on.slice(0, 7) : null, dueOn: op.due_on,
      periodText: op.starts_on || op.ends_on ? `${op.starts_on ? shortDate(op.starts_on) : '?'} – ${op.ends_on ? shortDate(op.ends_on) : '?'}` : null,
      amount: op.amount, currency: op.currency, payments: pays,
      summary: obligationState({ amount: op.amount, currency: op.currency, due_on: op.due_on }, pays, input.today),
    });
  }
  return items.sort((a, b) => (a.month ?? '9999').localeCompare(b.month ?? '9999') || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.title.localeCompare(b.title, 'tr'));
}

export interface IncomeFilter {
  month?: string;                // YYYY-MM: only items that belong to this month ('' = every month)
  category?: string;
  state?: string;                // a FinState, 'open' (not collected / not cancelled), or ''
  source?: 'fin' | 'ops' | '';
  q?: string;
}

export function filterIncome(items: IncomeItem[], f: IncomeFilter): IncomeItem[] {
  const q = (f.q ?? '').trim().toLocaleLowerCase('tr-TR');
  return items.filter((it) => {
    if (f.month && it.month !== f.month) return false;
    if (f.category && it.category !== f.category) return false;
    if (f.source && it.source !== f.source) return false;
    if (f.state === 'open') { if (['paid', 'over', 'cancelled'].includes(it.summary.state)) return false; }
    else if (f.state && it.summary.state !== f.state) return false;
    if (q && !`${it.title} ${it.party ?? ''} ${it.categoryText}`.toLocaleLowerCase('tr-TR').includes(q)) return false;
    return true;
  });
}

/* ── Period view (income of ONE month) ──────────────────────────── */

export interface IncomeOverview {
  month: string;
  total: Totals; count: number; unknownCount: number;   // expected amounts of the month (unknown: counted, never added)
  collected: Totals;                                     // NET valid collections on the month's receivables (refunds subtract), whatever the date
  over: Totals;                                          // part of `collected` above the expected amount (real values, never trimmed)
  collectedUnknown: Totals;                              // part of `collected` on receivables without an amount
  remaining: Totals; remainingCount: number;
  overdue: Totals; overdueCount: number;                 // as of today, every month; unknown amounts never count as overdue
}
// For the month: total = collected − over − collectedUnknown + remaining.

export function incomeOverview(items: IncomeItem[], today: string, month = today.slice(0, 7)): IncomeOverview {
  const o: IncomeOverview = { month, total: {}, count: 0, unknownCount: 0, collected: {}, over: {}, collectedUnknown: {}, remaining: {}, remainingCount: 0, overdue: {}, overdueCount: 0 };
  for (const it of items) {
    const s = it.summary;
    if (s.state === 'cancelled') continue;
    if (s.state === 'overdue') { add(o.overdue, it.currency, s.remaining); o.overdueCount += 1; }
    if (it.month !== month) continue;
    o.count += 1;
    if (s.paid !== ZERO) add(o.collected, it.currency, s.paid);
    if (s.state === 'unknown') { o.unknownCount += 1; if (s.paid !== ZERO) add(o.collectedUnknown, it.currency, s.paid); continue; }
    add(o.total, it.currency, s.expected);
    if (s.state === 'over') { add(o.over, it.currency, s.remaining === null ? null : -s.remaining); continue; }
    if (s.state === 'paid') continue;
    add(o.remaining, it.currency, s.remaining); o.remainingCount += 1;
  }
  return o;
}

/* ── Cash view (real dates) ─────────────────────────────────────── */

export interface CashMovement {
  id: string;
  date: string;
  direction: 'in' | 'out';
  kind: 'payment' | 'refund' | 'adjustment';
  amount: Minor;                 // as recorded (positive; adjustments signed)
  currency: string;
  source: 'income' | 'expense' | 'ops-in' | 'ops-out';
  title: string;
  href: string;
}

export interface CashFlow {
  month: string;
  in: Totals;                    // collections − refunds to customers
  out: Totals;                   // payments − refunds from providers
  net: Totals;                   // in − out, per currency (NOT profit)
  adjustments: number;           // corrections in the month: listed, not money
  movements: CashMovement[];     // valid records of the month (voided ones are left out)
}

/**
 * Cash of one month by the real payment date. Operasyon payments come from the
 * raw lists (every valid 'in' / 'out' row, whatever its period's state), so a
 * payment is never lost and never counted twice.
 */
export function cashFlow(input: {
  month: string;
  expenseItems: Item[]; incomeItems: IncomeItem[];
  opsOut: FinPayment[]; opsIn: Collection[];
}): CashFlow {
  const f: CashFlow = { month: input.month, in: {}, out: {}, net: {}, adjustments: 0, movements: [] };
  const titleOf = new Map<string, string>();
  for (const it of input.expenseItems) if (it.source === 'ops') titleOf.set(`out:${it.periodId}`, it.title);
  for (const it of input.incomeItems) if (it.source === 'ops') titleOf.set(`in:${it.id}`, it.title);
  const take = (p: FinPayment, direction: 'in' | 'out', source: CashMovement['source'], title: string, href: string) => {
    if (p.voided_at || p.paid_on.slice(0, 7) !== input.month) return;
    const amt = parseAmount(p.amount);
    if (amt === null || amt === undefined) return;
    f.movements.push({ id: p.id, date: p.paid_on, direction, kind: p.kind, amount: amt, currency: p.currency, source, title, href });
    if (p.kind === 'adjustment') { f.adjustments += 1; return; }
    add(direction === 'in' ? f.in : f.out, p.currency, p.kind === 'refund' ? -amt : amt);
  };
  for (const it of input.expenseItems) if (it.source === 'fin') for (const p of it.payments) take(p, 'out', 'expense', it.title, `/admin/expenses/${it.expenseId}?period=${it.periodId}`);
  for (const it of input.incomeItems) if (it.source === 'fin') for (const p of it.payments) take(p, 'in', 'income', it.title, `/admin/finance/income/${it.id}`);
  for (const p of input.opsOut) take(p, 'out', 'ops-out', titleOf.get(`out:${p.period_id}`) ?? 'Operasyon sağlayıcı ödemesi', `/admin/expenses/ops/${p.period_id}`);
  for (const p of input.opsIn) take(p, 'in', 'ops-in', titleOf.get(`in:${p.period_id}`) ?? 'Operasyon müşteri tahsilatı', `/admin/finance/income/ops/${p.period_id}`);
  for (const cur of Array.from(new Set(Object.keys(f.in).concat(Object.keys(f.out))))) f.net[cur] = (f.in[cur] ?? ZERO) - (f.out[cur] ?? ZERO);
  f.movements.sort((a, b) => a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction));
  return f;
}

export const CASH_SOURCE_LABEL: Record<CashMovement['source'], string> = { income: 'Gelirler', expense: 'Giderler', 'ops-in': 'Operasyon · tahsilat', 'ops-out': 'Operasyon · sağlayıcı' };

/* ── CSV ────────────────────────────────────────────────────────── */

export const INCOME_CSV_HEADER = ['Kaynak', 'Gelir / hizmet', 'Kategori', 'Müşteri / ödeyen', 'Dönem', 'Vade', 'Beklenen', 'Para birimi', 'Tahsil edilen', 'Kalan', 'Durum'];
const dec = (v: Minor | null) => {
  if (v === null) return '';
  const neg = v < ZERO; const a = neg ? -v : v;
  return `${neg ? '-' : ''}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, '0')}`;
};
export function incomeCsvRows(items: IncomeItem[]): string[][] {
  return items.map((it) => [it.source === 'ops' ? 'Operasyon' : 'Gelirler', it.title, it.categoryText, it.party ?? '', it.month ?? '', it.dueOn ?? '', it.amount ?? '', it.currency ?? '', dec(it.summary.paid), dec(it.summary.remaining), incomeStateText(it.summary)]);
}

