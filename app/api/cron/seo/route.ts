import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { adapterFor } from '@/lib/seoPanel/gsc';
import { snapshotRecent, supabaseStore } from '@/lib/seoPanel/weekly';
import { connection, getSite, listKeywords, SeoDbError, todayIso } from '@/lib/seoPanel/server';

/**
 * Yoca Kokpit SEO — weekly Search Console record (Vercel Cron, Thursday
 * 04:10 UTC: Monday–Sunday final data is normally complete by then).
 *
 * Separate path: it does not touch the sites / morning / ops jobs. CRON_SECRET
 * guard like the others. Upserts the last TWO completed weeks (idempotent;
 * a late final day is caught up the next week). Not configured or no v27
 * tables → skipped quietly. No notification, no e-mail, no Healthchecks ping.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const db = getSupabaseServiceRole();
  if (!db) return NextResponse.json({ ok: true, skipped: 'no_service_role' });
  try {
    const site = await getSite(db);
    const conn = connection(site);
    const adapter = adapterFor(conn, todayIso());
    if (!adapter) return NextResponse.json({ ok: true, skipped: 'not_configured' });
    const keywords = (await listKeywords(db, site.id)).filter((k) => k.status === 'active').map((k) => ({ keyword: k.keyword, country: k.country }));
    const weeks = await snapshotRecent(adapter, supabaseStore(db as never), site.id, keywords, todayIso());
    return NextResponse.json({ ok: true, source: adapter.source, weeks });
  } catch (e) {
    if (e instanceof SeoDbError && e.pending) return NextResponse.json({ ok: true, skipped: 'migration_pending' });
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
