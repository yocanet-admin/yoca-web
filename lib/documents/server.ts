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

export interface DocContext {
  ready: boolean;
  company: CompanyInfo;
  settings: DocSettings;
  issuer: Issuer;
}

export async function loadContext(client: SupabaseClient): Promise<DocContext> {
  const { data, error } = await client.from('cockpit_settings').select('key, value').in('key', ['company_info', 'documents']);
  const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
  const company = sanitizeCompany((rows.find((r) => r.key === 'company_info')?.value ?? DEFAULT_COMPANY) as Partial<CompanyInfo>);
  const settings = sanitizeDocSettings(rows.find((r) => r.key === 'documents')?.value ?? DEFAULT_DOC_SETTINGS);
  return { ready: !error, company, settings, issuer: issuerFrom(company, settings) };
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
export function assess(kind: DocKind, content: DocContent, issuer: Issuer, title: string): { missing: MissingReport; total: string | null } {
  const { totals, payment } = computeDocument(content);
  const def = KIND_DEF[kind];
  const missing = missingFor(kind, content, issuer, {
    title,
    missingPrices: def.items ? [...totals.missingPrices, ...totals.errors] : [],
    paymentProblem: def.payment ? payment.problem : null,
  });
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
