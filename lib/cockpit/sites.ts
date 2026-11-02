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

export async function saveSite(row: Partial<SiteRow> & { name: string; url: string }): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const query = row.id ? supabase.from('monitored_sites').update(row).eq('id', row.id) : supabase.from('monitored_sites').insert(row);
  const { error } = await query;
  return !error;
}

export async function removeSite(id: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { error } = await supabase.from('monitored_sites').delete().eq('id', id);
  return !error;
}

export { siteIssues, type Severity } from '@/lib/cockpit/issues';
