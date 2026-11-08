/**
 * Yoca — what an error report may contain before it leaves the server (GlitchTip).
 *
 * ALLOW-LIST: a new event is built from a few technical fields; nothing else
 * from the SDK's event is copied. What can leave:
 *  - error type (e.g. TypeError) and, when the error carries one, a safe code
 *    (e.g. ECONNRESET, 23505, PGRST116) — never the raw message
 *  - route template without parameter values (e.g. GET /api/admin/documents/[id]);
 *    ids, numbers and query strings that slip into a path are replaced
 *  - stack locations: file, function, line, column, in-app flag — no source
 *    lines, no variables
 *  - release (commit SHA), environment, SDK name/version, level, timestamp
 * Never: raw messages, request/response bodies, cookies, headers (Authorization
 * included), query strings, user identity, IP, server name, contexts, extra,
 * tags, breadcrumbs, finance or customer data. Events without an exception
 * (captureMessage, logs) are dropped.
 */

// ── Kept from the first version: masking for any text that is still shown locally ──
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

// ── Allow-list ──────────────────────────────────────────────────────────────

const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,39}$|^\d{3,5}$|^[A-Z]{2,6}\d{2,5}$/;
const ERROR_TYPE = /^[A-Za-z_$][\w$.]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A code property of the original error, only when it looks like a code (not a sentence). */
export function safeCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  const text = typeof code === 'number' ? String(code) : typeof code === 'string' ? code : null;
  return text && SAFE_CODE.test(text) ? text : null;
}

/**
 * A route template: method + path with parameter values removed. "[id]" style
 * segments stay; uuids, numbers, long tokens and anything after ? or # go.
 */
export function routeTemplate(name: unknown): string | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  const m = name.trim().match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)?\s*(\S+)/i);
  if (!m || !/^(\/|https?:\/\/)/i.test(m[2])) return undefined;
  const path = (pathOnly(m[2]) ?? '').replace(/^https?:\/\/[^/]+/i, '');
  if (!path.startsWith('/')) return undefined;
  const segs = path.split('/').map((seg) => {
    if (!seg || /^\[{1,2}(\.\.\.)?[\w-]+\]{1,2}$/.test(seg)) return seg; // template segment or empty
    if (UUID.test(seg)) return '[id]';
    if (/^\d+$/.test(seg)) return '[n]';
    if (/^[a-z0-9-]{1,40}$/.test(seg) && !/\d{4,}/.test(seg)) return seg; // ordinary route word
    return '[param]';
  });
  return `${m[1] ? `${m[1].toUpperCase()} ` : ''}${segs.join('/')}`.slice(0, 200);
}

type Frame = { filename?: unknown; abs_path?: unknown; function?: unknown; module?: unknown; lineno?: unknown; colno?: unknown; in_app?: unknown; [k: string]: unknown };
type Exc = { type?: unknown; value?: unknown; mechanism?: { type?: unknown; handled?: unknown }; stacktrace?: { frames?: Frame[] } };
type AnyEvent = {
  event_id?: unknown; timestamp?: unknown; platform?: unknown; level?: unknown; release?: unknown; environment?: unknown;
  sdk?: { name?: unknown; version?: unknown }; transaction?: unknown; exception?: { values?: Exc[] }; [k: string]: unknown;
};

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);

/** File location only: no machine-specific prefix, no query string. */
function fileOf(v: unknown): string | undefined {
  const s = str(v, 300);
  if (!s) return undefined;
  return s.replace(/^.*?(?=(?:app|lib|components|webpack|node_modules|\.next|src)\/)/, '').split(/[?#]/)[0];
}

function safeFrame(f: Frame): Frame {
  const out: Frame = {};
  const filename = fileOf(f.filename ?? f.abs_path);
  if (filename) out.filename = filename;
  const fn = str(f.function, 120);
  if (fn) out.function = fn;
  const mod = str(f.module, 120);
  if (mod) out.module = mod;
  const line = int(f.lineno);
  if (line !== undefined) out.lineno = line;
  const col = int(f.colno);
  if (col !== undefined) out.colno = col;
  if (typeof f.in_app === 'boolean') out.in_app = f.in_app;
  return out;
}

/**
 * Builds the event that is allowed to leave. Returns null (= not sent) when
 * there is no exception to report.
 */
export function toSafeEvent<E extends object>(event: E, hint?: { originalException?: unknown }): E | null {
  const e = event as AnyEvent;
  const values = Array.isArray(e.exception?.values) ? e.exception!.values! : [];
  if (values.length === 0) return null;
  const code = safeCode(hint?.originalException);
  const route = routeTemplate(e.transaction);
  const safe: AnyEvent = {
    event_id: str(e.event_id, 64),
    timestamp: e.timestamp,
    platform: str(e.platform, 20) ?? 'node',
    level: e.level === 'fatal' || e.level === 'warning' ? e.level : 'error',
    ...(str(e.release, 64) ? { release: str(e.release, 64) } : {}),
    ...(str(e.environment, 30) ? { environment: str(e.environment, 30) } : {}),
    ...(e.sdk ? { sdk: { name: str(e.sdk.name, 60), version: str(e.sdk.version, 30) } } : {}),
    ...(route ? { transaction: route } : {}),
    exception: {
      values: values.slice(-5).map((x, i, arr) => {
        const type = typeof x.type === 'string' && ERROR_TYPE.test(x.type) ? x.type : 'Error';
        const last = i === arr.length - 1;
        return {
          type,
          // Never the raw message: the safe code of the thrown error, or a fixed text.
          value: last && code ? `code ${code}` : '(mesaj gönderilmez)',
          ...(x.mechanism ? { mechanism: { type: str(x.mechanism.type, 40) ?? 'generic', handled: x.mechanism.handled === true } } : {}),
          ...(Array.isArray(x.stacktrace?.frames) ? { stacktrace: { frames: x.stacktrace!.frames!.slice(-50).map(safeFrame) } } : {}),
        };
      }),
    },
  };
  return safe as E;
}

/** Breadcrumbs are never sent. */
export function dropBreadcrumb(): null {
  return null;
}
