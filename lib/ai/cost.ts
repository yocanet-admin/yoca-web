/**
 * Yoca — AI cost ESTIMATE (pure, no imports; unit-tested).
 * Prices are USD per 1M tokens from an editable table in the AI settings.
 * The result is an estimate from recorded token usage and that table — the
 * OpenAI invoice is the only real figure.
 */

export interface ModelPrice {
  /** Text input per 1M tokens (for image models: text prompt tokens). */
  input: number;
  cachedInput?: number;
  /** Text output per 1M tokens. */
  output?: number;
  /** Image models only. */
  imageInput?: number;
  imageOutput?: number;
}

export interface UsageLike {
  input_tokens?: number;
  cached_tokens?: number;
  output_tokens?: number;
  image_input_tokens?: number;
  text_input_tokens?: number;
  images?: number;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Estimated USD for one call, or null when the model has no price in the table. */
export function estimateCost(usage: UsageLike, price: ModelPrice | undefined | null, kind: 'text' | 'image'): number | null {
  if (!price) return null;
  if (kind === 'text') {
    const input = n(usage.input_tokens);
    const cached = Math.min(n(usage.cached_tokens), input);
    const cost = ((input - cached) * n(price.input) + cached * n(price.cachedInput ?? price.input) + n(usage.output_tokens) * n(price.output)) / 1_000_000;
    return Math.round(cost * 1_000_000) / 1_000_000;
  }
  const textIn = usage.text_input_tokens !== undefined || usage.image_input_tokens !== undefined ? n(usage.text_input_tokens) : n(usage.input_tokens);
  const imageIn = n(usage.image_input_tokens);
  const cost = (textIn * n(price.input) + imageIn * n(price.imageInput) + n(usage.output_tokens) * n(price.imageOutput ?? price.output)) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** First day of the current month (UTC) as ISO — the budget window. */
export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Budget decision: null = allowed; otherwise a Turkish reason. */
export function budgetBlock(spentUsd: number, budgetUsd: number): string | null {
  if (!(budgetUsd > 0)) return 'Aylık yapay zekâ bütçesi girilmemiş. Ayarlar → Yapay zekâ → Aylık bütçe.';
  if (spentUsd >= budgetUsd) return `Bu ayın tahmini yapay zekâ harcaması bütçeye ulaştı (${spentUsd.toFixed(2)} / ${budgetUsd.toFixed(2)} USD, tahmini). Bütçeyi artırın ya da gelecek ayı bekleyin.`;
  return null;
}
