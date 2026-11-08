/**
 * Yoca — what an error report may contain before it leaves the server (GlitchTip).
 *
 * Applied in `beforeSend` / `beforeBreadcrumb` on top of the SDK settings
 * (sendDefaultPii off, request body/cookies/headers/query/IP not collected):
 *  - request: only method and the URL path survive — no body, cookies,
 *    headers (Authorization included), query string or fragment
 *  - user identity, server name and the SDK's extra request context are dropped
 *  - every remaining string (messages, exception values, breadcrumbs, frame
 *    variables) is masked: e-mail, IBAN, JWT / bearer / API keys, IP addresses,
 *    phone numbers, card-like numbers and money amounts
 * Kept on purpose: error type, stack frames (file, function, line), route path,
 * release and environment — what is needed to find and fix the bug.
 */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const JWT = /\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g;
const BEARER = /\b(Bearer|Basic)\s+[\w.~+/=-]+/gi;
const KEYLIKE = /\b(?:sk|pk|rk|re|oseo|sbp|ghp|xox[abp])_[\w-]{8,}\b/gi;
const SECRET_PARAM = /([?&;\s](?:apikey|api_key|key|token|access_token|refresh_token|secret|password|sig|signature|code)=)[^&\s"']+/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const PHONE = /(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g;
const MONEY = /(?:₺|\$|€|£)\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:TRY|TL|USD|EUR|AZN|GBP)\b|\b(tutar|amount|total|toplam|price|fiyat|bakiye|balance)(\s*[:=]?\s*)\d[\d.,]*/gi;

export function maskText(input: string): string {
  return input
    .replace(JWT, '[token]')
    .replace(BEARER, '$1 [token]')
    .replace(KEYLIKE, '[key]')
    .replace(SECRET_PARAM, '$1[gizli]')
    .replace(EMAIL, '[e-posta]')
    .replace(IBAN, '[iban]')
    .replace(IPV6, '[ip]')
    .replace(IPV4, '[ip]')
    .replace(MONEY, (m, label?: string, sep?: string) => (label ? `${label}${sep ?? ' '}[tutar]` : '[tutar]'))
    .replace(CARD, '[numara]')
    .replace(PHONE, '[telefon]');
}

function maskDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === 'string') return maskText(value) as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, depth + 1)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|iban|email|e-posta|phone|telefon/i.test(k) ? '[gizli]' : maskDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Only scheme + host + path of a URL; query and fragment never leave. */
export function pathOnly(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url, 'http://local.invalid');
    return u.origin === 'http://local.invalid' ? u.pathname : `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

// Structural types so this file needs no SDK import (keeps it unit-testable).
type AnyEvent = {
  request?: { url?: string; method?: string; [k: string]: unknown };
  user?: unknown;
  server_name?: string;
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

export function scrubEvent<E extends object>(event: E): E {
  const e: AnyEvent = { ...(event as AnyEvent) };
  if (e.request) e.request = { method: e.request.method, url: pathOnly(e.request.url) };
  delete e.user;
  delete e.server_name;
  if (e.contexts) {
    const { trace, runtime, os, app, device } = e.contexts as Record<string, unknown>;
    e.contexts = { ...(trace ? { trace } : {}), ...(runtime ? { runtime } : {}), ...(os ? { os } : {}), ...(app ? { app } : {}), ...(device ? { device } : {}) };
  }
  delete e.extra;
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map((b) => scrubBreadcrumb(b));
  return maskDeep(e) as E;
}

export function scrubBreadcrumb<B extends object>(crumb: B): B {
  const b: Record<string, unknown> = { ...(crumb as Record<string, unknown>) };
  const data = b.data as Record<string, unknown> | undefined;
  if (data) {
    const keep: Record<string, unknown> = {};
    if (typeof data.url === 'string') keep.url = pathOnly(data.url);
    if (data.method) keep.method = data.method;
    if (data.status_code) keep.status_code = data.status_code;
    b.data = keep;
  }
  return maskDeep(b) as B;
}
