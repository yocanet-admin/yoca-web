import { mockEnabled, mockPng, mockStructured } from '@/lib/ai/mock';

/**
 * Yoca — OpenAI client (server only; plain fetch, no SDK).
 *
 * Checked against the official docs (developers.openai.com, read 2026-11-03):
 *  - Responses API: POST /v1/responses with top-level `instructions` (system /
 *    developer message) and `input`; structured output via
 *    text.format = { type: 'json_schema', name, schema, strict: true };
 *    output items of type "message" carry `output_text` or `refusal` content;
 *    `store: false` so prompts and drafts are not kept for later retrieval.
 *    A response can come back with status "incomplete" (e.g. max_output_tokens)
 *    — that is treated as an error, never as a truncated draft.
 *  - Image API: POST /v1/images/generations and POST /v1/images/edits (JSON,
 *    `images: [{ image_url }]`), base64 output in data[].b64_json, token usage
 *    in `usage`. GPT Image models may need API organisation verification.
 *  - Models: GET /v1/models lists the models the key can use.
 * The key (OPENAI_API_KEY) is read here only and never leaves the server: it is
 * not returned by any route, not stored in settings and not logged.
 * Model ids are NEVER defaulted here — they come from lib/ai/settings.ts
 * (admin settings → env), so a wrong guess cannot hide behind a default.
 */

const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

export interface OpenAIUsage {
  input_tokens?: number;
  cached_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  /** Image API: tokens split, when reported. */
  image_input_tokens?: number;
  text_input_tokens?: number;
  images?: number;
}

export interface OpenAIResult<T> {
  data: T;
  usage: OpenAIUsage;
  requestId?: string;
  raw?: unknown;
  mock?: boolean;
}

export type OpenAIErrorCode =
  | 'no_key'
  | 'no_model'
  | 'auth'
  | 'model_access'
  | 'org_verification'
  | 'rate_limit'
  | 'quota'
  | 'timeout'
  | 'network'
  | 'incomplete'
  | 'refusal'
  | 'invalid_output'
  | 'bad_request'
  | 'server'
  | 'budget'
  | 'no_price'
  | 'mock_refused';

export class OpenAIError extends Error {
  status: number;
  code: OpenAIErrorCode;
  requestId?: string;
  constructor(message: string, status: number, code: OpenAIErrorCode = 'server', requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Is a key configured? (Value is never exposed.) */
export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new OpenAIError('Yapay zekâ kurulu değil: OPENAI_API_KEY sunucuda tanımlı değil (Vercel → Settings → Environment Variables, sonra Redeploy).', 503, 'no_key');
  return k;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
export const MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Map an OpenAI HTTP error to a clear Turkish message + code. */
export function describeError(status: number, message: string, model?: string): { message: string; code: OpenAIErrorCode } {
  const m = message || `OpenAI hatası (HTTP ${status})`;
  if (status === 401) return { message: 'OpenAI anahtarı geçersiz veya iptal edilmiş (401). Vercel’deki OPENAI_API_KEY değerini kontrol edin.', code: 'auth' };
  if (/verif/i.test(m)) return { message: 'Bu model için OpenAI organizasyon doğrulaması gerekiyor (platform.openai.com → Settings → Organization → Verify). Doğrulama tamamlanana kadar görsel üretilemez.', code: 'org_verification' };
  if (status === 404 || /model.*(not exist|not found|does not have access)/i.test(m)) return { message: `Model bulunamadı ya da hesabın bu modele erişimi yok${model ? `: ${model}` : ''}. Ayarlar → Yapay zekâ → “Modelleri doğrula”.`, code: 'model_access' };
  if (status === 403) return { message: `OpenAI bu isteğe izin vermedi (403): ${m}`, code: 'model_access' };
  if (status === 429 && /quota|billing|insufficient/i.test(m)) return { message: 'OpenAI hesabında kota/bakiye yetersiz (429). Faturalandırma ayarlarını kontrol edin.', code: 'quota' };
  if (status === 429) return { message: 'OpenAI hız sınırına takıldı (429). Biraz sonra tekrar deneyin.', code: 'rate_limit' };
  if (status >= 500) return { message: `OpenAI geçici hata verdi (HTTP ${status}). Metniniz değişmedi; tekrar deneyebilirsiniz.`, code: 'server' };
  return { message: `OpenAI isteği reddetti (HTTP ${status}): ${m}`, code: 'bad_request' };
}

interface RawResponse {
  status: number;
  payload: Record<string, unknown>;
  requestId?: string;
}

/** POST/GET with timeout and limited retries (429/5xx/network only; never infinite). */
async function request(path: string, init: { method: 'GET' | 'POST'; body?: unknown; timeoutMs: number; model?: string }): Promise<RawResponse> {
  const apiKey = key();
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method: init.method,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      clearTimeout(timer);
      const timedOut = error instanceof Error && error.name === 'AbortError';
      // A timed-out generation may still be billed; do not retry it automatically.
      if (!timedOut && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(1000 * 3 ** (attempt - 1));
        continue;
      }
      throw new OpenAIError(timedOut ? 'OpenAI zamanında yanıt vermedi. Metniniz değişmedi; tekrar deneyebilirsiniz.' : 'OpenAI’ye ulaşılamadı (ağ hatası).', 504, timedOut ? 'timeout' : 'network');
    }
    clearTimeout(timer);
    const requestId = res.headers.get('x-request-id') ?? undefined;
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { status: res.status, payload, requestId };
    const apiMessage = String((payload.error as { message?: string } | undefined)?.message ?? '');
    const quota = res.status === 429 && /quota|billing|insufficient/i.test(apiMessage);
    if (RETRYABLE.has(res.status) && !quota && attempt < MAX_RETRIES) {
      attempt += 1;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Math.min(10_000, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 3 ** (attempt - 1)));
      continue;
    }
    const { message, code } = describeError(res.status, apiMessage, init.model);
    throw new OpenAIError(message, res.status, code, requestId);
  }
}

// ── Responses API (text) ─────────────────────────────────────────

interface TextOptions {
  model: string;
  /** System/developer instructions (top-level `instructions`). */
  system: string;
  /** User input. Untrusted material must already be fenced by the caller. */
  user: string;
  schema?: { name: string; schema: Record<string, unknown> };
  tools?: Array<Record<string, unknown>>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/** Concatenated output_text (and any refusal) from a Responses payload. */
export function parseResponseOutput(payload: unknown): { text: string; refusal: string | null } {
  const p = payload as { output_text?: string; output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }> };
  const parts: string[] = [];
  let refusal: string | null = null;
  for (const item of p.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && c.text) parts.push(c.text);
      if (c.type === 'refusal') refusal = c.refusal ?? 'refused';
    }
  }
  const text = parts.length ? parts.join('\n') : typeof p.output_text === 'string' ? p.output_text : '';
  return { text, refusal };
}

/** Responses usage → our usage shape. */
export function parseUsage(raw: unknown): OpenAIUsage {
  const u = (raw ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number; image_tokens?: number; text_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cached_tokens: u.input_tokens_details?.cached_tokens,
    reasoning_tokens: u.output_tokens_details?.reasoning_tokens,
    image_input_tokens: u.input_tokens_details?.image_tokens,
    text_input_tokens: u.input_tokens_details?.text_tokens,
  };
}

/** Web-search citations (url_citation annotations) — the model DID read these during the call. */
export function outputCitations(payload: unknown): Array<{ url: string; title: string }> {
  const p = payload as { output?: Array<{ type: string; content?: Array<{ annotations?: Array<{ type: string; url?: string; title?: string }> }> }> };
  const out: Array<{ url: string; title: string }> = [];
  for (const item of p.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) for (const a of c.annotations ?? []) if (a.type === 'url_citation' && a.url) out.push({ url: a.url, title: a.title ?? '' });
  }
  return out;
}

export async function callOpenAI<T = string>(opts: TextOptions): Promise<OpenAIResult<T>> {
  if (!opts.model) throw new OpenAIError('Metin modeli seçilmemiş. Ayarlar → Yapay zekâ bölümünden bir model seçin ve “Modelleri doğrula”yı çalıştırın.', 503, 'no_model');
  if (mockEnabled()) {
    const data = (opts.schema ? mockStructured(opts.schema.name, opts.user) : 'Mock metin (AI_MOCK=1).') as T;
    // With a web_search tool, also return one fake url_citation so the citation flow can be tested.
    const raw = opts.tools?.length ? { output: [{ type: 'message', content: [{ type: 'output_text', text: String(data), annotations: [{ type: 'url_citation', url: 'https://example.com/mock-kaynak', title: 'Mock kaynak' }] }] }] } : undefined;
    return { data, usage: { input_tokens: 0, output_tokens: 0 }, mock: true, raw };
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    instructions: opts.system,
    input: [{ role: 'user', content: opts.user }],
    max_output_tokens: opts.maxOutputTokens ?? 4000,
    store: false,
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.schema) body.text = { format: { type: 'json_schema', name: opts.schema.name, schema: opts.schema.schema, strict: true } };

  const { payload, requestId } = await request('/responses', { method: 'POST', body, timeoutMs: opts.timeoutMs ?? 120_000, model: opts.model });
  const usage = parseUsage(payload.usage);
  if (payload.status === 'incomplete') {
    const reason = String((payload.incomplete_details as { reason?: string } | undefined)?.reason ?? 'unknown');
    throw Object.assign(new OpenAIError(reason === 'max_output_tokens' ? 'Yanıt uzunluk sınırına takıldı ve yarım kaldı; hiçbir şey uygulanmadı. Daha kısa bir uzunluk seçin.' : `Yanıt tamamlanmadı (${reason}); hiçbir şey uygulanmadı.`, 502, 'incomplete', requestId), { usage });
  }
  if (payload.status === 'failed') throw Object.assign(new OpenAIError('OpenAI yanıtı başarısız oldu; hiçbir şey uygulanmadı.', 502, 'server', requestId), { usage });
  const { text, refusal } = parseResponseOutput(payload);
  if (refusal) throw Object.assign(new OpenAIError(`Model isteği yanıtlamadı: ${refusal.slice(0, 200)}`, 422, 'refusal', requestId), { usage });
  if (!text) throw Object.assign(new OpenAIError('OpenAI boş yanıt döndürdü.', 502, 'invalid_output', requestId), { usage });
  let data: T;
  if (opts.schema) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw Object.assign(new OpenAIError('OpenAI geçersiz yapılandırılmış çıktı döndürdü.', 502, 'invalid_output', requestId), { usage });
    }
  } else data = text as unknown as T;
  return { data, usage, requestId, raw: payload };
}

// ── Image API ────────────────────────────────────────────────────

export interface ImageOptions {
  model: string;
  prompt: string;
  size?: string; // e.g. 1536x1024
  quality?: 'low' | 'medium' | 'high' | 'auto';
  timeoutMs?: number;
}

function imageResult(payload: Record<string, unknown>, requestId?: string): OpenAIResult<Buffer> {
  const data = payload.data as Array<{ b64_json?: string }> | undefined;
  const b64 = data?.[0]?.b64_json;
  if (!b64) throw new OpenAIError('Görsel boş döndü.', 502, 'invalid_output', requestId);
  return { data: Buffer.from(b64, 'base64'), usage: { ...parseUsage(payload.usage), images: 1 }, requestId };
}

export async function generateImage(opts: ImageOptions): Promise<OpenAIResult<Buffer>> {
  if (!opts.model) throw new OpenAIError('Görsel modeli seçilmemiş. Ayarlar → Yapay zekâ → Görsel modeli.', 503, 'no_model');
  if (mockEnabled()) return { data: mockPng(96, 64, opts.prompt.length), usage: { images: 1, input_tokens: 0, output_tokens: 0 }, mock: true };
  const { payload, requestId } = await request('/images/generations', {
    method: 'POST',
    body: { model: opts.model, prompt: opts.prompt.slice(0, 30_000), size: opts.size ?? '1536x1024', quality: opts.quality ?? 'medium', output_format: 'png', n: 1 },
    timeoutMs: opts.timeoutMs ?? 180_000,
    model: opts.model,
  });
  return imageResult(payload, requestId);
}

/** Edit one existing image with an instruction (Image API edits, JSON body with a data URL). */
export async function editImage(opts: ImageOptions & { image: Buffer; mime: string }): Promise<OpenAIResult<Buffer>> {
  if (!opts.model) throw new OpenAIError('Görsel modeli seçilmemiş.', 503, 'no_model');
  if (mockEnabled()) return { data: mockPng(96, 64, opts.prompt.length + 1), usage: { images: 1, input_tokens: 0, output_tokens: 0 }, mock: true };
  const { payload, requestId } = await request('/images/edits', {
    method: 'POST',
    body: {
      model: opts.model,
      prompt: opts.prompt.slice(0, 30_000),
      images: [{ image_url: `data:${opts.mime};base64,${opts.image.toString('base64')}` }],
      size: opts.size ?? 'auto',
      quality: opts.quality ?? 'medium',
      output_format: 'png',
      n: 1,
    },
    timeoutMs: opts.timeoutMs ?? 180_000,
    model: opts.model,
  });
  return imageResult(payload, requestId);
}

// ── Models ───────────────────────────────────────────────────────

export async function listModels(): Promise<string[]> {
  if (mockEnabled()) return ['mock-text-economy', 'mock-text-quality', 'mock-image'];
  const { payload } = await request('/models', { method: 'GET', timeoutMs: 20_000 });
  const data = (payload.data as Array<{ id?: string }> | undefined) ?? [];
  return data.map((m) => String(m.id ?? '')).filter(Boolean).sort();
}
