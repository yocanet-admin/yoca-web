'use client';

/**
 * Yoca Finans — Gelirler data access from the panel (signed-in session).
 * Row Level Security (v26, can_finance()) decides what an admin or a finance
 * user may read and write; the database guards set "who" and refuse deleting
 * or editing collection history. Operasyon customer collections are written
 * only through fin_ops_collect / fin_ops_collect_void (the same ops_payments
 * row Operasyon uses — no copy). Nothing here moves money or sends messages.
 */

import { getAdminClient } from '@/lib/adminClient';
import { finFriendly, type PaymentInput } from '@/lib/fin/data';
import type { Collection, FinClient, OpsReceivable, Receivable } from '@/lib/fin/income';

export interface IncomeData {
  ready: boolean;
  error?: string;
  receivables: Receivable[];
  collections: Collection[];
  opsReceivables: OpsReceivable[];
  opsCollections: Collection[];
  clients: FinClient[];
}

const EMPTY: IncomeData = { ready: false, receivables: [], collections: [], opsReceivables: [], opsCollections: [], clients: [] };

function db() {
  const supabase = getAdminClient();
  if (!supabase) throw new Error('Oturum yok.');
  return supabase;
}

export async function loadIncome(): Promise<IncomeData> {
  const supabase = getAdminClient();
  if (!supabase) return { ...EMPTY, error: 'Oturum yok.' };
  const [receivables, collections, opsReceivables, opsCollections, clients] = await Promise.all([
    supabase.from('fin_receivables').select('*').order('period_month'),
    supabase.from('fin_collections').select('*').order('paid_on', { ascending: false }),
    supabase.from('fin_ops_receivables').select('*').order('due_on'),
    supabase.from('fin_ops_collections').select('*').order('paid_on', { ascending: false }),
    supabase.from('fin_clients').select('id, name').order('name'),
  ]);
  const missing = [receivables, collections].find((r) => r.error && /does not exist|schema cache/i.test(r.error.message));
  if (missing) return { ...EMPTY, error: 'Gelirler tabloları yok: supabase/upgrade-v26-income.sql çalıştırılmalı.' };
  const err = [receivables, collections].find((r) => r.error)?.error;
  if (err) return { ...EMPTY, error: finFriendly(err.message) };
  const asCollection = (rows: Array<Record<string, unknown>>, key: string) => rows.map((r) => ({ ...r, period_id: r[key] as string, kind: (r.kind as Collection['kind']) ?? 'payment' }) as Collection);
  return {
    ready: true,
    receivables: (receivables.data ?? []) as Receivable[],
    collections: asCollection((collections.data ?? []) as Array<Record<string, unknown>>, 'receivable_id'),
    // Operasyon part: empty (not an error) if the views are not reachable
    opsReceivables: (opsReceivables.data ?? []) as OpsReceivable[],
    opsCollections: asCollection((opsCollections.data ?? []) as Array<Record<string, unknown>>, 'period_id'),
    clients: (clients.data ?? []) as FinClient[],
  };
}

export type ReceivableInput = Pick<Receivable, 'title' | 'category' | 'client_id' | 'payer_name' | 'period_month' | 'due_on' | 'amount' | 'currency' | 'owner_email' | 'pay_account' | 'pay_method' | 'note'>;

export async function createReceivable(input: ReceivableInput): Promise<{ id?: string; error?: string }> {
  const { data, error } = await db().from('fin_receivables').insert(input).select('id').single();
  if (error) return { error: finFriendly(error.message) };
  return { id: (data as { id: string }).id };
}

export async function updateReceivable(id: string, patch: Partial<ReceivableInput>): Promise<string | null> {
  const { error } = await db().from('fin_receivables').update(patch).eq('id', id);
  return error ? finFriendly(error.message) : null;
}

/**
 * Correct a wrongly entered expected amount. After a valid collection the
 * database requires a new reason; collections are not touched and the history
 * keeps the old → new amount, who and when.
 */
export async function correctReceivableAmount(id: string, amount: string, reason: string): Promise<string | null> {
  const { error } = await db().from('fin_receivables').update({ amount, amount_note: reason }).eq('id', id).eq('status', 'open');
  return error ? finFriendly(error.message) : null;
}

export async function cancelReceivable(id: string, reason: string): Promise<string | null> {
  const { error } = await db().from('fin_receivables').update({ status: 'cancelled', cancel_reason: reason }).eq('id', id).eq('status', 'open');
  return error ? finFriendly(error.message) : null;
}

/** One request key per form: a double click or a retry is one record. */
export async function addCollection(receivableId: string, p: PaymentInput, requestKey: string): Promise<{ id?: string; existing?: boolean; error?: string }> {
  const { data, error } = await db().from('fin_collections').insert({ ...p, receivable_id: receivableId, request_key: requestKey }).select('id').single();
  if (!error) return { id: (data as { id: string }).id };
  if (/duplicate key|unique/i.test(error.message)) {
    const { data: found } = await db().from('fin_collections').select('id').eq('request_key', requestKey).maybeSingle();
    if (found) return { id: (found as { id: string }).id, existing: true };
  }
  return { error: finFriendly(error.message) };
}

export async function voidCollection(id: string, reason: string): Promise<string | null> {
  const { error } = await db().from('fin_collections').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', id).is('voided_at', null);
  return error ? finFriendly(error.message) : null;
}

/** Operasyon customer collection: written to ops_payments (direction 'in'), the record Operasyon shows. */
export async function addOpsCollection(periodId: string, p: Pick<PaymentInput, 'kind' | 'amount' | 'currency' | 'paid_on' | 'method' | 'reference'>, requestKey: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await db().rpc('fin_ops_collect', {
    p_period: periodId, p_kind: p.kind, p_amount: p.amount, p_currency: p.currency, p_paid_on: p.paid_on, p_method: p.method, p_reference: p.reference, p_request_key: requestKey,
  });
  if (error) return { error: finFriendly(error.message) };
  return { id: data as string };
}

export async function voidOpsCollection(id: string, reason: string): Promise<string | null> {
  const { error } = await db().rpc('fin_ops_collect_void', { p_payment: id, p_reason: reason });
  return error ? finFriendly(error.message) : null;
}
