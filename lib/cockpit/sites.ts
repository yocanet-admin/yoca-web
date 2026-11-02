'use client';

import { getAdminClient } from '@/lib/adminClient';
import type { SiteCheck } from '@/lib/cockpit/monitor';

/** Yoca cockpit — monitored client sites (browser side). */

export interface SiteRow {
  id: string;
  name: string;
  url: string;
  expects_signature: boolean;
  hosting_renews_on: string | null;
  note: string;
  is_active: boolean;
  order_index: number;
}

export interface HealthResponse {
  ok: boolean;
  /** Set when the request failed (session expired, timeout…); `checks` may then be missing. */
  error?: string;
  sitesFromDatabase: boolean;
  vercelConfigured: boolean;
  checks: SiteCheck[];
  deployments: Array<{ id: string; state: string; target: string | null; createdAt: number; message: string; branch: string; url: string }> | null;
}

export async function loadSiteRows(): Promise<{ rows: SiteRow[]; ready: boolean }> {
  const supabase = getAdminClient();
  if (!supabase) return { rows: [], ready: false };
  const { data, error } = await supabase.from('monitored_sites').select('*').order('order_index');
  if (error) return { rows: [], ready: false };
  return { rows: (data as SiteRow[]) ?? [], ready: true };
}

/** Fields the admin may change. Cron bookkeeping (fail_count, alerted, last_state…) is never sent from the browser. */
export type SiteEdit = Partial<Pick<SiteRow, 'name' | 'url' | 'expects_signature' | 'hosting_renews_on' | 'note' | 'is_active' | 'order_index'>>;

/**
 * A usable site address or null. Adds https:// when missing; rejects spaces,
 * hosts without a dot and anything that is not http(s).
 */
export function normalizeSiteUrl(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!url.hostname.includes('.') || /\s/.test(input.trim())) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export async function addSite(row: { name: string; url: string; expects_signature: boolean; order_index: number }): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: 'Supabase yapılandırılmamış.' };
  const { error } = await supabase.from('monitored_sites').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Update only the given editable fields of one site. */
export async function updateSite(id: string, patch: SiteEdit): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('monitored_sites').update(patch).eq('id', id);
  return !error;
}

export async function removeSite(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('monitored_sites').delete().eq('id', id);
  return !error;
}

export { siteIssues, type Severity } from '@/lib/cockpit/issues';
