import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { loadContext } from '@/lib/documents/server';
import { parseAddresses, statusFromEvent, testRecipientProblem } from '@/lib/documents/mail';
import { CAPTURE_MODE, lookupDelivery, mailReady, sendMail, type SendOutcome } from '@/lib/documents/emailSend';
import { forwardEmail, forwardKey, forwardWarnings, type ForwardPayload } from '@/lib/ops/forward';
import type { Service } from '@/lib/ops/model';

/**
 * Yoca Operasyon — "E-postayla ilet" (admin only, manual).
 *
 * POST { action: 'preview', serviceId, subject, message, attachmentIds }
 *   → the exact e-mail (HTML + text) and warnings. Nothing is sent or stored.
 * POST { action: 'send', serviceId, to, cc?, subject, message, attachmentIds?, targetDate?, offsetDays?, reminderId?, requestKey }
 *   → one e-mail through the existing Resend account (same rules as the
 *     document e-mail). One request key = one record = one e-mail: a double
 *     click, a parallel call or "Yeniden dene" never sends a second copy.
 * POST { action: 'status', id } → delivery state from Resend.
 *
 * Only what the admin sees in the dialog is sent: the typed recipients, the
 * edited subject and message, and the files ticked by hand. No customer
 * address, cost, note or access detail is added on the server: the e-mail is
 * composed from those fields and the public company profile only
 * (forwardEmail in lib/ops/forward.ts takes no service data).
 *
 * The record is created with the admin's own session (the database sets the
 * sender from it, v23) and its send result is written with the service role
 * only: after v23 an admin session cannot change the content of a forward,
 * mark it as sent or delete it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

type Sb = NonNullable<ReturnType<typeof getSupabaseAsUser>>;
interface Row { id: string; dedupe_key: string; service_id: string | null; status: string; attempts: number; recipients: string[]; payload: ForwardPayload; created_at: string; last_error: string | null }
interface DocRow { id: string; name: string; path: string; size_bytes: number | null }

async function serviceOf(client: Sb, id: string) {
  const r = await client.from('ops_services').select('*').eq('id', id).maybeSingle();
  return r.data as Service | null;
}

/** Only documents of THIS service, not archived, and only the ones ticked. */
async function attachmentsOf(client: Sb, serviceId: string, ids: string[]): Promise<{ ok: true; docs: DocRow[] } | { ok: false; error: string }> {
  if (!ids.length) return { ok: true, docs: [] };
  if (ids.length > 10 || ids.some((x) => !UUID.test(x))) return { ok: false, error: 'Geçersiz ek seçimi.' };
  const r = await client.from('ops_documents').select('id, name, path, size_bytes').eq('entity', 'service').eq('entity_id', serviceId).is('archived_at', null).in('id', ids);
  if (r.error) return { ok: false, error: 'Ekler okunamadı.' };
  const docs = (r.data ?? []) as DocRow[];
  if (docs.length !== new Set(ids).size) return { ok: false, error: 'Seçilen eklerden biri bu hizmete ait değil veya arşivlenmiş.' };
  const total = docs.reduce((n, d) => n + (d.size_bytes ?? 0), 0);
  if (total > MAX_ATTACH_BYTES) return { ok: false, error: 'Eklerin toplamı 15 MB’ı geçemez.' };
  return { ok: true, docs };
}

async function download(client: Sb, docs: DocRow[]): Promise<{ ok: true; files: Array<{ doc: DocRow; buffer: Buffer; sha: string }> } | { ok: false; error: string }> {
  const files: Array<{ doc: DocRow; buffer: Buffer; sha: string }> = [];
  for (const d of docs) {
    const f = await client.storage.from('ops-docs').download(d.path);
    if (f.error || !f.data) return { ok: false, error: `Ek okunamadı: ${d.name}. Hiçbir şey gönderilmedi.` };
    const buffer = Buffer.from(await f.data.arrayBuffer());
    files.push({ doc: d, buffer, sha: createHash('sha256').update(buffer).digest('hex') });
  }
  return { ok: true, files };
}


/** Send (or repeat with the same idempotency key) the stored content of one record; record the outcome. */
async function deliver(client: Sb, row: Row, requestKey: string) {
  const p = row.payload;
  const docs = await attachmentsOf(client, row.service_id ?? '', p.attachments.map((a) => a.id));
  let outcome: SendOutcome;
  if (!docs.ok) outcome = { status: 'failed', error: docs.error };
  else {
    const files = await download(client, docs.docs);
    if (!files.ok) outcome = { status: 'failed', error: files.error };
    else if (files.files.some((f) => p.attachments.find((a) => a.id === f.doc.id)?.sha256 !== f.sha)) outcome = { status: 'failed', error: 'Ek dosya, gönderim kaydındakiyle aynı değil; hiçbir şey gönderilmedi.' };
    else {
      const ctx = await loadContext(client);
      const mail = forwardEmail({ issuer: ctx.issuer, subject: p.subject, body: p.body, attachmentNames: p.attachments.map((a) => a.name) });
      outcome = await sendMail({ to: row.recipients, cc: p.cc, replyTo: p.reply_to ?? undefined, subject: p.subject, html: mail.html, text: mail.text, attachments: files.files.map((f) => ({ filename: f.doc.name, content: f.buffer })) }, `yoca-ops-forward-${requestKey}`);
    }
  }
  const status = outcome.status === 'accepted' ? 'sent' : 'failed';
  const payload: ForwardPayload = { ...p, outcome: outcome.status, provider_id: outcome.status === 'accepted' ? outcome.providerId : p.provider_id ?? null };
  const writer = getSupabaseServiceRole() ?? client;
  const up = await writer.from('ops_notifications').update({
    status, attempts: row.attempts + 1, last_error: outcome.status === 'accepted' ? null : outcome.error,
    sent_at: outcome.status === 'accepted' ? new Date().toISOString() : null, next_attempt_at: null, payload,
  }).eq('id', row.id);
  if (up.error) return fail(500, 'Gönderim sonucu kaydedilemedi. Sonuç belirsiz; aynı pencereden “Yeniden dene” ikinci e-posta göndermez.', { status: 'unknown', id: row.id });
  if (outcome.status === 'accepted') return json({ ok: true, status: 'accepted', id: row.id });
  return json({ ok: false, status: outcome.status, id: row.id, error: outcome.error }, outcome.status === 'failed' ? 422 : 502);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return fail(401, 'unauthorized');
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail(503, 'Supabase yapılandırılmamış.');
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // ── delivery status ───────────────────────────────────────────
  if (body.action === 'status') {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return fail(400, 'bad request');
    const r = await client.from('ops_notifications').select('id, dedupe_key, status, payload').eq('id', body.id).maybeSingle();
    const row = r.data as { id: string; dedupe_key: string; status: string; payload: ForwardPayload } | null;
    if (!row || !row.dedupe_key.startsWith('forward:')) return fail(404, 'Gönderim kaydı bulunamadı.');
    if (row.status !== 'sent' || !row.payload.provider_id) return json({ ok: true, status: row.payload.outcome, unchanged: true });
    const look = await lookupDelivery(row.payload.provider_id);
    if (!look.ok) return json({ ok: false, error: look.error, restricted: look.restricted ?? false }, look.restricted ? 200 : 502);
    const delivery = statusFromEvent(look.lastEvent);
    await (getSupabaseServiceRole() ?? client).from('ops_notifications').update({ payload: { ...row.payload, delivery, last_event: look.lastEvent ?? null, status_checked_at: new Date().toISOString() } }).eq('id', row.id);
    return json({ ok: true, status: delivery, lastEvent: look.lastEvent });
  }

  if (typeof body.serviceId !== 'string' || !UUID.test(body.serviceId)) return fail(400, 'bad request');
  const service = await serviceOf(client, body.serviceId);
  if (!service) return fail(404, 'Hizmet bulunamadı.');
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const attachmentIds = Array.isArray(body.attachmentIds) ? Array.from(new Set(body.attachmentIds.map(String))) : [];

  // ── preview: the exact e-mail, nothing sent or stored ──────────
  if (body.action === 'preview') {
    const docs = await attachmentsOf(client, service.id, attachmentIds);
    if (!docs.ok) return fail(400, docs.error);
    const ctx = await loadContext(client);
    const mail = forwardEmail({ issuer: ctx.issuer, subject: subject || '(konu yok)', body: message || ' ', attachmentNames: docs.docs.map((d) => d.name) });
    return json({ ok: true, html: mail.html, text: mail.text, from: process.env.DOCUMENTS_EMAIL_FROM || process.env.NOTIFY_EMAIL_FROM || 'Yoca <noreply@yoca.net>', replyTo: (ctx.issuer.email ?? '').trim(), warnings: forwardWarnings(`${subject}\n${message}`, service), mailReady: mailReady() });
  }

  if (body.action !== 'send') return fail(400, 'bad request');
  if (typeof body.requestKey !== 'string' || !UUID.test(body.requestKey)) return fail(400, 'İstek anahtarı eksik.');
  const requestKey = body.requestKey;
  const key = forwardKey(requestKey);

  // Same key again (double click, retry): never a second e-mail.
  const prev = await client.from('ops_notifications').select('id, dedupe_key, service_id, status, attempts, recipients, payload, created_at, last_error').eq('dedupe_key', key).maybeSingle();
  if (prev.error) return fail(500, 'Gönderim kaydı okunamadı; hiçbir şey gönderilmedi.');
  if (prev.data) return replay(client, prev.data as Row, service.id, requestKey);

  const to = parseAddresses(String(body.to ?? ''));
  const cc = parseAddresses(String(body.cc ?? ''));
  if (!to.list.length) return fail(400, 'Alıcı adresini yazın veya seçin.');
  if (to.invalid.length || cc.invalid.length) return fail(400, `Geçersiz e-posta adresi: ${[...to.invalid, ...cc.invalid].join(', ')}`);
  if (to.tooMany || cc.tooMany) return fail(400, 'En fazla 10 alıcı ve 10 bilgi (CC) adresi.');
  if (!subject || subject.length > 300) return fail(400, 'Konu 1–300 karakter olmalı.');
  if (!message || message.length > 20_000) return fail(400, 'Mesaj boş olamaz (en fazla 20.000 karakter).');
  const guard = testRecipientProblem({ vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV, capture: CAPTURE_MODE, allow: process.env.DOCUMENTS_EMAIL_TEST_ALLOW }, [...to.list, ...cc.list]);
  if (guard) return fail(422, guard);
  if (!mailReady()) return fail(503, 'E-posta servisi kurulu değil (RESEND_API_KEY). Hiçbir şey gönderilmedi.');

  const docs = await attachmentsOf(client, service.id, attachmentIds);
  if (!docs.ok) return fail(400, `${docs.error} Hiçbir şey gönderilmedi.`);
  const files = await download(client, docs.docs);
  if (!files.ok) return fail(400, files.error);
  const ctx = await loadContext(client);
  const replyTo = parseAddresses((ctx.issuer.email ?? '').trim()).list[0] ?? null;
  const target = typeof body.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate) ? body.targetDate : null;
  const offset = Number.isInteger(body.offsetDays) ? Number(body.offsetDays) : null;
  const payload: ForwardPayload = {
    manual: true, subject, body: message, cc: cc.list, reply_to: replyTo,
    attachments: files.files.map((f) => ({ id: f.doc.id, name: f.doc.name, size: f.buffer.length, sha256: f.sha })),
    sent_by: admin.email ?? null, outcome: 'sending',
    reminder_id: typeof body.reminderId === 'string' && UUID.test(body.reminderId) ? body.reminderId : null,
  };
  const ins = await client.from('ops_notifications').upsert({
    dedupe_key: key, service_id: service.id, kind: 'customer_reminder', audience: 'customer', target_date: target, offset_days: offset,
    recipients: to.list, status: 'pending', payload,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id, dedupe_key, service_id, status, attempts, recipients, payload, created_at, last_error');
  if (ins.error) return fail(500, `Gönderim kaydı oluşturulamadı (${ins.error.message.slice(0, 120)}); hiçbir şey gönderilmedi.`);
  if (!ins.data?.length) {
    // A parallel call with the same key won the claim.
    const again = await client.from('ops_notifications').select('id, dedupe_key, service_id, status, attempts, recipients, payload, created_at, last_error').eq('dedupe_key', key).maybeSingle();
    if (!again.data) return fail(409, 'Bu gönderim başka bir istekle sürüyor; ikinci e-posta gönderilmez.');
    return replay(client, again.data as Row, service.id, requestKey);
  }
  return deliver(client, ins.data[0] as Row, requestKey);
}

async function replay(client: Sb, row: Row, serviceId: string, requestKey: string) {
  if (row.service_id !== serviceId) return fail(409, 'İstek anahtarı başka bir hizmete ait.');
  const age = Date.now() - new Date(row.created_at).getTime();
  if (row.status === 'sent') return json({ ok: true, replay: true, status: 'accepted', id: row.id });
  if (row.status === 'pending' && age < 120_000) return fail(409, 'Bu gönderim hâlâ sürüyor; birkaç saniye sonra durumu yenileyin. İkinci e-posta gönderilmez.', { status: 'sending', id: row.id });
  if (row.payload.outcome === 'failed') return json({ ok: false, replay: true, status: 'failed', id: row.id, error: row.last_error ?? 'Gönderilemedi.' }, 422);
  // The service remembers an idempotency key for 24 hours; after that a retry could send a second copy.
  if (age > 23 * 3_600_000) return fail(409, 'Bu gönderimin sonucu belirsiz kaldı ve 23 saatten eski; ikinci kopya riskine karşı yeniden denenmez. Alıcıya ulaşıp ulaşmadığını kontrol edin.', { status: 'unknown', id: row.id });
  return deliver(client, row, requestKey);
}
