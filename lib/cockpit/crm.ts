'use client';

import { getAdminClient } from '@/lib/adminClient';
import type { Lead } from '@/lib/cockpit/leads';
import { clientCandidates, type Candidate, type ContactLike, type PartyLike } from '@/lib/cockpit/match';

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

/** The client this lead is linked to (v18 lead.client_id), else the one created from it (source_*). */
export async function findClientForLead(lead: Pick<Lead, 'id' | 'type'> & { clientId?: string | null }): Promise<Client | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  if (lead.clientId) {
    const { data } = await supabase.from('clients').select('*').eq('id', lead.clientId).maybeSingle();
    if (data) return data as Client;
  }
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

export type ClientCandidate = Candidate<Client & PartyLike>;

/**
 * Existing clients that MAY be the same as { name, company, email } — CRM and
 * Operasyon records alike (one clients table). Only suggestions with reasons;
 * the admin chooses. Same name ≠ same client: nothing is linked here.
 */
export async function loadClientCandidates(input: { name?: string | null; company?: string | null; email?: string | null }): Promise<ClientCandidate[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const [clients, contacts] = await Promise.all([
    supabase.from('clients').select('*'),
    supabase.from('client_contacts').select('client_id, email'),
  ]);
  return clientCandidates(input, ((clients.data ?? []) as Array<Client & PartyLike>), contacts.error ? [] : ((contacts.data ?? []) as ContactLike[]));
}

/** A firm recorded only as a provider becomes a customer too — only on the admin's explicit choice. */
export async function ensureCustomerRole(client: Client & { roles?: string[] | null }): Promise<void> {
  const supabase = getAdminClient();
  if (!supabase || !Array.isArray(client.roles) || client.roles.includes('customer')) return;
  await supabase.from('clients').update({ roles: [...client.roles, 'customer'] }).eq('id', client.id);
}

const leadTable = (lead: Pick<Lead, 'type'>) => (lead.type === 'contact' ? 'contact_submissions' : 'checkup_submissions');
const leadKind = (lead: Pick<Lead, 'type'>) => (lead.type === 'contact' ? 'iletişim formu' : 'Check-Up');

function leadText(lead: Lead): string {
  return lead.type === 'contact'
    ? lead.message
    : `Digital Check-Up skoru: ${lead.score ?? '–'}/100\n` + lead.answers.map(([key, answer]) => `${key}: ${answer?.v ?? ''}`).join('\n');
}

/**
 * The admin chose an existing client for this lead: the lead keeps its own
 * record, status and history and gets client_id (v18). A short activity on the
 * client points at the lead; the lead is not copied, moved or deleted.
 */
export async function linkLeadToClient(lead: Lead, client: Client & { roles?: string[] | null }): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: 'Supabase yapılandırılmamış.' };
  if (lead.clientId && lead.clientId !== client.id) return { ok: false, error: 'Bu lead başka bir müşteriye bağlı; önce o bağlantıyı kaldırın.' };
  const { error } = await supabase.from(leadTable(lead)).update({ client_id: client.id }).eq('id', lead.id);
  if (error) return { ok: false, error: /client_id/.test(error.message) ? 'Lead bağlantısı için upgrade-v18-operations.sql gerekli.' : error.message };
  await ensureCustomerRole(client);
  await addActivity({ client_id: client.id, kind: 'note', body: `Lead bağlandı (${leadKind(lead)}, ${lead.name || lead.email}${lead.email ? ` · ${lead.email}` : ''}, ${lead.createdAt.slice(0, 10)}). Başvurunun kendisi Leadler sayfasında duruyor.` });
  return { ok: true };
}

/** Removes only the link; the lead and the client stay. */
export async function unlinkLead(lead: Pick<Lead, 'id' | 'type'>): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from(leadTable(lead)).update({ client_id: null }).eq('id', lead.id);
  return !error;
}

/**
 * Lead → NEW client (prospect) with the lead's message as the first note; the
 * lead is linked to it (client_id) and stays as it is. When the lead already
 * has a client, that one is returned (`existing: true`). Choosing between a
 * new client and an existing candidate is the caller's job (see
 * loadClientCandidates) — this never attaches a lead to a look-alike.
 */
export async function clientFromLead(lead: Lead): Promise<(Client & { existing?: boolean }) | null> {
  const found = await findClientForLead(lead);
  if (found) return { ...found, existing: true };
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
  const supabase = getAdminClient();
  if (supabase) await supabase.from(leadTable(lead)).update({ client_id: client.id }).eq('id', lead.id); // ignored before v18
  const first = leadText(lead);
  if (first.trim()) await addActivity({ client_id: client.id, kind: 'note', body: `İlk talep (${leadKind(lead)}):\n${first}` });
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
