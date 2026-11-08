import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { AUDIT_LIMITS, clampPages, runAudit } from '@/lib/seoPanel/audit';
import { acquireRun, saveResult, type AuditDb } from '@/lib/seoPanel/auditStore';
import { fixtureFetch } from '@/lib/seoPanel/fixture';
import { connection, fixtureMode, getSite, SeoDbError } from '@/lib/seoPanel/server';

/**
 * Yoca Kokpit SEO — limited technical audit, MANUAL trigger (admin only).
 * POST { maxPages? } (default 50, hard max 100). Allowlisted hosts only
 * (SEO_AUDIT_HOSTS), sitemap URLs, robots.txt honoured, GET only, 40 s budget,
 * 8 s per request, ≤ 3 parallel. SEO_FIXTURE=1: a synthetic site, no request
 * leaves the server.
 *
 * One running run per site across ALL instances (database: seo_audit_acquire;
 * a run older than 3 minutes is expired). Every write is checked: when the
 * results cannot be stored the run is marked failed and an error is returned.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { maxPages?: unknown };
  let site;
  try {
    site = await getSite(client);
  } catch (e) {
    const err = e instanceof SeoDbError ? e : new SeoDbError('SEO kaydı okunamadı.');
    return NextResponse.json({ ok: false, error: err.message, pending: err.pending || undefined }, { status: err.status });
  }
  const db = client as unknown as AuditDb;
  const fixture = fixtureMode();
  const acquired = await acquireRun(db, site.id, fixture ? 'fixture' : 'live', admin.email ?? admin.id);
  if (!acquired.ok) return NextResponse.json({ ok: false, error: acquired.error, running: acquired.status === 409 || undefined }, { status: acquired.status });
  const runId = acquired.runId;
  try {
    const delay = fixture ? Math.min(200, Math.max(0, Number(process.env.SEO_FIXTURE_DELAY_MS) || 0)) : 0; // local tests only (overlapping runs)
    const result = await runAudit({ origin: `https://${site.domain}`, hosts: connection(site).hosts, fetch: fixture ? fixtureFetch(delay) : fetch, maxPages: clampPages(body.maxPages), budgetMs: AUDIT_LIMITS.budgetMs });
    const saved = await saveResult(db, runId, result);
    if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error, runId }, { status: 500 });
    return NextResponse.json({ ok: true, runId, status: result.status, pagesChecked: result.pagesChecked, limitReason: result.limitReason, summary: result.summary, source: fixture ? 'fixture' : 'live' });
  } catch (e) {
    // never leave it "running" (the 3-minute expiry is the fallback if even this update fails)
    await Promise.resolve(db.from('seo_audit_runs').update({ status: 'failed', finished_at: new Date().toISOString(), limit_reason: `Tarama hatası: ${(e as Error).message?.slice(0, 160) ?? 'bilinmeyen'}` }).eq('id', runId)).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Tarama tamamlanamadı; başarısız olarak işaretlendi.' }, { status: 500 });
  }
}
