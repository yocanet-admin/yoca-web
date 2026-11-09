'use client';

import { getAdminClient } from '@/lib/adminClient';
import type { SiteCheck } from '@/lib/cockpit/monitor';
import type { SiteStatus } from '@/lib/cockpit/siteStatus';
import type { CheckInterval } from '@/lib/cockpit/schedule';
import { adminPost } from '@/lib/cockpit/client';

export type { SiteStatus } from '@/lib/cockpit/siteStatus';

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
  /** Vercel region the checks ran in (e.g. "iad1"); null outside Vercel. */
  monitorRegion?: string | null;
  /** Stored result + schedule per active site (v28). Reading it sends no request to the sites. */
  sites?: SiteStatus[];
  /** v28 tables missing. */
  migrationPending?: boolean;
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

export { siteIssues, checkLabel, PROBLEM_LABEL, type Severity, type SiteProblem } from '@/lib/cockpit/issues';

export { browserProbeText, probeFromBrowser, type BrowserProbe } from '@/lib/cockpit/browserProbe';

/** "Şimdi kontrol et" for one site (rate-limited and locked in the database). */
export function checkSiteNow(id: string): Promise<{ ok: boolean; error?: string; site?: SiteStatus | null }> {
  return adminPost('/api/admin/sites/check', { id });
}

/** Change one site's check frequency (only the schedule moves; alert state is kept). */
export function setSiteInterval(id: string, interval: CheckInterval): Promise<{ ok: boolean; error?: string; next_check_at?: string | null }> {
  return adminPost('/api/admin/sites/schedule', { id, interval });
}
