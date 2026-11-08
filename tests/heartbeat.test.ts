import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heartbeat, heartbeatUrl, morningOutcome, opsOutcome, sitesOutcome, withHeartbeat } from '../lib/cockpit/heartbeat';

const ch = (email: string, telegram: string) => ({ email: { state: email, error: null }, telegram: { state: telegram, error: null } }) as never;

test('heartbeatUrl: bare check address only, phase suffix, unsafe values refused', () => {
  const base = 'https://hc-ping.com/1b2c3d4e-0000-4000-8000-000000000000';
  assert.equal(heartbeatUrl(base, 'success'), base);
  assert.equal(heartbeatUrl(`${base}/`, 'start'), `${base}/start`);
  assert.equal(heartbeatUrl(base, 'fail'), `${base}/fail`);
  assert.equal(heartbeatUrl(undefined, 'success'), null);
  assert.equal(heartbeatUrl('  ', 'success'), null);
  assert.equal(heartbeatUrl('not a url', 'success'), null);
  assert.equal(heartbeatUrl('http://hc-ping.com/x', 'success'), null, 'plain http only for a local monitor');
  assert.equal(heartbeatUrl('http://127.0.0.1:8000/ping/x', 'start'), 'http://127.0.0.1:8000/ping/x/start');
  assert.equal(heartbeatUrl(`${base}?rid=1`, 'success'), null, 'no query string can be configured');
  assert.equal(heartbeatUrl('https://user:pw@hc-ping.com/x', 'success'), null);
  assert.equal(heartbeatUrl('https://hc-ping.com/', 'success'), null);
});

test('morning: success only when really delivered; nothing-to-do is success', () => {
  assert.equal(morningOutcome({ ready: false }), 'fail');
  assert.equal(morningOutcome({ ready: true, skipped: 'already' }), 'success');
  assert.equal(morningOutcome({ ready: true, skipped: 'off' }), 'success');
  assert.equal(morningOutcome({ ready: true, sent: { email: 'sent', telegram: 'sent' } }), 'success');
  assert.equal(morningOutcome({ ready: true, sent: { email: 'sent', telegram: 'skipped' } }), 'success');
  assert.equal(morningOutcome({ ready: true, sent: { email: 'sent', telegram: 'error' } }), 'fail', 'partial delivery is not success');
  assert.equal(morningOutcome({ ready: true, sent: { email: 'skipped', telegram: 'skipped' } }), 'fail', 'reached no channel');
  assert.equal(morningOutcome({ ready: true }), 'fail');
});

test('ops: partial run or a failed/unclear channel is fail; nothing to send is success', () => {
  assert.equal(opsOutcome({ partial: false, digest: 'skipped', channels: null }), 'success');
  assert.equal(opsOutcome({ partial: false, digest: 'already', channels: null }), 'success');
  assert.equal(opsOutcome({ partial: false, digest: 'off', channels: null }), 'success');
  assert.equal(opsOutcome({ partial: false, digest: 'sent', channels: ch('sent', 'sent') }), 'success');
  assert.equal(opsOutcome({ partial: true, digest: 'sent', channels: ch('sent', 'sent') }), 'fail', 'Giderler part failed');
  assert.equal(opsOutcome({ partial: false, digest: 'failed', channels: ch('failed', 'sent') }), 'fail');
  assert.equal(opsOutcome({ partial: false, digest: 'sent', channels: ch('sent', 'unknown') }), 'fail', 'unclear Telegram after the last attempt');
  assert.equal(opsOutcome({ partial: false, digest: 'suppressed', channels: ch('skipped', 'skipped') }), 'fail');
});

test('sites: unreadable table, failed publish or undelivered alert is fail', () => {
  assert.equal(sitesOutcome({ dbOk: true, published: 0, sent: null }), 'success');
  assert.equal(sitesOutcome({ dbOk: true, published: 2, sent: { email: 'sent', telegram: 'sent' } }), 'success');
  assert.equal(sitesOutcome({ dbOk: true, published: 0, sent: { email: 'skipped', telegram: 'skipped' } }), 'success', 'site alerts switched off');
  assert.equal(sitesOutcome({ dbOk: false, published: 0, sent: null }), 'fail');
  assert.equal(sitesOutcome({ dbOk: true, published: null, sent: null }), 'fail');
  assert.equal(sitesOutcome({ dbOk: true, published: 0, sent: { email: 'sent', telegram: 'error' } }), 'fail');
});

test('heartbeat: no URL → nothing sent; bare GET without body; monitor errors never throw', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const ok = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response('OK'); }) as typeof fetch;
  delete process.env.HEALTHCHECKS_URL_OPS;
  assert.equal(await heartbeat('ops', 'start', ok), 'skipped');
  assert.equal(calls.length, 0);

  process.env.HEALTHCHECKS_URL_OPS = 'https://hc-ping.com/aaaaaaaa-0000-4000-8000-000000000000';
  assert.equal(await heartbeat('ops', 'fail', ok), 'sent');
  assert.equal(calls[0].url, 'https://hc-ping.com/aaaaaaaa-0000-4000-8000-000000000000/fail');
  assert.equal(calls[0].init?.method, 'GET');
  assert.equal(calls[0].init?.body, undefined);

  const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  assert.equal(await heartbeat('ops', 'success', down), 'error');
  const http500 = (async () => new Response('', { status: 500 })) as typeof fetch;
  assert.equal(await heartbeat('ops', 'success', http500), 'error');
  delete process.env.HEALTHCHECKS_URL_OPS;
});

test('withHeartbeat: start then the job outcome; exceptions ping fail and re-throw; monitor down changes nothing', async () => {
  process.env.HEALTHCHECKS_URL_SITES = 'https://hc-ping.com/bbbbbbbb-0000-4000-8000-000000000000';
  const seen: string[] = [];
  const rec = (async (url: string) => { seen.push(url.split('/').pop() ?? ''); return new Response('OK'); }) as typeof fetch;

  const res = await withHeartbeat('sites', async () => ({ response: new Response('job body', { status: 207 }), outcome: 'success' }), rec);
  assert.equal(res.status, 207);
  assert.equal(await res.text(), 'job body');
  assert.deepEqual(seen, ['start', 'bbbbbbbb-0000-4000-8000-000000000000']);

  seen.length = 0;
  await withHeartbeat('sites', async () => ({ response: new Response('x'), outcome: 'fail' }), rec);
  assert.deepEqual(seen, ['start', 'fail']);

  seen.length = 0;
  await assert.rejects(withHeartbeat('sites', async () => { throw new Error('boom'); }, rec), /boom/);
  assert.deepEqual(seen, ['start', 'fail']);

  const down = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  const still = await withHeartbeat('sites', async () => ({ response: new Response('ok', { status: 200 }), outcome: 'success' }), down);
  assert.equal(still.status, 200);
  delete process.env.HEALTHCHECKS_URL_SITES;
});
