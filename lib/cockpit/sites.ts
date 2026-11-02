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

export type Severity = 'good' | 'warning' | 'critical' | 'neutral';

/** Problems a site check raises, most severe first. */
export function siteIssues(check: SiteCheck): Array<{ severity: Severity; text: string }> {
  const issues: Array<{ severity: Severity; text: string }> = [];
  if (check.state === 'suspended') issues.push({ severity: 'critical', text: 'Hosting askıya alınmış / park sayfası' });
  if (check.state === 'down') issues.push({ severity: 'critical', text: check.error ? `Erişilemiyor — ${check.error}` : `Hata kodu ${check.httpStatus}` });
  if (check.state === 'slow') issues.push({ severity: 'warning', text: `Yavaş (${((check.ms ?? 0) / 1000).toFixed(1)} sn)` });
  if (check.sslDaysLeft !== null && check.sslDaysLeft <= 14) issues.push({ severity: check.sslDaysLeft <= 3 ? 'critical' : 'warning', text: `SSL ${check.sslDaysLeft} gün içinde bitiyor` });
  if (check.domainDaysLeft !== null && check.domainDaysLeft <= 30) issues.push({ severity: check.domainDaysLeft <= 7 ? 'critical' : 'warning', text: `Alan adı ${check.domainDaysLeft} gün içinde bitiyor` });
  if (check.hostingRenewsOn) {
    const days = Math.floor((Date.parse(check.hostingRenewsOn) - Date.now()) / 86_400_000);
    if (days <= 30) issues.push({ severity: days <= 7 ? 'critical' : 'warning', text: `Hosting ${days < 0 ? 'süresi geçti' : `${days} gün içinde yenilenmeli`}` });
  }
  if (check.expectsSignature && check.signature === false && check.state !== 'suspended' && check.state !== 'down') issues.push({ severity: 'warning', text: '“Built by YOCA” imzası yok' });
  return issues;
}
