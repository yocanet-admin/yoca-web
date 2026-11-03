import { getSupabaseServiceRole } from '@/lib/supabase';
import { budgetBlock, estimateCost, monthStartIso } from '@/lib/ai/cost';
import { OpenAIError, type OpenAIUsage } from '@/lib/ai/openai';
import type { AiSettings } from '@/lib/ai/settings';

/**
 * Yoca — AI run ledger (server only; table public.ai_runs, upgrade v6 + v14).
 * - Idempotency: the editor sends one key per click. A second request with the
 *   same key never starts a second job: while the first runs it gets 409, after
 *   it finished it gets the stored result back (no new OpenAI call, no new cost).
 * - Budget: before a call, this month's estimated spend is compared with the
 *   monthly budget from the AI settings.
 * - Usage: REAL token/image counts from the API response are stored with an
 *   estimated cost from the editable price table (labelled as an estimate).
 * Requires v14 (idempotency_key, est_cost_usd …). Without it AI is blocked
 * with a setup message — the budget cannot be enforced otherwise.
 */

export const RUNNING_STALE_MS = 10 * 60 * 1000;

export interface RunStart {
  action: string;
  kind: 'text' | 'image';
  model: string;
  insightId?: string | null;
  locale?: string | null;
  createdBy: string;
  idempotencyKey: string;
}

export type StartOutcome = { kind: 'started'; runId: string } | { kind: 'replay'; result: unknown; status: string; error?: string | null };

function db() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new OpenAIError('Sunucu anahtarı (SUPABASE_SERVICE_ROLE_KEY) yok: yapay zekâ kullanımı kaydedilemiyor, bu yüzden kapalı.', 503, 'server');
  return supabase;
}

export async function monthSpendUsd(): Promise<{ spent: number; runs: number; text: number; images: number }> {
  const { data, error } = await db().from('ai_runs').select('est_cost_usd, kind, images, status').gte('created_at', monthStartIso());
  if (error) throw new OpenAIError('Yapay zekâ kayıt tablosu güncel değil (supabase/upgrade-v14-content.sql çalıştırılmalı).', 503, 'server');
  let spent = 0;
  let text = 0;
  let images = 0;
  for (const row of (data ?? []) as Array<{ est_cost_usd: number | null; kind: string | null; images: number | null; status: string }>) {
    spent += Number(row.est_cost_usd ?? 0);
    if (row.status === 'ok' || row.status === 'error') {
      if (row.kind === 'image') images += Number(row.images ?? 0);
      else text += 1;
    }
  }
  return { spent: Math.round(spent * 10_000) / 10_000, runs: (data ?? []).length, text, images };
}

/** Budget check + idempotent start. */
export async function startRun(input: RunStart, settings: AiSettings, mock: boolean): Promise<StartOutcome> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(input.idempotencyKey)) throw new OpenAIError('İstek anahtarı eksik.', 400, 'bad_request');
  const supabase = db();
  if (!mock) {
    const { spent } = await monthSpendUsd();
    const blocked = budgetBlock(spent, settings.monthlyBudgetUsd);
    if (blocked) throw new OpenAIError(blocked, 402, 'budget');
  }
  const { data, error } = await supabase
    .from('ai_runs')
    .insert({
      action: input.action,
      kind: input.kind,
      model: input.model || '-',
      insight_id: input.insightId ?? null,
      locale: input.locale ?? null,
      status: 'running',
      created_by: input.createdBy,
      idempotency_key: input.idempotencyKey,
    })
    .select('id')
    .single();
  if (!error && data) return { kind: 'started', runId: (data as { id: string }).id };
  if (error?.code !== '23505') throw new OpenAIError(`Yapay zekâ kaydı açılamadı (${error?.message ?? 'bilinmeyen'}). v14 SQL çalıştırıldı mı?`, 503, 'server');
  // Same key again (double click / retry of the same click).
  const existing = await supabase.from('ai_runs').select('id, status, result, error, created_at').eq('idempotency_key', input.idempotencyKey).maybeSingle();
  const row = existing.data as { id: string; status: string; result: unknown; error: string | null; created_at: string } | null;
  if (!row) throw new OpenAIError('İstek durumu okunamadı.', 503, 'server');
  if (row.status === 'running' && Date.now() - Date.parse(row.created_at) < RUNNING_STALE_MS) {
    throw new OpenAIError('Bu işlem zaten çalışıyor; tamamlanmasını bekleyin.', 409, 'bad_request');
  }
  return { kind: 'replay', result: row.result, status: row.status, error: row.error };
}

export async function finishRun(
  runId: string,
  outcome: { status: 'ok' | 'error' | 'mock'; usage?: OpenAIUsage; model: string; kind: 'text' | 'image'; settings: AiSettings; result?: unknown; error?: string; requestId?: string; startedAt: number },
): Promise<{ estCostUsd: number | null }> {
  const usage = outcome.usage ?? {};
  const est = outcome.status === 'mock' ? 0 : estimateCost(usage, outcome.settings.prices[outcome.model], outcome.kind);
  await db()
    .from('ai_runs')
    .update({
      status: outcome.status,
      tokens_in: usage.input_tokens ?? null,
      tokens_out: usage.output_tokens ?? null,
      tokens_cached: usage.cached_tokens ?? null,
      tokens_reasoning: usage.reasoning_tokens ?? null,
      images: usage.images ?? null,
      est_cost_usd: est,
      request_id: outcome.requestId ?? null,
      duration_ms: Date.now() - outcome.startedAt,
      result: outcome.result ?? null,
      error: outcome.error ? outcome.error.slice(0, 500) : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .then(
      () => undefined,
      () => undefined,
    );
  return { estCostUsd: est };
}
