import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskText, pathOnly, scrubBreadcrumb, scrubEvent } from '../lib/observability/scrub';

test('maskText: personal and secret values are masked, code locations kept', () => {
  const out = maskText('Tahsilat kaydedilemedi: ornek.musteri@example.com tutar 12.500,00 TRY IBAN TR33 0006 1005 1978 6457 8413 26 ip 203.0.113.7 tel +90 532 123 45 67 Bearer abc.def-123 key sk_live_abcdefghijk eyJhbGciOiJIUzI1NiJ9.e30.sig ₺1.075 at route.ts:42:7');
  for (const leak of ['example.com', '12.500', 'TR33', '203.0.113.7', '532 123', 'abc.def-123', 'sk_live', 'eyJhbGci', '1.075']) assert.ok(!out.includes(leak), `${leak} sızdı: ${out}`);
  assert.ok(out.includes('route.ts:42:7'));
  assert.ok(out.includes('Tahsilat kaydedilemedi'));
});

test('pathOnly: query string and fragment never leave', () => {
  assert.equal(pathOnly('https://yoca.net/api/admin/fin?token=abc&x=1#h'), 'https://yoca.net/api/admin/fin');
  assert.equal(pathOnly('/api/cron/ops?apikey=1'), '/api/cron/ops');
});

test('scrubEvent: no body, cookies, headers, query, user or extra; strings masked', () => {
  const e = scrubEvent({
    message: 'payer ali@example.com',
    request: { method: 'POST', url: 'https://yoca.net/api/x?token=s3cret', data: '{"iban":"TR00"}', cookies: { sb: 'x' }, headers: { authorization: 'Bearer zzz', cookie: 'sb=1' }, query_string: 'token=s3cret' },
    user: { email: 'finans@example.com', ip_address: '203.0.113.7' },
    server_name: 'host-1',
    extra: { body: { amount: 5 } },
    contexts: { trace: { trace_id: 't' }, request_body: { email: 'a@b.co' }, runtime: { name: 'node' } },
    exception: { values: [{ type: 'Error', value: 'tutar: 990 TRY for ali@example.com', stacktrace: { frames: [{ filename: 'app/api/x/route.ts', lineno: 9, vars: { password: 'p', note: 'ali@example.com' } }] } }] },
    breadcrumbs: [{ category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/t?apikey=eyJabc.def', method: 'GET', status_code: 200, body: 'secret' } }],
  });
  const s = JSON.stringify(e);
  for (const leak of ['example.com', 's3cret', 'TR00', 'Bearer zzz', 'sb=1', '203.0.113.7', 'host-1', '990', 'eyJabc', '"body"', 'request_body', '"amount"']) assert.ok(!s.includes(leak), `${leak} sızdı`);
  assert.deepEqual(e.request, { method: 'POST', url: 'https://yoca.net/api/x' });
  assert.equal(e.user, undefined);
  assert.ok(s.includes('app/api/x/route.ts'));
  assert.ok(s.includes('"trace_id":"t"'));
  assert.equal((e.exception.values[0].stacktrace.frames[0].vars as Record<string, string>).password, '[gizli]');
});

test('scrubBreadcrumb: only url path, method and status survive', () => {
  const b = scrubBreadcrumb({ category: 'http', message: 'POST to bob@example.com', data: { url: 'https://api.example.com/v1?key=1', method: 'POST', status_code: 500, 'http.request_body': 'x' } });
  assert.deepEqual(b.data, { url: 'https://api.example.com/v1', method: 'POST', status_code: 500 });
  assert.ok(!JSON.stringify(b).includes('bob@'));
});
