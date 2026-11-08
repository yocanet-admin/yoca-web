import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { hasOpenAIKey, OpenAIError } from '@/lib/ai/openai';
import { mockEnabled } from '@/lib/ai/mock';
import { checkModel, getAiSettings, resolveModel } from '@/lib/ai/settings';
import { suggest } from '@/lib/seoPanel/ai';
import { getSite, SeoDbError } from '@/lib/seoPanel/server';
import { OPPORTUNITY_LABEL, type OpportunityKind } from '@/lib/seoPanel/model';

/**
 * Yoca Kokpit SEO — "AI önerisi iste" for ONE opportunity row (admin only).
 * Only this explicit POST (one request key per click) calls the AI, through the
 * existing client, model settings, monthly budget and ai_runs ledger. The
 * result is shown in the panel and kept in seo_ai_suggestions; nothing is
 * published or written to Insights, site texts or pages.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let mock = false;
  try {
    mock = mockEnabled();
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
  if (!hasOpenAIKey() && !mock) return NextResponse.json({ ok: false, error: 'Yapay zekâ kurulu değil: sunucuda OPENAI_API_KEY tanımlı değil (Ayarlar → Yapay zekâ).' }, { status: 503 });
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? '') as OpportunityKind;
  if (!(kind in OPPORTUNITY_LABEL)) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 300) : '';
  if (!subject) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  const page = typeof body.page === 'string' ? body.page.slice(0, 300) : undefined;
  const language = body.language === 'en' || (page ?? subject).startsWith('/en') ? 'en' : 'tr';
  const m = body.metrics as { clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown } | undefined;
  const metrics = m && typeof m.impressions === 'number' ? { clicks: Number(m.clicks) || 0, impressions: Number(m.impressions) || 0, ctr: Number(m.ctr) || 0, position: typeof m.position === 'number' ? m.position : null } : undefined;

  let site;
  try {
    site = await getSite(client);
  } catch (e) {
    const err = e instanceof SeoDbError ? e : new SeoDbError('SEO kaydı okunamadı.');
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  const settings = await getAiSettings();
  const check = checkModel(settings, resolveModel(settings, 'text'), 'text', mock);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.message }, { status: 503 });
  try {
    const r = await suggest({ kind, subject, page, language, metrics }, { requestKey: String(body.requestKey ?? ''), createdBy: admin.email ?? admin.id, settings, model: check.model, mock });
    if (!r.replay) await client.from('seo_ai_suggestions').insert({ site_id: site.id, kind, subject, suggestion: r.suggestion, ai_run_id: r.runId || null, mock: r.mock, created_by: admin.email ?? admin.id });
    return NextResponse.json({ ok: true, suggestion: r.suggestion, mock: r.mock });
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError('Yapay zekâ isteği başarısız.', 502);
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
  }
}
