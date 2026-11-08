import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { hostAllowed } from '@/lib/seoPanel/audit';
import { fixturePsi } from '@/lib/seoPanel/fixture';
import { KEY_PAGES, parsePsi, PSI_KEY_ENV, runPsi, type PsiResult, type Strategy } from '@/lib/seoPanel/pagespeed';
import { connection, fixtureMode, getSite, SeoDbError } from '@/lib/seoPanel/server';

/**
 * Yoca Kokpit SEO — PageSpeed Insights, MANUAL trigger (admin only).
 * POST { path } — one of the ≤ 5 key pages; mobile + desktop in parallel.
 * LAB and FIELD numbers are stored in separate columns (field_scope url /
 * origin / none). PAGESPEED_API_KEY is optional; SEO_FIXTURE=1 uses synthetic
 * responses (no request to Google).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { path?: unknown };
  const path = typeof body.path === 'string' ? body.path : '';
  if (!KEY_PAGES.includes(path)) return NextResponse.json({ ok: false, error: `Yalnızca ana sayfalar test edilir: ${KEY_PAGES.join(', ')}` }, { status: 400 });
  try {
    const site = await getSite(client);
    const url = `https://${site.domain}${path}`;
    if (!hostAllowed(url, connection(site).hosts)) return NextResponse.json({ ok: false, error: 'İzin listesi dışında.' }, { status: 400 });
    const fixture = fixtureMode();
    const one = async (strategy: Strategy): Promise<{ result: PsiResult | null; error: string | null }> => {
      try {
        const result = fixture ? parsePsi(fixturePsi(url, strategy), url, strategy) : await runPsi(url, strategy, { fetch, key: process.env[PSI_KEY_ENV] || undefined });
        return { result, error: null };
      } catch (e) {
        return { result: null, error: (e as Error).message.slice(0, 300) };
      }
    };
    const results = await Promise.all((['mobile', 'desktop'] as const).map(async (strategy) => ({ strategy, ...(await one(strategy)) })));
    const rows = results.map(({ strategy, result, error }) => ({
      site_id: site.id, url, strategy, source: fixture ? 'fixture' : 'psi', triggered_by: admin.email ?? admin.id, error,
      lab_perf_score: result?.lab.perfScore ?? null, lab_lcp_ms: result?.lab.lcpMs ?? null, lab_cls: result?.lab.cls ?? null, lab_tbt_ms: result?.lab.tbtMs ?? null,
      field_scope: result?.field.scope ?? 'none', field_lcp_p75_ms: result?.field.lcpP75Ms ?? null, field_inp_p75_ms: result?.field.inpP75Ms ?? null, field_cls_p75: result?.field.clsP75 ?? null, field_category: result?.field.category ?? null,
    }));
    const { error } = await client.from('seo_pagespeed').insert(rows);
    if (error) throw new SeoDbError(error.message);
    return NextResponse.json({ ok: true, results: rows });
  } catch (e) {
    const err = e instanceof SeoDbError ? e : new SeoDbError('PageSpeed testi tamamlanamadı.');
    return NextResponse.json({ ok: false, error: err.message, pending: err.pending || undefined }, { status: err.status });
  }
}
