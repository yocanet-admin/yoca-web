import { NextRequest, NextResponse } from 'next/server';
import { cached, requireAdmin } from '@/lib/cockpit/auth';
import { recentDeployments, vercelConfigured } from '@/lib/cockpit/vercel';
import { loadSiteStatuses, SiteScheduleMissing } from '@/lib/cockpit/siteStatus';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — site health (admin only).
 * The STORED last check of every monitored site with its schedule (frequency,
 * last attempt, last success, next planned check) and the latest Vercel
 * deployments. Opening or refreshing the panel never sends a request to a client
 * site: checks run in the cron (when due) or via POST /api/admin/sites/check.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const fresh = request.nextUrl.searchParams.get('refresh') === '1';
  const supabase = getSupabaseAdmin();
  const deployments = vercelConfigured() ? cached('deployments', 2 * 60_000, fresh, () => recentDeployments(6)).catch(() => null) : Promise.resolve(null);
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.', sitesFromDatabase: false, vercelConfigured: vercelConfigured(), sites: [], checks: [], deployments: await deployments });
  try {
    const sites = await loadSiteStatuses(supabase);
    return NextResponse.json({
      ok: true,
      sitesFromDatabase: true,
      vercelConfigured: vercelConfigured(),
      // where the checks run (Vercel function region of the cron); a failure is a failure seen from there
      monitorRegion: process.env.VERCEL_REGION || null,
      sites,
      // stored results only (kept for older readers of `checks`)
      checks: sites.map((s) => s.check).filter(Boolean),
      deployments: await deployments,
    });
  } catch (error) {
    const pending = error instanceof SiteScheduleMissing;
    return NextResponse.json({ ok: false, error: pending ? error.message : 'Site durumları okunamadı.', migrationPending: pending, sitesFromDatabase: false, vercelConfigured: vercelConfigured(), sites: [], checks: [], deployments: await deployments });
  }
}
