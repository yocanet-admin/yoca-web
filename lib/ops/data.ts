'use client';

import { getAdminClient } from '@/lib/adminClient';
import type { Payment, PeriodRow, Service } from '@/lib/ops/model';

/**
 * Yoca Operasyon — browser data layer (admin session; every table is
 * admin-only through RLS + is_admin(); changes land in the audit log with
 * the admin as actor). Nothing here deletes finance history: payments are
 * voided, services/projects/providers are archived.
 */

export interface Party {
  id: string;
  name: string;
  party_type: 'company' | 'individual';
  roles: string[];
  status: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  note: string;
  brand_name: string | null;
  legal_name: string | null;
  address: string | null;
  billing: Record<string, string>;
  preferred_channel: string | null;
  owner_email: string | null;
  tags: string[];
  support_contact: string | null;
  panel_url: string | null;
  archived_at: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact { id: string; client_id: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean; note: string | null }
export interface Project { id: string; client_id: string | null; name: string; work_slug: string | null; status: 'active' | 'paused' | 'done'; start_on: string | null; delivered_on: string | null; links: Array<{ label: string; url: string }>; note: string | null; archived_at: string | null; created_at: string }
export interface ProviderAccount { id: string; provider_id: string; label: string; account_ref: string | null; login_hint: string | null; panel_url: string | null; secret_ref: string | null; note: string | null; archived_at: string | null }
export interface ServiceLink { id: string; service_id: string; client_id: string | null; project_id: string | null }
export interface ServiceRelation { id: string; service_id: string; related_id: string; note: string | null }
export interface DocumentRow { id: string; entity: string; entity_id: string; name: string; path: string; mime: string | null; size_bytes: number | null; note: string | null; uploaded_by: string | null; archived_at: string | null; created_at: string }
export interface WorkLog { id: string; service_id: string | null; project_id: string | null; worked_on: string; minutes: number; note: string | null; created_by: string | null; created_at: string }
export interface Task { id: string; project_id: string | null; service_id: string | null; kind: 'delivery' | 'handover' | 'task'; title: string; status: 'todo' | 'doing' | 'done' | 'skipped'; owner_email: string | null; due_on: string | null; done_at: string | null; sort: number; note: string | null }
export interface LicenseLink { id: string; license_id: string; client_id: string | null; project_id: string | null; service_id: string | null; label: string | null; snapshot: Record<string, unknown> | null; last_synced_at: string | null; sync_error: string | null }
export interface NotificationRow { id: string; dedupe_key: string; service_id: string | null; kind: string; offset_days: number | null; target_date: string | null; audience: string; status: string; attempts: number; last_error: string | null; sent_at: string | null; created_at: string; recipients?: string[]; payload?: Record<string, unknown> | null }

export interface OpsData {
  ready: boolean;
  error?: string;
  parties: Party[];
  contacts: Contact[];
  projects: Project[];
  accounts: ProviderAccount[];
  services: Service[];
  links: ServiceLink[];
  relations: ServiceRelation[];
  periods: PeriodRow[];
  payments: Payment[];
  licenses: LicenseLink[];
}

const EMPTY: OpsData = { ready: false, parties: [], contacts: [], projects: [], accounts: [], services: [], links: [], relations: [], periods: [], payments: [], licenses: [] };

export function db() {
  const supabase = getAdminClient();
  if (!supabase) throw new Error('Yönetim oturumu yok.');
  return supabase;
}

export async function currentEmail(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.email ?? null;
}

/** Everything the Operasyon screens need (small data; one round trip per table). */
export async function loadOps(): Promise<OpsData> {
  const supabase = getAdminClient();
  if (!supabase) return { ...EMPTY, error: 'Yönetim oturumu yok.' };
  const [parties, contacts, projects, accounts, services, links, relations, periods, payments, licenses] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('client_contacts').select('*').order('name'),
    supabase.from('ops_projects').select('*').order('name'),
    supabase.from('ops_provider_accounts').select('*').order('label'),
    supabase.from('ops_services').select('*').order('name'),
    supabase.from('ops_service_links').select('*'),
    supabase.from('ops_service_relations').select('*'),
    supabase.from('ops_periods').select('*').order('starts_on', { ascending: false }),
    supabase.from('ops_payments').select('*').order('paid_on', { ascending: false }),
    supabase.from('ops_license_links').select('*'),
  ]);
  const err = [services, periods, payments, projects].find((r) => r.error)?.error;
  if (err) return { ...EMPTY, error: /relation|does not exist|schema cache/i.test(err.message) ? 'Operasyon tabloları yok: supabase/upgrade-v18-operations.sql çalıştırılmalı.' : err.message };
  return {
    ready: true,
    parties: ((parties.data ?? []) as Party[]).map((p) => ({ ...p, roles: p.roles ?? ['customer'], tags: p.tags ?? [], billing: p.billing ?? {} })),
    contacts: (contacts.data ?? []) as Contact[],
    projects: (projects.data ?? []) as Project[],
    accounts: (accounts.data ?? []) as ProviderAccount[],
    services: (services.data ?? []) as Service[],
    links: (links.data ?? []) as ServiceLink[],
    relations: (relations.data ?? []) as ServiceRelation[],
    periods: (periods.data ?? []) as PeriodRow[],
    payments: (payments.data ?? []) as Payment[],
    licenses: (licenses.data ?? []) as LicenseLink[],
  };
}

/** Insert (no id) or update (id) one row; returns the stored row or an error message. */
export async function saveRow<T extends { id?: string } & Record<string, unknown>>(table: string, row: T): Promise<{ row?: T & { id: string }; error?: string }> {
  const { id, ...rest } = row as Record<string, unknown> & { id?: string };
  const q = id ? db().from(table).update(rest).eq('id', id).select().single() : db().from(table).insert(rest).select().single();
  const { data, error } = await q;
  if (error) return { error: friendly(error.message) };
  return { row: data as T & { id: string } };
}

export async function archiveRow(table: string, id: string, archived: boolean): Promise<string | null> {
  const { error } = await db().from(table).update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
  return error ? friendly(error.message) : null;
}

/** Only for link/relation rows (not history): removes a connection, not the records it connects. */
export async function removeLink(table: 'ops_service_links' | 'ops_service_relations' | 'client_contacts' | 'ops_tasks' | 'ops_license_links', id: string): Promise<string | null> {
  const { error } = await db().from(table).delete().eq('id', id);
  return error ? friendly(error.message) : null;
}

export function friendly(message: string): string {
  if (/violates foreign key|restrict/i.test(message)) return 'Bu kayda bağlı geçmiş (dönem, ödeme veya bağlantı) var; silinemez. Arşivleyin.';
  if (/duplicate key|unique/i.test(message)) return 'Bu kayıt zaten var.';
  if (/row-level security|permission denied/i.test(message)) return 'Yetki yok (yönetici oturumu gerekli).';
  return message;
}

/** New service + its first open period (from the service's dates and amounts). */
export async function createService(payload: Partial<Service>, links: Array<{ client_id?: string; project_id?: string }>): Promise<{ id?: string; error?: string; warning?: string }> {
  const by = await currentEmail();
  const r = await saveRow('ops_services', { ...payload, created_by: by });
  if (!r.row) return { error: r.error };
  const id = r.row.id;
  const warnings: string[] = [];
  if (links.length) {
    const { error } = await db().from('ops_service_links').insert(links.map((l) => ({ service_id: id, client_id: l.client_id ?? null, project_id: l.project_id ?? null })));
    if (error) warnings.push(`Bağlantılar kaydedilemedi: ${friendly(error.message)}`);
  }
  if (payload.period !== 'once' || payload.end_on) {
    const { error } = await db().from('ops_periods').insert({
      service_id: id, starts_on: payload.start_on ?? null, ends_on: payload.end_on ?? null, due_on: payload.due_on ?? null,
      expected_cost: payload.cost_amount ?? null, cost_currency: payload.cost_currency ?? null,
      expected_price: payload.price_amount ?? null, price_currency: payload.price_currency ?? null, created_by: by,
    });
    if (error) warnings.push(`İlk dönem açılamadı: ${friendly(error.message)}`);
  }
  return { id, warning: warnings.join(' ') || undefined };
}

/** Renewal verified at the provider → ONE database transaction (ops_confirm_renewal). */
export async function confirmRenewal(periodId: string, input: { newEnd: string; actualCost: string | null; ref: string | null; note: string | null; nextDue: string | null; nextCustomerDue: string | null }): Promise<{ nextPeriodId?: string; error?: string }> {
  const { data, error } = await db().rpc('ops_confirm_renewal', {
    p_period: periodId, p_new_end: input.newEnd, p_actual_cost: input.actualCost, p_ref: input.ref, p_note: input.note, p_next_due: input.nextDue, p_next_customer_due: input.nextCustomerDue,
  });
  if (error) return { error: friendly(error.message) };
  return { nextPeriodId: data as string };
}

/**
 * A payment record with a request key: a double click or a retry after a
 * lost connection finds the same record instead of creating a second one.
 */
export async function addPayment(p: Omit<Payment, 'id' | 'created_at' | 'created_by' | 'voided_at' | 'void_reason'>, requestKey: string): Promise<{ id?: string; error?: string; existing?: boolean }> {
  const by = await currentEmail();
  const { data, error } = await db().from('ops_payments').insert({ ...p, request_key: requestKey, created_by: by }).select('id').single();
  if (!error) return { id: (data as { id: string }).id };
  if (/duplicate key|unique/i.test(error.message)) {
    const { data: found } = await db().from('ops_payments').select('id').eq('request_key', requestKey).maybeSingle();
    if (found) return { id: (found as { id: string }).id, existing: true };
  }
  return { error: friendly(error.message) };
}

export async function voidPayment(id: string, reason: string): Promise<string | null> {
  const { error } = await db().from('ops_payments').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id).is('voided_at', null);
  return error ? friendly(error.message) : null;
}

/* ── Documents (private bucket "ops-docs") ─────────────────────── */

export const DOC_MAX_BYTES = 20 * 1024 * 1024;
export const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'];

export async function uploadDocument(entity: string, entityId: string, file: File, note?: string): Promise<{ doc?: DocumentRow; error?: string }> {
  if (file.size > DOC_MAX_BYTES) return { error: 'Dosya 20 MB’tan büyük.' };
  if (!DOC_TYPES.includes(file.type)) return { error: `Bu dosya türü yüklenemez (${file.type || 'bilinmiyor'}). PDF, görsel, metin, CSV, Word, Excel veya ZIP.` };
  const safe = file.name.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${entity}/${entityId}/${crypto.randomUUID()}-${safe}`;
  const up = await db().storage.from('ops-docs').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: friendly(up.error.message) };
  const r = await saveRow<Partial<DocumentRow>>('ops_documents', { entity, entity_id: entityId, name: file.name, path, mime: file.type, size_bytes: file.size, note: note ?? null, uploaded_by: await currentEmail() });
  return r.row ? { doc: r.row as DocumentRow } : { error: r.error };
}

export async function listDocuments(entity: string, entityId: string): Promise<DocumentRow[]> {
  const { data } = await db().from('ops_documents').select('*').eq('entity', entity).eq('entity_id', entityId).order('created_at', { ascending: false });
  return (data ?? []) as DocumentRow[];
}

/** Short-lived link (5 min) for one private document. */
export async function documentUrl(path: string): Promise<string | null> {
  const { data } = await db().storage.from('ops-docs').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
