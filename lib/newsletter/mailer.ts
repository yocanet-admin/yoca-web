/**
 * Yoca — newsletter e-mail delivery through Resend (server only).
 *
 * Env:
 *   RESEND_API_KEY     already used for admin notifications (domain yoca.net verified)
 *   NEWSLETTER_FROM    sender, default "Yoca <bulten@yoca.net>"
 *   NEWSLETTER_REPLY_TO  default connect@yoca.net
 * Issue e-mails go out with the batch endpoint (up to 100 per request) and
 * an Idempotency-Key, so a retried request never sends a second copy.
 * Each e-mail carries List-Unsubscribe + List-Unsubscribe-Post (one click).
 */

const ENDPOINT = (process.env.NOTIFY_RESEND_ENDPOINT || 'https://api.resend.com/emails').replace(/\/$/, '');
const FROM = process.env.NEWSLETTER_FROM || 'Yoca <bulten@yoca.net>';
const REPLY_TO = process.env.NEWSLETTER_REPLY_TO || 'connect@yoca.net';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string;
}

function payload(m: OutgoingEmail) {
  return {
    from: FROM,
    to: [m.to],
    reply_to: REPLY_TO,
    subject: m.subject,
    html: m.html,
    text: m.text,
    ...(m.unsubscribeUrl
      ? { headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
      : {}),
  };
}

export function mailerReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendOne(m: OutgoingEmail, idempotencyKey?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY tanımlı değil.' };
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify(payload(m)),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${String(json.message ?? '').slice(0, 200)}` };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'Gönderilemedi.' };
  }
}

/** Up to 100 e-mails in one request. Returns one result per input, in order. */
export async function sendBatch(list: OutgoingEmail[], idempotencyKey: string): Promise<Array<{ ok: boolean; id?: string; error?: string }>> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return list.map(() => ({ ok: false, error: 'RESEND_API_KEY tanımlı değil.' }));
  try {
    const res = await fetch(`${ENDPOINT}/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(list.map(payload)),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }>; message?: string };
    if (!res.ok) {
      const error = `Resend ${res.status}: ${String(json.message ?? '').slice(0, 200)}`;
      return list.map(() => ({ ok: false, error }));
    }
    return list.map((_, i) => ({ ok: true, id: json.data?.[i]?.id }));
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 200) : 'Gönderilemedi.';
    return list.map(() => ({ ok: false, error }));
  }
}
