import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIncomeItems, cashFlow, filterIncome, incomeCsvRows, incomeOverview, incomeStateText, type Collection, type OpsReceivable, type Receivable } from '../lib/fin/income';
import { buildItems, overview, type Expense, type FinPayment, type FinPeriod, type OpsCostPeriod } from '../lib/fin/model';

// Synthetic values only.
const TODAY = '2026-11-07';
const B = (n: number) => BigInt(Math.round(n * 100));
let n = 0;
const pay = (o: Partial<FinPayment>): FinPayment => ({ id: `p${++n}`, period_id: 'x', kind: 'payment', amount: '0', currency: 'TRY', paid_on: '2026-11-01', method: null, reference: null, voided_at: null, void_reason: null, created_by: 'x', created_at: '2026-11-01', ...o });
const rec = (o: Partial<Receivable>): Receivable => ({ id: 'r1', title: 'ÖRNEK proje', category: 'project', client_id: null, payer_name: null, period_month: '2026-11', due_on: '2026-11-20', amount: '1000', currency: 'TRY', owner_email: null, pay_account: null, pay_method: null, note: null, status: 'open', cancel_reason: null, cancelled_by: null, cancelled_at: null, created_by: null, created_at: '', updated_at: '', ...o });
const opsRec = (o: Partial<OpsReceivable>): OpsReceivable => ({ id: 'o1', service_id: 's1', service_name: 'ÖRNEK hosting', service_kind: 'hosting', client_names: 'Örnek Müşteri', starts_on: '2026-11-01', ends_on: '2027-10-31', due_on: '2026-11-10', status: 'open', amount: '300', currency: 'USD', service_archived: false, ...o });

function sample() {
  return buildIncomeItems({
    receivables: [
      rec({ id: 'a' }),                                                     // 1 000, 400 collected → partial
      rec({ id: 'b', title: 'ÖRNEK bakım', amount: '500', due_on: '2026-11-03' }),   // 500 + 100 over (late if not paid)
      rec({ id: 'c', title: 'ÖRNEK danışmanlık', amount: null, due_on: null }),      // amount unknown, 50 collected
      rec({ id: 'd', title: 'ÖRNEK iptal', amount: '700', status: 'cancelled', cancel_reason: 'yanlış' }),
      rec({ id: 'e', title: 'ÖRNEK aralık', period_month: '2026-12', due_on: '2026-12-15', amount: '800' }),
      rec({ id: 'f', title: 'ÖRNEK gecikmiş', period_month: '2026-10', due_on: '2026-10-20', amount: '200' }),
    ],
    collections: [
      pay({ period_id: 'a', amount: '600', paid_on: '2026-11-02' }), pay({ period_id: 'a', kind: 'refund', amount: '200', paid_on: '2026-11-04' }),
      pay({ period_id: 'b', amount: '600', paid_on: '2026-12-02' }),        // November receivable collected in December
      pay({ period_id: 'c', amount: '50', paid_on: '2026-11-05' }),
      pay({ period_id: 'a', amount: '999', paid_on: '2026-11-05', voided_at: '2026-11-06', void_reason: 'mükerrer' }),
    ],
    opsReceivables: [opsRec({}), opsRec({ id: 'o2', service_name: 'ÖRNEK vadesiz', due_on: null })],
    opsCollections: [pay({ period_id: 'o1', amount: '120', currency: 'USD', paid_on: '2026-11-03' })],
    clients: [], today: TODAY,
  });
}

test('income items: manual and Operasyon, each once; states incl. partial / refund / over / unknown / cancelled', () => {
  const items = sample();
  assert.equal(items.length, 8);
  const s = (id: string) => items.find((i) => i.id === id)!.summary;
  assert.equal(s('a').state, 'partial');
  assert.equal(s('a').paid, B(400));            // 600 − 200 refund; the voided 999 ignored
  assert.equal(s('b').state, 'over');
  assert.equal(incomeStateText(s('b')), 'Fazla tahsilat');
  assert.equal(s('c').state, 'unknown');        // never 0
  assert.equal(s('d').state, 'cancelled');
  assert.equal(s('f').state, 'overdue');
  assert.equal(s('o1').state, 'partial');
  assert.equal(items.find((i) => i.id === 'o2')!.month, null); // no due date → in no month
});

test("income period view: the month's receivables, net collections whatever the date, real values only", () => {
  const o = incomeOverview(sample(), TODAY, '2026-11');
  assert.equal(o.count, 4);                                    // a, b, c, o1 (cancelled d excluded; o2 has no month)
  assert.deepEqual(o.total, { TRY: B(1500), USD: B(300) });   // c unknown: counted, not added
  assert.equal(o.unknownCount, 1);
  assert.deepEqual(o.collected, { TRY: B(400 + 600 + 50), USD: B(120) });   // b collected in December is still November's
  assert.deepEqual(o.over, { TRY: B(100) });
  assert.deepEqual(o.collectedUnknown, { TRY: B(50) });
  assert.deepEqual(o.remaining, { TRY: B(600), USD: B(180) });
  assert.equal(o.total.TRY, o.collected.TRY - o.over.TRY - o.collectedUnknown.TRY + o.remaining.TRY);
  // overdue: as of today, every month; unknown amounts never overdue
  assert.deepEqual(o.overdue, { TRY: B(200) });
  assert.deepEqual(incomeOverview(sample(), TODAY, '2026-12').overdue, { TRY: B(200) });
  assert.deepEqual(incomeOverview(sample(), TODAY, '2026-12').total, { TRY: B(800) });
});

test('filters: month, state, source, text', () => {
  const items = sample();
  assert.equal(filterIncome(items, { month: '2026-11' }).length, 5);   // incl. the cancelled one (state filter decides)
  assert.equal(filterIncome(items, { month: '2026-11', state: 'open' }).length, 3);
  assert.equal(filterIncome(items, { source: 'ops' }).length, 2);
  assert.equal(filterIncome(items, { q: 'örnek müşteri' }).length, 2);
  assert.equal(incomeCsvRows(filterIncome(items, { month: '2026-11', source: 'fin' })).find((r) => r[1] === 'ÖRNEK proje')![8], '400.00');
});

// expenses for the cash view: November rent paid in December
const exp = (o: Partial<Expense>): Expense => ({ id: 'k', title: 'ÖRNEK kira', category: 'rent', kind: 'recurring', recurrence: 'monthly', first_due_on: '2026-11-05', ends_on: null, amount: '1000', currency: 'TRY', provider_id: null, vendor_name: null, owner_email: null, pay_account: null, pay_method: null, auto_debit: false, note: null, archived_at: null, created_by: null, created_at: '', updated_at: '', ...o });
const per = (o: Partial<FinPeriod>): FinPeriod => ({ id: 'kn', expense_id: 'k', seq: 0, starts_on: '2026-11-05', ends_on: '2026-12-04', due_on: '2026-11-05', amount: '1000', currency: 'TRY', status: 'open', cancel_reason: null, cancelled_by: null, cancelled_at: null, note: null, created_by: null, created_at: '', ...o });
const opsCost = (o: Partial<OpsCostPeriod>): OpsCostPeriod => ({ id: 'o1', service_id: 's1', service_name: 'ÖRNEK hosting', service_kind: 'hosting', provider_id: null, provider_name: 'Sağlayıcı', payer_party: 'yoca', starts_on: '2026-11-01', ends_on: '2027-10-31', due_on: '2026-11-08', status: 'open', amount: '100', currency: 'USD', service_archived: false, ...o });

function cashSample() {
  const expensePayments = [
    pay({ period_id: 'kn', amount: '1000', paid_on: '2026-12-03' }),                   // November rent, paid in December
    pay({ period_id: 'kd', amount: '1000', paid_on: '2026-11-30' }),                   // December rent, paid early in November
    pay({ period_id: 'kd', kind: 'refund', amount: '150', paid_on: '2026-11-30' }),
    pay({ period_id: 'kd', kind: 'adjustment', amount: '-20', paid_on: '2026-11-30' }), // correction: not money
  ];
  const opsOut = [pay({ period_id: 'o1', amount: '100', currency: 'USD', paid_on: '2026-11-08' }), pay({ period_id: 'gone', amount: '30', currency: 'USD', paid_on: '2026-11-09' })];
  const expenseItems = buildItems({
    expenses: [exp({})], periods: [per({}), per({ id: 'kd', seq: 1, starts_on: '2026-12-05', ends_on: '2027-01-04', due_on: '2026-12-05' })], payments: expensePayments,
    opsPeriods: [opsCost({})], opsPayments: opsOut, parties: [], today: TODAY,
  });
  const incomeItems = sample();
  const opsIn: Collection[] = [pay({ period_id: 'o1', amount: '120', currency: 'USD', paid_on: '2026-11-03' })];
  return { expenseItems, incomeItems, opsOut, opsIn };
}

test('cash view: by the real date; November rent paid in December is December cash and November period', () => {
  const s = cashSample();
  const nov = cashFlow({ month: '2026-11', ...s });
  // in: a 600 − 200 (refund to customer) + c 50 + Operasyon USD 120; the voided 999 and b's December collection are not November cash
  assert.deepEqual(nov.in, { TRY: B(450), USD: B(120) });
  // out: December rent paid early 1 000 − 150 refund; Operasyon USD 100 + 30 (a payment whose period is not in the views is still cash, once)
  assert.deepEqual(nov.out, { TRY: B(850), USD: B(130) });
  assert.deepEqual(nov.net, { TRY: B(-400), USD: B(-10) });   // never added across currencies, never called profit
  assert.equal(nov.adjustments, 1);
  assert.ok(nov.movements.every((m) => m.date.startsWith('2026-11')));
  assert.equal(nov.movements.filter((m) => m.source === 'ops-in').length, 1);    // Operasyon collection once (not again via the income item)
  const dec = cashFlow({ month: '2026-12', ...s });
  assert.deepEqual(dec.out, { TRY: B(1000) });                  // the November rent
  assert.deepEqual(dec.in, { TRY: B(600) });                    // b (a November receivable) collected in December
  // the period view of the same data: November rent belongs to November, paid (by period) whatever the date
  const ovNov = overview(s.expenseItems, TODAY, '2026-11');
  assert.deepEqual(ovNov.paid, { TRY: B(1000), USD: B(100) });
  assert.deepEqual(ovNov.remaining, {});
  assert.deepEqual(overview(s.expenseItems, TODAY, '2026-12').paid, { TRY: B(1000 - 150 - 20) });   // December rent: net incl. the adjustment
});

test('v26 migration: receivables + collections guarded, Operasyon collections through the same ops_payments row, no delete', () => {
  const sql = fs.readFileSync('supabase/upgrade-v26-income.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.fin_receivables/);
  assert.match(sql, /amount numeric\(14, 2\) check \(amount is null or amount > 0\)/);
  assert.match(sql, /Tahsilat kaydı değiştirilemez/);
  assert.match(sql, /Geçerli tahsilatı olan alacağın tutarı veya para birimi değiştirilemez/);
  assert.doesNotMatch(sql, /for delete to authenticated/);
  assert.match(sql, /values \(per\.id, per\.service_id, 'in', p_kind/);
  assert.match(sql, /where id = p_payment and direction = 'in' and voided_at is null/);
  assert.match(sql, /'fin_receivables', 'fin_collections'\)/);
  assert.doesNotMatch(sql, /insert into public\.fin_(collections|payments)[^;]*ops_payments/);   // no copies of Operasyon payments
});
