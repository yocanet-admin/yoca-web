import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIRM_DELAY_MS, domainDue, INTERVAL_MS, nextSchedule, parseClaimedIds, resultFreshness } from '../lib/cockpit/schedule';
import { FAILED_STATES, siteTransition } from '../lib/cockpit/siteAlerts';
import type { SiteState } from '../lib/cockpit/monitor';

const T0 = Date.parse('2026-11-09T12:00:00Z');
const H = 3_600_000;
const at = (ms: number) => new Date(ms).toISOString();

test('after a check: own interval; first failure → ONE confirmation in 15 min (long intervals)', () => {
  assert.deepEqual(nextSchedule({ interval: '7d', failed: false, prevFailCount: 0, alerted: false, now: T0 }), { next_check_at: at(T0 + INTERVAL_MS['7d']), confirm_pending: false });
  assert.deepEqual(nextSchedule({ interval: '7d', failed: true, prevFailCount: 0, alerted: false, now: T0 }), { next_check_at: at(T0 + CONFIRM_DELAY_MS), confirm_pending: true });
  assert.deepEqual(nextSchedule({ interval: '24h', failed: true, prevFailCount: 0, alerted: false, now: T0 }), { next_check_at: at(T0 + CONFIRM_DELAY_MS), confirm_pending: true });
  // the confirmation failed too (alert goes out): back to the own interval
  assert.deepEqual(nextSchedule({ interval: '7d', failed: true, prevFailCount: 1, alerted: false, now: T0 }), { next_check_at: at(T0 + INTERVAL_MS['7d']), confirm_pending: false });
  // an alerted site never schedules confirmations: no retry loop
  assert.deepEqual(nextSchedule({ interval: '6h', failed: true, prevFailCount: 0, alerted: true, now: T0 }), { next_check_at: at(T0 + INTERVAL_MS['6h']), confirm_pending: false });
  // 15 min: the next regular check is the confirmation
  assert.deepEqual(nextSchedule({ interval: '15m', failed: true, prevFailCount: 0, alerted: false, now: T0 }), { next_check_at: at(T0 + 15 * 60_000), confirm_pending: false });
  // manual only: nothing automatic, not even a confirmation
  assert.deepEqual(nextSchedule({ interval: 'manual', failed: true, prevFailCount: 0, alerted: false, now: T0 }), { next_check_at: null, confirm_pending: false });
});

test('weekly site, full incident: alert after the confirmation, once; recovery only from a real answer', () => {
  let row = { fail_count: 0, alerted: false, signature_alerted: false, expects_signature: true };
  const step = (state: SiteState, now: number) => {
    const t = siteTransition(row, { state, checkedAt: at(now), signature: state === 'up' ? true : null });
    const s = nextSchedule({ interval: '7d', failed: FAILED_STATES.includes(state), prevFailCount: row.fail_count, alerted: row.alerted, now });
    row = { ...row, fail_count: t.patch.fail_count, alerted: t.patch.alerted ?? row.alerted };
    return { ...t, ...s };
  };
  const first = step('unknown', T0);
  assert.deepEqual([first.alert, first.confirm_pending, first.next_check_at], [null, true, at(T0 + CONFIRM_DELAY_MS)]);
  const confirm = step('unknown', T0 + CONFIRM_DELAY_MS);
  assert.equal(confirm.alert, 'unchecked', 'alert ~15 minutes after the first failure, not a week later');
  assert.equal(confirm.confirm_pending, false);
  const weekLater = step('down', T0 + CONFIRM_DELAY_MS + INTERVAL_MS['7d']);
  assert.deepEqual([weekLater.alert, weekLater.recovered, weekLater.confirm_pending], [null, false, false], 'no second alert, no loop');
  const back = step('up', T0 + 2 * INTERVAL_MS['7d']);
  assert.equal(back.recovered, true);
  assert.equal(row.alerted, false);
});

test('"manual only": a failed (manual) check never schedules an automatic confirmation', () => {
  const T0 = Date.parse('2026-11-09T12:00:00Z');
  assert.deepEqual(nextSchedule({ interval: 'manual', failed: true, prevFailCount: 0, alerted: false, now: T0 }), { next_check_at: null, confirm_pending: false });
  assert.deepEqual(nextSchedule({ interval: 'manual', failed: true, prevFailCount: 1, alerted: false, now: T0 }), { next_check_at: null, confirm_pending: false });
  assert.deepEqual(nextSchedule({ interval: 'manual', failed: false, prevFailCount: 2, alerted: true, now: T0 }), { next_check_at: null, confirm_pending: false });
});

test('claim answer: only a real list is accepted; an empty list is "nothing due", anything else is an error', () => {
  const id = '3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
  assert.deepEqual(parseClaimedIds([]), { ok: true, ids: [] });
  assert.deepEqual(parseClaimedIds([{ claimed_id: id }]), { ok: true, ids: [id] });
  for (const bad of [null, undefined, {}, 'ok', id, [{}], [{ claimed_id: 'x' }], [id], [{ claimed_id: id }, null]]) {
    assert.equal(parseClaimedIds(bad).ok, false, `not "nothing due": ${JSON.stringify(bad)}`);
  }
});

test('freshness follows the frequency: a weekly site checked yesterday is not stale; not-yet-due is not a failure', () => {
  const yesterday = at(T0 - 24 * H);
  assert.equal(resultFreshness({ interval: '7d', lastAttemptAt: yesterday, nextCheckAt: at(T0 + 6 * 24 * H), now: T0 }), 'fresh');
  assert.equal(resultFreshness({ interval: '15m', lastAttemptAt: at(T0 - 20 * 60_000), nextCheckAt: at(T0 - 5 * 60_000), now: T0 }), 'fresh', 'late by 5 min: within grace');
  assert.equal(resultFreshness({ interval: '15m', lastAttemptAt: at(T0 - H), nextCheckAt: at(T0 - 45 * 60_000), now: T0 }), 'overdue');
  assert.equal(resultFreshness({ interval: '24h', lastAttemptAt: at(T0 - 26 * H), nextCheckAt: null, now: T0 }), 'overdue', 'no stored next: last + interval');
  assert.equal(resultFreshness({ interval: 'manual', lastAttemptAt: at(T0 - 30 * 24 * H), nextCheckAt: null, now: T0 }), 'manual');
  assert.equal(resultFreshness({ interval: '1h', lastAttemptAt: null, nextCheckAt: null, now: T0 }), 'never');
});

test('domain (RDAP) at most once a day', () => {
  assert.equal(domainDue(null, T0), true);
  assert.equal(domainDue(at(T0 - 23 * H), T0), false);
  assert.equal(domainDue(at(T0 - 25 * H), T0), true);
});
