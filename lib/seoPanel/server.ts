import type { SupabaseClient } from '@supabase/supabase-js';
import { auditHosts } from '@/lib/seoPanel/audit';
import { fixtureEnabled, FixtureRefusedError, gscStatus, type GscStatus } from '@/lib/seoPanel/gsc';
import type { KeywordRow } from '@/lib/seoPanel/report';

/**
 * Yoca Kokpit SEO — database helpers (server only). Every read and write goes
 * through the caller's client: the admin's own session (RLS: is_admin()) for
 * the panel, the service role only for the weekly cron.
 * Without the v27 tables the panel answers "migration bekleniyor" and nothing
 * else in the cockpit is affected.
 */

export const MIGRATION_FILE = 'supabase/upgrade-v27-seo.sql';
export const MIGRATION_PENDING = `SEO tabloları yok: migration bekleniyor (${MIGRATION_FILE}).`;
export interface SiteRow { id: string; domain: string; gsc_property: string; client_id: string | null; enabled: boolean }

export const isMissingTable = (msg: string | undefined) => Boolean(msg && /relation .*seo_|does not exist|schema cache|Could not find the table/i.test(msg));

export class SeoDbError extends Error {
  constructor(message: string, public status = 500, public pending = false) {
    super(message);
  }
}

/** The yoca.net site row (the only site in Faz 0). */
export async function getSite(client: SupabaseClient, domain = 'yoca.net'): Promise<SiteRow> {
  const { data, error } = await client.from('seo_sites').select('id, domain, gsc_property, client_id, enabled').eq('domain', domain).maybeSingle();
  if (error) throw isMissingTable(error.message) ? new SeoDbError(MIGRATION_PENDING, 503, true) : new SeoDbError(error.message);
  if (!data) throw new SeoDbError(`${domain} SEO kaydı yok (${MIGRATION_FILE} tohum satırı).`, 503, true);
  return data as SiteRow;
}

export async function listKeywords(client: SupabaseClient, siteId: string): Promise<KeywordRow[]> {
  const { data, error } = await client.from('seo_keywords').select('id, keyword, language, country, target_path, source, status, note, created_at, updated_at').eq('site_id', siteId).order('status').order('keyword');
  if (error) throw new SeoDbError(error.message);
  return (data ?? []) as KeywordRow[];
}

/** Environment status for the panel (names and modes only, never values). */
export function connection(site: SiteRow): GscStatus & { fixture: boolean; refused?: string; hosts: string[] } {
  try {
    const s = gscStatus(site.gsc_property);
    return { ...s, fixture: s.mode === 'fixture', hosts: auditHosts() };
  } catch (e) {
    if (e instanceof FixtureRefusedError) return { mode: 'none', property: site.gsc_property, message: 'Search Console bağlantısı kurulmadı.', step: e.message, fixture: false, refused: e.message, hosts: auditHosts() };
    throw e;
  }
}

export function fixtureMode(): boolean {
  try {
    return fixtureEnabled();
  } catch {
    return false;
  }
}

/** UTC calendar day (Search Console dates are Pacific days; a day either way does not change the lag logic). */
export const todayIso = () => new Date().toISOString().slice(0, 10);
