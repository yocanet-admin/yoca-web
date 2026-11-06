/**
 * Yoca — sending a document by e-mail through the existing Resend account
 * (server only). Same key and endpoint convention as lib/notify.ts and the
 * newsletter mailer:
 *   RESEND_API_KEY          already set in production (domain yoca.net verified)
 *   DOCUMENTS_EMAIL_FROM    sender, default NOTIFY_EMAIL_FROM or "Yoca <noreply@yoca.net>"
 *   NOTIFY_RESEND_ENDPOINT  test capture endpoint (never set in production)
 *   DOCUMENTS_EMAIL_TEST_ALLOW  non-production only: addresses / @domains that may receive
 *
 * One request key = one e-mail: it is also the Resend Idempotency-Key, so a
 * double click, a retry after a timeout or a second server instance never
 * sends a second copy (Resend keeps idempotency keys for 24 hours).
 * The outcome is reported exactly:
 *   accepted  Resend returned an id (accepted for delivery, NOT "delivered")
 *   failed    Resend refused it (4xx): nothing was sent
 *   unknown   timeout / network error / 5xx: it may or may not have been sent;
 *             retrying with the same key is safe
 * Delivery ("delivered", "bounced" …) is read later with GET /emails/{id};
 * that needs a full-access API key — with a sending-only key the status stays
 * "accepted" and the panel says the delivery state cannot be read.
 */

const ENDPOINT = (process.env.NOTIFY_RESEND_ENDPOINT || 'https://api.resend.com/emails').replace(/\/$/, '');
export const CAPTURE_MODE = Boolean(process.env.NOTIFY_RESEND_ENDPOINT);
const FROM = process.env.DOCUMENTS_EMAIL_FROM || process.env.NOTIFY_EMAIL_FROM || 'Yoca <noreply@yoca.net>';

function apiKey(): string | undefined {
  // Test capture (local / staging) sits behind the test gateway, which takes its anon key.
  return process.env.RESEND_API_KEY || (CAPTURE_MODE ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined);
}
const headers = (key: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(CAPTURE_MODE ? { apikey: key } : {}), ...extra });

export const mailReady = () => Boolean(apiKey());
export const senderAddress = () => FROM;

export interface DocumentMail {
  to: string[];
  cc: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachment: { filename: string; content: Buffer };
}

/** Any e-mail through the same account and rules (used by documents and by the Operasyon "E-postayla ilet"). */
export interface OutgoingMail {
  to: string[];
  cc: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}

export type SendOutcome = { status: 'accepted'; providerId: string } | { status: 'failed' | 'unknown'; error: string };

export async function sendDocumentMail(m: DocumentMail, requestKey: string, timeoutMs = 25_000): Promise<SendOutcome> {
  return sendMail({ to: m.to, cc: m.cc, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text, attachments: [m.attachment] }, `yoca-doc-email-${requestKey}`, timeoutMs);
}

/**
 * One call to Resend. `idempotencyKey` is sent as the Idempotency-Key, so the
 * same key never produces a second e-mail (24 h). Outcome as in the header.
 */
export async function sendMail(m: OutgoingMail, idempotencyKey: string, timeoutMs = 25_000): Promise<SendOutcome> {
  const key = apiKey();
  if (!key) return { status: 'failed', error: 'E-posta servisi kurulu değil (RESEND_API_KEY yok). Hiçbir şey gönderilmedi.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: headers(key, { 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify({
        from: FROM,
        to: m.to,
        ...(m.cc.length ? { cc: m.cc } : {}),
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.attachments.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok && json.id) return { status: 'accepted', providerId: json.id };
    if (res.ok) return { status: 'unknown', error: 'Servis yanıt verdi ama gönderim kimliği dönmedi.' };
    const msg = `Resend ${res.status}${json.message ? `: ${String(json.message).slice(0, 200)}` : ''}`;
    // 4xx = refused (nothing sent), except 409 (idempotency key in use / concurrent) and 429 (rate limit).
    if (res.status >= 400 && res.status < 500 && res.status !== 409 && res.status !== 429) return { status: 'failed', error: msg };
    return { status: 'unknown', error: msg };
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    return { status: 'unknown', error: aborted ? 'Servis zamanında yanıt vermedi.' : `Bağlantı hatası: ${(e as Error).message.slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

export type DeliveryLookup = { ok: true; lastEvent: string | null } | { ok: false; error: string; restricted?: boolean };

export async function lookupDelivery(providerId: string): Promise<DeliveryLookup> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'E-posta servisi kurulu değil.' };
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(providerId)}`, { headers: headers(key) });
    const json = (await res.json().catch(() => ({}))) as { last_event?: string; message?: string };
    if (res.status === 401 || res.status === 403) return { ok: false, restricted: true, error: 'Teslim durumu okunamadı: e-posta servisindeki API anahtarı yalnızca gönderim yetkili. Durum “servis kabul etti” olarak kalır; teslimi görmek için tam yetkili anahtar gerekir.' };
    if (!res.ok) return { ok: false, error: `Durum okunamadı (Resend ${res.status}).` };
    return { ok: true, lastEvent: typeof json.last_event === 'string' ? json.last_event : null };
  } catch (e) {
    return { ok: false, error: `Durum okunamadı: ${(e as Error).message.slice(0, 160)}` };
  }
}
