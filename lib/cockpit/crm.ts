'use client';

import { getAdminClient } from '@/lib/adminClient';
import type { Lead } from '@/lib/cockpit/leads';

/**
 * Yoca cockpit — CRM (clients, deals, activities) on Supabase.
 * Tables from upgrade-v8; every call degrades to empty data before it is run.
 */

export const CLIENT_STATUSES = ['prospect', 'active', 'past'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const CLIENT_LABEL: Record<ClientStatus, string> = { prospect: 'Aday', active: 'Aktif müşteri', past: 'Eski müşteri' };

export const DEAL_STAGES = ['discovery', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_LABEL: Record<DealStage, string> = {
  discovery: 'Keşif',
  proposal: 'Teklif',
  negotiation: 'Pazarlık',
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
};
export const OPEN_STAGES: DealStage[] = ['discovery', 'proposal', 'negotiation'];

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'AZN', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACTIVITY_KINDS = ['note', 'call', 'email', 'meeting', 'task'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABEL: Record<ActivityKind, string> = { note: 'Not', call: 'Arama', email: 'E-posta', meeting: 'Toplantı', task: 'Görev' };
export const ACTIVITY_ICON: Record<ActivityKind, string> = { note: '¶', call: '☎', email: '✉', meeting: '◷', task: '☐' };

export interface Client {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  status: ClientStatus;
  note: string;
  source_type: 'contact' | 'checkup' | 'manual' | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  client_id: string;
  title: string;
  value: number;
  currency: Currency;
  stage: DealStage;
  expected_close: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  client_id: string;
  deal_id: string | null;
  kind: ActivityKind;
  body: string;
  due_on: string | null;
  done: boolean;
  created_by: string;
  created_at: string;
}

export interface CrmData {
  ready: boolean;
  clients: Client[];
  deals: Deal[];
  activities: Activity[];
}

export async function loadCrm(): Promise<CrmData> {
  const supabase = getAdminClient();
  if (!supabase) return { ready: false, clients: [], deals: [], activities: [] };
  const [clients, deals, activities] = await Promise.all([
    supabase.from('clients').select('*').order('updated_at', { ascending: false }),
    supabase.from('deals').select('*').order('updated_at', { ascending: false }),
    supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(1000),
  ]);
  if (clients.error) return { ready: false, clients: [], deals: [], activities: [] };
  return {
    ready: true,
    // Firms that are only providers (Operasyon, v18 roles) are not CRM clients.
    clients: ((clients.data as Array<Client & { roles?: string[] }>) ?? []).filter((c) => !Array.isArray(c.roles) || c.roles.includes('customer')),
    deals: ((deals.data as Deal[]) ?? []).map((d) => ({ ...d, value: Number(d.value) || 0 })),
    activities: (activities.data as Activity[]) ?? [],
  };
}

async function currentEmail(): Promise<string> {
  const supabase = getAdminClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.user.email ?? '';
}

export async function saveClient(client: Partial<Client> & { name: string }): Promise<Client | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const payload = { ...client, updated_at: new Date().toISOString() };
  const query = client.id
    ? supabase.from('clients').update(payload).eq('id', client.id).select().single()
    : supabase.from('clients').insert(payload).select().single();
  const { data, error } = await query;
  return error ? null : (data as Client);
}

export async function deleteClient(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('clients').delete().eq('id', id);
  return !error;
}

export async function saveDeal(deal: Partial<Deal> & { client_id: string; title: string }): Promise<Deal | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const payload = { ...deal, updated_at: new Date().toISOString() };
  const query = deal.id
    ? supabase.from('deals').update(payload).eq('id', deal.id).select().single()
    : supabase.from('deals').insert(payload).select().single();
  const { data, error } = await query;
  return error ? null : ({ ...(data as Deal), value: Number((data as Deal).value) || 0 });
}

export async function deleteDeal(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('deals').delete().eq('id', id);
  return !error;
}

export async function addActivity(activity: Pick<Activity, 'client_id' | 'kind' | 'body'> & Partial<Pick<Activity, 'deal_id' | 'due_on'>>): Promise<Activity | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('activities')
    .insert({ ...activity, created_by: await currentEmail() })
    .select()
    .single();
  return error ? null : (data as Activity);
}

export async function setTaskDone(id: string, done: boolean): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('activities').update({ done }).eq('id', id);
  return !error;
}

export async function deleteActivity(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('activities').delete().eq('id', id);
  return !error;
}

/** The client already created from this lead, if any. */
export async function findClientForLead(lead: Pick<Lead, 'id' | 'type'>): Promise<Client | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('source_type', lead.type)
    .eq('source_id', lead.id)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as Client;
}

const likeExact = (value: string) => value.trim().replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The one client record behind a name or e-mail — CRM and Operasyon share
 * the clients table, so a firm entered on either screen is found here
 * (also a firm that is only a provider, or whose e-mail is on a contact).
 */
export async function findMatchingClient(name: string, email?: string | null): Promise<(Client & { roles?: string[] }) | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const mail = String(email ?? '').trim();
  if (mail.includes('@')) {
    const { data } = await supabase.from('clients').select('*').ilike('email', likeExact(mail)).order('created_at', { ascending: true }).limit(1);
    if (data?.length) return data[0] as Client;
    const contact = await supabase.from('client_contacts').select('client_id').ilike('email', likeExact(mail)).limit(1);
    const id = (contact.data?.[0] as { client_id?: string } | undefined)?.client_id;
    if (!contact.error && id) {
      const { data: c } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
      if (c) return c as Client;
    }
  }
  if (name.trim().length >= 2) {
    const { data } = await supabase.from('clients').select('*').ilike('name', likeExact(name)).order('created_at', { ascending: true }).limit(1);
    if (data?.length) return data[0] as Client;
  }
  return null;
}

/** A firm recorded only as a provider becomes a customer too (same record, no copy). */
export async function ensureCustomerRole(client: Client & { roles?: string[] }): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase || !Array.isArray(client.roles) || client.roles.includes('customer')) return;
  await supabase.from('clients').update({ roles: [...client.roles, 'customer'] }).eq('id', client.id);
}

/**
 * Lead → client (prospect) with the lead's message as the first note.
 * When the lead was already turned into a client, that client is returned
 * (`existing: true`) instead of creating a duplicate. When a client with the
 * same e-mail (or the same firm name) already exists — entered in CRM or in
 * Operasyon — the lead is attached to THAT record (`matched: true`): its
 * message becomes a note there and no second record is created.
 */
export async function clientFromLead(lead: Lead): Promise<(Client & { existing?: boolean; matched?: boolean }) | null> {
  const found = await findClientForLead(lead);
  if (found) return { ...found, existing: true };
  const firstNote =
    lead.type === 'contact'
      ? lead.message
      : `Digital Check-Up skoru: ${lead.score ?? '–'}/100\n` + lead.answers.map(([key, answer]) => `${key}: ${answer?.v ?? ''}`).join('\n');
  const match = await findMatchingClient(lead.company || lead.name, lead.email);
  if (match) {
    await ensureCustomerRole(match);
    await addActivity({ client_id: match.id, kind: 'note', body: `Yeni talep (${lead.type === 'contact' ? 'iletişim formu' : 'Check-Up'}, ${lead.name}${lead.email ? ` · ${lead.email}` : ''}):\n${firstNote}` });
    return { ...match, existing: true, matched: true };
  }
  const client = await saveClient({
    name: lead.company || lead.name,
    contact_name: lead.name,
    email: lead.email,
    phone: lead.phone,
    status: 'prospect',
    source_type: lead.type,
    source_id: lead.id,
  });
  if (!client) return null;
  if (firstNote.trim()) await addActivity({ client_id: client.id, kind: 'note', body: `İlk talep (${lead.type === 'contact' ? 'iletişim formu' : 'Check-Up'}):\n${firstNote}` });
  return client;
}

export function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/** Open pipeline value grouped by currency (no FX conversion — honest totals). */
export function pipelineByCurrency(deals: Deal[], stages: DealStage[] = OPEN_STAGES): Array<{ currency: string; value: number; count: number }> {
  const map = new Map<string, { value: number; count: number }>();
  for (const deal of deals) {
    if (!stages.includes(deal.stage)) continue;
    const entry = map.get(deal.currency) ?? { value: 0, count: 0 };
    entry.value += deal.value;
    entry.count += 1;
    map.set(deal.currency, entry);
  }
  return Array.from(map.entries()).map(([currency, v]) => ({ currency, ...v })).sort((a, b) => b.value - a.value);
}
