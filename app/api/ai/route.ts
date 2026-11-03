import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { OpenAIError, MODELS } from '@/lib/ai/openai';
import {
  contentBrief,
  coverConcept,
  faqPack,
  polishDraft,
  generateDirection,
  generateDraft,
  repurpose,
  reviewArticle,
  rewriteText,
  seoPack,
  topicIdeas,
  translateArticle,
  type Brief,
  type InlineAction,
} from '@/lib/ai/editorial';
import { researchTopic } from '@/lib/ai/research';
import { generateCoverImage, storeCover } from '@/lib/ai/images';
import { isAllowedAdminEmail } from '@/lib/cockpit/auth';

/**
 * Yoca — admin AI endpoint (server only).
 * - Requires a valid Supabase Auth session (Bearer access token) → only
 *   authenticated admins/editors can spend tokens.
 * - Rate-limited per user, input length capped, output length capped.
 * - Never publishes, never writes article content — returns structured
 *   results for the editor to review and save as DRAFT.
 * - Logs operational metadata to ai_runs (no secrets, no reasoning).
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const hits = new Map<string, number[]>();
const RATE_LIMIT = 40; // requests per user per hour
const WINDOW_MS = 60 * 60 * 1000;
const MAX_INPUT = 120_000; // characters per request body

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((ts) => ts > now - WINDOW_MS);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  hits.set(userId, list);
  return false;
}

const LOCALES = new Set(['en', 'tr', 'az', 'ar']);
const INLINE_ACTIONS: InlineAction[] = ['rewrite', 'shorter', 'natural', 'clearer', 'technical', 'editorial', 'yoca-tone', 'improve-title', 'strengthen-intro', 'add-example', 'remove-repetition', 'section-rewrite', 'expand', 'condense', 'house-style'];

interface Payload {
  action: string;
  insightId?: string;
  locale?: string;
  [key: string]: unknown;
}

async function authenticate(request: NextRequest): Promise<{ id: string; email?: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  // Optional ADMIN_EMAILS allowlist (no-op when unset) — same rule as /api/admin/*.
  if (!isAllowedAdminEmail(data.user.email)) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

async function logRun(entry: { insightId?: string; action: string; model: string; locale?: string; status: string; createdBy?: string; tokensIn?: number; tokensOut?: number; error?: string }) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from('ai_runs').insert({
    insight_id: entry.insightId ?? null,
    action: entry.action,
    model: entry.model,
    locale: entry.locale ?? null,
    status: entry.status,
    created_by: entry.createdBy ?? null,
    tokens_in: entry.tokensIn ?? null,
    tokens_out: entry.tokensOut ?? null,
    error: entry.error ? entry.error.slice(0, 500) : null,
  }).then(() => undefined, () => undefined);
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (rateLimited(user.id)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_INPUT) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const action = String(payload.action ?? '');
  const locale = LOCALES.has(String(payload.locale)) ? String(payload.locale) : 'tr';
  const str = (v: unknown, max = 20_000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) as string[] : []);
  const model = action === 'research' ? MODELS.research : action === 'cover' ? process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1' : MODELS.editorial;

  try {
    let result: unknown;
    let usage: { input_tokens?: number; output_tokens?: number } = {};

    switch (action) {
      case 'direction':
      case 'draft': {
        const brief: Brief = {
          topic: str(payload.topic, 2000),
          objective: str(payload.objective, 200) || 'Thought Leadership',
          audience: str(payload.audience, 300) || 'business decision-makers',
          mainKeyword: str(payload.mainKeyword, 200) || undefined,
          supportingKeywords: arr(payload.supportingKeywords),
          relatedService: str(payload.relatedService, 100) || undefined,
          relatedProduct: str(payload.relatedProduct, 100) || undefined,
          locale,
          depth: (['short', 'standard', 'deep'] as const).includes(payload.depth as 'short') ? (payload.depth as Brief['depth']) : 'standard',
          tone: str(payload.tone, 40) || 'default',
          direction: (payload.direction as Brief['direction']) || undefined,
          research: str(payload.research, 40_000) || undefined,
        };
        if (!brief.topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 });
        if (action === 'direction') {
          const r = await generateDirection(brief);
          result = r.data; usage = r.usage;
          break;
        }
        const r = await generateDraft(brief);
        usage = r.usage;
        // House-style line edit on every new draft (skip with polish:false). A failed
        // polish never loses the draft: the unpolished version is returned instead.
        if (payload.polish !== false) {
          try {
            const p = await polishDraft({ title: r.data.title, excerpt: r.data.excerpt, body: r.data.body }, locale);
            result = { ...r.data, title: p.data.title || r.data.title, excerpt: p.data.excerpt || r.data.excerpt, body: p.data.body || r.data.body, polishChanges: p.data.changes };
            usage = { input_tokens: (usage.input_tokens ?? 0) + (p.usage.input_tokens ?? 0), output_tokens: (usage.output_tokens ?? 0) + (p.usage.output_tokens ?? 0) };
          } catch (polishError) {
            console.error('[ai] polish skipped:', (polishError as Error).message);
            result = { ...r.data, polishChanges: [] };
          }
        } else result = r.data;
        break;
      }
      case 'research': {
        const topic = str(payload.topic, 2000);
        if (!topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 });
        const r = await researchTopic(topic, locale, arr(payload.keywords));
        result = r.data; usage = r.usage;
        break;
      }
      case 'rewrite': {
        const inline = String(payload.inlineAction ?? '') as InlineAction;
        if (!INLINE_ACTIONS.includes(inline)) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
        const selection = str(payload.selection, 60_000);
        if (!selection.trim()) return NextResponse.json({ error: 'selection_required' }, { status: 400 });
        const r = await rewriteText(inline, selection, str(payload.context, 60_000), locale, str(payload.instruction, 500) || undefined);
        result = { text: r.data }; usage = r.usage;
        break;
      }
      case 'cover': {
        const title = str(payload.title, 300);
        if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 });
        const concept = await coverConcept(title, str(payload.excerpt, 1000));
        const image = await generateCoverImage(concept.data.subject);
        const url = await storeCover(image, str(payload.groupId, 64) || 'ai');
        result = { url, alt: concept.data.alt, subject: concept.data.subject };
        usage = concept.usage;
        break;
      }
      case 'review': {
        const r = await reviewArticle(str(payload.title, 300), str(payload.body, 80_000), locale);
        result = r.data; usage = r.usage;
        break;
      }
      case 'seo': {
        const r = await seoPack(str(payload.title, 300), str(payload.excerpt, 1000), str(payload.body, 80_000), locale, str(payload.mainKeyword, 200) || undefined);
        result = r.data; usage = r.usage;
        break;
      }
      case 'faq': {
        const r = await faqPack(str(payload.title, 300), str(payload.body, 80_000), locale);
        result = { faq: r.data }; usage = r.usage;
        break;
      }
      case 'translate': {
        const to = String(payload.to ?? '');
        if (!LOCALES.has(to)) return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
        const r = await translateArticle({ title: str(payload.title, 300), excerpt: str(payload.excerpt, 1000), body: str(payload.body, 80_000), seoTitle: str(payload.seoTitle, 200), metaDescription: str(payload.metaDescription, 400) }, locale, to);
        result = r.data; usage = r.usage;
        break;
      }
      case 'repurpose': {
        const platform = String(payload.platform ?? '') as 'linkedin' | 'instagram' | 'newsletter' | 'x';
        if (!['linkedin', 'instagram', 'newsletter', 'x'].includes(platform)) return NextResponse.json({ error: 'invalid_platform' }, { status: 400 });
        const r = await repurpose(platform, str(payload.title, 300), str(payload.body, 80_000), locale);
        result = { platform, output: r.data }; usage = r.usage;
        break;
      }
      case 'topics': {
        const r = await topicIdeas({ category: str(payload.category, 100) || undefined, audience: str(payload.audience, 200) || undefined, goal: str(payload.goal, 200) || undefined, locale });
        result = { ideas: r.data }; usage = r.usage;
        break;
      }
      case 'brief': {
        const topic = str(payload.topic, 2000);
        if (!topic) return NextResponse.json({ error: 'topic_required' }, { status: 400 });
        const r = await contentBrief(topic, locale, str(payload.audience, 200) || undefined, str(payload.goal, 200) || undefined);
        result = r.data; usage = r.usage;
        break;
      }
      default:
        return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
    }

    await logRun({ insightId: str(payload.insightId, 64) || undefined, action, model, locale, status: 'ok', createdBy: user.email ?? user.id, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const err = error instanceof OpenAIError ? error : new OpenAIError('AI request failed', 500);
    console.error('[ai]', action, err.status, err.requestId ?? '-', err.message);
    await logRun({ insightId: str(payload.insightId, 64) || undefined, action, model, locale, status: 'error', createdBy: user.email ?? user.id, error: err.message });
    return NextResponse.json({ error: err.message, status: err.status }, { status: err.status >= 400 && err.status < 600 ? err.status : 500 });
  }
}
