import type { SupabaseClient } from '@supabase/supabase-js';
import { daysUntil, type MonitoredSite, type SiteCheck } from '@/lib/cockpit/monitor';
import { isInterval, plannedSlot, type CheckInterval } from '@/lib/cockpit/schedule';

/**
 * Yoca cockpit — what the panel, the cockpit and the morning summary show for
 * each site: the STORED last check plus its schedule (server only). Reading this
 * never sends a request to a client site.
 */

export interface SiteStatus {
  id: string;
  name: string;
  url: string;
  expectsSignature: boolean;
  hostingRenewsOn: string | null;
  orderIndex: number;
  interval: CheckInterval;
  failCount: number;
  alerted: boolean;
  /** Last check attempt (cron or manual). */
  lastAttemptAt: string | null;
  /** Last check where the site answered normally (up / slow). */
  lastSuccessAt: string | null;
  /** Stored next automatic check (a cron slot); null = at the next cron (or never for "manual"). */
  nextCheckAt: string | null;
  /** The cron slot that will actually check the site (shown in the panel); null for "manual". */
  plannedAt: string | null;
  /** The next check is the single confirmation after a first failure. */
  confirmPending: boolean;
  /** A run is checking this site right now. */
  checking: boolean;
  lastManualAt: string | null;
  /** Cron slot the last check belonged to (null = manual, or before v29). */
  lastSlotAt: string | null;
  /** When the last check really started / finished (v29). */
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  /** The stored result (null = never checked since v28). */
  check: SiteCheck | null;
}

export interface SiteRunRow extends MonitoredSite {
  id: string;
  check_interval: CheckInterval;
  fail_count: number;
  alerted: boolean;
  signature_alerted: boolean;
  last_checked_at: string | null;
  domain_checked_at: string | null;
  domain_expires_at: string | null;
}

export class SiteScheduleMissing extends Error {
  constructor() {
    super('Site sıklığı tabloları yok: supabase/upgrade-v28-site-schedule.sql bekleniyor.');
  }
}

const missing = (msg?: string) => Boolean(msg && /site_check_state|check_interval|does not exist|schema cache|Could not find/i.test(msg));

type StateRow = {
  site_id: string;
  next_check_at: string | null;
  confirm_pending: boolean;
  last_success_at: string | null;
  last_result: SiteCheck | null;
  lease_until: string | null;
  last_manual_at: string | null;
  domain_checked_at: string | null;
  domain_expires_at: string | null;
  last_slot_at?: string | null;
  last_started_at?: string | null;
  last_finished_at?: string | null;
};

const SITE_COLUMNS = 'id,name,url,expects_signature,hosting_renews_on,note,is_active,order_index,check_interval,fail_count,alerted,signature_alerted,last_checked_at';

async function readBoth(supabase: SupabaseClient, ids?: string[]) {
  let sitesQuery = supabase.from('monitored_sites').select(SITE_COLUMNS).order('order_index');
  if (ids) sitesQuery = sitesQuery.in('id', ids);
  else sitesQuery = sitesQuery.eq('is_active', true);
  const [sites, states] = await Promise.all([sitesQuery, ids ? supabase.from('site_check_state').select('*').in('site_id', ids) : supabase.from('site_check_state').select('*')]);
  if (sites.error) throw missing(sites.error.message) ? new SiteScheduleMissing() : new Error(sites.error.message);
  if (states.error) throw missing(states.error.message) ? new SiteScheduleMissing() : new Error(states.error.message);
  const byId = new Map(((states.data ?? []) as StateRow[]).map((s) => [s.site_id, s]));
  return { sites: (sites.data ?? []) as Array<Record<string, unknown>>, byId };
}

/** Active sites with their stored result and schedule, in panel order. */
export async function loadSiteStatuses(supabase: SupabaseClient, now = Date.now()): Promise<SiteStatus[]> {
  const { sites, byId } = await readBoth(supabase);
  return sites.map((row) => {
    const s = byId.get(String(row.id));
    const stored = s?.last_result ?? null;
    // domain expiry and hosting date come from their own sources, so the shown values stay current
    const domainExpires = s?.domain_expires_at ?? stored?.domainExpires ?? null;
    const check: SiteCheck | null = stored
      ? { ...stored, name: String(row.name), url: String(row.url), expectsSignature: Boolean(row.expects_signature), hostingRenewsOn: (row.hosting_renews_on as string | null) ?? null, domainExpires, domainDaysLeft: daysUntil(domainExpires), sslDaysLeft: daysUntil(stored.sslExpires) }
      : null;
    const interval: CheckInterval = isInterval(row.check_interval) ? row.check_interval : '15m';
    return {
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      expectsSignature: Boolean(row.expects_signature),
      hostingRenewsOn: (row.hosting_renews_on as string | null) ?? null,
      orderIndex: Number(row.order_index ?? 0),
      interval,
      failCount: Number(row.fail_count ?? 0),
      alerted: Boolean(row.alerted),
      lastAttemptAt: (row.last_checked_at as string | null) ?? null,
      lastSuccessAt: s?.last_success_at ?? null,
      nextCheckAt: s?.next_check_at ?? null,
      plannedAt: plannedSlot({ interval, nextCheckAt: s?.next_check_at ?? null, now }),
      confirmPending: Boolean(s?.confirm_pending),
      checking: Boolean(s?.lease_until && Date.parse(s.lease_until) > now),
      lastManualAt: s?.last_manual_at ?? null,
      lastSlotAt: s?.last_slot_at ?? null,
      lastStartedAt: s?.last_started_at ?? null,
      lastFinishedAt: s?.last_finished_at ?? null,
      check,
    };
  });
}

/** The rows a run needs for the given (already claimed) site ids. */
export async function loadRunRows(supabase: SupabaseClient, ids: string[]): Promise<SiteRunRow[]> {
  if (!ids.length) return [];
  const { sites, byId } = await readBoth(supabase, ids);
  return sites.map((row) => {
    const s = byId.get(String(row.id));
    return {
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      expects_signature: Boolean(row.expects_signature),
      hosting_renews_on: (row.hosting_renews_on as string | null) ?? null,
      check_interval: isInterval(row.check_interval) ? row.check_interval : '15m',
      fail_count: Number(row.fail_count ?? 0),
      alerted: Boolean(row.alerted),
      signature_alerted: Boolean(row.signature_alerted),
      last_checked_at: (row.last_checked_at as string | null) ?? null,
      domain_checked_at: s?.domain_checked_at ?? null,
      domain_expires_at: s?.domain_expires_at ?? null,
    };
  });
}
