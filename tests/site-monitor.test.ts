import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFetchError, classifyHttpStatus, dnsFailure, type SiteCheck } from '../lib/cockpit/monitor';
import { checkLabel, siteIssues } from '../lib/cockpit/issues';
import { siteTransition } from '../lib/cockpit/siteAlerts';

const fetchFailed = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
const dnsErr = (code: string) => Object.assign(new Error(code), { code });

test('timeouts and connection errors: "Kontrol tamamlanamadı", never site-down', () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.deepEqual(classifyFetchError(abort), { state: 'unknown', problem: 'check_incomplete', reason: 'Zaman aşımı (10 sn)' });
  for (const code of ['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'UND_ERR_SOCKET', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPROTO']) {
    const f = classifyFetchError(fetchFailed(code));
    assert.equal(f.state, 'unknown', code);
    assert.equal(f.problem, 'check_incomplete', code);
  }
  assert.equal(classifyFetchError(new Error('weird')).problem, 'check_incomplete');
});

test('certificate problem: "Güvenli bağlantı sorunu" (a property of the site)', () => {
  for (const code of ['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN']) {
    const f = classifyFetchError(fetchFailed(code));
    assert.equal(f.state, 'down', code);
    assert.equal(f.problem, 'tls', code);
  }
  assert.equal(checkLabel({ state: 'down', problem: 'tls' }), 'Güvenli bağlantı sorunu');
});

test('DNS: getaddrinfo "not found" alone is not "domain does not exist"', async () => {
  assert.equal(classifyFetchError(fetchFailed('ENOTFOUND')).problem, 'check_incomplete');
  assert.equal(classifyFetchError(fetchFailed('EAI_AGAIN')).problem, 'check_incomplete');
  const nx = await dnsFailure('x.test', () => Promise.reject(dnsErr('ENOTFOUND')), () => Promise.reject(dnsErr('ENOTFOUND')));
  assert.deepEqual([nx.state, nx.problem], ['down', 'dns_nxdomain'], 'real NXDOMAIN on A and AAAA');
  const nodata = await dnsFailure('x.test', () => Promise.reject(dnsErr('ENODATA')), () => Promise.reject(dnsErr('ENODATA')));
  assert.deepEqual([nodata.state, nodata.problem], ['down', 'dns_no_address']);
  const servfail = await dnsFailure('x.test', () => Promise.reject(dnsErr('ESERVFAIL')), () => Promise.reject(dnsErr('ENOTFOUND')));
  assert.deepEqual([servfail.state, servfail.problem], ['unknown', 'check_incomplete'], 'resolver error is not NXDOMAIN');
  const timeout = await dnsFailure('x.test', () => Promise.reject(dnsErr('ETIMEOUT')), () => Promise.reject(dnsErr('ETIMEOUT')));
  assert.equal(timeout.problem, 'check_incomplete');
  const found = await dnsFailure('x.test', () => Promise.resolve(['203.0.113.7']), () => Promise.reject(dnsErr('ENODATA')));
  assert.equal(found.problem, 'check_incomplete', 'an address exists after all');
});

test('HTTP status: 401/403/429 restricted (not down), 404, 5xx, other 4xx', () => {
  assert.equal(classifyHttpStatus(200), null);
  assert.equal(classifyHttpStatus(301), null);
  for (const s of [401, 403, 429]) assert.deepEqual(classifyHttpStatus(s), { state: 'unknown', problem: 'restricted', reason: `HTTP ${s}` });
  assert.deepEqual(classifyHttpStatus(404), { state: 'down', problem: 'not_found', reason: 'HTTP 404' });
  for (const s of [500, 502, 503]) assert.equal(classifyHttpStatus(s)?.problem, 'server_error');
  assert.equal(classifyHttpStatus(410)?.problem, 'http_error');
  assert.equal(checkLabel({ state: 'unknown', problem: 'restricted' }), 'Erişim kısıtlı / kontrol engellendi');
  assert.equal(checkLabel({ state: 'down', problem: 'not_found' }), 'İzlenen adres bulunamadı');
  assert.equal(checkLabel({ state: 'down', problem: 'server_error' }), 'Sunucu hatası');
});

const check = (over: Partial<SiteCheck>): SiteCheck => ({
  name: 'SP Medya', url: 'https://www.spmedya.com', state: 'up', httpStatus: 200, ms: 800, finalUrl: null, signature: true, expectsSignature: true,
  sslExpires: null, sslDaysLeft: 60, domainExpires: null, domainDaysLeft: 400, hostingRenewsOn: null, problem: null, error: null, checkedAt: new Date().toISOString(), ...over,
});

test('issues: incomplete/restricted are warnings with the reason; never "up"; no signature noise', () => {
  const timeout = siteIssues(check({ state: 'unknown', problem: 'check_incomplete', error: 'Zaman aşımı (10 sn)', httpStatus: null, ms: null, signature: null }));
  assert.deepEqual(timeout, [{ severity: 'warning', text: 'Kontrol tamamlanamadı — Zaman aşımı (10 sn)' }]);
  const blocked = siteIssues(check({ state: 'unknown', problem: 'restricted', error: 'HTTP 403', httpStatus: 403, signature: null }));
  assert.deepEqual(blocked, [{ severity: 'warning', text: 'Erişim kısıtlı / kontrol engellendi — HTTP 403' }]);
  const five = siteIssues(check({ state: 'down', problem: 'server_error', error: 'HTTP 503', httpStatus: 503, signature: null }));
  assert.deepEqual(five[0], { severity: 'critical', text: 'Sunucu hatası — HTTP 503' });
  assert.equal(siteIssues(check({ state: 'unknown', problem: 'check_incomplete', error: 'x', signature: false })).some((i) => /imza/i.test(i.text)), false);
});

const row = (over = {}) => ({ fail_count: 0, alerted: false, signature_alerted: false, expects_signature: true, ...over });
const at = '2026-11-09T14:00:00.000Z';

test('alerts: two failed checks in a row, once per incident, whatever the label', () => {
  const first = siteTransition(row(), { state: 'unknown', checkedAt: at, signature: null });
  assert.equal(first.alert, null);
  assert.equal(first.patch.fail_count, 1);
  const second = siteTransition(row({ fail_count: 1 }), { state: 'unknown', checkedAt: at, signature: null });
  assert.equal(second.alert, 'unchecked');
  assert.equal(second.patch.alerted, true);
  const down = siteTransition(row({ fail_count: 1 }), { state: 'down', checkedAt: at, signature: null });
  assert.equal(down.alert, 'down');
});

test('SP Medya case: already alerted as "down", now "unknown" → no new alert, no recovery', () => {
  const t = siteTransition(row({ fail_count: 18, alerted: true }), { state: 'unknown', checkedAt: at, signature: null });
  assert.equal(t.alert, null, 'renaming the state does not alert again');
  assert.equal(t.recovered, false, 'an unfinished check is not a recovery');
  assert.equal(t.patch.alerted, undefined, 'alerted flag untouched');
  assert.equal(t.patch.fail_count, 19);
  assert.equal(t.patch.last_state, 'unknown');
  assert.equal(t.unsigned, false);
});

test('recovery only from a check where the site answered (up / slow)', () => {
  for (const state of ['up', 'slow'] as const) {
    const t = siteTransition(row({ fail_count: 19, alerted: true }), { state, checkedAt: at, signature: true });
    assert.equal(t.recovered, true, state);
    assert.equal(t.patch.alerted, false);
    assert.equal(t.patch.fail_count, 0);
  }
  for (const state of ['down', 'suspended', 'unknown'] as const) assert.equal(siteTransition(row({ fail_count: 3, alerted: true }), { state, checkedAt: at, signature: null }).recovered, false, state);
});

test('signature: reported once, only when the site answered', () => {
  assert.equal(siteTransition(row(), { state: 'up', checkedAt: at, signature: false }).unsigned, true);
  assert.equal(siteTransition(row({ signature_alerted: true }), { state: 'up', checkedAt: at, signature: false }).unsigned, false);
  assert.equal(siteTransition(row(), { state: 'unknown', checkedAt: at, signature: false }).unsigned, false);
  assert.equal(siteTransition(row({ signature_alerted: true }), { state: 'up', checkedAt: at, signature: true }).patch.signature_alerted, false);
});
