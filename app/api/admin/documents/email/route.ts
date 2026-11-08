import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { docFileName, sanitizeContent, type DocKind } from '@/lib/documents/model';
import { currentRenderOf, dbError, DOC_BUCKET, loadContext, type DocContext, type VersionSnapshot } from '@/lib/documents/server';
import { bankChanges } from '@/lib/documents/settings';
import { brandedEmailText, documentEmailHtml, emailThemeOf, parseAddresses, statusFromEvent, testRecipientProblem } from '@/lib/documents/mail';
import { CAPTURE_MODE, lookupDelivery, mailReady, sendDocumentMail, type SendOutcome } from '@/lib/documents/emailSend';

/**
 * Yoca — "E-postayla gönder" for a finalized document version (admin only).
 *
 * POST { action: 'send', id, version, to, cc?, subject, message, theme?, keepBank?, requestKey }
 *   theme 'light' (default) | 'dark' changes only the e-mail body; it is kept
 *   on the doc_emails row (v22), so a retry sends the same look. The attached
 *   PDF is the same file in both themes.
 *   Attaches the stored PDF of that version made with the current company
 *   profile and template (the same file "PDF indir" gives; rendered and kept
 *   if it does not exist yet). If the version's bank details differ from the
 *   current settings, nothing is sent unless keepBank is true (same decision
 *   as the download). One request key = one row and one e-mail.
 * POST { action: 'status', emailId }  reads the delivery state from Resend.
 * Generating a PDF or finalizing never sends; only this action does.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

type Sb = NonNullable<ReturnType<typeof getSupabaseAsUser>>;
interface EmailRow { id: string; document_id: string; version: number; render_id: string; pdf_sha256: string; pdf_name: string; to_addrs: string[]; cc_addrs: string[]; subject: string; body: string; reply_to: string | null; status: string; provider_id: string | null; error: string | null; created_at: string; theme?: string }

const MISSING_TABLE = 'E-posta gönderimi için veritabanı güncellemesi (supabase/upgrade-v20-document-emails.sql) henüz uygulanmadı. Hiçbir şey gönderilmedi.';
const MISSING_THEME = 'Koyu tema için veritabanı güncellemesi (supabase/upgrade-v22-document-email-theme.sql) henüz uygulanmadı. Hiçbir şey gönderilmedi; açık temayla gönderebilirsiniz.';

function dbFail(error: { code?: string; message?: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42883' || error.code === 'PGRST202') return fail(503, MISSING_TABLE);
  const e = dbError(error);
  return fail(e.status, e.error);
}

async function pdfOf(client: Sb, renderId: string): Promise<{ ok: true; buffer: Buffer; sha: string } | { ok: false; error: string }> {
  const r = await client.from('doc_renders').select('pdf_path, pdf_sha256').eq('id', renderId).maybeSingle();
  if (r.error || !r.data) return { ok: false, error: 'Gönderilecek PDF bulunamadı.' };
  const row = r.data as { pdf_path: string; pdf_sha256: string };
  const file = await client.storage.from(DOC_BUCKET).download(row.pdf_path);
  if (file.error || !file.data) return { ok: false, error: 'PDF depodan okunamadı; hiçbir şey gönderilmedi.' };
  const buffer = Buffer.from(await file.data.arrayBuffer());
  const sha = createHash('sha256').update(buffer).digest('hex');
  // The attachment must be exactly the stored file recorded for this send.
  if (sha !== row.pdf_sha256) return { ok: false, error: 'PDF dosyası kayıtla eşleşmiyor; hiçbir şey gönderilmedi.' };
  return { ok: true, buffer, sha };
}

/** Make (or repeat, with the same idempotency key) the send of one doc_emails row and record the outcome. */
async function deliver(client: Sb, row: EmailRow, ctx: DocContext, locale: 'tr' | 'en', requestKey: string, doc: { number: string; kind: DocKind }) {
  const pdf = await pdfOf(client, row.render_id);
  let outcome: SendOutcome;
  if (!pdf.ok) outcome = { status: 'failed', error: pdf.error };
  else {
    // the document's name as frozen in the sent version (dark theme shows it with the number)
    const ver = await client.from('doc_versions').select('title').eq('document_id', row.document_id).eq('version', row.version).maybeSingle();
    const docTitle = ver.data ? String((ver.data as { title: string | null }).title ?? '') : '';
    const mail = { issuer: ctx.issuer, locale, preheader: row.subject, body: row.body, note: `${locale === 'tr' ? 'Ek' : 'Attachment'}: ${row.pdf_name}` };
    const html = documentEmailHtml({ issuer: ctx.issuer, locale, kind: doc.kind, number: doc.number, docTitle, subject: row.subject, body: row.body, pdfName: row.pdf_name, theme: emailThemeOf(row.theme) });
    outcome = await sendDocumentMail({
      to: row.to_addrs, cc: row.cc_addrs, replyTo: row.reply_to ?? undefined, subject: row.subject,
      html, text: brandedEmailText(mail), attachment: { filename: row.pdf_name, content: pdf.buffer },
    }, requestKey);
  }
  const fin = await client.rpc('doc_email_finish', {
    p_email_id: row.id, p_status: outcome.status, p_provider_id: outcome.status === 'accepted' ? outcome.providerId : null, p_error: outcome.status === 'accepted' ? null : outcome.error,
  });
  if (fin.error) {
    // The e-mail may have gone out but the result could not be written: never report success.
    return fail(500, `Gönderim sonucu kaydedilemedi (${fin.error.message?.slice(0, 120) ?? 'veritabanı'}). Sonuç belirsiz; aynı pencereden “Yeniden dene” aynı e-postayı ikinci kez göndermez.`, { status: 'unknown', emailId: row.id });
  }
  const status = (fin.data as { status: string }).status;
  if (status === 'accepted') return json({ ok: true, status, emailId: row.id, providerId: outcome.status === 'accepted' ? outcome.providerId : null });
  return json({ ok: false, status, emailId: row.id, error: outcome.status === 'accepted' ? 'Durum güncellenemedi.' : outcome.error }, status === 'failed' ? 422 : 502);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return fail(401, 'unauthorized');
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail(503, 'Supabase yapılandırılmamış.');
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // ── delivery status ───────────────────────────────────────────
  if (body.action === 'status') {
    if (typeof body.emailId !== 'string' || !UUID.test(body.emailId)) return fail(400, 'bad request');
    const r = await client.from('doc_emails').select('id, status, provider_id').eq('id', body.emailId).maybeSingle();
    if (r.error) return dbFail(r.error);
    if (!r.data) return fail(404, 'Gönderim kaydı bulunamadı.');
    const row = r.data as { id: string; status: string; provider_id: string | null };
    if (!row.provider_id || !['accepted', 'delivered', 'delayed', 'bounced', 'complained'].includes(row.status)) return json({ ok: true, status: row.status, unchanged: true });
    const look = await lookupDelivery(row.provider_id);
    if (!look.ok) return json({ ok: false, status: row.status, error: look.error, restricted: look.restricted ?? false }, look.restricted ? 200 : 502);
    const next = statusFromEvent(look.lastEvent);
    const u = await client.rpc('doc_email_status', { p_email_id: row.id, p_status: next, p_last_event: look.lastEvent ?? '' });
    if (u.error) return dbFail(u.error);
    return json({ ok: true, status: (u.data as { status: string }).status, lastEvent: look.lastEvent });
  }

  if (body.action !== 'send') return fail(400, 'bad request');

  // ── send ──────────────────────────────────────────────────────
  if (typeof body.requestKey !== 'string' || !UUID.test(body.requestKey)) return fail(400, 'İstek anahtarı eksik.');
  if (typeof body.id !== 'string' || !UUID.test(body.id)) return fail(400, 'bad id');
  const requestKey = body.requestKey;
  const ctx = await loadContext(client);

  const d = await client.from('doc_documents').select('id, number, kind, status, final_version, locale').eq('id', body.id).maybeSingle();
  if (d.error) return dbFail(d.error);
  if (!d.data) return fail(404, 'Belge bulunamadı.');
  const doc = d.data as { id: string; number: string; kind: DocKind; status: string; final_version: number; locale: 'tr' | 'en' };

  // Same request key again (double click, retry): never a second e-mail.
  const prev = await client.from('doc_emails').select('*').eq('request_key', requestKey).maybeSingle();
  if (prev.error) return dbFail(prev.error);
  if (prev.data) {
    const row = prev.data as EmailRow;
    if (row.document_id !== doc.id) return fail(409, 'İstek anahtarı başka belgeye ait.');
    const fresh = Date.now() - new Date(row.created_at).getTime() < 120_000;
    if (row.status === 'sending' && fresh) return fail(409, 'Bu gönderim hâlâ sürüyor; birkaç saniye sonra durumu yenileyin. İkinci e-posta gönderilmez.', { status: 'sending', emailId: row.id });
    // The service remembers a request key for 24 hours; after that a retry could send a second copy.
    const stale = Date.now() - new Date(row.created_at).getTime() > 23 * 3_600_000;
    if ((row.status === 'sending' || row.status === 'unknown') && stale) return fail(409, 'Bu gönderimin sonucu belirsiz kaldı ve 23 saatten eski; ikinci kopya riskine karşı yeniden denenmez. Alıcıya ulaşıp ulaşmadığını kontrol edin, gerekirse yeni gönderim yapın.', { status: row.status, emailId: row.id });
    if (row.status === 'sending' || row.status === 'unknown') return deliver(client, row, ctx, doc.locale, requestKey, doc);
    return json({ ok: row.status !== 'failed', replay: true, status: row.status, emailId: row.id, error: row.error ?? undefined }, row.status === 'failed' ? 422 : 200);
  }

  const version = Number(body.version);
  if (!Number.isInteger(version) || version < 1 || version > doc.final_version) return fail(400, 'Yalnızca kesinleşmiş bir sürüm gönderilebilir.');
  if (doc.status === 'archived') return fail(409, 'Arşivdeki belge gönderilemez; önce arşivden çıkarın.');
  const to = parseAddresses(String(body.to ?? ''));
  const cc = parseAddresses(String(body.cc ?? ''));
  if (!to.list.length) return fail(400, 'En az bir geçerli alıcı e-posta adresi yazın.');
  if (to.invalid.length || cc.invalid.length) return fail(400, `Geçersiz e-posta adresi: ${[...to.invalid, ...cc.invalid].join(', ')}`);
  if (to.tooMany || cc.tooMany) return fail(400, 'En fazla 10 alıcı ve 10 bilgi (CC) adresi.');
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!subject || subject.length > 300) return fail(400, 'Konu 1–300 karakter olmalı.');
  if (!message || message.length > 20_000) return fail(400, 'Mesaj boş olamaz (en fazla 20.000 karakter).');
  if (body.theme !== undefined && body.theme !== 'light' && body.theme !== 'dark') return fail(400, 'Geçersiz e-posta teması.');
  const theme = emailThemeOf(body.theme);

  const guard = testRecipientProblem({ vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV, capture: CAPTURE_MODE, allow: process.env.DOCUMENTS_EMAIL_TEST_ALLOW }, [...to.list, ...cc.list]);
  if (guard) return fail(422, guard);
  if (!mailReady()) return fail(503, 'E-posta servisi kurulu değil (RESEND_API_KEY). Hiçbir şey gönderilmedi.');

  // Bank details: same explicit decision as the download; nothing silent.
  const v = await client.from('doc_versions').select('snapshot').eq('document_id', doc.id).eq('version', version).maybeSingle();
  if (v.error) return dbFail(v.error);
  if (!v.data) return fail(404, 'Bu sürüm bulunamadı.');
  const snap = (v.data as { snapshot: VersionSnapshot }).snapshot;
  if (body.keepBank !== true) {
    const changes = bankChanges(snap?.bankAccounts ?? [], ctx.settings.bankAccounts);
    if (changes.length) return json({ ok: false, needsBankDecision: true, version, bankChanges: changes, error: 'Bu sürümdeki banka bilgisi güncel ayarlardan farklı.' }, 409);
  }
  const locale = sanitizeContent(snap?.content, doc.kind).locale;

  const rendered = await currentRenderOf(client, doc.id, version, ctx, getSupabaseServiceRole());
  if (!rendered.ok) return fail(rendered.status, `${rendered.error} Hiçbir şey gönderilmedi.`);
  const pdfName = docFileName(doc.kind, doc.number, version, { ascii: true });
  const replyTo = (ctx.issuer.email ?? '').trim();

  const begin = await client.rpc('doc_email_begin', {
    p_id: doc.id, p_version: version, p_render_id: rendered.id, p_pdf_name: pdfName, p_to: to.list, p_cc: cc.list,
    p_subject: subject, p_body: message, p_reply_to: parseAddresses(replyTo).list[0] ?? '', p_request_key: requestKey,
    // Light is the column default, so a light send also works before v22.
    ...(theme === 'dark' ? { p_theme: theme } : {}),
  });
  if (begin.error) {
    if (theme === 'dark' && (begin.error.code === 'PGRST202' || begin.error.code === '42883')) return fail(503, MISSING_THEME);
    return dbFail(begin.error);
  }
  const b = begin.data as { id: string; status: string; replay: boolean };
  const rowRes = await client.from('doc_emails').select('*').eq('id', b.id).maybeSingle();
  if (rowRes.error || !rowRes.data) return fail(500, 'Gönderim kaydı okunamadı; hiçbir şey gönderilmedi.');
  const row = rowRes.data as EmailRow;
  if (b.replay && !['sending', 'unknown'].includes(row.status)) return json({ ok: row.status !== 'failed', replay: true, status: row.status, emailId: row.id, error: row.error ?? undefined });
  return deliver(client, row, ctx, locale, requestKey, doc);
}
