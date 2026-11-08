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
 * Healthchecks (optional HEALTHCHECKS_URL_SEO, content-free pings like the other
 * jobs): start → success ONLY when the LATEST completed week was saved; a run
 * that refreshed only the older week, or skipped (not connected, no v27 tables,
 * latest week not final / finality unknown) → /log, never a success; an error
 * → /fail. Row counts and reasons go only to the application log.
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
    // newest first: [latest completed week, the week before]
    const weeks = await snapshotRecent(adapter, supabaseStore(db as never), site.id, keywords, todayIso());
    return { kind: 'ran', weeks: weeks.map((w) => (w.status === 'saved' ? { week: w.week, status: 'saved', rows: w.rows } : w.status === 'skipped' ? { week: w.week, status: 'skipped', reason: w.reason } : { week: w.week, status: 'not_final' })), source: adapter.source };
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
  const out = seoOutcome(result);
  await heartbeat('seo', out.phase);
  // counts and reasons only in the application log (no secrets, no data)
  console.log(`cron seo: ${out.summary} → ${out.phase}`);
  const report = { latest: out.latest, previous: out.previous, monitor: out.phase };
  if (result.kind === 'error') return NextResponse.json({ ok: false, error: result.message, ...report }, { status: 500 });
  if (result.kind === 'skipped') return NextResponse.json({ ok: true, skipped: result.reason, ...report });
  return NextResponse.json({ ok: true, source: result.source, weeks: result.weeks, ...report });
}
