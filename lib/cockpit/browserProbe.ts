/** Yoca cockpit — reachability of a client site from the admin's own browser (display only). */

export type BrowserProbe =
  | { state: 'checking' }
  /** The request finished without a network error. `opaque`: a no-cors response — status and body are hidden by the browser. */
  | { state: 'completed'; at: string; ms: number; opaque: boolean; status: number | null }
  | { state: 'failed'; at: string; reason: string };

/**
 * Second vantage point for a site the server monitor could not confirm: does a
 * request from THIS browser complete? Method: fetch(url, { mode: 'no-cors' }).
 * The browser then returns an OPAQUE response for another origin: the HTTP status
 * (always 0) and body cannot be read, so all we learn is "the request completed
 * (some server answered)" plus the elapsed time — never "200" or "healthy".
 * A failure can also come from this browser (extension, network), not only the site.
 * Display only: never sent to the server, never touches alerts or recovery.
 */
export async function probeFromBrowser(url: string, timeoutMs = 10_000, fetchImpl: typeof fetch = fetch): Promise<BrowserProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: controller.signal });
    const opaque = response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0;
    return { state: 'completed', at: new Date().toISOString(), ms: Date.now() - started, opaque, status: opaque ? null : response.status };
  } catch (error) {
    return { state: 'failed', at: new Date().toISOString(), reason: (error as Error)?.name === 'AbortError' ? `zaman aşımı (${timeoutMs / 1000} sn)` : 'ağ hatası' };
  } finally {
    clearTimeout(timer);
  }
}

/** The text shown for a browser probe, worded to the limit of what it proves. */
export function browserProbeText(probe: BrowserProbe): string {
  if (probe.state === 'checking') return 'deneniyor…';
  if (probe.state === 'failed') return `tarayıcı isteği tamamlanamadı — ${probe.reason} (bu tarayıcının ağı da neden olabilir)`;
  const ms = `${(probe.ms / 1000).toFixed(1)} sn`;
  if (probe.opaque || probe.status === null) return `tarayıcı isteği tamamlandı (${ms}); HTTP durumu doğrulanamadı (no-cors, opak yanıt)`;
  return `tarayıcı isteği tamamlandı (${ms}); HTTP ${probe.status}`;
}
