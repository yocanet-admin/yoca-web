import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubVercel } from './vercelStub';
import { visitorCard } from '../lib/cockpit/visitorCard';

process.env.VERCEL_API_TOKEN = 'test-only-not-a-token';

test('Vercel stub → trafficReport: missing days stay missing, zeros stay zero, today detected', async () => {
  const { trafficReport } = await import('../lib/cockpit/vercel');
  const real = globalThis.fetch;
  try {
    stubVercel('full');
    const full = await trafficReport(30);
    assert.equal(full.daily.length, 30);
    assert.ok(full.today && full.today.visitors > 0);
    assert.equal(visitorCard({ ok: true, configured: true, report: full }).state, 'ok');

    stubVercel('gaps');
    const gaps = await trafficReport(30);
    assert.equal(gaps.daily.length, 26, 'four days without a row are not filled in');
    assert.equal(gaps.today, null);
    assert.equal(visitorCard({ ok: true, configured: true, report: gaps }).state, 'no_data');

    stubVercel('zero');
    const zero = await trafficReport(7);
    assert.equal(zero.daily.length, 7);
    assert.equal(zero.daily.filter((d) => d.visitors === 0).length, 2);
    assert.equal(zero.today?.visitors, 0);
    assert.equal(visitorCard({ ok: true, configured: true, report: zero }).state, 'zero');
  } finally {
    globalThis.fetch = real;
  }
});
