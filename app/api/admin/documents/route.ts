import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { addDaysIso, blockHeading, KIND_DEF, localId, newContent, sanitizeContent, todayIso, DOC_KINDS, QUOTE_STATES, type DocContent, type DocKind } from '@/lib/documents/model';
import { bankChanges, docSettingsProblems, sanitizeDocSettings } from '@/lib/documents/settings';
import { mailReady, senderAddress } from '@/lib/documents/emailSend';
import { assess, buildSnapshot, contentOf, dbError, DOC_BUCKET, istanbulStamp, loadContext, recipientFromClient, selectedBanks, TEMPLATE_VERSION, type DocRow, type VersionRow, type VersionSnapshot } from '@/lib/documents/server';
import { renderDocumentPdf } from '@/lib/documents/pdf';

/**
 * Yoca — Teklifler ve Belgeler API (admin only; every query runs as the
 * signed-in admin, so RLS applies and the audit log names them).
 *
 * GET               → list (+ clients for the pickers, settings, issuer)
 * GET ?id=…         → one document + versions + events + what is missing
 * POST { action, … }
 *   create        { kind, clientId?, requestKey, locale?, currency? }
 *   duplicate     { id, requestKey }
 *   from_quote    { id, requestKey }            proforma from a finalized quote (quote unchanged)
 *   save          { id, expectedUpdatedAt, title, clientId, content }
 *   finalize      { id, expectedUpdatedAt, requestKey }   PDF first, then the version (one transaction)
 *   revise        { id, expectedUpdatedAt }
 *   archive       { id, archive: boolean }
 *   quote_state   { id, state: 'sent'|'accepted'|'rejected'|'expired'|null, note? }
 *   settings      { value }                      cockpit_settings "documents"
 * Nothing here sends e-mail, shares a document publicly or touches
 * Operasyon payments.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const unauthorized = () => json({ ok: false, error: 'unauthorized' }, 401);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const CLIENT_COLUMNS = 'id, name, legal_name, brand_name, party_type, roles, contact_name, email, phone, address, billing, archived_at';
const PROJECT_COLUMNS = 'id, client_id, name, status, archived_at';
type Sb = NonNullable<ReturnType<typeof getSupabaseAsUser>>;
/** Operations projects (optional link for a document). Missing table / no rights → empty list, never an error. */
async function projectsOf(client: Sb) {
  const r = await client.from('ops_projects').select(PROJECT_COLUMNS).order('name');
  return r.error ? [] : (r.data ?? []);
}

const EMAIL_COLUMNS = 'id, version, render_id, pdf_name, pdf_sha256, to_addrs, cc_addrs, subject, body, status, provider_id, error, last_event, sent_by, created_at, finished_at, status_checked_at';
/**
 * Sending history (v20) with the e-mail theme (v22). Before v22 the history is
 * read without the theme (every row was light) and the dark theme is offered as
 * not ready; without the table the panel says sending is not set up yet.
 */
async function emailsOf(client: Sb, documentId: string): Promise<{ error: unknown; data: unknown[] | null; themeReady: boolean }> {
  const r = await client.from('doc_emails').select(`${EMAIL_COLUMNS}, theme`).eq('document_id', documentId).order('created_at', { ascending: false });
  if (!r.error) return { error: null, data: r.data, themeReady: true };
  if (r.error.code !== '42703' && r.error.code !== 'PGRST204') return { error: r.error, data: null, themeReady: false };
  const old = await client.from('doc_emails').select(EMAIL_COLUMNS).eq('document_id', documentId).order('created_at', { ascending: false });
  return { error: old.error, data: (old.data ?? []).map((row) => ({ ...row, theme: 'light' })), themeReady: false };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return json({ ok: false, error: 'Supabase yapılandırılmamış.' }, 503);
  const id = request.nextUrl.searchParams.get('id');
  const ctx = await loadContext(client);
  if (!id) {
    const [docs, clients, projects] = await Promise.all([
      client.from('doc_documents').select('*').order('created_at', { ascending: false }).limit(1000),
      client.from('clients').select(CLIENT_COLUMNS).order('name'),
      projectsOf(client),
    ]);
    if (docs.error) { const e = dbError(docs.error); return json({ ok: false, error: e.error }, e.status); }
    // List rows without the full content (only what the list shows).
    const documents = ((docs.data ?? []) as DocRow[]).map(({ content, ...row }) => {
      const c = (content && typeof content === 'object' ? content : {}) as { issueDate?: string; validUntil?: string; recipient?: { company?: string; name?: string } };
      return { ...row, issue_date: c.issueDate ?? null, valid_until: c.validUntil ?? null, recipient_company: c.recipient?.company ?? '', recipient_name: c.recipient?.name ?? '' };
    });
    return json({ ok: true, documents, clients: clients.data ?? [], projects, settings: ctx.settings, issuer: ctx.issuer, companyRevision: ctx.revision });
  }
  if (!isUuid(id)) return json({ ok: false, error: 'bad id' }, 400);
  const [doc, versions, events, clients, renders, projects, emails] = await Promise.all([
    client.from('doc_documents').select('*').eq('id', id).maybeSingle(),
    client.from('doc_versions').select('id, document_id, version, number, title, total, currency, pdf_path, pdf_bytes, pdf_pages, pdf_sha256, finalized_by, finalized_at, snapshot').eq('document_id', id).order('version', { ascending: false }),
    client.from('doc_events').select('id, kind, detail, actor, at').eq('document_id', id).order('at', { ascending: false }).limit(100),
    client.from('clients').select(CLIENT_COLUMNS).order('name'),
    client.from('doc_renders').select('id, version, company_revision, template_version, reason, issuer, pdf_pages, pdf_bytes, generated_by, generated_at').eq('document_id', id).order('generated_at', { ascending: false }),
    projectsOf(client),
    emailsOf(client, id),
  ]);
  if (doc.error) { const e = dbError(doc.error); return json({ ok: false, error: e.error }, e.status); }
  if (!doc.data) return json({ ok: false, error: 'Belge bulunamadı.' }, 404);
  const row = doc.data as DocRow;
  const content = contentOf(row);
  const [source, derived] = await Promise.all([
    row.source_id ? client.from('doc_documents').select('id, number, title, kind').eq('id', row.source_id).maybeSingle() : Promise.resolve({ data: null }),
    client.from('doc_documents').select('id, number, title, kind, status').eq('source_id', row.id),
  ]);
  return json({
    ok: true,
    document: { ...row, content },
    // Versions with the frozen content (for the read-only summary) and the bank check.
    versions: ((versions.data ?? []) as Array<VersionRow & { snapshot: VersionSnapshot }>).map(({ snapshot, ...v }) => ({
      ...v,
      content: sanitizeContent(snapshot?.content, row.kind),
      bankAccounts: snapshot?.bankAccounts ?? [],
      sourceNumber: snapshot?.source_number ?? null,
      bankChanges: bankChanges(snapshot?.bankAccounts ?? [], ctx.settings.bankAccounts),
    })),
    events: events.data ?? [],
    clients: clients.data ?? [],
    projects,
    emails: emails.error ? [] : emails.data ?? [],
    mail: { tableReady: !emails.error, themeReady: !emails.error && emails.themeReady, serviceReady: mailReady(), from: senderAddress() },
    source: source.data ?? null,
    derived: derived.data ?? [],
    settings: ctx.settings,
    issuer: ctx.issuer,
    company: ctx.company,
    companyRevision: ctx.revision,
    templateVersion: TEMPLATE_VERSION,
    // bigint columns may arrive as text depending on the driver: always numbers here.
    renders: ((renders.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...r, company_revision: Number(r.company_revision), version: Number(r.version) })),
    assessment: assess(row.kind, content, ctx.issuer, row.title, ctx.settings),
  });
}

type Body = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  const token = bearerToken(request);
  const client = getSupabaseAsUser(token);
  if (!client) return json({ ok: false, error: 'Supabase yapılandırılmamış.' }, 503);
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action ?? '');

  // ── settings ──────────────────────────────────────────────────
  if (action === 'settings') {
    const value = sanitizeDocSettings(body.value);
    const problems = docSettingsProblems(value);
    if (problems.length) return json({ ok: false, error: problems.join(' '), problems }, 422);
    const { error } = await client.from('cockpit_settings').upsert({ key: 'documents', value, updated_at: new Date().toISOString() });
    if (error) { const e = dbError(error); return json({ ok: false, error: e.error }, e.status); }
    return json({ ok: true, settings: value });
  }

  const ctx = await loadContext(client);

  // ── create ────────────────────────────────────────────────────
  if (action === 'create') {
    const kind = String(body.kind) as DocKind;
    if (!(DOC_KINDS as readonly string[]).includes(kind)) return json({ ok: false, error: 'Geçersiz belge türü.' }, 400);
    if (!isUuid(body.requestKey)) return json({ ok: false, error: 'İstek anahtarı eksik.' }, 400);
    const s = ctx.settings;
    const content = newContent(kind, {
      locale: body.locale === 'en' ? 'en' : body.locale === 'tr' ? 'tr' : s.defaultLocale,
      currency: s.defaultCurrency, validityDays: s.validityDays, defaultTaxRate: s.defaultTaxRate,
      signatory: { name: s.signatoryName, title: s.signatoryTitle },
    });
    let clientId: string | null = null;
    if (body.clientId) {
      if (!isUuid(body.clientId)) return json({ ok: false, error: 'Geçersiz müşteri.' }, 400);
      const c = await client.from('clients').select(CLIENT_COLUMNS).eq('id', body.clientId).maybeSingle();
      if (!c.data) return json({ ok: false, error: 'Müşteri bulunamadı.' }, 404);
      if ((c.data as { archived_at: string | null }).archived_at) return json({ ok: false, error: 'Arşivlenmiş müşteri için yeni belge açılamaz.' }, 409);
      clientId = body.clientId as string;
      content.recipient = recipientFromClient(c.data as Record<string, unknown>);
    } else if (body.recipient && typeof body.recipient === 'object') {
      // Not linked to a client: the recipient typed in the "Yeni belge" dialog.
      const rc = body.recipient as Record<string, unknown>;
      const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      content.recipient = { ...content.recipient, company: t(rc.company, 200), name: t(rc.name, 200) };
    }
    // Optional operations project: its id and name are copied into the document.
    if (body.projectId) {
      if (!isUuid(body.projectId)) return json({ ok: false, error: 'Geçersiz proje.' }, 400);
      const pr = await client.from('ops_projects').select(PROJECT_COLUMNS).eq('id', body.projectId).maybeSingle();
      if (!pr.data) return json({ ok: false, error: 'Proje bulunamadı.' }, 404);
      const pd = pr.data as { id: string; client_id: string | null; name: string };
      if (clientId && pd.client_id && pd.client_id !== clientId) return json({ ok: false, error: 'Seçilen proje bu müşteriye ait değil.' }, 409);
      content.projectId = pd.id;
      content.projectName = pd.name;
    }
    const r = await client.rpc('doc_create', {
      p_kind: kind, p_title: '', p_client_id: clientId, p_source_id: null, p_locale: content.locale, p_currency: content.currency,
      p_content: content, p_total: null, p_request_key: body.requestKey, p_event: 'created',
    });
    if (r.error) { const e = dbError(r.error); return json({ ok: false, error: e.error }, e.status); }
    return json({ ok: true, ...(r.data as object) });
  }

  // Everything below works on one existing document.
  if (!isUuid(body.id)) return json({ ok: false, error: 'bad id' }, 400);
  const got = await client.from('doc_documents').select('*').eq('id', body.id).maybeSingle();
  if (got.error) { const e = dbError(got.error); return json({ ok: false, error: e.error }, e.status); }
  if (!got.data) return json({ ok: false, error: 'Belge bulunamadı.' }, 404);
  const row = got.data as DocRow;

  // ── duplicate / proforma from quote ───────────────────────────
  if (action === 'duplicate' || action === 'from_quote') {
    if (!isUuid(body.requestKey)) return json({ ok: false, error: 'İstek anahtarı eksik.' }, 400);
    let content: DocContent;
    let kind: DocKind = row.kind;
    let title = row.title;
    if (action === 'from_quote') {
      if (row.kind !== 'quote') return json({ ok: false, error: 'Proforma yalnızca bir tekliften oluşturulur.' }, 409);
      if (row.final_version < 1) return json({ ok: false, error: 'Önce teklifi kesinleştirin; proforma kesinleşmiş teklif sürümünden oluşturulur.' }, 409);
      const v = await client.from('doc_versions').select('snapshot, version').eq('document_id', row.id).eq('version', row.final_version).maybeSingle();
      if (!v.data) return json({ ok: false, error: 'Teklifin kesinleşmiş sürümü okunamadı.' }, 500);
      const snap = (v.data as { snapshot: { content: unknown } }).snapshot;
      const q = sanitizeContent(snap.content, 'quote');
      kind = 'proforma';
      const base = newContent('proforma', { locale: q.locale, currency: q.currency, validityDays: ctx.settings.validityDays, defaultTaxRate: ctx.settings.defaultTaxRate });
      content = {
        ...base,
        recipient: q.recipient, currency: q.currency, items: q.items.map((i) => ({ ...i, id: localId('i') })), payment: q.payment.map((p) => ({ ...p, id: localId('p') })),
        deliveryTime: q.deliveryTime, bankAccountIds: q.bankAccountIds, projectName: q.projectName, projectId: q.projectId, reference: q.reference,
        signatory: q.signatory,
        blocks: [{ id: localId('b'), key: 'notes', heading: blockHeading('notes', q.locale), body: q.locale === 'tr'
          ? `Bu proforma, ${row.number} numaralı teklifin ${(v.data as { version: number }).version}. sürümüne dayanır.${ctx.settings.proformaNote ? `\n\n${ctx.settings.proformaNote}` : ''}`
          : `This proforma is based on version ${(v.data as { version: number }).version} of quotation ${row.number}.${ctx.settings.proformaNote ? `\n\n${ctx.settings.proformaNote}` : ''}` }],
      };
      title = row.title ? `Proforma — ${row.title}` : 'Proforma';
    } else {
      content = contentOf(row);
      const today = todayIso();
      content.issueDate = today;
      if (KIND_DEF[row.kind].validity) content.validUntil = addDaysIso(today, ctx.settings.validityDays);
      content.items = content.items.map((i) => ({ ...i, id: localId('i') }));
      content.blocks = content.blocks.map((b) => ({ ...b, id: localId('b') }));
      title = row.title ? `${row.title} (kopya)` : '';
    }
    const { total } = assess(kind, content, ctx.issuer, title);
    const r = await client.rpc('doc_create', {
      p_kind: kind, p_title: title, p_client_id: row.client_id, p_source_id: row.id, p_locale: content.locale, p_currency: content.currency,
      p_content: content, p_total: total, p_request_key: body.requestKey, p_event: action === 'from_quote' ? 'from_quote' : 'duplicated',
    });
    if (r.error) { const e = dbError(r.error); return json({ ok: false, error: e.error }, e.status); }
    return json({ ok: true, ...(r.data as object) });
  }

  // ── save (draft only, optimistic concurrency) ─────────────────
  if (action === 'save') {
    if (row.status !== 'draft') return json({ ok: false, error: row.status === 'final' ? 'Kesinleşmiş belge düzenlenemez; önce “Revize et”.' : 'Arşivlenmiş belge düzenlenemez.' }, 409);
    if (body.expectedUpdatedAt !== row.updated_at) return json({ ok: false, error: 'Belge siz düzenlerken başka bir oturumda değişti. Sayfayı yenileyip son hâli üzerinden devam edin.', conflict: true }, 409);
    const content = sanitizeContent(body.content, row.kind);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : row.title;
    let clientId: string | null = row.client_id;
    if (body.clientId === null || body.clientId === '') clientId = null;
    else if (body.clientId !== undefined) {
      if (!isUuid(body.clientId)) return json({ ok: false, error: 'Geçersiz müşteri.' }, 400);
      clientId = body.clientId;
    }
    const { total, missing } = assess(row.kind, content, ctx.issuer, title);
    const upd = await client.from('doc_documents')
      .update({ content, title, client_id: clientId, locale: content.locale, currency: content.currency, total })
      .eq('id', row.id).eq('updated_at', row.updated_at).eq('status', 'draft')
      .select('updated_at').maybeSingle();
    if (upd.error) { const e = dbError(upd.error); return json({ ok: false, error: e.error }, e.status); }
    if (!upd.data) return json({ ok: false, error: 'Belge siz düzenlerken başka bir oturumda değişti. Sayfayı yenileyip son hâli üzerinden devam edin.', conflict: true }, 409);
    return json({ ok: true, updated_at: (upd.data as { updated_at: string }).updated_at, total, assessment: { missing, total } });
  }

  // ── finalize ──────────────────────────────────────────────────
  if (action === 'finalize') {
    if (!isUuid(body.requestKey)) return json({ ok: false, error: 'İstek anahtarı eksik.' }, 400);
    const replay = await client.from('doc_versions').select('version').eq('request_key', body.requestKey).maybeSingle();
    if (replay.data) return json({ ok: true, version: (replay.data as { version: number }).version, replay: true });
    if (row.status !== 'draft') return json({ ok: false, error: 'Belge taslak değil; kesinleştirilecek değişiklik yok.' }, 409);
    if (body.expectedUpdatedAt !== row.updated_at) return json({ ok: false, error: 'Kaydedilmemiş ya da başka bir oturumda değişmiş belge kesinleştirilemez. Önce kaydedin.', conflict: true }, 409);
    const content = contentOf(row);
    const { missing, total } = assess(row.kind, content, ctx.issuer, row.title, ctx.settings);
    if (missing.blocking.length) return json({ ok: false, error: 'Belge kesinleştirilemedi: eksik bilgi var.', missing }, 422);
    if (!ctx.revision) return json({ ok: false, error: 'Şirket profili revizyonları yok: supabase/upgrade-v19-documents.sql çalıştırılmalı.' }, 503);
    let sourceNumber: string | null = null;
    if (row.source_id) {
      const src = await client.from('doc_documents').select('number').eq('id', row.source_id).maybeSingle();
      sourceNumber = (src.data as { number: string } | null)?.number ?? null;
    }
    const version = row.final_version + 1;
    const snapshot = buildSnapshot(row, content, ctx, sourceNumber);
    let pdf: { buffer: Buffer; pages: number };
    try {
      pdf = await renderDocumentPdf({ kind: row.kind, number: row.number, title: row.title, content, issuer: ctx.issuer, bankAccounts: selectedBanks(content, ctx.settings, row.kind), mode: 'final', version, versionAt: istanbulStamp(new Date(), content.locale), sourceNumber });
    } catch (error) {
      return json({ ok: false, error: `PDF üretilemedi; belge taslak olarak kaldı. (${(error as Error).message.slice(0, 160)})` }, 500);
    }
    const path = `${row.id}/v${version}-${body.requestKey}.pdf`;
    const up = await client.storage.from(DOC_BUCKET).upload(path, pdf.buffer, { contentType: 'application/pdf', upsert: false });
    if (up.error) {
      // Same request key already uploading (double click that reached the server twice): wait for that one.
      if (/exists|duplicate|409/i.test(up.error.message)) {
        for (let i = 0; i < 20; i += 1) {
          await new Promise((r) => setTimeout(r, 500));
          const again = await client.from('doc_versions').select('version').eq('request_key', body.requestKey).maybeSingle();
          if (again.data) return json({ ok: true, version: (again.data as { version: number }).version, replay: true });
        }
      }
      return json({ ok: false, error: `PDF depoya kaydedilemedi; belge taslak olarak kaldı. (${up.error.message})` }, 502);
    }
    const sha = createHash('sha256').update(pdf.buffer).digest('hex');
    const fin = await client.rpc('doc_finalize', {
      p_id: row.id, p_expected_updated_at: row.updated_at, p_snapshot: snapshot, p_total: total,
      p_pdf_path: path, p_pdf_sha256: sha, p_pdf_bytes: pdf.buffer.length, p_pdf_pages: pdf.pages, p_request_key: body.requestKey,
      p_company_revision: ctx.revision, p_template_version: TEMPLATE_VERSION,
    });
    if (fin.error) {
      // The version was not created: remove the file that was just stored (admins cannot delete stored PDFs themselves).
      await getSupabaseServiceRole()?.storage.from(DOC_BUCKET).remove([path]).catch(() => undefined);
      const e = dbError(fin.error);
      return json({ ok: false, error: e.error }, e.status);
    }
    return json({ ok: true, ...(fin.data as object), pages: pdf.pages });
  }

  if (action === 'revise') {
    const r = await client.rpc('doc_revise', { p_id: row.id, p_expected_updated_at: body.expectedUpdatedAt ?? row.updated_at });
    if (r.error) { const e = dbError(r.error); return json({ ok: false, error: e.error }, e.status); }
    return json({ ok: true, ...(r.data as object) });
  }

  if (action === 'archive') {
    const r = await client.rpc('doc_archive', { p_id: row.id, p_archive: body.archive !== false });
    if (r.error) { const e = dbError(r.error); return json({ ok: false, error: e.error }, e.status); }
    return json({ ok: true, ...(r.data as object) });
  }

  if (action === 'quote_state') {
    const state = body.state === null || body.state === '' ? null : String(body.state);
    if (state !== null && !(QUOTE_STATES as readonly string[]).includes(state)) return json({ ok: false, error: 'Geçersiz durum.' }, 400);
    const r = await client.rpc('doc_quote_state', { p_id: row.id, p_state: state, p_note: typeof body.note === 'string' ? body.note.slice(0, 500) : null });
    if (r.error) { const e = dbError(r.error); return json({ ok: false, error: e.error }, e.status); }
    return json({ ok: true, ...(r.data as object) });
  }

  return json({ ok: false, error: 'unknown action' }, 400);
}

