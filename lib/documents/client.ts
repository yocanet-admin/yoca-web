'use client';

import { getAdminClient } from '@/lib/adminClient';
import { adminApi, adminPost } from '@/lib/cockpit/client';
import type { DocContent, DocKind, DocStatus, Issuer, MissingReport, QuoteState } from '@/lib/documents/model';
import type { BankAccount, BankChange, DocSettings } from '@/lib/documents/settings';
import type { CompanyInfo } from '@/lib/companyInfo';
import { fmtMoney, parseMoney } from '@/lib/documents/calc';

/**
 * Yoca — Teklifler ve Belgeler: browser helpers. Every call goes through the
 * admin API with the signed-in session; nothing talks to OpenAI or storage
 * from the browser.
 */

export interface ClientLite {
  id: string; name: string; legal_name: string | null; brand_name: string | null; party_type: string; roles: string[] | null;
  contact_name: string; email: string; phone: string; address: string | null; billing: Record<string, string> | null; archived_at: string | null;
}

export interface ProjectLite { id: string; client_id: string | null; name: string; status: string; archived_at: string | null }

export interface EmailRow {
  id: string; version: number; render_id: string; pdf_name: string; pdf_sha256: string; to_addrs: string[]; cc_addrs: string[]; subject: string; body: string;
  status: 'sending' | 'accepted' | 'failed' | 'unknown' | 'delivered' | 'delayed' | 'bounced' | 'complained';
  provider_id: string | null; error: string | null; last_event: string | null; sent_by: string | null; created_at: string; finished_at: string | null; status_checked_at: string | null;
  /** e-mail body theme (v22); 'light' for every row sent before */
  theme: 'light' | 'dark';
}

export interface DocListRow {
  id: string; kind: DocKind; number: string; title: string; status: DocStatus; client_id: string | null; source_id: string | null;
  locale: 'tr' | 'en'; currency: string; total: string | null; final_version: number; final_total: string | null; final_at: string | null;
  quote_state: QuoteState | null; quote_state_at: string | null; quote_state_by: string | null; archived_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  issue_date: string | null; valid_until: string | null; recipient_company: string; recipient_name: string;
}

export interface DocFull extends Omit<DocListRow, 'issue_date' | 'valid_until' | 'recipient_company' | 'recipient_name'> { content: DocContent }

export interface VersionRow {
  id: string; version: number; number: string; title: string; total: string | null; currency: string; pdf_pages: number; pdf_bytes: number; finalized_by: string | null; finalized_at: string;
  /** Frozen content of this version, the bank accounts printed on it and how they differ from today's settings. */
  content: DocContent; bankAccounts: BankAccount[]; sourceNumber: string | null; bankChanges: BankChange[];
}
export interface RenderRow { id: string; version: number; company_revision: number; template_version: string; reason: 'finalized' | 'download'; issuer: Issuer; pdf_pages: number; pdf_bytes: number; generated_by: string | null; generated_at: string }
export interface EventRow { id: string; kind: string; detail: Record<string, unknown>; actor: string | null; at: string }

export interface DocDetail {
  ok: boolean; error?: string;
  document: DocFull; versions: VersionRow[]; renders: RenderRow[]; events: EventRow[]; clients: ClientLite[]; projects: ProjectLite[];
  emails: EmailRow[]; mail: { tableReady: boolean; themeReady: boolean; serviceReady: boolean; from: string };
  source: { id: string; number: string; title: string } | null; derived: Array<{ id: string; number: string; title: string; kind: DocKind; status: DocStatus }>;
  settings: DocSettings; issuer: Issuer; company: CompanyInfo; companyRevision: number; templateVersion: string;
  assessment: { missing: MissingReport; total: string | null };
}

export interface DocList { ok: boolean; error?: string; documents: DocListRow[]; clients: ClientLite[]; projects: ProjectLite[]; settings: DocSettings; issuer: Issuer; companyRevision: number }

export const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`);

export const loadList = () => adminApi<DocList>('/api/admin/documents');
export const loadDoc = (id: string) => adminApi<DocDetail>(`/api/admin/documents?id=${encodeURIComponent(id)}`);
export const docAction = <T = Record<string, unknown>>(body: Record<string, unknown>) => adminPost<{ ok: boolean; error?: string; missing?: MissingReport; conflict?: boolean } & T>('/api/admin/documents', body);
export const aiAction = <T = Record<string, unknown>>(body: Record<string, unknown>) => adminPost<{ ok: boolean; error?: string } & T>('/api/admin/documents/ai', body);

async function token(): Promise<string | null> {
  const { data } = (await getAdminClient()?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? null;
}

/** Draft PDF of the editor's CURRENT text with the CURRENT company profile (opened in a new tab or downloaded). */
export async function draftPdf(id: string, title: string, content: DocContent, download: boolean, number: string): Promise<string | null> {
  const t = await token();
  let res: Response;
  try {
    res = await fetch('/api/admin/documents/pdf', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ id, title, content }) });
  } catch (e) {
    return `Sunucuya ulaşılamadı: ${(e as Error).message}`;
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return j?.error ?? `PDF üretilemedi (HTTP ${res.status}).`;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url; a.download = `${number}-taslak.pdf`; document.body.appendChild(a); a.click(); a.remove();
  } else window.open(url, '_blank'); // our own blob URL (same origin), not an external link
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}

export type StoredPdfResult = null | { error: string } | { bankDecision: { version: number; changes: BankChange[] } };

/**
 * Normal download of a finalized version (current company profile) or a past
 * PDF exactly as produced. When the bank details printed on the version differ
 * from today's settings, nothing is downloaded until the admin decides
 * (`keepBank` = download with the version's bank details, stated in the panel).
 */
export async function storedPdf(q: { id: string; version?: number } | { render: string }, opts: { keepBank?: boolean; preview?: Window | null } = {}): Promise<StoredPdfResult> {
  const qs = 'render' in q
    ? `render=${encodeURIComponent(q.render)}`
    : `id=${encodeURIComponent(q.id)}${q.version ? `&version=${q.version}` : ''}${opts.keepBank ? '&bank=keep' : ''}${opts.preview ? '&inline=1' : ''}`;
  const r = await adminApi<{ ok: boolean; url?: string; error?: string; needsBankDecision?: boolean; version?: number; bankChanges?: BankChange[] }>(`/api/admin/documents/pdf?${qs}`);
  if (r.ok && r.needsBankDecision && r.bankChanges) { opts.preview?.close(); return { bankDecision: { version: r.version ?? 0, changes: r.bankChanges } }; }
  if (!r.ok || !r.url) { opts.preview?.close(); return { error: r.error ?? 'İndirme bağlantısı oluşturulamadı.' }; }
  // Preview: the tab was opened on the click (so it is not blocked) and now gets the signed link.
  if (opts.preview) opts.preview.location.href = r.url;
  else window.location.assign(r.url);
  return null;
}

export function clientDisplay(c: ClientLite): string {
  return c.legal_name || c.brand_name || c.name;
}

/** numeric(14,2) text from the database → "₺1.234,56"; null when unknown. */
export function moneyOf(value: string | null, currency: string): string | null {
  if (value === null || value === undefined) return null;
  const m = parseMoney(String(value));
  return m === null || m === undefined ? null : fmtMoney(m, currency, 'tr');
}

/** POST to a PDF route; the PDF as a Blob, or a Turkish error. */
export async function fetchPdf(path: string, body: unknown): Promise<{ blob: Blob } | { error: string }> {
  const t = await token();
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body) });
  } catch (e) {
    return { error: `Sunucuya ulaşılamadı: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: j?.error ?? `PDF üretilemedi (HTTP ${res.status}).` };
  }
  return { blob: await res.blob() };
}

/** Save a Blob (PDF, HTML) under a file name. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Copy formatted HTML (with a plain-text fallback) to the clipboard. */
export async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
