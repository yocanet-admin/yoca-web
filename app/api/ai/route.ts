import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { editImage, generateImage, hasOpenAIKey, OpenAIError, type OpenAIResult, type OpenAIUsage } from '@/lib/ai/openai';
import { mockEnabled } from '@/lib/ai/mock';
import { checkModel, getAiSettings, resolveModel, type AiSettings, type Preset } from '@/lib/ai/settings';
import { finishRun, startRun } from '@/lib/ai/runs';
import { fetchSources, type FetchedSource } from '@/lib/ai/sources';
import {
  coverBrief,
  faqPack,
  generateDraft,
  repurpose,
  rewriteSelection,
  seoPack,
  sourceCheck,
  styleEdit,
  styleReview,
  titleOptions,
  topicIdeas,
  translateArticle,
  webResearch,
  type StudioBrief,
} from '@/lib/ai/editorial';
import { buildEditPrompt, buildImagePrompt, imageSize, readDraftImage, storeDraftImage } from '@/lib/ai/images';

/**
 * Yoca — admin AI endpoint (server only).
 * - Every request: valid session + ADMIN_EMAILS (optional) + database is_admin()
 *   (requireAdmin). The OpenAI key never leaves the server.
 * - Per-user rate limit, request size cap, per-request token caps, monthly
 *   budget, idempotency key per click (double clicks never start a second job),
 *   limited retries inside the client (no fix loops).
 * - Never publishes and never overwrites article text: text results come back
 *   as proposals and full-text proposals are also stored as an "ai_proposal"
 *   revision; images go to the private draft bucket. On any error nothing in
 *   the article changes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const hits = new Map<string, number[]>();
const RATE_LIMIT = 60; // requests per user per hour
const MAX_RAW = 250_000; // bytes of JSON per request

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((ts) => ts > now - 3_600_000);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  hits.set(userId, list);
  return false;
}

const LOCALES = new Set(['en', 'tr', 'az', 'ar']);
const TEXT_ACTIONS = new Set(['ideas', 'research', 'draft', 'rewrite', 'titles', 'source_check', 'style_review', 'style_edit', 'seo', 'translate', 'faq', 'repurpose', 'cover_brief']);
const IMAGE_ACTIONS = new Set(['image_generate', 'image_edit']);

type Payload = Record<string, unknown>;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const urls = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 2000)).slice(0, 10) : []);

async function saveProposal(insightId: string, runId: string, createdBy: string, reason: string, data: { title: string; excerpt: string; body_md: string; extra?: Record<string, unknown> }): Promise<string | null> {
  const supabase = getSupabaseServiceRole();
  if (!supabase || !/^[0-9a-f-]{36}$/.test(insightId)) return null;
  const { data: row } = await supabase
    .from('insight_revisions')
    .insert({ insight_id: insightId, title: data.title.slice(0, 300), excerpt: data.excerpt.slice(0, 1000), body_md: data.body_md, reason, kind: 'ai_proposal', data: data.extra ?? {}, created_by: createdBy, ai_run_id: runId })
    .select('id')
    .single();
  return (row as { id: string } | null)?.id ?? null;
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (rateLimited(user.id)) return NextResponse.json({ ok: false, error: 'Saatlik yapay zekâ sınırı doldu; biraz sonra tekrar deneyin.' }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_RAW) return NextResponse.json({ ok: false, error: 'İstek çok büyük. Metni kısaltın.' }, { status: 413 });
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const action = String(payload.action ?? '');
  const locale = LOCALES.has(String(payload.locale)) ? String(payload.locale) : 'tr';
  const insightId = /^[0-9a-f-]{36}$/.test(String(payload.insightId ?? '')) ? String(payload.insightId) : null;
  const createdBy = user.email ?? user.id;

  let mock = false;
  try {
    mock = mockEnabled();
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message, code: 'mock_refused' }, { status: 503 });
  }

  // Source fetching does not call OpenAI (no budget, no run).
  if (action === 'fetch_sources') {
    const fetched = await fetchSources(urls(payload.urls));
    return NextResponse.json({ ok: true, result: { sources: fetched.map(({ text, ...rest }) => ({ ...rest, preview: text?.slice(0, 600) ?? '' })) } });
  }

  const kind: 'text' | 'image' | null = TEXT_ACTIONS.has(action) ? 'text' : IMAGE_ACTIONS.has(action) ? 'image' : null;
  if (!kind) return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
  if (!hasOpenAIKey() && !mock) return NextResponse.json({ ok: false, code: 'no_key', error: 'Yapay zekâ kurulu değil: OPENAI_API_KEY sunucuda tanımlı değil (Vercel → Environment Variables, sonra Redeploy). Ayarlar → Yapay zekâ bölümünde durum görünür.' }, { status: 503 });

  const settings: AiSettings = await getAiSettings();
  const preset = payload.preset === 'quality' || payload.preset === 'economy' ? (payload.preset as Preset) : undefined;
  const check = checkModel(settings, resolveModel(settings, kind, preset), kind, mock);
  if (!check.ok) return NextResponse.json({ ok: false, code: check.code, error: check.message }, { status: 503 });
  const model = check.model;
  const cap = settings.maxInputChars;

  const startedAt = Date.now();
  let runId: string;
  try {
    const start = await startRun({ action, kind, model, insightId, locale, createdBy, idempotencyKey: String(payload.requestKey ?? '') }, settings, mock);
    if (start.kind === 'replay') {
      if (start.status === 'error') return NextResponse.json({ ok: false, error: start.error ?? 'Bu istek daha önce başarısız oldu; yeniden deneyin.', replay: true }, { status: 409 });
      return NextResponse.json({ ok: true, result: start.result, replay: true });
    }
    runId = start.runId;
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError('Yapay zekâ isteği başlatılamadı.', 500);
    return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: e.status });
  }

  let usage: OpenAIUsage = {};
  let requestId: string | undefined;
  let wasMock = mock;
  const take = <T,>(r: OpenAIResult<T>): T => {
    usage = r.usage;
    requestId = r.requestId;
    wasMock = wasMock || Boolean(r.mock);
    return r.data;
  };

  try {
    let result: unknown;
    let proposalId: string | null = null;
    switch (action) {
      case 'ideas':
        result = { ideas: take(await topicIdeas(model, { topic: str(payload.topic, 2000), reader: str(payload.reader, 300), goal: str(payload.goal, 300), service: str(payload.service, 100), locale })) };
        break;
      case 'research': {
        // Optional web search. Citations come back as "not read by the server";
        // nothing here is fed into a draft automatically.
        const topic = str(payload.topic, 500);
        if (!topic.trim()) throw new OpenAIError('Konu gerekli.', 400, 'bad_request');
        result = take(await webResearch(model, topic, locale));
        break;
      }
      case 'draft': {
        const brief: StudioBrief = {
          topic: str(payload.topic, 2000),
          reader: str(payload.reader, 300),
          locale,
          length: (['short', 'standard', 'deep'] as const).includes(payload.length as 'short') ? (payload.length as StudioBrief['length']) : 'standard',
          notes: str(payload.notes, cap / 2),
          existingText: str(payload.existingText, cap / 2),
          goal: str(payload.goal, 300) || undefined,
          service: str(payload.service, 100) || undefined,
          keyword: str(payload.keyword, 200) || undefined,
          tone: str(payload.tone, 40) || undefined,
          cta: str(payload.cta, 300) || undefined,
        };
        if (!brief.topic.trim()) throw new OpenAIError('Konu gerekli.', 400, 'bad_request');
        const fetched: FetchedSource[] = await fetchSources(urls(payload.sourceUrls));
        brief.sources = fetched;
        const draft = take(await generateDraft(model, brief, settings.maxOutputTokens));
        result = { draft, sources: fetched.map(({ text: _t, ...rest }) => (void _t, rest)) };
        if (insightId) proposalId = await saveProposal(insightId, runId, createdBy, 'AI taslak önerisi', { title: draft.title, excerpt: draft.excerpt, body_md: draft.body, extra: { seo_title: draft.seoTitle, meta_description: draft.metaDescription, tags: draft.suggestedTags, faq: draft.faq } });
        break;
      }
      case 'rewrite': {
        const selection = str(payload.selection, cap);
        if (!selection.trim()) throw new OpenAIError('Önce editörde bir bölüm seçin.', 400, 'bad_request');
        const mode = payload.mode === 'simplify' ? 'simplify' : 'rewrite';
        result = { text: take(await rewriteSelection(model, mode, selection, str(payload.context, cap), locale, str(payload.instruction, 500) || undefined)) };
        break;
      }
      case 'titles':
        result = { titles: take(await titleOptions(model, str(payload.title, 300), str(payload.excerpt, 1000), str(payload.body, cap), locale)) };
        break;
      case 'style_review': {
        const text = str(payload.text, cap);
        if (!text.trim()) throw new OpenAIError('İncelenecek metin yok.', 400, 'bad_request');
        result = { findings: take(await styleReview(model, text, locale)) };
        break;
      }
      case 'style_edit': {
        const text = str(payload.text, cap);
        if (!text.trim()) throw new OpenAIError('Düzenlenecek metin yok.', 400, 'bad_request');
        const edited = take(await styleEdit(model, text, locale, settings.maxOutputTokens));
        result = edited;
        if (insightId && payload.scope === 'body') proposalId = await saveProposal(insightId, runId, createdBy, 'AI düzenleme önerisi (yazım kalıpları)', { title: str(payload.title, 300), excerpt: str(payload.excerpt, 1000), body_md: edited.text });
        break;
      }
      case 'source_check': {
        const body = str(payload.body, cap);
        if (!body.trim()) throw new OpenAIError('Kontrol edilecek metin yok.', 400, 'bad_request');
        const fetched = await fetchSources(urls(payload.sourceUrls));
        result = take(await sourceCheck(model, body, locale, fetched, str(payload.notes, cap / 2)));
        break;
      }
      case 'seo':
        result = take(await seoPack(model, str(payload.title, 300), str(payload.excerpt, 1000), str(payload.body, cap), locale, str(payload.keyword, 200) || undefined));
        break;
      case 'translate': {
        const to = String(payload.to ?? '');
        if (!LOCALES.has(to) || to === locale) throw new OpenAIError('Geçersiz hedef dil.', 400, 'bad_request');
        result = take(await translateArticle(model, { title: str(payload.title, 300), excerpt: str(payload.excerpt, 1000), body: str(payload.body, cap), seoTitle: str(payload.seoTitle, 200), metaDescription: str(payload.metaDescription, 400) }, locale, to));
        break;
      }
      case 'faq':
        result = { faq: take(await faqPack(model, str(payload.title, 300), str(payload.body, cap), locale)) };
        break;
      case 'repurpose': {
        const platform = String(payload.platform ?? '') as 'linkedin' | 'instagram' | 'newsletter' | 'x';
        if (!['linkedin', 'instagram', 'newsletter', 'x'].includes(platform)) throw new OpenAIError('Geçersiz platform.', 400, 'bad_request');
        result = { platform, output: take(await repurpose(model, platform, str(payload.title, 300), str(payload.body, cap), locale)) };
        break;
      }
      case 'cover_brief':
        result = take(await coverBrief(model, str(payload.title, 300), str(payload.excerpt, 1000), str(payload.body, 20_000)));
        break;
      case 'image_generate': {
        const brief = str(payload.brief, 1500);
        if (!brief.trim()) throw new OpenAIError('Görsel özeti (brief) gerekli.', 400, 'bad_request');
        const approach = ['photo', 'illustration', 'diagram'].includes(String(payload.approach)) ? String(payload.approach) : 'photo';
        const variant = Math.max(0, Math.min(5, Number(payload.variant) || 0));
        const prompt = buildImagePrompt(brief, approach, variant);
        const quality = (preset ?? settings.imagePreset) === 'quality' ? 'high' : 'medium';
        const bytes = take(await generateImage({ model, prompt, size: '1536x1024', quality }));
        const dims = imageSize(bytes);
        const saved = await storeDraftImage(bytes, { insightId, groupId: str(payload.groupId, 64) || null, kind: variant > 0 ? 'alternative' : 'generated', origin: 'ai', prompt, brief, model, size: '1536x1024', width: dims?.width, height: dims?.height, altText: str(payload.alt, 300), aiRunId: runId, createdBy, mime: dims?.mime ?? 'image/png' });
        result = { imageId: saved.id };
        break;
      }
      case 'image_edit': {
        const imageId = str(payload.imageId, 64);
        const instruction = str(payload.instruction, 1500);
        if (!/^[0-9a-f-]{36}$/.test(imageId) || !instruction.trim()) throw new OpenAIError('Görsel ve talimat gerekli.', 400, 'bad_request');
        const source = await readDraftImage(imageId);
        const prompt = buildEditPrompt(instruction);
        const bytes = take(await editImage({ model, prompt, image: source.bytes, mime: source.mime, size: 'auto' }));
        const dims = imageSize(bytes);
        const saved = await storeDraftImage(bytes, { insightId, groupId: (source.row.group_id as string) ?? null, kind: 'edited', origin: 'ai', prompt, brief: (source.row.brief as string) ?? null, model, size: dims ? `${dims.width}x${dims.height}` : null, width: dims?.width, height: dims?.height, parentId: imageId, altText: String(source.row.alt_text ?? ''), aiRunId: runId, createdBy, mime: dims?.mime ?? 'image/png' });
        result = { imageId: saved.id };
        break;
      }
      default:
        throw new OpenAIError('unknown_action', 400, 'bad_request');
    }

    const { estCostUsd } = await finishRun(runId, { status: wasMock ? 'mock' : 'ok', usage, model, kind, settings, result: { ...(result as object), proposalId }, requestId, startedAt });
    return NextResponse.json({ ok: true, result: { ...(result as object), proposalId }, run: { id: runId, model, usage, estCostUsd, mock: wasMock } });
  } catch (error) {
    const e = error instanceof OpenAIError ? error : new OpenAIError('Yapay zekâ isteği başarısız oldu.', 500);
    const errUsage = (error as { usage?: OpenAIUsage }).usage ?? usage;
    console.error('[ai]', action, e.status, e.code, e.requestId ?? '-', e.message.slice(0, 200));
    await finishRun(runId, { status: 'error', usage: errUsage, model, kind, settings, error: e.message, requestId: e.requestId, startedAt });
    return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 500 });
  }
}
