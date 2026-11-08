import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { heartbeat, seoOutcome, type SeoRun } from '@/lib/cockpit/heartbeat';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { adapterFor } from '@/lib/seoPanel/gsc';
import { snapshotRecent, supabaseStore } from '@/lib/seoPanel/weekly';
import { connection, getSite, listKeywords, SeoDbError, todayIso } from '@/lib/seoPanel/server';

/**
 * Yoca Kokpit SEO — weekly Search Console record (Vercel Cron, Thursday
 * 04:10 UTC: Monday–Sunday final data is normally complete by then).
 *
 * Separate path: it does not touch the sites / morning / ops jobs. CRON_SECRET
 * guard like the others. Replaces the last TWO completed weeks that Search
 * Console confirms final (idempotent; a late final day is caught up the next
 * week). No notification, no e-mail, no report.
 *
 * Healthchecks (optional HEALTHCHECKS_URL_SEO): start → success ONLY when data
 * was really saved ("kaydedildi: N satır"); skipped (not connected, no v27
 * tables, weeks not final / finality unknown) → /log with the reason, never a
 * success; an error → /fail.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(): Promise<SeoRun & { source?: string }> {
  const db = getSupabaseServiceRole();
  if (!db) return { kind: 'skipped', reason: 'no_service_role' };
  try {
    const site = await getSite(db);
    const adapter = adapterFor(connection(site), todayIso());
    if (!adapter) return { kind: 'skipped', reason: 'not_configured' };
    const keywords = (await listKeywords(db, site.id)).filter((k) => k.status === 'active').map((k) => ({ keyword: k.keyword, country: k.country }));
    const weeks = await snapshotRecent(adapter, supabaseStore(db as never), site.id, keywords, todayIso());
    if (weeks.some((w) => w.status === 'saved')) return { kind: 'saved', weeks, source: adapter.source };
    if (weeks.some((w) => w.status === 'skipped')) return { kind: 'skipped', reason: 'finality_unknown', weeks };
    return { kind: 'skipped', reason: 'not_final', weeks };
  } catch (e) {
    if (e instanceof SeoDbError && e.pending) return { kind: 'skipped', reason: 'migration_pending' };
    return { kind: 'error', message: e instanceof SeoDbError ? 'SEO kaydı okunamadı' : /Haftalık kayıt yazılamadı/.test((e as Error).message) ? 'haftalık kayıt yazılamadı, önceki kayıt korundu' : 'Search Console verisi alınamadı' };
  }
}

export async function GET(request: NextRequest) {
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  await heartbeat('seo', 'start');
  const result = await run();
  const ping = seoOutcome(result);
  await heartbeat('seo', ping.phase, fetch, ping.body);
  if (result.kind === 'error') return NextResponse.json({ ok: false, error: result.message, monitor: ping.phase }, { status: 500 });
  if (result.kind === 'skipped') return NextResponse.json({ ok: true, skipped: result.reason, weeks: result.weeks, monitor: ping.phase });
  return NextResponse.json({ ok: true, source: result.source, weeks: result.weeks, monitor: ping.phase, saved: ping.body });
}
