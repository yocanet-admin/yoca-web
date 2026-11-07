'use client';

/**
 * Yoca Giderler — data access from the panel (browser, signed-in session).
 *
 * Everything goes through Supabase with the user's own JWT: Row Level Security
 * (v25, can_finance()) decides what an admin or a finance user may read and
 * write, and the database guards set "who" (created_by / voided_by …) from the
 * session and refuse deleting or editing payment history. Nothing here sends a
 * message or moves money: it is a register.
 */

import { getAdminClient } from '@/lib/adminClient';
import { istanbulDay, addDays } from '@/lib/ops/model';
import type { Expense, FinParty, FinPayment, FinPeriod, OpsCostPeriod } from '@/lib/fin/model';

export interface FinData {
  ready: boolean;
  error?: string;
  expenses: Expense[];
  periods: FinPeriod[];
  payments: FinPayment[];
  opsPeriods: OpsCostPeriod[];
  opsPayments: FinPayment[];
  parties: FinParty[];
}

export interface FinDocument { id: string; entity: string; entity_id: string; name: string; path: string; mime: string | null; size_bytes: number | null; note: string | null; uploaded_by: string | null; archived_at: string | null; archived_by: string | null; created_at: string }

const EMPTY: FinData = { ready: false, expenses: [], periods: [], payments: [], opsPeriods: [], opsPayments: [], parties: [] };

function db() {
  const supabase = getAdminClient();
  if (!supabase) throw new Error('Oturum yok.');
  return supabase;
}

export function finFriendly(message: string): string {
  if (/row-level security|permission denied|Yetki yok/i.test(message)) return 'Yetki yok (finans veya yönetici oturumu gerekli).';
  if (/duplicate key|unique/i.test(message)) return 'Bu kayıt zaten var.';
  if (/violates foreign key|restrict/i.test(message)) return 'Bu kayda bağlı geçmiş var; silinemez.';
  return message.replace(/^.*?ERROR:\s*/, '');
}

/**
 * Loads the register. First makes sure the periods up to `horizon` days ahead
 * exist (idempotent; a period is never created twice and starts unpaid).
 */
export async function loadFinance(horizon = 45): Promise<FinData> {
  const supabase = getAdminClient();
  if (!supabase) return { ...EMPTY, error: 'Oturum yok.' };
  const roll = await supabase.rpc('fin_roll_periods', { p_until: addDays(istanbulDay(), horizon) });
  if (roll.error && /function|does not exist|schema cache/i.test(roll.error.message)) {
    return { ...EMPTY, error: 'Giderler tabloları yok: supabase/upgrade-v25-expenses.sql çalıştırılmalı.' };
  }
  const [expenses, periods, payments, opsPeriods, opsPayments, parties] = await Promise.all([
    supabase.from('fin_expenses').select('*').order('title'),
    supabase.from('fin_periods').select('*').order('due_on'),
    supabase.from('fin_payments').select('*').order('paid_on', { ascending: false }),
    supabase.from('fin_ops_periods').select('*').order('due_on'),
    supabase.from('fin_ops_payments').select('*').order('paid_on', { ascending: false }),
    supabase.from('fin_parties').select('id, name').order('name'),
  ]);
  const err = [expenses, periods, payments].find((r) => r.error)?.error ?? roll.error;
  if (err) return { ...EMPTY, error: finFriendly(err.message) };
  return {
    ready: true,
    expenses: (expenses.data ?? []) as Expense[],
    periods: (periods.data ?? []) as FinPeriod[],
    payments: (payments.data ?? []) as FinPayment[],
    // Operasyon part: empty (not an error) if the views are not reachable
    opsPeriods: (opsPeriods.data ?? []) as OpsCostPeriod[],
    opsPayments: ((opsPayments.data ?? []) as FinPayment[]).map((p) => ({ ...p, kind: p.kind ?? 'payment' })),
    parties: (parties.data ?? []) as FinParty[],
  };
}

export type ExpenseInput = Omit<Expense, 'id' | 'archived_at' | 'created_by' | 'created_at' | 'updated_at'>;

export async function createExpense(input: ExpenseInput): Promise<{ id?: string; error?: string }> {
  const { data, error } = await db().from('fin_expenses').insert(input).select('id').single();
  if (error) return { error: finFriendly(error.message) };
  return { id: (data as { id: string }).id };
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>): Promise<string | null> {
  const { error } = await db().from('fin_expenses').update(patch).eq('id', id);
  return error ? finFriendly(error.message) : null;
}

export async function archiveExpense(id: string, archived: boolean): Promise<string | null> {
  const { error } = await db().from('fin_expenses').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
  return error ? finFriendly(error.message) : null;
}

/** Amount / due date of a period without valid payments (the database refuses it otherwise). */
export async function updatePeriod(id: string, patch: { amount?: string | null; due_on?: string; note?: string | null }): Promise<string | null> {
  const { error } = await db().from('fin_periods').update(patch).eq('id', id);
  return error ? finFriendly(error.message) : null;
}

export async function cancelPeriod(id: string, reason: string): Promise<string | null> {
  const { error } = await db().from('fin_periods').update({ status: 'cancelled', cancel_reason: reason }).eq('id', id).eq('status', 'open');
  return error ? finFriendly(error.message) : null;
}

export interface PaymentInput { kind: 'payment' | 'refund' | 'adjustment'; amount: string; currency: string; paid_on: string; method: string | null; account: string | null; reference: string | null; note: string | null }

/**
 * One request key per form: a double click or a retry after a lost
 * connection finds the same record instead of creating a second one.
 */
export async function addPayment(periodId: string, p: PaymentInput, requestKey: string): Promise<{ id?: string; existing?: boolean; error?: string }> {
  const { data, error } = await db().from('fin_payments').insert({ ...p, period_id: periodId, request_key: requestKey }).select('id').single();
  if (!error) return { id: (data as { id: string }).id };
  if (/duplicate key|unique/i.test(error.message)) {
    const { data: found } = await db().from('fin_payments').select('id').eq('request_key', requestKey).maybeSingle();
    if (found) return { id: (found as { id: string }).id, existing: true };
  }
  return { error: finFriendly(error.message) };
}

export async function voidPayment(id: string, reason: string): Promise<string | null> {
  const { error } = await db().from('fin_payments').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id).is('voided_at', null);
  return error ? finFriendly(error.message) : null;
}

/** Operasyon provider payment: written to ops_payments (the same record the Operasyon screens show). */
export async function addOpsPayment(periodId: string, p: Pick<PaymentInput, 'kind' | 'amount' | 'currency' | 'paid_on' | 'method' | 'reference'>, requestKey: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await db().rpc('fin_ops_pay', {
    p_period: periodId, p_kind: p.kind, p_amount: p.amount, p_currency: p.currency, p_paid_on: p.paid_on, p_method: p.method, p_reference: p.reference, p_request_key: requestKey,
  });
  if (error) return { error: finFriendly(error.message) };
  return { id: data as string };
}

export async function voidOpsPayment(id: string, reason: string): Promise<string | null> {
  const { error } = await db().rpc('fin_ops_void', { p_payment: id, p_reason: reason });
  return error ? finFriendly(error.message) : null;
}

/* ── Documents (private bucket "fin-docs") ─────────────────────── */

export const FIN_DOC_MAX = 20 * 1024 * 1024;
export const FIN_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export type FinDocEntity = 'expense' | 'period' | 'payment' | 'ops_period' | 'ops_payment' | 'receivable' | 'collection' | 'ops_receivable' | 'ops_collection';

export async function uploadFinDocument(entity: FinDocEntity, entityId: string, file: File): Promise<{ doc?: FinDocument; error?: string }> {
  if (file.size > FIN_DOC_MAX) return { error: 'Dosya 20 MB’tan büyük.' };
  if (!FIN_DOC_TYPES.includes(file.type)) return { error: `Bu dosya türü yüklenemez (${file.type || 'bilinmiyor'}). PDF, görsel, metin, CSV, Word veya Excel.` };
  const safe = file.name.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'belge';
  const path = `${entity}/${entityId}/${crypto.randomUUID()}-${safe}`;
  const up = await db().storage.from('fin-docs').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: finFriendly(up.error.message) };
  const { data, error } = await db().from('fin_documents').insert({ entity, entity_id: entityId, name: file.name.slice(0, 200), path, mime: file.type, size_bytes: file.size }).select('*').single();
  if (error) return { error: finFriendly(error.message) };
  return { doc: data as FinDocument };
}

export async function listFinDocuments(pairs: Array<{ entity: string; id: string }>): Promise<FinDocument[]> {
  if (!pairs.length) return [];
  const ids = Array.from(new Set(pairs.map((p) => p.id)));
  const { data } = await db().from('fin_documents').select('*').in('entity_id', ids).order('created_at', { ascending: false });
  const want = new Set(pairs.map((p) => `${p.entity}:${p.id}`));
  return ((data ?? []) as FinDocument[]).filter((d) => want.has(`${d.entity}:${d.entity_id}`));
}

export async function archiveFinDocument(id: string, archived: boolean): Promise<string | null> {
  const { error } = await db().from('fin_documents').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
  return error ? finFriendly(error.message) : null;
}

/** Short-lived link (60 s) for one private file; only admin / finance can create it. */
export async function finDocumentUrl(path: string): Promise<string | null> {
  const { data } = await db().storage.from('fin-docs').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

/* ── History (fin_audit: Finans records + Operasyon customer / provider payments; not the general audit log) ── */

export interface FinAuditRow { id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null; label: string | null; changes: Record<string, { from: unknown; to: unknown }> | null }

/** History of the given records and of their files (not the general audit log). */
export async function loadFinHistory(ids: string[]): Promise<FinAuditRow[]> {
  const list = Array.from(new Set(ids.filter(Boolean)));
  if (!list.length) return [];
  const { data: docs } = await db().from('fin_documents').select('id').in('entity_id', list);
  const all = [...list, ...((docs ?? []) as Array<{ id: string }>).map((d) => d.id)];
  const { data, error } = await db().from('fin_audit').select('*').in('entity_id', all).order('at', { ascending: false }).limit(300);
  if (error) return [];
  return (data ?? []) as FinAuditRow[];
}

/* ── Excel import (server reads the file; apply = one database transaction) ── */

export interface ImportRowRecord { id: string; import_id: string; source_key: string; file_name: string; sheet: string; source_row: number; payload: Record<string, unknown>; plan: Record<string, unknown>; action: string; expense_id: string | null; period_id: string | null; payment_id: string | null; changed_payload: Record<string, unknown> | null; changed_at: string | null; resolved_at: string | null; resolved_by: string | null; resolution: string | null; created_by: string | null; created_at: string }

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

export async function importRequest<T>(action: 'preview' | 'apply', file: File, month?: string): Promise<{ ok: boolean; error?: string } & T> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Oturum yok.' } as { ok: boolean; error?: string } & T;
  const res = await fetch('/api/admin/fin/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, fileName: file.name, data: await fileBase64(file), month }) });
  const body = (await res.json().catch(() => ({ ok: false, error: `Sunucu hatası (${res.status})` }))) as { ok: boolean; error?: string } & T;
  return body;
}

export async function listImportRows(): Promise<ImportRowRecord[]> {
  const { data } = await db().from('fin_import_rows').select('*').order('source_row');
  return (data ?? []) as ImportRowRecord[];
}

export async function getImportRow(id: string): Promise<ImportRowRecord | null> {
  const { data } = await db().from('fin_import_rows').select('*').eq('id', id).maybeSingle();
  return (data as ImportRowRecord | null) ?? null;
}

export async function resolveImportRow(id: string, resolution: string, expenseId?: string): Promise<string | null> {
  const patch: Record<string, unknown> = { resolved_at: new Date().toISOString(), resolution };
  if (expenseId) patch.expense_id = expenseId;
  const { error } = await db().from('fin_import_rows').update(patch).eq('id', id);
  return error ? finFriendly(error.message) : null;
}

export async function importRowsOfExpense(expenseId: string): Promise<ImportRowRecord[]> {
  const { data } = await db().from('fin_import_rows').select('*').eq('expense_id', expenseId);
  return (data ?? []) as ImportRowRecord[];
}

export async function clearReview(periodId: string): Promise<string | null> {
  const { error } = await db().from('fin_periods').update({ review_note: null }).eq('id', periodId);
  return error ? finFriendly(error.message) : null;
}
