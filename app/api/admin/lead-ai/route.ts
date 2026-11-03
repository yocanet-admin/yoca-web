import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { draftReply, summarizeLead, type LeadForAI } from '@/lib/ai/leads';
import { hasOpenAIKey, OpenAIError } from '@/lib/ai/openai';
import { mockEnabled } from '@/lib/ai/mock';
import { checkModel, getAiSettings, resolveModel } from '@/lib/ai/settings';
import { finishRun, startRun } from '@/lib/ai/runs';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — AI lead summary / reply draft (admin only).
 * POST { type: 'contact' | 'checkup', id, mode: 'summary' | 'reply' }
 * The summary is saved on the lead (ai_summary); the reply draft is returned
 * for the admin to edit and send. Every call is logged to ai_runs with real
 * usage and the monthly budget applies.
 * This explicit admin click is the ONLY path by which a submission reaches
 * OpenAI. E-mail and phone are not sent; e-mail addresses / phone numbers
 * inside the message are redacted (lib/ai/leads.ts).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => t > now - 3_600_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 60;
}

type Row = Record<string, unknown>;

function toLead(row: Row, type: 'contact' | 'checkup'): LeadForAI {
  const info = (type === 'checkup' ? row.contact_info_json : row) as Row;
  const answers = type === 'checkup' ? Object.entries((row.data_json ?? {}) as Record<string, { v?: string }>).map(([k, a]) => [k, String(a?.v ?? '')] as [string, string]) : [];
  return {
    type,
    firstName: String(info?.name ?? '').trim().split(/\s+/)[0]?.slice(0, 40) ?? '',
    company: String(info?.company ?? ''),
    locale: String(info?.locale ?? ''),
    message: type === 'contact' ? String(row.message ?? '') : '',
    answers,
    score: typeof info?.score === 'number' ? (info.score as number) : null,
    note: String(row.note ?? ''),
  };
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let mock = false;
  try {
    mock = mockEnabled();
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
  if (!hasOpenAIKey() && !mock) return NextResponse.json({ ok: false, error: 'Yapay zekâ kurulu değil: Vercel’e OPENAI_API_KEY ekleyin (Ayarlar sayfası).' });
  if (rateLimited(admin.id)) return NextResponse.json({ ok: false, error: 'Saatlik sınır doldu, biraz sonra tekrar deneyin.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { type?: string; id?: string; mode?: string };
  const type = body.type === 'checkup' ? 'checkup' : body.type === 'contact' ? 'contact' : null;
  const mode = body.mode === 'reply' ? 'reply' : body.mode === 'summary' ? 'summary' : null;
  if (!type || !mode || !body.id) return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase not configured' }, { status: 503 });
  const table = type === 'contact' ? 'contact_submissions' : 'checkup_submissions';
  const { data: row } = await supabase.from(table).select('*').eq('id', body.id).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: 'Lead bulunamadı.' }, { status: 404 });
  const lead = toLead(row as Row, type);

  const settings = await getAiSettings();
  const check = checkModel(settings, resolveModel(settings, 'text'), 'text', mock);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.message }, { status: 503 });
  const model = check.model;
  // One job per lead + mode per minute: a double click never starts a second call.
  const idempotencyKey = `lead-${mode}-${String(body.id).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)}-${Math.floor(Date.now() / 60_000)}`;
  const startedAt = Date.now();
  let runId: string;
  try {
    const start = await startRun({ action: `lead_${mode}`, kind: 'text', model, locale: lead.locale || null, createdBy: admin.email ?? admin.id, idempotencyKey }, settings, mock);
    if (start.kind === 'replay') {
      if (start.status === 'error' || !start.result) return NextResponse.json({ ok: false, error: start.error ?? 'Önceki deneme başarısız oldu; bir dakika sonra tekrar deneyin.' }, { status: 409 });
      return NextResponse.json({ ok: true, ...(start.result as object) });
    }
    runId = start.runId;
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError('Yapay zekâ isteği başlatılamadı.', 500);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }

  try {
    if (mode === 'summary') {
      const result = await summarizeLead(model, lead);
      const summary = { ...result.data, uygunluk: Math.min(5, Math.max(1, Math.round(result.data.uygunluk))) };
      const at = new Date().toISOString();
      await supabase.from(table).update({ ai_summary: summary, ai_summary_at: at }).eq('id', body.id);
      await finishRun(runId, { status: result.mock ? 'mock' : 'ok', usage: result.usage, model, kind: 'text', settings, result: { summary, at }, requestId: result.requestId, startedAt });
      return NextResponse.json({ ok: true, summary, at });
    }
    const result = await draftReply(model, lead);
    await finishRun(runId, { status: result.mock ? 'mock' : 'ok', usage: result.usage, model, kind: 'text', settings, result: { reply: result.data }, requestId: result.requestId, startedAt });
    return NextResponse.json({ ok: true, reply: result.data });
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError('Yapay zekâ isteği başarısız.', 502);
    await finishRun(runId, { status: 'error', usage: (error as { usage?: object }).usage, model, kind: 'text', settings, error: e.message, startedAt });
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
  }
}
