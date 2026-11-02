import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { draftReply, summarizeLead, type LeadForAI } from '@/lib/ai/leads';
import { MODELS, OpenAIError } from '@/lib/ai/openai';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca cockpit — AI lead summary / reply draft (admin only).
 * POST { type: 'contact' | 'checkup', id, mode: 'summary' | 'reply' }
 * The summary is saved on the lead (ai_summary); the reply draft is returned
 * for the admin to edit and send. Every call is logged to ai_runs.
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
    name: String(info?.name ?? ''),
    company: String(info?.company ?? ''),
    email: String(info?.email ?? ''),
    phone: String(info?.phone ?? ''),
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
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: 'Yapay zekâ kurulu değil: Vercel’e OPENAI_API_KEY ekleyin (Ayarlar sayfası).' });
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

  const log = (status: string, usage?: { input_tokens?: number; output_tokens?: number }, error?: string) =>
    supabase
      .from('ai_runs')
      .insert({
        action: `lead_${mode}`,
        model: MODELS.editorial,
        locale: lead.locale || null,
        status,
        created_by: admin.email ?? null,
        tokens_in: usage?.input_tokens ?? null,
        tokens_out: usage?.output_tokens ?? null,
        error: error ? error.slice(0, 500) : null,
      })
      .then(
        () => undefined,
        () => undefined,
      );

  try {
    if (mode === 'summary') {
      const result = await summarizeLead(lead);
      const summary = { ...result.data, uygunluk: Math.min(5, Math.max(1, Math.round(result.data.uygunluk))) };
      const at = new Date().toISOString();
      await supabase.from(table).update({ ai_summary: summary, ai_summary_at: at }).eq('id', body.id);
      await log('ok', result.usage);
      return NextResponse.json({ ok: true, summary, at });
    }
    const result = await draftReply(lead);
    await log('ok', result.usage);
    return NextResponse.json({ ok: true, reply: result.data });
  } catch (error) {
    const message = error instanceof OpenAIError ? error.message : 'Yapay zekâ isteği başarısız.';
    await log('error', undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
