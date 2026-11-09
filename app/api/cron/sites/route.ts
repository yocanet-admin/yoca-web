import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { sitesOutcome, withHeartbeat } from '@/lib/cockpit/heartbeat';
import { LEASE_S } from '@/lib/cockpit/schedule';
import { runSiteChecks } from '@/lib/cockpit/siteRunner';
import { loadRunRows, SiteScheduleMissing } from '@/lib/cockpit/siteStatus';
import { getCronState, saveCronState } from '@/lib/cockpit/settings';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — client site watch (Vercel Cron, every 15 minutes).
 * Each site has its own frequency (15 min … weekly, or manual only); a run
 * checks ONLY the sites whose next check is due, claimed atomically in the
 * database so a site is never checked by two runs at once (v28).
 * Alerts (siteAlerts.ts / schedule.ts): after a first failure one confirmation
 * check follows 15 minutes later; a second failure in a row alerts, once per
 * incident; a recovery message only follows a check where the site answered.
 * Reports start/success/fail to Healthchecks (lib/cockpit/heartbeat.ts).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_GAP_MS = 5 * 60_000;

/**
 * SCHEDULED → PUBLISHED for articles whose publish_at has passed. The public
 * site (and its RLS policy) only shows PUBLISHED rows, so without this step a
 * scheduled article would never appear. Returns how many went live (null on error).
 */
async function publishDueInsights(): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('insights')
      .update({ status: 'PUBLISHED' })
      .eq('status', 'SCHEDULED')
      .lte('publish_at', new Date().toISOString())
      .select('id');
    if (error) {
      console.error('cron: scheduled insights publish failed:', error.message);
      return null;
    }
    const count = data?.length ?? 0;
    if (count > 0) console.log(`cron: published ${count} scheduled insight(s)`);
    return count;
  } catch (error) {
    console.error('cron: scheduled insights publish failed:', (error as Error).message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  return withHeartbeat('sites', async () => {
    // Scheduled Insights go live once their time has come (runs even when the site check is throttled).
    const published = await publishDueInsights();

    const state = await getCronState();
    if (state.sites_last_at && Date.now() - Date.parse(state.sites_last_at) < MIN_GAP_MS) {
      return { response: NextResponse.json({ ok: true, skipped: 'ran less than 5 minutes ago', published }), outcome: sitesOutcome({ dbOk: true, published, sent: null }) };
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return { response: NextResponse.json({ ok: false, error: 'supabase not configured' }, { status: 503 }), outcome: sitesOutcome({ dbOk: false, published, sent: null }) };
    await saveCronState({ sites_last_at: new Date().toISOString() });

    // only the due sites, each held by this run (lease) until its result is written
    const claim = await supabase.rpc('site_checks_claim_due', { p_lease_seconds: LEASE_S });
    if (claim.error) {
      const pending = /site_checks_claim_due|site_check_state|does not exist|schema cache|Could not find/i.test(claim.error.message);
      return { response: NextResponse.json({ ok: false, error: pending ? 'run supabase/upgrade-v28-site-schedule.sql' : claim.error.message.slice(0, 160) }, { status: 500 }), outcome: sitesOutcome({ dbOk: false, published, sent: null }) };
    }
    const ids = (Array.isArray(claim.data) ? (claim.data as Array<{ claimed_id: string }>) : []).map((r) => r.claimed_id);
    try {
      const rows = await loadRunRows(supabase, ids);
      const run = await runSiteChecks(supabase, rows);
      const { results: _r, ...summary } = run;
      return { response: NextResponse.json({ ok: true, published, due: ids.length, ...summary }), outcome: sitesOutcome({ dbOk: true, published, sent: run.sent }) };
    } catch (error) {
      if (ids.length) await supabase.from('site_check_state').update({ lease_until: null }).in('site_id', ids);
      const message = error instanceof SiteScheduleMissing ? error.message : (error as Error).message?.slice(0, 160) || 'site kontrolü başarısız';
      return { response: NextResponse.json({ ok: false, error: message }, { status: 500 }), outcome: sitesOutcome({ dbOk: false, published, sent: null }) };
    }
  });
}
