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

/**
 * Monthly usage THRESHOLD decision (not a hard spend limit): null = allowed;
 * otherwise a Turkish reason. It compares the ESTIMATED spend recorded so far
 * this month; jobs still running and jobs started at the same time are not in
 * that sum yet, so the real total can end up above the threshold.
 */
export function budgetBlock(spentUsd: number, budgetUsd: number): string | null {
  if (!(budgetUsd > 0)) return 'Aylık tahmini kullanım eşiği girilmemiş (0 = yapay zekâ kapalı). Ayarlar → Yapay zekâ → Aylık tahmini kullanım eşiği.';
  if (spentUsd >= budgetUsd) return `Bu ayın tahmini yapay zekâ kullanımı eşiğe ulaştı (${spentUsd.toFixed(2)} / ${budgetUsd.toFixed(2)} USD, tahmini). Eşik her ay (UTC) sıfırlanır; eşiği değiştirmek Ayarlar → Yapay zekâ bölümündedir.`;
  return null;
}

/**
 * A paid call is allowed only when the model has a row in the price table:
 * without a price its cost cannot be estimated, and counting it as 0 USD would
 * hide it from the monthly threshold. null = allowed.
 */
export function priceBlock(model: string, prices: Record<string, ModelPrice> | undefined | null): string | null {
  if (model && prices && prices[model]) return null;
  return `“${model || '—'}” modelinin fiyatı fiyat tablosunda yok. Maliyeti hesaplanamadığı için bu modelle ücretli üretim kapalı. Ayarlar → Yapay zekâ → Gelişmiş → Fiyat tablosuna bu model için bir satır ekleyip kaydedin.`;
}
