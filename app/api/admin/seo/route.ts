import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, cached, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { adapterFor, GscError } from '@/lib/seoPanel/gsc';
import { buildReport, type Report } from '@/lib/seoPanel/report';
import { snapshotRecent, supabaseStore } from '@/lib/seoPanel/weekly';
import { connection, getSite, listKeywords, SeoDbError, todayIso } from '@/lib/seoPanel/server';
import { customRange, normalizeFilters, normQuery, pathOf, PRESETS, validateKeyword, type DateRange, type Preset } from '@/lib/seoPanel/model';

/**
 * Yoca Kokpit — SEO (Faz 0, yoca.net). ADMIN ONLY: requireAdmin (is_admin());
 * the finance role and everyone else get 401, and RLS on the seo_* tables
 * refuses them as well.
 *
 * GET  ?preset=7|28|90 | start=&end=, country, device, searchType, dataState
 *      → connection status, performance report (current + previous period with
 *        IDENTICAL filters), keywords with metrics, opportunities, weekly
 *        record, last audit, PageSpeed results, AI suggestions.
 * POST { action: 'keyword_save' | 'keyword_status' | 'keyword_delete' | 'adopt' | 'snapshot', … }
 * Never calls the AI (see /api/admin/seo/suggest).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number, extra: object = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });
const UUID = /^[0-9a-f-]{36}$/i;

function dbFailure(e: unknown) {
  if (e instanceof SeoDbError) return fail(e.message, e.status, e.pending ? { pending: true } : {});
  return fail((e as Error).message?.slice(0, 200) || 'Beklenmeyen hata', 500);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return fail('unauthorized', 401);
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail('Supabase yapılandırılmamış.', 503);
  try {
    const site = await getSite(client);
    const conn = connection(site);
    const keywords = await listKeywords(client, site.id);
    const p = request.nextUrl.searchParams;
    const today = todayIso();
    const filters = normalizeFilters({ country: p.get('country'), device: p.get('device'), searchType: p.get('searchType') ?? 'web', dataState: p.get('dataState') ?? 'final' });
    const preset = (PRESETS as readonly number[]).includes(Number(p.get('preset'))) ? (Number(p.get('preset')) as Preset) : 28;
    let range: DateRange | undefined;
    if (p.get('start') || p.get('end')) {
      const c = customRange(p.get('start'), p.get('end'), today);
      if (!c.ok) return fail(c.error, 400);
      range = c.range;
    }

    let report: Report | null = null;
    let reportError: string | null = null;
    const adapter = adapterFor(conn, today);
    if (adapter) {
      try {
        const key = JSON.stringify([conn.mode, today, filters, preset, range ?? null, keywords.map((k) => [k.keyword, k.status, k.target_path, k.country])]);
        report = await cached(`seo:${key}`, 10 * 60_000, p.get('refresh') === '1', () => buildReport(adapter, { today, filters, preset, range, keywords }));
      } catch (e) {
        reportError = e instanceof GscError ? e.message : 'Search Console verisi alınamadı.';
      }
    }

    const [weekly, auditRun, psi, suggestions] = await Promise.all([
      client.from('seo_weekly').select('week_start, clicks, impressions, ctr, position, days_with_data, data_through, fetched_at, filters').eq('site_id', site.id).eq('dimension', 'total').order('week_start', { ascending: false }).limit(12),
      client.from('seo_audit_runs').select('id, started_at, finished_at, status, pages_planned, pages_checked, limit_reason, source, summary').eq('site_id', site.id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('seo_pagespeed').select('url, strategy, fetched_at, lab_perf_score, lab_lcp_ms, lab_cls, lab_tbt_ms, field_scope, field_lcp_p75_ms, field_inp_p75_ms, field_cls_p75, field_category, source, error').eq('site_id', site.id).order('fetched_at', { ascending: false }).limit(40),
      client.from('seo_ai_suggestions').select('id, kind, subject, suggestion, mock, created_by, created_at').eq('site_id', site.id).order('created_at', { ascending: false }).limit(20),
    ]);
    const run = auditRun.data as { id: string } | null;
    const findings = run ? await client.from('seo_audit_findings').select('url, check_key, severity, message, detail').eq('run_id', run.id).order('id').limit(2000) : { data: [] };
    const weekRows = await client.from('seo_weekly').select('week_start, dimension').eq('site_id', site.id).gte('week_start', ((weekly.data ?? []) as Array<{ week_start: string }>).at(-1)?.week_start ?? '9999-12-31').limit(5000);
    const counts: Record<string, Record<string, number>> = {};
    for (const r of (weekRows.data ?? []) as Array<{ week_start: string; dimension: string }>) {
      counts[r.week_start] ??= {};
      counts[r.week_start][r.dimension] = (counts[r.week_start][r.dimension] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      today,
      site: { domain: site.domain, property: conn.property, clientLinked: Boolean(site.client_id) },
      connection: { mode: conn.mode, fixture: conn.fixture, message: conn.mode === 'none' ? conn.message : null, step: conn.mode === 'none' ? conn.step : null, hosts: conn.hosts },
      filters,
      preset: range ? null : preset,
      report,
      reportError,
      keywords: report ? report.keywords : keywords.map((k) => ({ ...k, metrics: null, prevMetrics: null })),
      weekly: ((weekly.data ?? []) as Array<{ week_start: string }>).map((w) => ({ ...w, counts: counts[w.week_start] ?? {} })),
      audit: run ? { run: auditRun.data, findings: findings.data ?? [] } : null,
      pagespeed: psi.data ?? [],
      suggestions: suggestions.data ?? [],
    });
  } catch (e) {
    return dbFailure(e);
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return fail('unauthorized', 401);
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return fail('Supabase yapılandırılmamış.', 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const site = await getSite(client);
    const conn = connection(site);
    const hosts = conn.hosts;
    const actor = admin.email ?? admin.id;
    const dup = (msg?: string) => (msg && /duplicate|unique|23505/i.test(msg) ? fail('Bu kelime bu dil ve ülke için zaten var.', 409) : null);

    switch (body.action) {
      case 'keyword_save': {
        const v = validateKeyword({ keyword: body.keyword, language: body.language, country: body.country, targetPath: body.targetPath, source: body.source, status: body.status, note: body.note }, hosts);
        if (!v.ok) return fail(v.error, 400);
        const row = { keyword: v.value.keyword, language: v.value.language, country: v.value.country, target_path: v.value.targetPath, status: v.value.status, note: v.value.note, updated_at: new Date().toISOString() };
        if (typeof body.id === 'string' && body.id) {
          if (!UUID.test(body.id)) return fail('bad request', 400);
          const { data, error } = await client.from('seo_keywords').update(row).eq('id', body.id).eq('site_id', site.id).select('id').maybeSingle();
          if (error) return dup(error.message) ?? fail(error.message, 500);
          if (!data) return fail('Kelime bulunamadı.', 404);
          return NextResponse.json({ ok: true, id: (data as { id: string }).id });
        }
        const { data, error } = await client.from('seo_keywords').insert({ ...row, site_id: site.id, source: v.value.source, created_by: actor }).select('id').single();
        if (error) return dup(error.message) ?? fail(error.message, 500);
        return NextResponse.json({ ok: true, id: (data as { id: string }).id });
      }
      case 'keyword_status': {
        const status = body.status === 'active' || body.status === 'paused' ? body.status : null;
        if (!status || typeof body.id !== 'string' || !UUID.test(body.id)) return fail('bad request', 400);
        const { data, error } = await client.from('seo_keywords').update({ status, updated_at: new Date().toISOString() }).eq('id', body.id).eq('site_id', site.id).select('id').maybeSingle();
        if (error) return fail(error.message, 500);
        if (!data) return fail('Kelime bulunamadı.', 404);
        return NextResponse.json({ ok: true });
      }
      case 'keyword_delete': {
        if (typeof body.id !== 'string' || !UUID.test(body.id)) return fail('bad request', 400);
        const { error } = await client.from('seo_keywords').delete().eq('id', body.id).eq('site_id', site.id);
        if (error) return fail(error.message, 500);
        return NextResponse.json({ ok: true });
      }
      case 'adopt': {
        // One click: a Search Console query becomes an ACTIVE target, linked to the page that gets most of its clicks.
        const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
        if (!query) return fail('Sorgu boş.', 400);
        let targetPath = typeof body.targetPath === 'string' && body.targetPath ? body.targetPath : '';
        const adapter = adapterFor(conn, todayIso());
        if (!targetPath && adapter) {
          const today = todayIso();
          const rows = await adapter.query({ range: { start: new Date(Date.parse(today) - 90 * 86_400_000).toISOString().slice(0, 10), end: today }, filters: normalizeFilters({}), dimensions: ['page'], rowLimit: 5, equals: [{ dimension: 'query', expression: normQuery(query) }] }).catch(() => []);
          targetPath = rows[0]?.keys?.[0] ? pathOf(rows[0].keys[0]) : '';
        }
        const language = body.language === 'en' || body.language === 'az' || body.language === 'ar' ? body.language : targetPath.startsWith('/en') ? 'en' : 'tr';
        const v = validateKeyword({ keyword: query, language, country: language === 'tr' ? 'tur' : '', targetPath: targetPath || `/${language}`, source: 'gsc', status: 'active', note: 'Search Console sorgusundan alındı; hedef sayfa en çok tıklanan sayfa (kontrol edin).' }, hosts);
        if (!v.ok) return fail(v.error, 400);
        const { data, error } = await client.from('seo_keywords').insert({ site_id: site.id, keyword: v.value.keyword, language: v.value.language, country: v.value.country, target_path: v.value.targetPath, source: 'gsc', status: 'active', note: v.value.note, created_by: actor }).select('id').single();
        if (error) return dup(error.message) ?? fail(error.message, 500);
        return NextResponse.json({ ok: true, id: (data as { id: string }).id, targetPath: v.value.targetPath });
      }
      case 'snapshot': {
        const adapter = adapterFor(conn, todayIso());
        if (!adapter) return fail(conn.mode === 'none' ? `${conn.message} ${conn.step}` : 'Search Console bağlantısı kurulmadı.', 503);
        const keywords = (await listKeywords(client, site.id)).filter((k) => k.status === 'active').map((k) => ({ keyword: k.keyword, country: k.country }));
        const weeks = await snapshotRecent(adapter, supabaseStore(client as never), site.id, keywords, todayIso());
        return NextResponse.json({ ok: true, weeks, source: adapter.source });
      }
      default:
        return fail('bad request', 400);
    }
  } catch (e) {
    if (e instanceof GscError) return fail(e.message, e.status);
    return dbFailure(e);
  }
}
