import { createHash, createHmac } from 'node:crypto';

/**
 * Yoca Operasyon — server-to-server client for the license system
 * (license.yoca.net). Server only: the secret never reaches the browser.
 *
 * license.yoca.net stays the source of truth. As of this version it has NO
 * management API (admin actions are server actions behind Better Auth + 2FA);
 * the contract this client expects is in docs/license-management-api.md and
 * has to be added to the license platform first. Until the env vars below are
 * set, every call returns `not_configured` and the cockpit says so — it never
 * shows a license action as done.
 *
 * Env (names only): YOCA_LICENSE_API_URL, YOCA_LICENSE_API_KEY_ID, YOCA_LICENSE_API_SECRET
 * Requests are signed: HMAC-SHA256(secret, `${ts}\n${METHOD}\n${path}\n${sha256(body)}`)
 * in X-Yoca-Signature, with X-Yoca-Key-Id, X-Yoca-Timestamp and, for changes,
 * Idempotency-Key (the cockpit's request key).
 */

export const LICENSE_ENV = ['YOCA_LICENSE_API_URL', 'YOCA_LICENSE_API_KEY_ID', 'YOCA_LICENSE_API_SECRET'] as const;

export function licenseApiConfigured(): { configured: boolean; missing: string[] } {
  const missing = LICENSE_ENV.filter((k) => !(process.env[k] ?? '').trim());
  return { configured: missing.length === 0, missing };
}

export type LicenseCall<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'not_configured' | 'rejected' | 'unreachable'; status?: number; error: string };

/** Pure signing helper (unit-tested). */
export function signRequest(secret: string, ts: string, method: string, path: string, body: string): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret).update(`${ts}\n${method.toUpperCase()}\n${path}\n${bodyHash}`).digest('hex');
}

export async function licenseCall<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<LicenseCall<T>> {
  const cfg = licenseApiConfigured();
  if (!cfg.configured) return { ok: false, kind: 'not_configured', error: `Lisans API’si yapılandırılmadı (${cfg.missing.join(', ')}).` };
  const base = String(process.env.YOCA_LICENSE_API_URL).replace(/\/$/, '');
  const raw = body === undefined ? '' : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    'X-Yoca-Key-Id': String(process.env.YOCA_LICENSE_API_KEY_ID),
    'X-Yoca-Timestamp': ts,
    'X-Yoca-Signature': signRequest(String(process.env.YOCA_LICENSE_API_SECRET), ts, method, path, raw),
  };
  if (raw) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: raw || undefined, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch {
    // Timeout / connection lost: for a change the outcome is UNKNOWN (it may have happened).
    return { ok: false, kind: 'unreachable', error: 'Lisans sunucusuna ulaşılamadı ya da yanıt gelmedi. Sonuç bilinmiyor.' };
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; message?: string; code?: string } | null;
  if (!res.ok || !json?.ok) {
    if (res.status >= 500 || !json) return { ok: false, kind: 'unreachable', status: res.status, error: `Lisans sunucusu hata verdi (HTTP ${res.status}). Sonuç bilinmiyor olabilir.` };
    return { ok: false, kind: 'rejected', status: res.status, error: json?.message || json?.code || `Reddedildi (HTTP ${res.status}).` };
  }
  return { ok: true, data: json.data as T };
}

/** Fields the license system has today (from its schema; see the doc). */
export interface RemoteLicense {
  id: string;
  product: { id: string; name: string; slug?: string } | null;
  customer: { id: string; name: string; email?: string } | null;
  key_masked: string | null;
  status: 'active' | 'suspended' | 'revoked';
  activation_limit: number | null;
  expires_at: string | null; // null = perpetual (in the license system)
  issued_at: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
  notes: string | null;
  activations?: Array<{ domain: string; environment: string; status: string; last_validated_at: string | null }>;
}
