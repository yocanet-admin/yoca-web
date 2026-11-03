import { getSupabaseServiceRole } from '@/lib/supabase';
import { mockRequested } from '@/lib/ai/mock';
import type { ModelPrice } from '@/lib/ai/cost';

/**
 * Yoca — AI settings (server only), stored in cockpit_settings key "ai".
 * Friendly presets ("Ekonomik" / "Yüksek kalite") map to technical model ids,
 * separately for text and images. Model ids come from the admin settings, then
 * env (OPENAI_TEXT_MODEL_ECONOMY / _QUALITY, OPENAI_IMAGE_MODEL_ECONOMY /
 * _QUALITY; legacy OPENAI_EDITORIAL_MODEL / OPENAI_IMAGE_MODEL). There is no
 * hard-coded model id: an empty id produces a clear setup message instead.
 * No secret is ever stored here.
 */

export type Preset = 'economy' | 'quality';

export interface AiSettings {
  textPreset: Preset;
  imagePreset: Preset;
  models: { textEconomy: string; textQuality: string; imageEconomy: string; imageQuality: string };
  /** USD per calendar month (UTC). 0 = not set → AI blocked. */
  monthlyBudgetUsd: number;
  /** USD per 1M tokens, editable. */
  prices: Record<string, ModelPrice>;
  pricesNote: string;
  /** Per-request caps. */
  maxOutputTokens: number;
  maxInputChars: number;
  /** Last "Modelleri doğrula" result (ids only). */
  verified: { at: string; available: string[] } | null;
}

/** Prices read from developers.openai.com/api/docs/pricing on 2026-11-03 (standard tier). Estimates only; editable. */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'gpt-6-astra': { input: 10, cachedInput: 1, output: 50 },
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
  'gpt-6.1-terra': { input: 1, cachedInput: 0.05, output: 5 },
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'gpt-image-2.5-sunburst': { input: 5, imageInput: 8, imageOutput: 30 },
  'gpt-image-2.5-flare': { input: 5, imageInput: 8, imageOutput: 30 },
};

const env = (name: string) => (process.env[name] ?? '').trim();

export function defaultAiSettings(): AiSettings {
  const legacyText = env('OPENAI_EDITORIAL_MODEL');
  const legacyImage = env('OPENAI_IMAGE_MODEL');
  return {
    textPreset: 'economy',
    imagePreset: 'economy',
    models: {
      textEconomy: env('OPENAI_TEXT_MODEL_ECONOMY') || legacyText,
      textQuality: env('OPENAI_TEXT_MODEL_QUALITY') || legacyText,
      imageEconomy: env('OPENAI_IMAGE_MODEL_ECONOMY') || legacyImage,
      imageQuality: env('OPENAI_IMAGE_MODEL_QUALITY') || legacyImage,
    },
    monthlyBudgetUsd: Number(env('AI_MONTHLY_BUDGET_USD')) || 0,
    prices: DEFAULT_PRICES,
    pricesNote: 'developers.openai.com/api/docs/pricing, 2026-11-03 tarihinde okundu (standart katman). Tahmin içindir; fatura esastır.',
    maxOutputTokens: 9000,
    maxInputChars: 60_000,
    verified: null,
  };
}

const MODEL_ID = /^[A-Za-z0-9._:-]{0,80}$/;

/** Validate + normalise a partial settings object coming from the admin UI. */
export function sanitizeAiSettings(input: Partial<AiSettings>, current: AiSettings): AiSettings {
  const next: AiSettings = { ...current, models: { ...current.models }, prices: { ...current.prices } };
  if (input.textPreset === 'economy' || input.textPreset === 'quality') next.textPreset = input.textPreset;
  if (input.imagePreset === 'economy' || input.imagePreset === 'quality') next.imagePreset = input.imagePreset;
  if (input.models) {
    for (const k of ['textEconomy', 'textQuality', 'imageEconomy', 'imageQuality'] as const) {
      const v = String(input.models[k] ?? next.models[k]).trim();
      if (MODEL_ID.test(v)) next.models[k] = v;
    }
  }
  if (input.monthlyBudgetUsd !== undefined) {
    const b = Number(input.monthlyBudgetUsd);
    if (Number.isFinite(b) && b >= 0 && b <= 10_000) next.monthlyBudgetUsd = Math.round(b * 100) / 100;
  }
  if (input.prices && typeof input.prices === 'object') {
    const prices: Record<string, ModelPrice> = {};
    for (const [id, p] of Object.entries(input.prices).slice(0, 40)) {
      if (!MODEL_ID.test(id) || !id || !p) continue;
      const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);
      const input = num(p.input);
      if (input === undefined) continue;
      prices[id] = { input, cachedInput: num(p.cachedInput), output: num(p.output), imageInput: num(p.imageInput), imageOutput: num(p.imageOutput) };
    }
    next.prices = prices;
  }
  if (typeof input.pricesNote === 'string') next.pricesNote = input.pricesNote.slice(0, 300);
  if (input.maxOutputTokens !== undefined) next.maxOutputTokens = Math.min(16_000, Math.max(500, Math.round(Number(input.maxOutputTokens) || current.maxOutputTokens)));
  if (input.maxInputChars !== undefined) next.maxInputChars = Math.min(120_000, Math.max(2_000, Math.round(Number(input.maxInputChars) || current.maxInputChars)));
  return next;
}

export async function getAiSettings(): Promise<AiSettings & { ready: boolean }> {
  const base = defaultAiSettings();
  const supabase = getSupabaseServiceRole();
  if (!supabase) return { ...base, ready: false };
  const { data, error } = await supabase.from('cockpit_settings').select('value').eq('key', 'ai').maybeSingle();
  if (error) return { ...base, ready: false };
  const stored = (data?.value ?? {}) as Partial<AiSettings>;
  const merged = sanitizeAiSettings(stored, base);
  // Empty stored model ids fall back to env.
  for (const k of ['textEconomy', 'textQuality', 'imageEconomy', 'imageQuality'] as const) if (!merged.models[k]) merged.models[k] = base.models[k];
  merged.verified = stored.verified ?? null;
  return { ...merged, ready: true };
}

/**
 * Is a model id usable right now? Pure; unit-tested.
 * A preset maps to a model ONLY after "Modelleri doğrula" (GET /v1/models with
 * the server key) listed that id for this key: no guessing, no silent default.
 */
export type ModelCheck = { ok: true; model: string } | { ok: false; code: 'no_model' | 'unverified' | 'model_access'; message: string };

export function checkModel(settings: Pick<AiSettings, 'verified'>, model: string, kind: 'text' | 'image', mock = false): ModelCheck {
  const what = kind === 'text' ? 'Metin' : 'Görsel';
  if (!model) return { ok: false, code: 'no_model', message: `${what} modeli seçilmemiş. Ayarlar → Yapay zekâ → “Modelleri doğrula”, sonra listeden bir model seçin.` };
  if (mock) return { ok: true, model };
  if (!settings.verified || !Array.isArray(settings.verified.available) || settings.verified.available.length === 0) {
    return { ok: false, code: 'unverified', message: `${what} modeli (${model}) henüz doğrulanmadı. Ayarlar → Yapay zekâ → “Modelleri doğrula”: anahtarın erişebildiği modeller listelenmeden yapay zekâ çalışmaz.` };
  }
  if (!settings.verified.available.includes(model)) {
    return { ok: false, code: 'model_access', message: `${what} modeli “${model}” bu anahtarın model listesinde yok (son doğrulama: ${settings.verified.at.slice(0, 10)}). Listeden başka bir model seçin ya da yeniden doğrulayın.` };
  }
  return { ok: true, model };
}

/** The model to use right now for a kind (empty string = not configured). */
export function resolveModel(settings: AiSettings, kind: 'text' | 'image', preset?: Preset): string {
  const p = preset ?? (kind === 'text' ? settings.textPreset : settings.imagePreset);
  const id = kind === 'text' ? (p === 'quality' ? settings.models.textQuality : settings.models.textEconomy) : p === 'quality' ? settings.models.imageQuality : settings.models.imageEconomy;
  if (!id && mockRequested()) return kind === 'text' ? 'mock-text' : 'mock-image';
  return id;
}
