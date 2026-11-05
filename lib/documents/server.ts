import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COMPANY, sanitizeCompany, type CompanyInfo } from '@/lib/companyInfo';
import { computeDocument, minorToNumeric, totalsJson } from '@/lib/documents/calc';
import { KIND_DEF, missingFor, sanitizeContent, type DocContent, type DocKind, type Issuer, type MissingReport, type Recipient } from '@/lib/documents/model';
import { DEFAULT_DOC_SETTINGS, issuerFrom, sanitizeDocSettings, type BankAccount, type DocSettings } from '@/lib/documents/settings';

/**
 * Yoca — Teklifler ve Belgeler: server helpers (server only).
 * Every query runs with the signed-in admin's token (RLS + audit actor).
 */

export const DOC_BUCKET = 'yoca-docs';

export interface DocRow {
  id: string;
  kind: DocKind;
  number: string;
  title: string;
  status: 'draft' | 'final' | 'archived';
  client_id: string | null;
  source_id: string | null;
  locale: 'tr' | 'en';
  currency: string;
  content: unknown;
  total: string | null;
  final_version: number;
  final_total: string | null;
  final_at: string | null;
  quote_state: string | null;
  quote_state_at: string | null;
  quote_state_by: string | null;
  archived_at: string | null;
  archived_from: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  id: string;
  document_id: string;
  version: number;
  number: string;
  title: string;
  total: string | null;
  currency: string;
  pdf_path: string;
  pdf_bytes: number;
  pdf_pages: number;
  pdf_sha256: string;
  finalized_by: string | null;
  finalized_at: string;
  snapshot?: unknown;
}

/** Template version stored with every PDF render (bump when the PDF design changes). */
export const TEMPLATE_VERSION = 'belge-2026-11-g';

export interface DocContext {
  ready: boolean;
  /** Company profile revision these facts come from (0 = v19 not installed). */
  revision: number;
  company: CompanyInfo;
  settings: DocSettings;
  issuer: Issuer;
}

function contextFrom(companyRaw: unknown, docsRaw: unknown, revision: number, ready: boolean): DocContext {
  const company = sanitizeCompany((companyRaw ?? DEFAULT_COMPANY) as Partial<CompanyInfo>);
  const settings = sanitizeDocSettings(docsRaw ?? DEFAULT_DOC_SETTINGS);
  return { ready, revision, company, settings, issuer: issuerFrom(company) };
}

/**
 * The CURRENT company profile, read as ONE revision row (company_info +
 * documents together), so a PDF never mixes facts from two revisions.
 */
export async function loadContext(client: SupabaseClient): Promise<DocContext> {
  const rev = await client.from('doc_company_revisions').select('revision, profile').order('revision', { ascending: false }).limit(1).maybeSingle();
  if (!rev.error && rev.data) {
    const row = rev.data as { revision: number; profile: { company_info?: unknown; documents?: unknown } };
    return contextFrom(row.profile?.company_info, row.profile?.documents, Number(row.revision), true);
  }
  const { data, error } = await client.from('cockpit_settings').select('key, value').in('key', ['company_info', 'documents']);
  const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
  return contextFrom(rows.find((r) => r.key === 'company_info')?.value, rows.find((r) => r.key === 'documents')?.value, 0, !error);
}

/** Recipient copy from the client master record (the document keeps its own copy). */
export function recipientFromClient(c: Record<string, unknown>): Recipient {
  const billing = (c.billing && typeof c.billing === 'object' ? c.billing : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const company = s(c.legal_name) || (c.party_type === 'individual' ? '' : s(c.name));
  return {
    name: s(c.contact_name) || (c.party_type === 'individual' ? s(c.name) : ''),
    company,
    attention: '',
    // Keys used by Operasyon → Müşteri detayı (billing jsonb).
    address: s(billing.billing_address) || s(c.address),
    taxOffice: s(billing.tax_office),
    taxNumber: s(billing.tax_no),
    email: s(billing.billing_email) || s(c.email),
    phone: s(c.phone),
  };
}

export function contentOf(row: Pick<DocRow, 'content' | 'kind'>): DocContent {
  return sanitizeContent(row.content, row.kind);
}

/** Totals + what is missing, for the editor and for finalizing. */
export function assess(kind: DocKind, content: DocContent, issuer: Issuer, title: string, settings?: DocSettings): { missing: MissingReport; total: string | null } {
  const { totals, payment } = computeDocument(content);
  const def = KIND_DEF[kind];
  const missing = missingFor(kind, content, issuer, {
    title,
    missingPrices: def.items ? [...totals.missingPrices, ...totals.errors] : [],
    paymentProblem: def.payment ? payment.problem : null,
  });
  // A selected bank account that is no longer in the settings is never dropped
  // (or replaced) silently: the admin chooses again before finalizing.
  const gone = settings && def.bank ? content.bankAccountIds.filter((id) => !settings.bankAccounts.some((a) => a.id === id)) : [];
  if (gone.length) missing.blocking.push(`Seçili ${gone.length} banka hesabı Belge ayarlarında artık yok; banka bilgilerini yeniden seçin.`);
  return { missing, total: def.items && totals.grand !== null ? minorToNumeric(totals.grand) : null };
}

export function selectedBanks(content: DocContent, settings: DocSettings, kind: DocKind): BankAccount[] {
  if (!KIND_DEF[kind].bank) return [];
  return settings.bankAccounts.filter((a) => content.bankAccountIds.includes(a.id));
}

/** Everything frozen into a version (later setting / client changes never alter it). */
export function buildSnapshot(row: DocRow, content: DocContent, ctx: DocContext, sourceNumber: string | null) {
  return {
    schema: 1,
    number: row.number,
    kind: row.kind,
    title: row.title,
    client_id: row.client_id,
    source_number: sourceNumber,
    content,
    issuer: ctx.issuer,
    company_revision: ctx.revision,
    template_version: TEMPLATE_VERSION,
    bankAccounts: selectedBanks(content, ctx.settings, row.kind),
    totals: KIND_DEF[row.kind].items ? totalsJson(content) : null,
  };
}

export function istanbulStamp(d: Date, locale: 'tr' | 'en'): string {
  const t = new Date(d.getTime() + 3 * 3_600_000);
  const months = locale === 'tr'
    ? ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]} ${t.getUTCFullYear()} ${hh}:${mm}`;
}

export function safeFileName(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'belge';
}

/** Postgres error → Turkish message + HTTP status. */
export function dbError(error: { code?: string; message?: string } | null | undefined): { status: number; error: string } {
  const code = error?.code ?? '';
  const msg = error?.message ?? 'Bilinmeyen veritabanı hatası.';
  if (/relation .*doc_|does not exist|schema cache|Could not find the function/i.test(msg)) return { status: 503, error: 'Belge tabloları yok: supabase/upgrade-v19-documents.sql çalıştırılmalı.' };
  if (code === '42501' || /yetkisiz|permission denied/i.test(msg)) return { status: 403, error: msg.includes('doc_documents:') ? msg.replace(/^.*doc_documents:\s*/, '') : 'Bu işlem için yetkiniz yok.' };
  if (code === '40001' || /başka bir oturumda/.test(msg)) return { status: 409, error: 'Belge siz düzenlerken başka bir oturumda değişti. Sayfayı yenileyip son hâli üzerinden devam edin.' };
  if (code === '55000' || code === 'P0002' || code === '22023') return { status: code === 'P0002' ? 404 : 409, error: msg.replace(/^doc_\w+:\s*/, '') };
  return { status: 500, error: msg };
}

/* ── Stored PDFs of finalized versions ─────────────────────────── */

export interface VersionSnapshot {
  number: string;
  kind: DocKind;
  title: string;
  source_number: string | null;
  content: unknown;
  issuer: Issuer;
  bankAccounts: BankAccount[];
  company_revision?: number;
  template_version?: string;
}

/**
 * The normal download of a finalized version: the version's frozen content
 * (items, amounts, recipient, dates, bank details) with the CURRENT company
 * profile. Rendered once per (version, profile revision, template) and stored;
 * earlier renders are never replaced.
 */
export async function currentRenderOf(
  client: SupabaseClient,
  documentId: string,
  version: number,
  ctx: DocContext,
  service: SupabaseClient | null,
): Promise<{ ok: true; id: string; path: string; reused: boolean } | { ok: false; status: number; error: string }> {
  if (!ctx.revision) return { ok: false, status: 503, error: 'Şirket profili revizyonları yok: supabase/upgrade-v19-documents.sql çalıştırılmalı.' };
  const hit = await client.from('doc_renders').select('id, pdf_path').eq('document_id', documentId).eq('version', version).eq('company_revision', ctx.revision).eq('template_version', TEMPLATE_VERSION).maybeSingle();
  if (hit.data) { const h = hit.data as { id: string; pdf_path: string }; return { ok: true, id: h.id, path: h.pdf_path, reused: true }; }
  const v = await client.from('doc_versions').select('snapshot, finalized_at, version, kind').eq('document_id', documentId).eq('version', version).maybeSingle();
  if (v.error) { const e = dbError(v.error); return { ok: false, ...e }; }
  if (!v.data) return { ok: false, status: 404, error: 'Bu sürüm bulunamadı.' };
  const row = v.data as { snapshot: VersionSnapshot; finalized_at: string; version: number; kind: DocKind };
  const snap = row.snapshot;
  const content = sanitizeContent(snap.content, row.kind);
  const { renderDocumentPdf } = await import('@/lib/documents/pdf');
  let pdf: { buffer: Buffer; pages: number };
  try {
    pdf = await renderDocumentPdf({
      kind: row.kind, number: snap.number, title: snap.title, content, issuer: ctx.issuer, bankAccounts: snap.bankAccounts ?? [],
      mode: 'final', version: row.version, versionAt: istanbulStamp(new Date(row.finalized_at), content.locale), sourceNumber: snap.source_number,
    });
  } catch (error) {
    return { ok: false, status: 500, error: `PDF üretilemedi: ${(error as Error).message.slice(0, 160)}` };
  }
  const { createHash, randomUUID } = await import('node:crypto');
  const path = `${documentId}/v${version}-r${ctx.revision}-${TEMPLATE_VERSION}-${randomUUID().slice(0, 8)}.pdf`;
  const up = await client.storage.from(DOC_BUCKET).upload(path, pdf.buffer, { contentType: 'application/pdf', upsert: false });
  if (up.error) return { ok: false, status: 502, error: `PDF depoya kaydedilemedi (${up.error.message}).` };
  const r = await client.rpc('doc_add_render', {
    p_id: documentId, p_version: version, p_company_revision: ctx.revision, p_template_version: TEMPLATE_VERSION, p_issuer: ctx.issuer,
    p_pdf_path: path, p_pdf_sha256: createHash('sha256').update(pdf.buffer).digest('hex'), p_pdf_bytes: pdf.buffer.length, p_pdf_pages: pdf.pages,
  });
  if (r.error) {
    await service?.storage.from(DOC_BUCKET).remove([path]).catch(() => undefined);
    const e = dbError(r.error);
    return { ok: false, ...e };
  }
  const out = r.data as { id: string; pdf_path: string; replay: boolean };
  // Another request stored the same render first: keep that one, drop ours.
  if (out.replay && out.pdf_path !== path) await service?.storage.from(DOC_BUCKET).remove([path]).catch(() => undefined);
  return { ok: true, id: out.id, path: out.pdf_path, reused: out.replay };
}
