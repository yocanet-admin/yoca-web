import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { AUDIT_LIMITS, clampPages, runAudit } from '@/lib/seoPanel/audit';
import { fixtureFetch } from '@/lib/seoPanel/fixture';
import { connection, fixtureMode, getSite, SeoDbError } from '@/lib/seoPanel/server';

/**
 * Yoca Kokpit SEO — limited technical audit, MANUAL trigger (admin only).
 * POST { maxPages? } (default 50, hard max 100). Allowlisted hosts only
 * (SEO_AUDIT_HOSTS), sitemap URLs, robots.txt honoured, GET only, 40 s budget,
 * 8 s per request, ≤ 3 parallel. SEO_FIXTURE=1: a synthetic site, no request
 * leaves the server. One run row + its findings are stored.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let running = false;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  if (running) return NextResponse.json({ ok: false, error: 'Bir tarama zaten çalışıyor; bitmesini bekleyin.' }, { status: 409 });
  const body = (await request.json().catch(() => ({}))) as { maxPages?: unknown };
  running = true;
  try {
    const site = await getSite(client);
    const hosts = connection(site).hosts;
    const fixture = fixtureMode();
    const { data: run, error } = await client.from('seo_audit_runs').insert({ site_id: site.id, status: 'running', source: fixture ? 'fixture' : 'live', triggered_by: admin.email ?? admin.id }).select('id').single();
    if (error) throw new SeoDbError(error.message);
    const runId = (run as { id: string }).id;
    const result = await runAudit({ origin: `https://${site.domain}`, hosts, fetch: fixture ? fixtureFetch() : fetch, maxPages: clampPages(body.maxPages), budgetMs: AUDIT_LIMITS.budgetMs });
    const rows = result.findings.map((f) => ({ run_id: runId, url: f.url, check_key: f.check, severity: f.severity, message: f.message.slice(0, 500), detail: f.detail ?? {} }));
    for (let i = 0; i < rows.length; i += 300) await client.from('seo_audit_findings').insert(rows.slice(i, i + 300));
    await client.from('seo_audit_runs').update({ status: result.status, finished_at: new Date().toISOString(), pages_planned: result.pagesPlanned, pages_checked: result.pagesChecked, limit_reason: result.limitReason, summary: result.summary }).eq('id', runId);
    return NextResponse.json({ ok: true, runId, status: result.status, pagesChecked: result.pagesChecked, limitReason: result.limitReason, summary: result.summary, source: fixture ? 'fixture' : 'live' });
  } catch (e) {
    const err = e instanceof SeoDbError ? e : new SeoDbError('Tarama tamamlanamadı.');
    return NextResponse.json({ ok: false, error: err.message, pending: err.pending || undefined }, { status: err.status });
  } finally {
    running = false;
  }
}
