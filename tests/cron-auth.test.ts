/**
 * Cron guard: jobs run only with a configured secret and the exact header.
 * Run: npx tsx --test tests/cron-auth.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCronAuth } from '../lib/cockpit/cron';

const SECRET = 'a'.repeat(48);

test('missing secret refuses (never "allow all")', () => {
  assert.deepEqual(checkCronAuth(undefined, null), { ok: false, status: 503, error: 'cron_not_configured' });
  assert.deepEqual(checkCronAuth('', 'Bearer '), { ok: false, status: 503, error: 'cron_not_configured' });
  assert.deepEqual(checkCronAuth('   ', 'Bearer x'), { ok: false, status: 503, error: 'cron_not_configured' });
});

test('short secret counts as not configured', () => {
  assert.equal(checkCronAuth('short-secret', 'Bearer short-secret').ok, false);
});

test('missing or wrong header is 401', () => {
  assert.deepEqual(checkCronAuth(SECRET, null), { ok: false, status: 401, error: 'unauthorized' });
  assert.deepEqual(checkCronAuth(SECRET, `Bearer ${SECRET}x`), { ok: false, status: 401, error: 'unauthorized' });
  assert.deepEqual(checkCronAuth(SECRET, SECRET), { ok: false, status: 401, error: 'unauthorized' });
  assert.deepEqual(checkCronAuth(SECRET, `bearer ${SECRET}`), { ok: false, status: 401, error: 'unauthorized' });
});

test('exact Vercel Cron header passes', () => {
  assert.deepEqual(checkCronAuth(SECRET, `Bearer ${SECRET}`), { ok: true });
  assert.deepEqual(checkCronAuth(`  ${SECRET}\n`, `Bearer ${SECRET}`), { ok: true });
});
