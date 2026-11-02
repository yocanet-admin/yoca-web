/**
 * Yoca — which client site sent a visitor through the "Built by YOCA" signature.
 * Signature links look like https://yoca.net/?utm_source=<site>&utm_medium=signature&utm_campaign=built_by_yoca
 * The site is kept for the browser session so later conversion events
 * (contact / Check-Up) can say where the visitor originally came from.
 * Browser only; storage failures are ignored.
 */

const KEY = 'yoca_signature_site';

/** "https://www.Example.com/path" → "example.com" (empty when it does not look like a domain). */
export function normalizeSite(value: string): string {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host.length <= 80 ? host : '';
}

/** Reads the signature UTM from the current URL; returns the site only the first time in a session. */
export function captureSignatureVisit(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('utm_medium') !== 'signature') return null;
  const site = normalizeSite(params.get('utm_source') ?? '');
  if (!site) return null;
  try {
    if (sessionStorage.getItem(KEY) === site) return null;
    sessionStorage.setItem(KEY, site);
  } catch {
    // private mode etc. — still report the visit once per page load
  }
  return site;
}

export function signatureSite(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Event data addition: { ref: site } when the visitor came through a signature. */
export function refData(): { ref?: string } {
  const site = signatureSite();
  return site ? { ref: site } : {};
}
