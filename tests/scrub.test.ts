import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropBreadcrumb, maskText, pathOnly, routeTemplate, safeCode, toSafeEvent } from '../lib/observability/scrub';

test('maskText: personal and secret values are masked, code locations kept', () => {
  const out = maskText('Tahsilat kaydedilemedi: ornek.musteri@example.com tutar 12.500,00 TRY IBAN TR33 0006 1005 1978 6457 8413 26 ip 203.0.113.7 tel +90 532 123 45 67 Bearer abc.def-123 key sk_live_abcdefghijk eyJhbGciOiJIUzI1NiJ9.e30.sig ₺1.075 at route.ts:42:7');
  for (const leak of ['example.com', '12.500', 'TR33', '203.0.113.7', '532 123', 'abc.def-123', 'sk_live', 'eyJhbGci', '1.075']) assert.ok(!out.includes(leak), `${leak} sızdı: ${out}`);
  assert.ok(out.includes('route.ts:42:7'));
});

test('pathOnly: query string and fragment never leave', () => {
  assert.equal(pathOnly('https://yoca.net/api/admin/fin?token=abc&x=1#h'), 'https://yoca.net/api/admin/fin');
  assert.equal(pathOnly('/api/cron/ops?apikey=1'), '/api/cron/ops');
});

test('safeCode: only code-shaped values; sentences and secrets are not codes', () => {
  assert.equal(safeCode(Object.assign(new Error('x'), { code: 'ECONNRESET' })), 'ECONNRESET');
  assert.equal(safeCode({ code: '23505' }), '23505');
  assert.equal(safeCode({ code: 'PGRST116' }), 'PGRST116');
  assert.equal(safeCode({ code: 'duplicate key ali@example.com' }), null);
  assert.equal(safeCode({ code: 'eyJhbGciOiJIUzI1NiJ9' }), null);
  assert.equal(safeCode(new Error('no code')), null);
  assert.equal(safeCode('ECONNRESET'), null);
});

test('routeTemplate: parameter values never leave', () => {
  assert.equal(routeTemplate('GET /api/admin/documents/[id]'), 'GET /api/admin/documents/[id]');
  assert.equal(routeTemplate('POST /api/admin/fin/receivables/3f2b6c1e-1111-4222-8333-444455556666?token=x'), 'POST /api/admin/fin/receivables/[id]');
  assert.equal(routeTemplate('/admin/ops/clients/42'), '/admin/ops/clients/[n]');
  assert.equal(routeTemplate('GET /share/aB3xY9kQ_zz81Lmn0pQr'), 'GET /share/[param]');
  assert.equal(routeTemplate('https://yoca.net/api/cron/ops?secret=1'), '/api/cron/ops');
  assert.equal(routeTemplate('ali@example.com did something'), undefined);
  assert.equal(routeTemplate(undefined), undefined);
});

const fullEvent = () => ({
  event_id: 'abc123',
  timestamp: 1794130000,
  platform: 'node',
  level: 'error',
  release: '4375b02fb61fa95cc40bf7df1567c22209febb92',
  environment: 'test',
  sdk: { name: 'sentry.javascript.nextjs', version: '9.47.2', integrations: ['x'], packages: [{ name: 'npm:@sentry/nextjs' }] },
  transaction: 'POST /api/admin/fin/collections/3f2b6c1e-1111-4222-8333-444455556666',
  message: 'payer ali@example.com',
  logentry: { message: 'IBAN TR33 0006 1005' },
  request: { method: 'POST', url: 'https://yoca.net/api/x?token=s3cret', data: '{"iban":"TR00"}', cookies: { sb: 'x' }, headers: { authorization: 'Bearer zzz', cookie: 'sb=1' }, query_string: 'token=s3cret' },
  user: { email: 'finans@example.com', ip_address: '203.0.113.7' },
  server_name: 'mustafa-macbook',
  tags: { customer: 'ACME Ltd' },
  extra: { body: { amount: 5 } },
  modules: { next: '14.2.5' },
  contexts: { trace: { trace_id: 't' }, os: { name: 'darwin' }, device: { hostname: 'host-1' }, runtime: { name: 'node' }, culture: { timezone: 'Europe/Istanbul' } },
  breadcrumbs: [{ category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/t?apikey=eyJabc.def' } }],
  exception: {
    values: [{
      type: 'Error',
      value: 'tutar: 990 TRY for ali@example.com',
      mechanism: { type: 'onerror', handled: false, data: { body: 'x' } },
      stacktrace: { frames: [{ filename: '/var/task/.next/server/app/api/x/route.js', abs_path: '/var/task/.next/server/app/api/x/route.js', function: 'POST', lineno: 9, colno: 3, in_app: true, vars: { password: 'p', note: 'ali@example.com' }, pre_context: ['const iban = "TR00"'], context_line: 'throw new Error(email)', post_context: ['}'] }] },
    }],
  },
});

test('toSafeEvent: only the allow-listed technical fields leave', () => {
  const out = toSafeEvent(fullEvent(), { originalException: Object.assign(new Error('raw'), { code: '23505' }) }) as Record<string, unknown>;
  assert.deepEqual(Object.keys(out).sort(), ['environment', 'event_id', 'exception', 'level', 'platform', 'release', 'sdk', 'timestamp', 'transaction']);
  const s = JSON.stringify(out);
  for (const leak of ['example.com', 's3cret', 'TR00', 'TR33', 'Bearer', 'sb=1', '203.0.113.7', 'mustafa-macbook', 'host-1', '990', 'eyJabc', 'ACME', 'amount', 'Istanbul', 'darwin', 'trace_id', 'pre_context', 'context_line', 'vars', 'password', '3f2b6c1e', '"modules"', 'integrations', 'packages', '/var/task']) {
    assert.ok(!s.includes(leak), `${leak} sızdı: ${s}`);
  }
  assert.equal(out.transaction, 'POST /api/admin/fin/collections/[id]');
  const exc = (out.exception as { values: Array<Record<string, unknown>> }).values[0];
  assert.equal(exc.type, 'Error');
  assert.equal(exc.value, 'code 23505');
  assert.deepEqual(exc.mechanism, { type: 'onerror', handled: false });
  assert.deepEqual((exc.stacktrace as { frames: unknown[] }).frames[0], { filename: '.next/server/app/api/x/route.js', function: 'POST', lineno: 9, colno: 3, in_app: true });
  assert.deepEqual(out.sdk, { name: 'sentry.javascript.nextjs', version: '9.47.2' });
});

test('toSafeEvent: no code → fixed text; odd error types → Error; no exception → not sent', () => {
  const out = toSafeEvent(fullEvent(), { originalException: new Error('müşteri ali@example.com') }) as { exception: { values: Array<{ value: string; type: string }> } };
  assert.equal(out.exception.values[0].value, '(mesaj gönderilmez)');
  const odd = fullEvent();
  odd.exception.values[0].type = 'Error: ali@example.com tutar 5';
  assert.equal((toSafeEvent(odd) as { exception: { values: Array<{ type: string }> } }).exception.values[0].type, 'Error');
  assert.equal(toSafeEvent({ message: 'log line with ali@example.com' }), null);
  assert.equal(toSafeEvent({ exception: { values: [] } }), null);
});

test('breadcrumbs are never kept', () => {
  assert.equal(dropBreadcrumb(), null);
});
