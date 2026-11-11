import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalStats } from '../lib/ops/renewals';
import type { Service } from '../lib/ops/model';

const svc = (id: string, name: string, end: string | null, extra: Partial<Service> = {}): Service => ({
  id, name, kind: 'domain', status: 'active', provider_id: null, provider_account_id: null, panel_url: null, start_on: null, end_on: end,
  is_perpetual: false, due_on: null, cancel_by: null, period: 'yearly', period_months: null, auto_renew: 'off', owner_party: 'client', owner_client_id: null,
  payer_party: 'client', payer_client_id: null, renewer_party: 'yoca', team_owner: 'ekip@test.local', cost_amount: null, cost_currency: null,
  price_amount: null, price_currency: null, archived_at: null, ...extra,
} as unknown as Service);

test('renewal figures: windows, archived/cancelled skipped, upcoming = the rows of the 90-day figure, nearest first', () => {
  const today = '2026-11-11';
  const r = renewalStats({
    services: [
      svc('a', 'B alan', '2026-11-15'),
      svc('b', 'A alan', '2026-12-01'),
      svc('c', 'Uzak', '2027-01-20'),
      svc('d', 'Çok uzak', '2027-06-01'),
      svc('e', 'Arşiv', '2026-11-12', { archived_at: '2026-10-01T00:00:00Z' }),
      svc('f', 'İptal', '2026-11-12', { status: 'cancelled' }),
    ],
    periods: [], payments: [],
  }, today);
  assert.equal(r.live.length, 4);
  assert.deepEqual(r.within, { 7: 1, 30: 2, 90: 3 });
  assert.deepEqual(r.upcoming.map((u) => [u.id, u.days]), [['a', 4], ['b', 20], ['c', 70]]);
  assert.equal(r.upcoming.length, r.within[90]);
});
