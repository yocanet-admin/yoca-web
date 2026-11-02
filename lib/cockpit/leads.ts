'use client';

import { getAdminClient } from '@/lib/adminClient';
import type { CheckupAnswer } from '@/types';
import type { LeadStatus } from '@/lib/cockpit/client';

/**
 * Yoca cockpit — leads (contact form + Digital Check-Up) as one list.
 * Pipeline fields (status, note, follow_up_on) come from upgrade-v8; before
 * that SQL is run, `schemaReady` is false and every lead reads as "new".
 */

export interface Lead {
  id: string;
  type: 'contact' | 'checkup';
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  answers: Array<[string, CheckupAnswer]>;
  score: number | null;
  locale: string;
  createdAt: string;
  status: LeadStatus;
  note: string;
  followUpOn: string | null;
  aiSummary: AiSummary | null;
  aiSummaryAt: string | null;
}

/** Saved AI brief (upgrade-v9, written by /api/admin/lead-ai). */
export interface AiSummary {
  ozet: string;
  ihtiyaclar: string[];
  butce: string;
  aciliyet: 'düşük' | 'orta' | 'yüksek';
  uygunluk: number;
  uygunluk_nedeni: string;
  spam_olasiligi: 'düşük' | 'orta' | 'yüksek';
  sonraki_adim: string;
  sorular: string[];
}

type Row = Record<string, unknown>;

function asStatus(value: unknown): LeadStatus {
  return (['new', 'contacted', 'proposal', 'won', 'lost', 'spam'] as const).includes(value as LeadStatus)
    ? (value as LeadStatus)
    : 'new';
}

export async function loadLeads(): Promise<{ leads: Lead[]; schemaReady: boolean }> {
  const supabase = getAdminClient();
  if (!supabase) return { leads: [], schemaReady: false };

  const probe = await supabase.from('contact_submissions').select('status').limit(1);
  const schemaReady = !probe.error;

  const [contacts, checkups] = await Promise.all([
    supabase.from('contact_submissions').select('*').order('created_at', { ascending: false }),
    supabase.from('checkup_submissions').select('*').order('created_at', { ascending: false }),
  ]);

  const leads: Lead[] = [
    ...((contacts.data as Row[]) ?? []).map((row) => ({
      id: String(row.id),
      type: 'contact' as const,
      name: String(row.name ?? ''),
      email: String(row.email ?? ''),
      company: String(row.company ?? ''),
      phone: '',
      message: String(row.message ?? ''),
      answers: [],
      score: null,
      locale: String(row.locale ?? ''),
      createdAt: String(row.created_at),
      status: asStatus(row.status),
      note: String(row.note ?? ''),
      followUpOn: (row.follow_up_on as string | null) ?? null,
      aiSummary: (row.ai_summary as AiSummary | null) ?? null,
      aiSummaryAt: (row.ai_summary_at as string | null) ?? null,
    })),
    ...((checkups.data as Row[]) ?? []).map((row) => {
      const contact = (row.contact_info_json ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        type: 'checkup' as const,
        name: String(contact.name ?? ''),
        email: String(contact.email ?? ''),
        company: String(contact.company ?? ''),
        phone: String(contact.phone ?? ''),
        message: '',
        answers: Object.entries((row.data_json ?? {}) as Record<string, CheckupAnswer>),
        score: typeof contact.score === 'number' ? contact.score : null,
        locale: String(contact.locale ?? ''),
        createdAt: String(row.created_at),
        status: asStatus(row.status),
        note: String(row.note ?? ''),
        followUpOn: (row.follow_up_on as string | null) ?? null,
        aiSummary: (row.ai_summary as AiSummary | null) ?? null,
        aiSummaryAt: (row.ai_summary_at as string | null) ?? null,
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { leads, schemaReady };
}

function table(lead: Pick<Lead, 'type'>) {
  return lead.type === 'contact' ? 'contact_submissions' : 'checkup_submissions';
}

export async function updateLead(lead: Lead, patch: Partial<{ status: LeadStatus; note: string; follow_up_on: string | null }>): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from(table(lead))
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', lead.id);
  return !error;
}

export async function deleteLead(lead: Lead): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from(table(lead)).delete().eq('id', lead.id);
  return !error;
}

/** [table, ids] batches of at most 100 ids (keeps the request URL short). */
function groupByTable(leads: Lead[]): Array<[string, string[]]> {
  const map = new Map<string, string[]>();
  for (const lead of leads) map.set(table(lead), [...(map.get(table(lead)) ?? []), lead.id]);
  const batches: Array<[string, string[]]> = [];
  for (const [name, ids] of Array.from(map.entries())) {
    for (let i = 0; i < ids.length; i += 100) batches.push([name, ids.slice(i, i + 100)]);
  }
  return batches;
}

/** Bulk status change; true when every table update succeeded. */
export async function updateLeads(leads: Lead[], patch: Partial<{ status: LeadStatus }>): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase || leads.length === 0) return false;
  const results = await Promise.all(
    groupByTable(leads).map(([name, ids]) => supabase.from(name).update({ ...patch, updated_at: new Date().toISOString() }).in('id', ids)),
  );
  return results.every((r) => !r.error);
}

/** Bulk delete; true when every table delete succeeded. */
export async function deleteLeads(leads: Lead[]): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase || leads.length === 0) return false;
  const results = await Promise.all(groupByTable(leads).map(([name, ids]) => supabase.from(name).delete().in('id', ids)));
  return results.every((r) => !r.error);
}

/** Leads per ISO week (Monday start, Istanbul-agnostic UTC weeks), last `weeks` weeks. */
export function weeklyCounts(leads: Lead[], weeks = 8): Array<{ date: string; value: number }> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const dow = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - dow - (weeks - 1) * 7);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return { date: d.toISOString().slice(0, 10), value: 0 };
  });
  for (const lead of leads) {
    if (lead.status === 'spam') continue;
    const t = new Date(lead.createdAt).getTime();
    const index = Math.floor((t - start.getTime()) / (7 * 86_400_000));
    if (index >= 0 && index < weeks) buckets[index].value += 1;
  }
  return buckets;
}

export function replyHref(lead: Lead): string {
  const tr = lead.locale === 'tr';
  const subject = tr ? 'YOCA — talebiniz hakkında' : lead.locale === 'az' ? 'YOCA — sorğunuz haqqında' : 'YOCA — about your enquiry';
  const greeting = tr ? `Merhaba ${lead.name},` : lead.locale === 'az' ? `Salam ${lead.name},` : `Hi ${lead.name},`;
  return `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${greeting}\n\n`)}`;
}
