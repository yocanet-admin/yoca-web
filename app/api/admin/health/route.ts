import { NextRequest, NextResponse } from 'next/server';
import { cached, requireAdmin } from '@/lib/cockpit/auth';
import { recentDeployments, vercelConfigured } from '@/lib/cockpit/vercel';
import { checkSites, DEFAULT_SITES, type MonitoredSite } from '@/lib/cockpit/monitor';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — site health (admin only).
 * Client site checks (uptime, suspension, signature, SSL, domain) and the
 * latest Vercel deployments. GET ?refresh=1 skips the 10-minute cache.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function loadSites(): Promise<{ sites: MonitoredSite[]; fromDatabase: boolean }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { sites: DEFAULT_SITES, fromDatabase: false };
  const { data, error } = await admin
    .from('monitored_sites')
    .select('id,name,url,expects_signature,hosting_renews_on,note')
    .eq('is_active', true)
    .order('order_index', { ascending: true });
  if (error || !data) return { sites: DEFAULT_SITES, fromDatabase: false };
  return { sites: data as MonitoredSite[], fromDatabase: true };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const fresh = request.nextUrl.searchParams.get('refresh') === '1';
  const { sites, fromDatabase } = await loadSites();
  const key = `sites:${sites.map((s) => `${s.url}|${s.expects_signature}|${s.hosting_renews_on ?? ''}`).join(',')}`;

  const [checks, deployments] = await Promise.all([
    cached(key, 10 * 60_000, fresh, () => checkSites(sites)),
    vercelConfigured()
      ? cached('deployments', 2 * 60_000, fresh, () => recentDeployments(6)).catch(() => null)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    sitesFromDatabase: fromDatabase,
    vercelConfigured: vercelConfigured(),
    checks,
    deployments,
  });
}
