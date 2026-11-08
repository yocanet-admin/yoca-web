import { createSign } from 'node:crypto';

/**
 * Yoca Kokpit SEO — Google auth for the Search Console API (server only).
 *
 * Chosen method: a Google Cloud SERVICE ACCOUNT whose JSON key is stored in a
 * Vercel environment variable marked "Sensitive":
 *
 *   GSC_SERVICE_ACCOUNT_JSON   the whole key file (type "service_account")
 *   GSC_PROPERTY               optional; defaults to the site's property
 *                              ("https://yoca.net/", URL-prefix property)
 *
 * The service account's e-mail must be added as a user (Kısıtlı / Restricted
 * is enough) to the Search Console property. Scope: webmasters.readonly only.
 * A short-lived access token is made from a signed JWT (RS256, node:crypto,
 * no extra dependency) and cached in memory until shortly before it expires.
 *
 * Alternative (documented, not implemented): Vercel OIDC → Google Workload
 * Identity Federation (no long-lived key; needs a WIF pool/provider for the
 * Vercel team + `@vercel/oidc` token exchange and service account
 * impersonation). Worth switching to once a Google Cloud project exists.
 *
 * This module reads environment variable NAMES only; values are never logged,
 * returned to the browser or put into error messages.
 */

export const GSC_ENV = { serviceAccount: 'GSC_SERVICE_ACCOUNT_JSON', property: 'GSC_PROPERTY' } as const;
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount { clientEmail: string; privateKey: string; tokenUri: string }
export type ServiceAccountRead = { ok: true; account: ServiceAccount } | { ok: false; missing: 'env' | 'invalid'; message: string };

/** Reads and validates the key from the environment (never echoes its content). */
export function readServiceAccount(env: Record<string, string | undefined> = process.env): ServiceAccountRead {
  const raw = env[GSC_ENV.serviceAccount];
  if (!raw || !raw.trim()) return { ok: false, missing: 'env', message: `${GSC_ENV.serviceAccount} tanımlı değil.` };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, missing: 'invalid', message: `${GSC_ENV.serviceAccount} geçerli bir JSON değil.` };
  }
  const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email : '';
  const privateKey = typeof parsed.private_key === 'string' ? parsed.private_key.replace(/\\n/g, '\n') : '';
  if (parsed.type !== 'service_account' || !clientEmail || !privateKey.includes('PRIVATE KEY')) {
    return { ok: false, missing: 'invalid', message: `${GSC_ENV.serviceAccount} bir servis hesabı anahtarı değil (type "service_account", client_email, private_key gerekli).` };
  }
  const tokenUri = typeof parsed.token_uri === 'string' && parsed.token_uri.startsWith('https://') ? parsed.token_uri : TOKEN_URL;
  return { ok: true, account: { clientEmail, privateKey, tokenUri } };
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Signed JWT assertion for the OAuth 2.0 JWT bearer grant (scope: webmasters.readonly). */
export function signedAssertion(account: ServiceAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.clientEmail, scope: GSC_SCOPE, aud: account.tokenUri, iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(account.privateKey))}`;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let cache: { token: string; exp: number; email: string } | null = null;

/** Access token for the Search Console API; cached until 60 s before expiry. */
export async function accessToken(account: ServiceAccount, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<string> {
  if (cache && cache.email === account.clientEmail && cache.exp - 60_000 > now) return cache.token;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(account, Math.floor(now / 1000)) });
  const res = await fetchImpl(account.tokenUri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    // Google's error code only (e.g. invalid_grant); never the key or the assertion.
    throw new GoogleAuthError(`Google erişim anahtarı alınamadı (${json.error ?? res.status}). Servis hesabı anahtarı iptal edilmiş veya hatalı olabilir.`);
  }
  cache = { token: json.access_token, exp: now + (json.expires_in ?? 3600) * 1000, email: account.clientEmail };
  return json.access_token;
}

export class GoogleAuthError extends Error {}

/** Test hook: forget the cached token. */
export function resetTokenCache() {
  cache = null;
}
