import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { runSiteChecks } from '../lib/cockpit/siteRunner';
import type { SiteRunRow } from '../lib/cockpit/siteStatus';

// TEST ONLY: local stub servers on 127.0.0.1 — no request leaves the machine; messages go to a fake sender.
function fakeDb(options: { current?: Record<string, string>; failWrites?: string } = {}) {
  const writes: Array<{ table: string; values: Record<string, unknown>; id: string }> = [];
  const client = {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if (options.failWrites === table) return { error: { message: 'simulated write failure' } };
          writes.push({ table, values, id });
          return { error: null };
        },
      }),
      // the runner re-reads the frequency after storing a result
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: options.current?.[id] ? { check_interval: options.current[id] } : null, error: null }),
        }),
      }),
    }),
  };
  return { client: client as never, writes };
}

const recent = new Date().toISOString();
const row = (over: Partial<SiteRunRow>): SiteRunRow => ({
  id: '00000000-0000-4000-8000-000000000001', name: 'Test', url: '', expects_signature: false, hosting_renews_on: null,
  check_interval: '7d', fail_count: 0, alerted: false, signature_alerted: false, last_checked_at: null,
  // RDAP not due → no registry request
  domain_checked_at: recent, domain_expires_at: '2027-01-01T00:00:00.000Z', ...over,
});

test('runner: stores result + schedule, releases the claim; first failure → confirmation, no message', async () => {
  const srv = http.createServer((req, res) => { res.writeHead(req.url === '/fail' ? 503 : 200, { 'content-type': 'text/html' }); res.end('ok'); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const sent: unknown[] = [];
  const notify = (async (m: unknown) => { sent.push(m); return { email: 'skipped', telegram: 'skipped' }; }) as never;
  try {
    const db = fakeDb();
    const now = Date.parse('2026-11-09T12:00:00Z');
    await runSiteChecks(db.client, [row({ id: 'a', url: `${base}/ok` }), row({ id: 'b', url: `${base}/fail` })], { now: () => now, notify });
    const state = (id: string) => db.writes.find((w) => w.table === 'site_check_state' && w.id === id)!.values;
    const site = (id: string) => db.writes.find((w) => w.table === 'monitored_sites' && w.id === id)!.values;
    assert.equal(state('a').lease_until, null);
    assert.equal(state('a').next_check_at, new Date(now + 7 * 24 * 3_600_000).toISOString());
    assert.ok(state('a').last_success_at, 'success time stored');
    assert.equal(state('a').domain_checked_at, undefined, 'RDAP not due: not refreshed');
    assert.equal(state('b').confirm_pending, true);
    assert.equal(state('b').next_check_at, new Date(now + 15 * 60_000).toISOString());
    assert.equal(state('b').last_success_at, undefined, 'a failure never moves "last success"');
    assert.equal((state('b').last_result as { problem: string }).problem, 'server_error');
    assert.equal(site('b').fail_count, 1);
    assert.equal(sent.length, 0, 'first failure: no message');

    // the confirmation fails too → exactly one alert
    const db2 = fakeDb();
    await runSiteChecks(db2.client, [row({ id: 'b', url: `${base}/fail`, fail_count: 1 })], { now: () => now + 15 * 60_000, notify });
    assert.equal(sent.length, 1);
    assert.match(String((sent[0] as { subject: string }).subject), /Site sorunu: Test/);
    // already alerted: later failures send nothing, schedule stays on the own interval
    const db3 = fakeDb();
    await runSiteChecks(db3.client, [row({ id: 'b', url: `${base}/fail`, fail_count: 2, alerted: true })], { now: () => now + 7 * 24 * 3_600_000, notify });
    assert.equal(sent.length, 1);
    assert.equal(db3.writes.find((w) => w.table === 'site_check_state')!.values.confirm_pending, false);
    // recovery from a real answer → one "Tekrar çalışıyor"
    await runSiteChecks(fakeDb().client, [row({ id: 'b', url: `${base}/ok`, fail_count: 3, alerted: true })], { now: () => now + 8 * 24 * 3_600_000, notify });
    assert.equal(sent.length, 2);
    assert.match(String((sent[1] as { subject: string }).subject), /Tekrar çalışıyor: Test/);
  } finally {
    srv.close();
  }
});

test('runner: "manual only" failure plans nothing; a frequency changed during the check wins; failed writes are reported', async () => {
  const srv = http.createServer((req, res) => { res.writeHead(req.url === '/fail' ? 503 : 200, { 'content-type': 'text/html' }); res.end('ok'); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const sent: unknown[] = [];
  const notify = (async (m: unknown) => { sent.push(m); return { email: 'skipped', telegram: 'skipped' }; }) as never;
  const now = Date.parse('2026-11-09T12:00:00Z');
  const last = (db: ReturnType<typeof fakeDb>, id: string) => db.writes.filter((w) => w.table === 'site_check_state' && w.id === id).reduce((acc, w) => ({ ...acc, ...w.values }), {} as Record<string, unknown>);
  try {
    // manual only + failure: no automatic confirmation, no automatic next check
    const m = fakeDb({ current: { m: 'manual' } });
    const r1 = await runSiteChecks(m.client, [row({ id: 'm', url: `${base}/fail`, check_interval: 'manual' })], { now: () => now, notify });
    assert.equal(last(m, 'm').next_check_at, null);
    assert.equal(last(m, 'm').confirm_pending, false);
    assert.equal(sent.length, 0);
    assert.deepEqual(r1.dbErrors, []);

    // claimed as 15 min, changed to weekly while the check ran → planned weekly
    const w = fakeDb({ current: { w: '7d' } });
    await runSiteChecks(w.client, [row({ id: 'w', url: `${base}/ok`, check_interval: '15m' })], { now: () => now, notify });
    assert.equal(last(w, 'w').next_check_at, new Date(now + 7 * 24 * 3_600_000).toISOString(), 'the old 15-minute plan does not keep running');

    // first failure on a 24-hour site, switched to "manual only" meanwhile → confirmation cancelled, alarm history kept
    const c = fakeDb({ current: { c: 'manual' } });
    await runSiteChecks(c.client, [row({ id: 'c', url: `${base}/fail`, check_interval: '24h' })], { now: () => now, notify });
    assert.equal(last(c, 'c').next_check_at, null);
    assert.equal(last(c, 'c').confirm_pending, false);
    assert.equal(c.writes.find((x) => x.table === 'monitored_sites')!.values.fail_count, 1, 'the failure itself is still counted');

    // a result that cannot be stored is reported (the cron turns it into a failed run)
    const f = fakeDb({ failWrites: 'site_check_state', current: { f: '7d' } });
    const r2 = await runSiteChecks(f.client, [row({ id: 'f', url: `${base}/ok` })], { now: () => now, notify });
    assert.equal(r2.dbErrors.length, 1);
  } finally {
    srv.close();
  }
});

test('runner: plans from the run start (cron slot), not from when the check ended; manual checks use a full interval', async () => {
  const srv = http.createServer((req, res) => { res.writeHead(req.url === '/fail' ? 503 : 200, { 'content-type': 'text/html' }); res.end('ok'); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const notify = (async () => ({ email: 'skipped', telegram: 'skipped' })) as never;
  const slot = Date.parse('2026-11-09T21:00:00Z');
  const ended = () => slot + 3 * 60_000 + 40_000; // the check "ended" 3 min 40 s into the slot
  const state = (db: ReturnType<typeof fakeDb>, id: string) => db.writes.filter((w) => w.table === 'site_check_state' && w.id === id).reduce((acc, w) => ({ ...acc, ...w.values }), {} as Record<string, unknown>);
  try {
    const db = fakeDb({ current: { q: '15m', d: '24h', c: '7d' } });
    await runSiteChecks(
      db.client,
      [row({ id: 'q', url: `${base}/ok`, check_interval: '15m' }), row({ id: 'd', url: `${base}/ok`, check_interval: '24h' }), row({ id: 'c', url: `${base}/fail`, check_interval: '7d' })],
      { now: ended, startedAt: slot + 2_000, notify },
    );
    assert.equal(state(db, 'q').next_check_at, '2026-11-09T21:15:00.000Z', '15 min site: the very next cron run');
    assert.equal(state(db, 'd').next_check_at, '2026-11-10T21:00:00.000Z', 'daily: same slot tomorrow');
    assert.equal(state(db, 'c').next_check_at, '2026-11-09T21:15:00.000Z');
    assert.equal(state(db, 'c').confirm_pending, true, 'confirmation at the next cron run');

    const m = fakeDb({ current: { m: '24h' } });
    await runSiteChecks(m.client, [row({ id: 'm', url: `${base}/ok`, check_interval: '24h' })], { now: () => slot + 7 * 60_000 + 5_000, startedAt: slot + 7 * 60_000, manual: true, notify });
    assert.equal(state(m, 'm').next_check_at, '2026-11-10T21:15:00.000Z', 'manual at 21:07: not before 21:07 tomorrow → the 21:15 slot');
  } finally {
    srv.close();
  }
});
