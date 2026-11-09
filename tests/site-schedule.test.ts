import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainDue, nextSchedule, parseClaimedIds, plannedSlot, resultFreshness } from '../lib/cockpit/schedule';
import { FAILED_STATES, siteTransition } from '../lib/cockpit/siteAlerts';
import type { SiteState } from '../lib/cockpit/monitor';

const T0 = Date.parse('2026-11-09T12:00:00Z');
const H = 3_600_000;
const at = (ms: number) => new Date(ms).toISOString();

const S = T0; // 12:00:00Z: a cron slot (the cron runs at :00 / :15 / :30 / :45 UTC)
const MIN = 60_000;
const SEC = 1_000;
const cron = (interval: Parameters<typeof nextSchedule>[0]['interval'], startedAt: number, failed = false, prevFailCount = 0, alerted = false) =>
  nextSchedule({ interval, failed, prevFailCount, alerted, startedAt });
const manualCheck = (interval: Parameters<typeof nextSchedule>[0]['interval'], startedAt: number, failed = false, prevFailCount = 0, alerted = false) =>
  nextSchedule({ interval, failed, prevFailCount, alerted, startedAt, manual: true });

test("cron run: the next check is planned from the run's slot — seconds of delay or a long check never push 15 min to 30 min", () => {
  for (const late of [0, 3 * SEC, 49 * SEC, 3 * MIN + 20 * SEC, 6 * MIN]) {
    assert.equal(cron('15m', S + late).next_check_at, at(S + 15 * MIN), `15 min, run started +${late / SEC}s`);
    assert.equal(cron('1h', S + late).next_check_at, at(S + H));
    assert.equal(cron('6h', S + late).next_check_at, at(S + 6 * H));
    assert.equal(cron('24h', S + late).next_check_at, at(S + 24 * H), 'daily: the same slot tomorrow, never earlier');
    assert.equal(cron('7d', S + late).next_check_at, at(S + 7 * 24 * H), 'weekly: the same slot next week, never earlier');
  }
  // every planned time is a cron slot boundary
  for (const iv of ['15m', '1h', '6h', '24h', '7d'] as const) assert.equal(Date.parse(cron(iv, S + 49 * SEC).next_check_at!) % (15 * MIN), 0);
});

test('late or missed cron: one check, then the next suitable slot — no back-to-back catch-up', () => {
  // the :00 run started 10 minutes late: :15 would be only 5 minutes away → :30
  assert.equal(cron('15m', S + 10 * MIN).next_check_at, at(S + 30 * MIN));
  assert.equal(cron('15m', S + 14 * MIN + 50 * SEC).next_check_at, at(S + 30 * MIN), 'started 10 s before the next slot: not checked again 10 s later');
  // the :15 run was missed; the :30 run checks once (site overdue for 15 min, or for 3 days) and plans from ITS slot
  const at30 = S + 30 * MIN + 2 * SEC;
  assert.equal(cron('15m', at30).next_check_at, at(S + 45 * MIN));
  assert.equal(cron('7d', at30).next_check_at, at(S + 30 * MIN + 7 * 24 * H));
});

test('first failure: ONE confirmation at the next suitable cron slot; then the own interval; alerted sites never loop', () => {
  assert.deepEqual(cron('7d', S + 5 * SEC, true), { next_check_at: at(S + 15 * MIN), confirm_pending: true });
  assert.deepEqual(cron('24h', S + 3 * MIN + 30 * SEC, true), { next_check_at: at(S + 15 * MIN), confirm_pending: true }, 'a check over 3 minutes: still the next slot');
  assert.deepEqual(cron('6h', S + 10 * MIN, true), { next_check_at: at(S + 30 * MIN), confirm_pending: true }, 'run 10 min late: the slot at least 7.5 min away');
  // the confirmation (run of the :15 slot) failed too → alert; back to the own interval from that slot
  assert.deepEqual(cron('7d', S + 15 * MIN + 4 * SEC, true, 1), { next_check_at: at(S + 15 * MIN + 7 * 24 * H), confirm_pending: false });
  // an alerted site never schedules confirmations: no retry loop
  assert.deepEqual(cron('6h', S + 4 * SEC, true, 0, true), { next_check_at: at(S + 6 * H), confirm_pending: false });
  // 15 min: the next regular slot is the confirmation
  assert.deepEqual(cron('15m', S + 4 * SEC, true), { next_check_at: at(S + 15 * MIN), confirm_pending: false });
  // manual check failing: the confirmation is the next suitable cron slot too
  assert.deepEqual(manualCheck('24h', S + 7 * MIN, true), { next_check_at: at(S + 15 * MIN), confirm_pending: true });
  assert.deepEqual(manualCheck('24h', S + 12 * MIN, true), { next_check_at: at(S + 30 * MIN), confirm_pending: true });
});

test('manual check: the next automatic check is the first slot a FULL interval later (daily / weekly never early)', () => {
  const t = S + 7 * MIN; // 12:07
  assert.equal(manualCheck('15m', t).next_check_at, at(S + 30 * MIN), '12:07 + 15 min = 12:22 → the 12:30 slot');
  assert.equal(manualCheck('24h', t).next_check_at, at(S + 24 * H + 15 * MIN), 'not 12:00 tomorrow (7 min early) but 12:15');
  assert.equal(manualCheck('7d', t).next_check_at, at(S + 7 * 24 * H + 15 * MIN));
  assert.equal(manualCheck('1h', S).next_check_at, at(S + H), 'a manual check exactly on a slot: one interval later');
});

test('weekly site, full incident: alert after the confirmation, once; recovery only from a real answer', () => {
  let row = { fail_count: 0, alerted: false, signature_alerted: false, expects_signature: true };
  const step = (state: SiteState, startedAt: number) => {
    const t = siteTransition(row, { state, checkedAt: at(startedAt), signature: state === 'up' ? true : null });
    const s = nextSchedule({ interval: '7d', failed: FAILED_STATES.includes(state), prevFailCount: row.fail_count, alerted: row.alerted, startedAt });
    row = { ...row, fail_count: t.patch.fail_count, alerted: t.patch.alerted ?? row.alerted };
    return { ...t, ...s };
  };
  const first = step('unknown', S + 3 * SEC);
  assert.deepEqual([first.alert, first.confirm_pending, first.next_check_at], [null, true, at(S + 15 * MIN)]);
  const confirm = step('unknown', S + 15 * MIN + 3 * SEC);
  assert.equal(confirm.alert, 'unchecked', 'alert ~15 minutes after the first failed check, not a week later');
  assert.equal(confirm.confirm_pending, false);
  assert.equal(confirm.next_check_at, at(S + 15 * MIN + 7 * 24 * H));
  const weekLater = step('down', S + 15 * MIN + 7 * 24 * H + 3 * SEC);
  assert.deepEqual([weekLater.alert, weekLater.recovered, weekLater.confirm_pending], [null, false, false], 'no second alert, no loop');
  const back = step('up', S + 15 * MIN + 14 * 24 * H + 3 * SEC);
  assert.equal(back.recovered, true);
  assert.equal(row.alerted, false);
});

test('"manual only": a failed (manual) check never schedules an automatic confirmation', () => {
  assert.deepEqual(manualCheck('manual', S, true), { next_check_at: null, confirm_pending: false });
  assert.deepEqual(manualCheck('manual', S, true, 1), { next_check_at: null, confirm_pending: false });
  assert.deepEqual(manualCheck('manual', S, false, 2, true), { next_check_at: null, confirm_pending: false });
});

test('panel: the shown time is the cron slot that will really do the check', () => {
  const now = S + 20 * MIN; // 12:20
  assert.equal(plannedSlot({ interval: '15m', nextCheckAt: at(S + 30 * MIN), now }), at(S + 30 * MIN));
  assert.equal(plannedSlot({ interval: '7d', nextCheckAt: at(S + 7 * 24 * H), now }), at(S + 7 * 24 * H));
  assert.equal(plannedSlot({ interval: '15m', nextCheckAt: at(S + 30 * MIN + 6 * SEC), now }), at(S + 30 * MIN), 'a pre-v29 value (end + interval) counts from its slot');
  assert.equal(plannedSlot({ interval: '1h', nextCheckAt: null, now }), at(S + 30 * MIN), 'never checked: the next cron run');
  assert.equal(plannedSlot({ interval: '24h', nextCheckAt: at(S - 2 * H), now }), at(S + 30 * MIN), 'a missed slot: the next cron run');
  assert.equal(plannedSlot({ interval: 'manual', nextCheckAt: null, now }), null);
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
