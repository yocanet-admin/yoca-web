import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserProbeText, probeFromBrowser } from '../lib/cockpit/browserProbe';

test('no-cors opaque response: "completed; HTTP status not verified", never 200/healthy', async () => {
  const opaque = (async () => ({ type: 'opaque', status: 0 }) as Response) as typeof fetch;
  const probe = await probeFromBrowser('https://www.spmedya.com', 10_000, opaque);
  assert.equal(probe.state, 'completed');
  assert.equal(probe.state === 'completed' && probe.opaque, true);
  assert.equal(probe.state === 'completed' && probe.status, null);
  const text = browserProbeText(probe);
  assert.match(text, /^tarayıcı isteği tamamlandı \(\d+\.\d sn\); HTTP durumu doğrulanamadı \(no-cors, opak yanıt\)$/);
  assert.doesNotMatch(text, /200|sağlıklı|çalışıyor/);
});

test('the request is no-cors, without cookies', async () => {
  let init: RequestInit | undefined;
  const spy = (async (_u: unknown, i?: RequestInit) => { init = i; return { type: 'opaque', status: 0 } as Response; }) as typeof fetch;
  await probeFromBrowser('https://example.test', 10_000, spy);
  assert.equal(init?.mode, 'no-cors');
  assert.equal(init?.credentials, 'omit');
});

test('network error and timeout: "could not complete", the browser may be the cause', async () => {
  const fail = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
  assert.equal(browserProbeText(await probeFromBrowser('https://x.test', 10_000, fail)), 'tarayıcı isteği tamamlanamadı — ağ hatası (bu tarayıcının ağı da neden olabilir)');
  const hang = ((_u: unknown, i?: RequestInit) => new Promise((_, reject) => i?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' }))))) as typeof fetch;
  assert.match(browserProbeText(await probeFromBrowser('https://x.test', 50, hang)), /tamamlanamadı — zaman aşımı/);
});
