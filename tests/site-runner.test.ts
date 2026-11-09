import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { runSiteChecks } from '../lib/cockpit/siteRunner';
import type { SiteRunRow } from '../lib/cockpit/siteStatus';

// TEST ONLY: local stub servers on 127.0.0.1 — no request leaves the machine; messages go to a fake sender.
function fakeDb() {
  const writes: Array<{ table: string; values: Record<string, unknown>; id: string }> = [];
  const client = {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          writes.push({ table, values, id });
          return { error: null };
        },
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
