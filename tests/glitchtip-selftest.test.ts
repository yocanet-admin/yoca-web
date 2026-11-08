import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GlitchTipSelfTest, SELFTEST_CODE, selftestDue } from '../lib/observability/selftest';
import { toSafeEvent } from '../lib/observability/scrub';

const SHA = '4375b02fb61fa95cc40bf7df1567c22209febb92';

test('selftest: only for the deployed commit, once per instance', () => {
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: '4375b02', VERCEL_GIT_COMMIT_SHA: SHA }, false), true);
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: SHA, VERCEL_GIT_COMMIT_SHA: SHA }, false), true);
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: '4375b02', VERCEL_GIT_COMMIT_SHA: SHA }, true), false, 'already sent in this instance');
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: '1111111', VERCEL_GIT_COMMIT_SHA: SHA }, false), false, 'another deploy: off by itself');
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: '4375b0', VERCEL_GIT_COMMIT_SHA: SHA }, false), false, 'too short');
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: 'yes', VERCEL_GIT_COMMIT_SHA: SHA }, false), false);
  assert.equal(selftestDue({ GLITCHTIP_SELFTEST: '4375b02' }, false), false, 'no commit (local): off');
  assert.equal(selftestDue({ VERCEL_GIT_COMMIT_SHA: SHA }, false), false);
});

test('selftest event passes the allow-list as type + code + release only', () => {
  const err = new GlitchTipSelfTest();
  const out = toSafeEvent({ release: SHA, sdk: { name: 'sentry.javascript.nextjs', version: '9.47.2' }, exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: [{ filename: 'sentry.server.config.ts', function: 'register', lineno: 40 }] } }] } }, { originalException: err }) as { release: string; exception: { values: Array<{ type: string; value: string }> } };
  assert.equal(out.exception.values[0].type, 'GlitchTipSelfTest');
  assert.equal(out.exception.values[0].value, `code ${SELFTEST_CODE}`);
  assert.equal(out.release, SHA, 'the release is the commit, not the SDK version');
  assert.ok(!JSON.stringify(out).includes('bağlantı testi'), 'message never leaves');
});
