import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildItems, csvRows, defaultFirstDue, filterItems, listTotals, monthBounds, obligationState, overview, periodLabel, shiftMonth, stateText, type Expense, type FinPayment, type FinPeriod, type OpsCostPeriod } from '../lib/fin/model';
import { buildOpsDigest } from '../lib/ops/digest';

const pay = (o: Partial<FinPayment>): FinPayment => ({ id: Math.random().toString(16).slice(2), period_id: 'p1', kind: 'payment', amount: '0', currency: 'TRY', paid_on: '2026-11-01', method: null, reference: null, voided_at: null, void_reason: null, created_by: 'x', created_at: '2026-11-01', ...o });
const TODAY = '2026-11-07';

test('state: pending → partial → paid; refunds subtract; voided ignored', () => {
  const base = { amount: '1000.00', currency: 'TRY', due_on: '2026-11-20' };
  assert.equal(obligationState(base, [], TODAY).state, 'pending');
  assert.equal(obligationState(base, [pay({ amount: '400' })], TODAY).state, 'partial');
  assert.equal(obligationState(base, [pay({ amount: '400' }), pay({ amount: '600' })], TODAY).state, 'paid');
  assert.equal(obligationState(base, [pay({ amount: '1000' }), pay({ kind: 'refund', amount: '100' })], TODAY).state, 'partial');
  assert.equal(obligationState(base, [pay({ amount: '1000', voided_at: '2026-11-02' })], TODAY).state, 'pending');
  const adj = obligationState(base, [pay({ amount: '900' }), pay({ kind: 'adjustment', amount: '100' })], TODAY);
  assert.equal(adj.state, 'paid');
  assert.equal(obligationState(base, [pay({ amount: '1200' })], TODAY).state, 'over');
});

test('state: overdue by due date; partly paid and late is shown as such', () => {
  const late = { amount: '1000.00', currency: 'TRY', due_on: '2026-11-01' };
  assert.equal(obligationState(late, [], TODAY).state, 'overdue');
  const s = obligationState(late, [pay({ amount: '300' })], TODAY);
  assert.equal(s.state, 'overdue');
  assert.equal(stateText(s), 'Gecikti (kısmen ödendi)');
  assert.equal(s.remaining, BigInt(70000));
  // due today is not late
  assert.equal(obligationState({ ...late, due_on: TODAY }, [], TODAY).state, 'pending');
  // paid in full before the due date stays paid after it
  assert.equal(obligationState(late, [pay({ amount: '1000' })], TODAY).state, 'paid');
});

test('state: unknown amount and cancelled periods are not counted as paid or owed', () => {
  assert.equal(obligationState({ amount: null, currency: 'TRY', due_on: '2026-10-01' }, [], TODAY).state, 'unknown');
  assert.equal(obligationState({ amount: '10', currency: 'TRY', due_on: '2026-10-01', cancelled: true }, [], TODAY).state, 'cancelled');
  // another currency is never subtracted (the database refuses it too)
  assert.equal(obligationState({ amount: '10', currency: 'TRY', due_on: '2026-12-01' }, [pay({ amount: '10', currency: 'USD' })], TODAY).state, 'pending');
});

const exp = (o: Partial<Expense>): Expense => ({ id: 'e1', title: 'Kira', category: 'rent', kind: 'recurring', recurrence: 'monthly', first_due_on: '2026-10-05', ends_on: null, amount: '10000', currency: 'TRY', provider_id: null, vendor_name: 'Ev sahibi', owner_email: null, pay_account: null, pay_method: null, auto_debit: false, note: null, archived_at: null, created_by: null, created_at: '', updated_at: '', ...o });
const per = (o: Partial<FinPeriod>): FinPeriod => ({ id: 'p1', expense_id: 'e1', seq: 0, starts_on: '2026-10-05', ends_on: '2026-11-04', due_on: '2026-10-05', amount: '10000', currency: 'TRY', status: 'open', cancel_reason: null, cancelled_by: null, cancelled_at: null, note: null, created_by: null, created_at: '', ...o });
const opsPer = (o: Partial<OpsCostPeriod>): OpsCostPeriod => ({ id: 'o1', service_id: 's1', service_name: 'Hosting', service_kind: 'hosting', provider_id: 'pr1', provider_name: 'Sağlayıcı', payer_party: 'yoca', starts_on: '2026-11-01', ends_on: '2027-10-31', due_on: '2026-11-10', status: 'open', amount: '100', currency: 'USD', service_archived: false, ...o });

function sample() {
  return buildItems({
    expenses: [exp({}), exp({ id: 'e2', title: 'Laptop', category: 'equipment', kind: 'once', recurrence: null, first_due_on: '2026-11-15', amount: '50000', vendor_name: 'Mağaza' })],
    periods: [
      per({}), per({ id: 'p2', seq: 1, starts_on: '2026-11-05', ends_on: '2026-12-04', due_on: '2026-11-05' }), per({ id: 'p3', seq: 2, starts_on: '2026-12-05', ends_on: '2027-01-04', due_on: '2026-12-05', amount: '12000' }),
      per({ id: 'p4', expense_id: 'e2', starts_on: null, ends_on: null, due_on: '2026-11-15', amount: '50000' }),
    ],
    payments: [pay({ period_id: 'p1', amount: '10000', paid_on: '2026-10-04' }), pay({ period_id: 'p2', amount: '4000', paid_on: '2026-11-03' })],
    opsPeriods: [opsPer({})],
    opsPayments: [pay({ period_id: 'o1', amount: '60', currency: 'USD', paid_on: '2026-11-02' })],
    parties: [], today: TODAY,
  });
}

test('items: one list from both sources, each counted once', () => {
  const items = sample();
  assert.equal(items.length, 5);
  assert.equal(items.filter((i) => i.source === 'ops').length, 1);
  const p2 = items.find((i) => i.periodId === 'p2')!;
  assert.equal(p2.summary.state, 'overdue');
  assert.equal(p2.periodText, 'Kasım 2026');
  assert.equal(items.find((i) => i.periodId === 'p3')!.amount, '12000');
  assert.equal(items.find((i) => i.periodId === 'o1')!.summary.state, 'partial');
});

test('overview: per currency, never mixed; monthly figures = periods due in the selected month', () => {
  const o = overview(sample(), TODAY);
  assert.equal(o.month, '2026-11');
  // November: rent p2 (10 000, 4 000 paid, late) + laptop (50 000) + ops hosting (USD 100, 60 paid)
  assert.deepEqual(o.total, { TRY: BigInt(1000000 + 5000000), USD: BigInt(10000) });
  assert.equal(o.count, 3);
  assert.deepEqual(o.paid, { TRY: BigInt(400000), USD: BigInt(6000) });
  assert.deepEqual(o.remaining, { TRY: BigInt(600000 + 5000000), USD: BigInt(4000) });
  assert.equal(o.remainingCount, 3);
  assert.deepEqual(o.overdue, { TRY: BigInt(600000) });
  assert.equal(o.overdueCount, 1);
  // the December rent (12 000, already created) is NOT in November
  const dec = overview(sample(), TODAY, '2026-12');
  assert.deepEqual(dec.total, { TRY: BigInt(1200000) });
  assert.deepEqual(dec.remaining, { TRY: BigInt(1200000) });
  assert.deepEqual(dec.paid, {});
  // October: paid in full on 4 Oct
  const oct = overview(sample(), TODAY, '2026-10');
  assert.deepEqual(oct.total, { TRY: BigInt(1000000) });
  assert.deepEqual(oct.paid, { TRY: BigInt(1000000) });
  assert.deepEqual(oct.remaining, {});
  // "Geciken" is as of today, whatever month is selected
  assert.deepEqual(dec.overdue, { TRY: BigInt(600000) });
});

test('overview: periods created ahead for December never enter November (synthetic office sheet)', () => {
  const e = (id: string, title: string, amount: string | null) => exp({ id, title, amount });
  const p = (id: string, expense_id: string, seq: number, due_on: string, amount: string | null, review_note: string | null = null) => per({ id, expense_id, seq, due_on, starts_on: due_on, ends_on: null, amount, review_note });
  const items = buildItems({
    expenses: [e('k', 'ÖRNEK kira', '10000'), e('a', 'ÖRNEK aidat', '500'), e('s', 'ÖRNEK su', null), e('i', 'ÖRNEK internet', '700'), e('m', 'ÖRNEK muhasebe', '2000')],
    periods: [
      p('k0', 'k', 0, '2026-11-20', '10000'), p('k1', 'k', 1, '2026-12-20', '10000'),
      p('a0', 'a', 0, '2026-11-30', '500'),
      p('s0', 's', 0, '2026-11-02', '300', 'Excel: Ödendi, tarih yok'), p('s1', 's', 1, '2026-12-02', null),
      p('i0', 'i', 0, '2026-11-16', '700'), p('i1', 'i', 1, '2026-12-16', '700'),
      p('m0', 'm', 0, '2026-11-30', '2000'),
    ],
    payments: [], opsPayments: [], opsPeriods: [], parties: [], today: TODAY,
  });
  const nov = overview(items, TODAY, '2026-11');
  assert.deepEqual(nov.total, { TRY: BigInt(1350000) });
  assert.deepEqual(nov.paid, {});
  assert.deepEqual(nov.remaining, { TRY: BigInt(1320000) });
  assert.deepEqual(nov.review, { TRY: BigInt(30000) });
  assert.equal(nov.unknownCount, 0);
  const dec = overview(items, TODAY, '2026-12');
  assert.deepEqual(dec.total, { TRY: BigInt(1070000) });
  assert.equal(dec.unknownCount, 1); // December water: amount unknown → counted, never a debt
  assert.deepEqual(dec.review, {});
  // the list of the selected month uses the same bounds and keeps "review" apart from "Kalan"
  const b = monthBounds('2026-11');
  const shown = filterItems(items, { from: b.from, to: b.to });
  assert.equal(shown.length, 5);
  const t = listTotals(shown);
  assert.deepEqual(t.amount, { TRY: BigInt(1350000) });
  assert.deepEqual(t.remaining, { TRY: BigInt(1320000) });
  assert.deepEqual(t.review, { TRY: BigInt(30000) });
});

test('month helpers', () => {
  assert.deepEqual(monthBounds('2026-11'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(monthBounds('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

test('review: paid in the source without a date — neither paid nor owed nor late, kept separately', () => {
  const items = buildItems({
    expenses: [exp({ id: 'w', title: 'Su', category: 'utilities', amount: null })],
    periods: [per({ id: 'pw', expense_id: 'w', due_on: '2026-11-02', amount: '250.00', review_note: 'Excel: Ödendi, tarih yok' })],
    payments: [], opsPayments: [], opsPeriods: [], parties: [], today: TODAY,
  });
  assert.equal(items[0].summary.state, 'review');
  const o = overview(items, TODAY);
  assert.deepEqual(o.review, { TRY: BigInt(25000) });
  assert.equal(o.reviewCount, 1);
  assert.deepEqual(o.overdue, {});
  assert.deepEqual(o.remaining, {});
  assert.deepEqual(o.paid, {});
  assert.deepEqual(o.total, { TRY: BigInt(25000) });
  // once the real payment is recorded it is simply paid
  const paid = buildItems({ expenses: [exp({ id: 'w', amount: null })], periods: [per({ id: 'pw', expense_id: 'w', due_on: '2026-11-02', amount: '250.00', review_note: 'x' })], payments: [pay({ period_id: 'pw', amount: '250', paid_on: '2026-11-05' })], opsPayments: [], opsPeriods: [], parties: [], today: TODAY });
  assert.equal(paid[0].summary.state, 'paid');
});

test('filters: category, state, source, provider, date range, text', () => {
  const items = sample();
  assert.equal(filterItems(items, { category: 'ops' }).length, 1);
  assert.equal(filterItems(items, { state: 'open' }).length, 4);
  assert.equal(filterItems(items, { state: 'paid' }).length, 1);
  assert.equal(filterItems(items, { source: 'fin' }).length, 4);
  assert.equal(filterItems(items, { provider: 'mağaza' }).length, 1);
  assert.equal(filterItems(items, { provider: 'pr1' }).length, 1);
  assert.equal(filterItems(items, { from: '2026-11-01', to: '2026-11-30' }).length, 3);
  assert.equal(filterItems(items, { q: 'laptop' }).length, 1);
});

test('csv: source column, amounts as decimals, formula injection neutralised by toCsv', () => {
  const rows = csvRows(sample());
  const ops = rows.find((r) => r[0] === 'Operasyon')!;
  assert.equal(ops[8], '60.00');
  assert.equal(ops[9], '40.00');
  assert.equal(rows.find((r) => r[1] === 'Laptop')![10], 'Bekliyor');
});

test('period labels and default first due date', () => {
  assert.equal(periodLabel({ starts_on: '2026-11-05', ends_on: '2026-12-04' }, 'monthly'), 'Kasım 2026');
  assert.equal(periodLabel({ starts_on: '2026-11-01', ends_on: '2027-01-31' }, 'quarterly'), 'Kasım 2026 – Ocak 2027');
  assert.equal(defaultFirstDue('2026-11-07', 1), '2026-12-01');
  assert.equal(defaultFirstDue('2026-11-07', 10), '2026-11-10');
  assert.equal(defaultFirstDue('2026-01-31', 31), '2026-01-31');
  assert.equal(defaultFirstDue('2026-02-01', 31), '2026-02-28');
});

test('digest: Giderler lines are a section of the same team digest', () => {
  const d = buildOpsDigest({ today: TODAY, reminders: [], renewals: [], payments: [], tasks: [], expenses: [{ tone: 'red', title: 'Kira', detail: 'gecikti 2026-11-05' }] });
  assert.equal(d.empty, false);
  assert.equal(d.counts.expenses, 1);
  assert.match(d.subject, /1 gider/);
  assert.match(d.telegram, /Giderler/);
  assert.equal(buildOpsDigest({ today: TODAY, reminders: [], renewals: [], payments: [], tasks: [] }).empty, true);
});

test('v25 migration: roles, guards, no delete policy, private bucket, ops append-only', () => {
  const sql = fs.readFileSync('supabase/upgrade-v25-expenses.sql', 'utf8');
  assert.match(sql, /add column if not exists role text not null default 'admin'/);
  assert.match(sql, /where email = lower\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\) and role = 'admin'/);
  assert.match(sql, /constraint fin_periods_once unique \(expense_id, seq\)/);
  assert.match(sql, /on conflict \(expense_id, seq\) do nothing/);
  assert.doesNotMatch(sql, /for delete to authenticated/);
  assert.match(sql, /values \('fin-docs', 'fin-docs', false/);
  assert.match(sql, /create trigger ops_payments_append_only/);
  assert.match(sql, /new\.created_by := public\.doc_actor\(\)/);
  // provider payment function: only payment / refund / adjustment, always direction 'out'
  assert.match(sql, /p_kind not in \('payment', 'refund', 'adjustment'\)/);
  assert.match(sql, /values \(per\.id, per\.service_id, 'out', p_kind/);
  // finance history view: fin_* tables and provider payments only
  assert.match(sql, /create or replace view public\.fin_audit/);
  assert.match(sql, /x\.direction = 'out'/);
});
