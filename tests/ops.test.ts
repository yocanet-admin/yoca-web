/**
 * Operasyon: money, status rules, reminders, CSV import.
 * Run: npx tsx --test tests/ops.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, formatMinor, minorToDb, parseAmount, toMinor, totalsByCurrency } from '../lib/ops/money';
import { addMonths, daysUntil, duplicateService, istanbulDay, missingInfo, payState, renewState, suggestNextEnd, type Payment, type PeriodRow, type Service } from '../lib/ops/model';
import { planReminders } from '../lib/ops/reminders';
import { guessMapping, parseCsv, toCsv, validateImport } from '../lib/ops/csv';

const B = (n: number) => BigInt(n);

test('money: decimal parsing without floats; unknown is null, not 0', () => {
  assert.equal(toMinor('1.234,56'), B(123456));
  assert.equal(toMinor('1234.56'), B(123456));
  assert.equal(toMinor('1,234.5'), B(123450));
  assert.equal(toMinor('0,1'), B(10));
  assert.equal(toMinor(''), null);
  assert.equal(toMinor(null), null);
  assert.equal(parseAmount('1,2,3'), undefined);
  assert.equal(parseAmount('abc'), undefined);
  assert.equal(minorToDb(B(-5)), '-0.05');
  // 0.1 + 0.2 stays exact
  assert.equal(minorToDb((toMinor('0.1') as bigint) + (toMinor('0.2') as bigint)), '0.30');
  assert.equal(formatAmount(null, 'TRY'), 'Tutar bilinmiyor');
  assert.equal(formatMinor(B(123456), 'TRY'), '₺1.234,56');
});

test('money: totals per currency, never mixed', () => {
  const { totals, unknown } = totalsByCurrency([
    { amount: '10.00', currency: 'USD' }, { amount: '5.50', currency: 'USD' }, { amount: '100', currency: 'TRY' }, { amount: null, currency: 'EUR' }, { amount: '3', currency: null },
  ]);
  assert.deepEqual(Object.keys(totals).sort(), ['TRY', 'USD']);
  assert.equal(totals.USD, B(1550));
  assert.equal(unknown, 2);
});

test('dates: Istanbul day, month arithmetic', () => {
  assert.equal(istanbulDay(new Date('2026-11-04T21:30:00Z')), '2026-11-05'); // 00:30 in Istanbul
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2027-12-15', 12), '2028-12-15');
  assert.equal(daysUntil('2026-11-10', '2026-11-04'), 6);
  assert.equal(suggestNextEnd('2026-03-31', { period: 'quarterly', period_months: null }), '2026-06-30');
  assert.equal(suggestNextEnd(null, { period: 'yearly', period_months: null }), null);
});

const period = (p: Partial<PeriodRow> = {}): PeriodRow => ({ id: 'p1', service_id: 's1', starts_on: '2026-01-01', ends_on: '2026-12-31', due_on: '2026-12-01', customer_due_on: '2026-11-20', status: 'open', expected_cost: '10.00', actual_cost: null, cost_currency: 'USD', expected_price: '500.00', price_currency: 'TRY', renewed_at: null, renewed_by: null, renewal_ref: null, renewal_note: null, next_period_id: null, note: null, created_at: '', ...p });
const pay = (p: Partial<Payment>): Payment => ({ id: Math.random().toString(), period_id: 'p1', service_id: 's1', direction: 'in', kind: 'payment', amount: '0', currency: 'TRY', paid_on: '2026-11-01', method: null, reference: null, note: null, client_id: null, voided_at: null, void_reason: null, created_by: null, created_at: '', ...p });

test('collection, provider payment and renewal are independent', () => {
  const pr = period();
  const pays = [pay({ direction: 'in', amount: '500.00' })];
  assert.equal(payState(pr, pays, 'in', '2026-11-04').state, 'paid');
  assert.equal(payState(pr, pays, 'out', '2026-11-04').state, 'pending');
  const svc = { end_on: '2026-12-31', is_perpetual: false, period: 'yearly' as const, auto_renew: 'off' as const, status: 'active' as const };
  // Collected but not renewed: waiting for verification, not "renewed".
  assert.equal(renewState(svc, pr, pays, '2026-12-10'), 'awaiting_verification');
  assert.equal(renewState(svc, { ...pr, renewed_at: '2026-12-20T10:00:00Z' }, pays, '2026-12-10'), 'verified');
  assert.equal(renewState(svc, pr, [], '2027-01-02'), 'overdue');
  assert.equal(renewState({ ...svc, end_on: null }, { ...pr, ends_on: null }, [], '2026-12-10'), 'unknown_date');
  assert.equal(renewState({ ...svc, is_perpetual: true }, null, [], '2026-12-10'), 'perpetual');
});

test('partial payments, refunds, voids, overdue, other currency kept apart', () => {
  const pr = period();
  const pays = [pay({ amount: '200.00' }), pay({ amount: '50.00', kind: 'refund' }), pay({ amount: '100.00', voided_at: 'x' }), pay({ amount: '20', currency: 'USD' })];
  const s = payState(pr, pays, 'in', '2026-11-04');
  assert.equal(s.state, 'partial');
  assert.equal(s.paid, B(15000));
  assert.equal(s.remaining, B(35000));
  assert.equal(s.otherCurrencies.USD, B(2000));
  assert.equal(payState(pr, pays, 'in', '2026-11-25').state, 'overdue');
  assert.equal(payState(period({ expected_price: null }), pays, 'in', '2026-11-04').state, 'unknown');
});

test('missing info is listed; unknown end date is not "süresiz"', () => {
  assert.deepEqual(missingInfo({ end_on: null, is_perpetual: false, period: 'yearly', team_owner: null, provider_id: null, kind: 'domain' }), ['Bitiş tarihi', 'Ekip sorumlusu', 'Sağlayıcı']);
  assert.deepEqual(missingInfo({ end_on: null, is_perpetual: true, period: null, team_owner: 'a@b', provider_id: 'x', kind: 'saas' }), []);
});

const svc = (p: Partial<Service> = {}): Service => ({ id: 's1', name: 'example.com', kind: 'domain', status: 'active', provider_id: null, provider_account_id: null, panel_url: null, start_on: null, end_on: '2026-12-31', is_perpetual: false, due_on: null, cancel_by: null, period: 'yearly', period_months: null, auto_renew: 'unknown', owner_party: 'client', owner_client_id: null, payer_party: 'client', payer_client_id: null, renewer_party: 'yoca', team_owner: null, cost_amount: null, cost_currency: null, price_amount: null, price_currency: null, details: {}, custom_fields: [], reminder_days: null, cancel_reminder_days: null, customer_notify: false, customer_recipients: [], tags: [], note: null, archived_at: null, created_by: null, created_at: '', updated_at: '', ...p });

test('reminders: thresholds, dedupe, catch-up sends only the most urgent', () => {
  const base = { services: [svc()], openPeriods: new Map<string, PeriodRow>(), customerEnabled: false, existing: new Set<string>() };
  assert.equal(planReminders({ ...base, today: '2026-11-15' }).length, 0); // 46 days left
  const at30 = planReminders({ ...base, today: '2026-12-01' });
  assert.deepEqual(at30.map((r) => [r.offsetDays, r.skip]), [[30, false]]);
  // Cron missed two weeks: 30 and 14 both passed → only 14 is sent, 30 recorded as skipped.
  const late = planReminders({ ...base, today: '2026-12-20' });
  assert.deepEqual(late.map((r) => [r.offsetDays, r.skip]).sort(), [[14, false], [30, true]]);
  // Second run the same day: nothing new.
  const again = planReminders({ ...base, today: '2026-12-20', existing: new Set(late.map((r) => r.dedupeKey)) });
  assert.equal(again.length, 0);
  // The day itself and one "passed" notice, nothing a month later.
  assert.ok(planReminders({ ...base, today: '2026-12-31' }).some((r) => r.offsetDays === 0 && !r.skip));
  assert.deepEqual(planReminders({ ...base, today: '2027-01-02' }).map((r) => r.offsetDays), [-1]);
  assert.equal(planReminders({ ...base, today: '2027-02-15' }).length, 0);
  // Changing the end date creates new keys.
  const moved = planReminders({ ...base, services: [svc({ end_on: '2027-01-05' })], today: '2026-12-20', existing: new Set(late.map((r) => r.dedupeKey)) });
  assert.ok(moved.length > 0);
});

test('reminders: verified renewal, perpetual, cancelled → nothing; customer only when switched on', () => {
  const open = new Map([['s1', period({ renewed_at: '2026-12-01T00:00:00Z' })]]);
  assert.equal(planReminders({ services: [svc()], openPeriods: open, today: '2026-12-25', customerEnabled: true, existing: new Set() }).length, 0);
  assert.equal(planReminders({ services: [svc({ is_perpetual: true }), svc({ id: 's2', status: 'cancelled' })], openPeriods: new Map(), today: '2026-12-25', customerEnabled: true, existing: new Set() }).length, 0);
  const off = planReminders({ services: [svc({ customer_notify: true, customer_recipients: ['a@example.com'] })], openPeriods: new Map(), today: '2026-12-25', customerEnabled: false, existing: new Set() });
  assert.ok(off.every((r) => r.audience === 'team'));
  const on = planReminders({ services: [svc({ customer_notify: true, customer_recipients: ['a@example.com'] })], openPeriods: new Map(), today: '2026-12-25', customerEnabled: true, existing: new Set() });
  assert.ok(on.some((r) => r.audience === 'customer'));
});

test('duplicate keeps setup, never payments/dates/notifications', () => {
  const d = duplicateService(svc({ customer_notify: true, customer_recipients: ['x@y'] }));
  assert.equal(d.name, 'example.com (kopya)');
  assert.equal(d.customer_notify, false);
  assert.ok(!('end_on' in d) && !('id' in d));
});

test('CSV: quotes, separators, BOM, formula guard', () => {
  const rows = parseCsv('﻿ad;tür;not\n"a; b";domain;"çift ""tırnak"""\r\nx;vps;\n');
  assert.deepEqual(rows, [['ad', 'tür', 'not'], ['a; b', 'domain', 'çift "tırnak"'], ['x', 'vps', '']]);
  assert.ok(toCsv(['a'], [['=HYPERLINK("x")']]).includes(`"'=HYPERLINK(""x"")"`));
});

test('CSV import: mapping, errors with reasons, duplicates reported (not merged)', () => {
  const rows = parseCsv('Kayıt adı,Tür,Alan adı (domain),Bitiş,Satış bedeli,Satış para birimi\nexample.com,Domain,example.com,31.12.2026,"1.200,00",TL\nNew,hosting,,2026-02-30,abc,\n,,,,,\nexample.com kopya,domain,EXAMPLE.com,,,\n');
  const map = guessMapping(rows[0]);
  const out = validateImport(rows.slice(1), map, [{ id: 'x', name: 'Eski', kind: 'domain', domain: 'other.com' }]);
  assert.equal(out[0].errors.length, 0);
  assert.equal(out[0].values.end_on, '2026-12-31');
  assert.equal(out[0].values.price_amount, '1200.00');
  assert.equal(out[0].values.price_currency, 'TRY');
  assert.ok(out[1].errors.some((e) => e.includes('geçersiz tarih')));
  assert.ok(out[1].errors.some((e) => e.includes('geçersiz tutar')));
  assert.equal(out[2].duplicateOf, 'example.com (dosyada satır 2)');
});
