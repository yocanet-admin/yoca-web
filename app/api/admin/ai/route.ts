import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { hasOpenAIKey, listModels, OpenAIError } from '@/lib/ai/openai';
import { mockEnabled, mockRequested } from '@/lib/ai/mock';
import { checkModel, getAiSettings, resolveModel, sanitizeAiSettings, type AiSettings } from '@/lib/ai/settings';
import { monthSpendUsd } from '@/lib/ai/runs';
import { NO_AI_SLOP_SOURCE } from '@/lib/ai/prompts/no-ai-slop';

/**
 * Yoca — AI settings + usage (admin only).
 * GET  → settings (no secrets), whether the key exists (boolean only), mock
 *        state, this month's estimated spend and recent runs.
 * POST { action: 'save', settings } | { action: 'verify' } — "Modelleri doğrula"
 *        calls GET /v1/models with the server key and reports which configured
 *        ids the account can use. Without a key it fails with a clear message.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

async function writeSettings(value: AiSettings, token: string): Promise<boolean> {
  const client = getSupabaseAsUser(token);
  if (!client) return false;
  const { error } = await client.from('cockpit_settings').upsert({ key: 'ai', value, updated_at: new Date().toISOString() });
  return !error;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const settings = await getAiSettings();
  let mock: { requested: boolean; active: boolean; error?: string } = { requested: mockRequested(), active: false };
  try {
    mock = { ...mock, active: mockEnabled() };
  } catch (error) {
    mock = { ...mock, error: (error as Error).message };
  }
  let spend: Awaited<ReturnType<typeof monthSpendUsd>> | null = null;
  let spendError: string | null = null;
  try {
    spend = await monthSpendUsd();
  } catch (error) {
    spendError = (error as Error).message;
  }
  const service = getSupabaseServiceRole();
  const runs = service
    ? ((await service.from('ai_runs').select('id, created_at, action, kind, model, status, tokens_in, tokens_out, tokens_cached, images, est_cost_usd, error, created_by').order('created_at', { ascending: false }).limit(30)).data ?? [])
    : [];
  return NextResponse.json({
    ok: true,
    keyConfigured: hasOpenAIKey(),
    mock,
    settings,
    active: { text: resolveModel(settings, 'text'), image: resolveModel(settings, 'image') },
    activeCheck: {
      text: checkModel(settings, resolveModel(settings, 'text'), 'text', mock.active),
      image: checkModel(settings, resolveModel(settings, 'image'), 'image', mock.active),
    },
    spend,
    spendError,
    runs,
    noAiSlop: NO_AI_SLOP_SOURCE,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { action?: string; settings?: Partial<AiSettings> };
  const current = await getAiSettings();
  if (!current.ready) return NextResponse.json({ ok: false, error: 'Ayarlar okunamadı (SUPABASE_SERVICE_ROLE_KEY ve v9 SQL gerekli).' }, { status: 503 });
  const { ready: _ready, ...stored } = current;
  void _ready;

  if (body.action === 'save') {
    const next = sanitizeAiSettings(body.settings ?? {}, stored);
    next.verified = stored.verified;
    const ok = await writeSettings(next, bearerToken(request));
    return NextResponse.json({ ok, error: ok ? undefined : 'Kaydedilemedi.' });
  }

  if (body.action === 'verify') {
    let mock = false;
    try {
      mock = mockEnabled();
    } catch (error) {
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
    }
    if (!hasOpenAIKey() && !mock) return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY sunucuda tanımlı değil; modeller doğrulanamadı. Anahtarı Vercel’e ekleyip Redeploy edin.' }, { status: 503 });
    try {
      const available = await listModels();
      const configured = Object.entries(stored.models).map(([slot, id]) => ({ slot, id, available: Boolean(id) && available.includes(id) }));
      const next = { ...stored, verified: { at: new Date().toISOString(), available } };
      await writeSettings(next, bearerToken(request));
      return NextResponse.json({ ok: true, configured, availableCount: available.length, available, mock });
    } catch (error) {
      const e = error instanceof OpenAIError ? error : new OpenAIError('Modeller listelenemedi.', 502);
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status });
    }
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
