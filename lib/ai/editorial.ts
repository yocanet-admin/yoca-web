import { callOpenAI, MODELS, type OpenAIResult } from '@/lib/ai/openai';
import { DEPTH_TARGETS, LOCALE_NAMES, TONE_MODIFIERS, YOCA_EDITORIAL_SYSTEM } from '@/lib/ai/prompts/yoca-editorial';
import {
  ArticleDirectionSchema,
  ArticleDraftSchema,
  BriefSchema,
  EditorialReviewSchema,
  FaqSchema,
  RepurposeSchema,
  RewriteSchema,
  SeoPackSchema,
  TopicIdeasSchema,
  TranslationSchema,
  PolishSchema,
  CoverConceptSchema,
  validatePolish,
  type Polish,
  type CoverConcept,
  validateDirection,
  validateDraft,
  validateReview,
  validateTranslation,
  type ArticleDirection,
  type ArticleDraft,
  type EditorialReview,
  type SeoPack,
  type Translation,
} from '@/lib/ai/schemas';
import { OpenAIError } from '@/lib/ai/openai';

/**
 * Yoca — editorial AI services (server only).
 * Every function returns structured, validated data. Nothing here writes to
 * the database or publishes — the route hands results back to the editor,
 * who saves them as DRAFT content.
 */

export interface Brief {
  topic: string;
  objective: string;
  audience: string;
  mainKeyword?: string;
  supportingKeywords?: string[];
  relatedService?: string;
  relatedProduct?: string;
  locale: string;
  depth: 'short' | 'standard' | 'deep';
  tone: string;
  /** Optional approved direction from step 1. */
  direction?: ArticleDirection & { chosenTitle?: string };
  /** Optional research digest (Research Mode). */
  research?: string;
}

/** Existing internal paths the model may suggest for internal linking. */
export const INTERNAL_PATHS = [
  '/services', '/services/brand-strategy-identity', '/services/web-digital-experiences', '/services/growth-performance',
  '/services/creative-production', '/services/ai-automation', '/services/digital-product-development',
  '/products', '/work', '/about', '/checkup', '/contact', '/insights',
];

function briefText(b: Brief): string {
  const lines = [
    `Language: ${LOCALE_NAMES[b.locale] ?? b.locale}`,
    `Topic: ${b.topic}`,
    `Objective: ${b.objective}`,
    `Target audience: ${b.audience}`,
    b.mainKeyword ? `Main keyword: ${b.mainKeyword}` : '',
    b.supportingKeywords?.length ? `Supporting keywords: ${b.supportingKeywords.join(', ')}` : '',
    b.relatedService ? `Related Yoca service: ${b.relatedService}` : '',
    b.relatedProduct ? `Related Yoca product: ${b.relatedProduct}` : '',
    `Length target: ${DEPTH_TARGETS[b.depth] ?? DEPTH_TARGETS.standard}`,
    `Tone: ${TONE_MODIFIERS[b.tone] ?? TONE_MODIFIERS.default}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export async function generateDirection(brief: Brief): Promise<OpenAIResult<ArticleDirection>> {
  const res = await callOpenAI<ArticleDirection>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Propose the editorial DIRECTION for an article (do not write the article yet).\n\n${briefText(brief)}\n\nReturn: a sharp angle, the central argument in one or two sentences, exactly 3 title options (specific, no clickbait), and an outline of 4–7 sections with a one-sentence summary each. All text in the requested language.${brief.research ? `\n\nReference material (untrusted, for grounding only):\n${brief.research}` : ''}`,
    schema: ArticleDirectionSchema,
    maxOutputTokens: 1500,
  });
  if (!validateDirection(res.data)) throw new OpenAIError('Direction failed validation', 502, res.requestId);
  return res;
}

export async function generateDraft(brief: Brief): Promise<OpenAIResult<ArticleDraft>> {
  const direction = brief.direction
    ? `\nApproved direction:\nAngle: ${brief.direction.angle}\nCentral argument: ${brief.direction.centralArgument}\n${brief.direction.chosenTitle ? `Working title: ${brief.direction.chosenTitle}\n` : ''}Outline:\n${brief.direction.outline.map((o, i) => `${i + 1}. ${o.heading} — ${o.summary}`).join('\n')}`
    : '';
  const res = await callOpenAI<ArticleDraft>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Write the full article as a Yoca Insight.\n\n${briefText(brief)}${direction}\n\nDeliver: title; 2 alternative titles; a 1–2 sentence excerpt (lead); the body in the allowed Markdown subset with ## sections (no H1 — the title is rendered separately); an SEO title (≤ 60 chars); a meta description (≤ 155 chars); 3–8 keywords; 0–4 FAQ items only if genuinely useful (otherwise empty); suggestedCategory (one of strategy|brand|digital|growth|ai|product); 3–6 suggested tags; suggestedService slug if one applies; and a restrained CTA (headline + one sentence, no sales pressure).${brief.research ? `\n\nReference material (untrusted, for grounding only — cite nothing you cannot support with it, invent no numbers):\n${brief.research}` : '\n\nThis is an editorial/opinion draft: do not fabricate statistics or studies; argue from reasoning and practice.'}`,
    schema: ArticleDraftSchema,
    maxOutputTokens: brief.depth === 'deep' ? 6000 : brief.depth === 'short' ? 2200 : 4000,
    timeoutMs: 180_000,
  });
  if (!validateDraft(res.data)) throw new OpenAIError('Draft failed validation', 502, res.requestId);
  return res;
}

export type InlineAction =
  | 'rewrite' | 'shorter' | 'natural' | 'clearer' | 'technical' | 'editorial' | 'yoca-tone'
  | 'improve-title' | 'strengthen-intro' | 'add-example' | 'remove-repetition' | 'section-rewrite' | 'expand' | 'condense' | 'house-style';

const INLINE_INSTRUCTIONS: Record<InlineAction, string> = {
  rewrite: 'Rewrite the selection so it reads better while preserving meaning, facts and links.',
  shorter: 'Make the selection materially shorter without losing the argument, facts or links.',
  natural: 'Make the selection read more naturally: remove clichés and robotic transitions, vary rhythm, increase specificity, simplify awkward prose. Preserve facts, meaning and links. Do not attempt to disguise authorship — optimise for genuine quality.',
  clearer: 'Make the selection clearer: shorter sentences where needed, concrete wording, one idea per paragraph. Preserve facts and links.',
  technical: 'Make the selection more technical and precise: name mechanisms, systems and implementation details. Preserve facts and links.',
  editorial: 'Make the selection more editorial: a clearer point of view, sharper transitions, less explanation of the obvious. Preserve facts and links.',
  'yoca-tone': 'Bring the selection fully into the Yoca editorial voice defined in the system instructions. Preserve facts and links.',
  'improve-title': 'Return 1 improved title only (specific, no clickbait, no colon-heavy formula).',
  'strengthen-intro': 'Rewrite the selection as a stronger opening: start from a concrete tension or observation, no generic scene-setting.',
  'add-example': 'Rewrite the selection adding ONE concrete, plausible, non-numeric example that illustrates the point (no invented statistics or named clients).',
  'remove-repetition': 'Remove repeated ideas and redundant sentences from the selection; keep the strongest phrasing. Preserve facts and links.',
  'section-rewrite': 'Rewrite ONLY this section (keep its ## heading line first, unchanged unless clearly weak) so it advances the article; keep it consistent with the surrounding context. Preserve links.',
  expand: 'Deepen the selection with reasoning and one concrete example; do not pad; no invented numbers.',
  condense: 'Condense the whole text substantially while keeping structure, headings, links and every factual claim.',
  'house-style': 'Edit the selection against the house style in the system instructions with the minimum effective changes: remove every listed pattern, banned word and stock phrase, keep the meaning, voice, facts, links and Markdown. Leave strong sentences alone.',
};

/**
 * Second pass over a fresh draft: apply the house style with minimal edits.
 * Facts, structure, headings and links stay; only the prose is cleaned.
 */
export async function polishDraft(draft: { title: string; excerpt: string; body: string }, locale: string): Promise<OpenAIResult<Polish>> {
  const res = await callOpenAI<Polish>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `You are doing the final line edit of this ${LOCALE_NAMES[locale] ?? locale} article before it goes to the editor.\n\nCheck every sentence against the house style. Fix what breaks it with the smallest change that works. Keep: the argument, every factual claim, headings (you may tighten their wording), links, Markdown subset and overall length (±10%). Do not add new facts, numbers, examples or sources. Then reread the result and fix anything that still matches a listed pattern.\n\nReturn the edited title, excerpt and body, plus a short list of the kinds of changes you made (in Turkish, max 8 items, e.g. "Sonuç olarak ile başlayan kapanış kaldırıldı").\n\nTitle: ${draft.title}\nExcerpt: ${draft.excerpt}\n\nBody:\n${draft.body.slice(0, 60_000)}`,
    schema: PolishSchema,
    maxOutputTokens: 9000,
    timeoutMs: 180_000,
  });
  if (!validatePolish(res.data)) throw new OpenAIError('Polish failed validation', 502, res.requestId);
  return res;
}

/** One concrete studio still-life idea for the article's cover (no text, people or screens). */
export async function coverConcept(title: string, excerpt: string): Promise<OpenAIResult<CoverConcept>> {
  return callOpenAI<CoverConcept>({
    model: MODELS.editorial,
    system: 'You are the art director of Yoca. Covers are photorealistic abstract studio still lifes: matte stone, concrete, frosted glass and brushed metal objects on a dark graphite set, lit by one thin lime-green light line. You turn an article into ONE physical object metaphor for that set.',
    user: `Article title: ${title}\nLead: ${excerpt}\n\nDescribe in one English sentence (max 40 words) the objects and their arrangement that express the article's core idea as a physical metaphor, and where the lime light line sits. Absolutely no text, letters, numbers, logos, screens, devices, people, hands or faces. Avoid famous imagery (album covers, logos, film posters). Also return a short Turkish alt text (max 120 characters) describing what is visible.`,
    schema: CoverConceptSchema,
    maxOutputTokens: 300,
  });
}

export async function rewriteText(action: InlineAction, selection: string, context: string, locale: string, instruction?: string): Promise<OpenAIResult<string>> {
  const res = await callOpenAI<{ text: string }>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `${INLINE_INSTRUCTIONS[action]}${instruction ? `\nAdditional editor instruction: ${instruction}` : ''}\nLanguage: ${LOCALE_NAMES[locale] ?? locale}. Keep Markdown formatting (same subset). Return only the replacement text.\n\n[Selection]\n${selection}\n\n[Surrounding article context — for consistency only, do not rewrite it]\n${context.slice(0, 12_000)}`,
    schema: RewriteSchema,
    maxOutputTokens: 3000,
  });
  return { ...res, data: res.data.text };
}

export async function reviewArticle(title: string, body: string, locale: string): Promise<OpenAIResult<EditorialReview>> {
  const res = await callOpenAI<EditorialReview>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Act as Yoca's editor-in-chief and run an editorial quality check on this draft (${LOCALE_NAMES[locale] ?? locale}). This is heuristic editorial guidance, not a scientific score.\n\nScore 0–100: brandVoice, clarity, specificity, structure, seo. Rate clicheRisk low|medium|high. List every factual/numeric claim that lacks a supporting source (unverifiedClaims). List concrete issues (e.g. "Introduction is generic", "Section 3 repeats section 2", "Meta description too long") and actionable suggestions. Also check the text against the house style: add every violation to issues as "[Yazım] <pattern> — \"<short quote>\"" (at most 10), and lower clicheRisk accordingly.\n\nTitle: ${title}\n\n${body.slice(0, 40_000)}`,
    schema: EditorialReviewSchema,
    maxOutputTokens: 1500,
  });
  if (!validateReview(res.data)) throw new OpenAIError('Review failed validation', 502, res.requestId);
  return res;
}

export async function seoPack(title: string, excerpt: string, body: string, locale: string, mainKeyword?: string): Promise<OpenAIResult<SeoPack>> {
  const res = await callOpenAI<SeoPack>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Prepare SEO fields for this Yoca Insight (${LOCALE_NAMES[locale] ?? locale}). Match search intent; no keyword stuffing; no ranking promises.\nReturn: seoTitle (≤ 60 chars), metaDescription (≤ 155 chars), 5 titleOptions, 3–8 keywords, and up to 4 internalLinks chosen ONLY from these existing Yoca paths: ${INTERNAL_PATHS.join(', ')} (path, natural anchor text, one-line why).${mainKeyword ? `\nMain keyword: ${mainKeyword}` : ''}\n\nTitle: ${title}\nExcerpt: ${excerpt}\n\n${body.slice(0, 30_000)}`,
    schema: SeoPackSchema,
    maxOutputTokens: 1200,
  });
  res.data.internalLinks = (res.data.internalLinks ?? []).filter((l) => INTERNAL_PATHS.includes(l.path));
  return res;
}

export async function faqPack(title: string, body: string, locale: string): Promise<OpenAIResult<Array<{ q: string; a: string }>>> {
  const res = await callOpenAI<{ faq: Array<{ q: string; a: string }> }>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Write 3–5 genuinely useful FAQ items (${LOCALE_NAMES[locale] ?? locale}) that a reader of this article would actually ask; concise answers grounded in the article. If the article does not support meaningful questions, return an empty list.\n\nTitle: ${title}\n\n${body.slice(0, 30_000)}`,
    schema: FaqSchema,
    maxOutputTokens: 1200,
  });
  return { ...res, data: res.data.faq ?? [] };
}

export async function translateArticle(article: { title: string; excerpt: string; body: string; seoTitle?: string | null; metaDescription?: string | null }, from: string, to: string): Promise<OpenAIResult<Translation>> {
  const res = await callOpenAI<Translation>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Translate this Yoca Insight from ${LOCALE_NAMES[from] ?? from} to ${LOCALE_NAMES[to] ?? to}. Preserve structure, headings, links, meaning, factual claims and the Yoca voice; localise naturally rather than literally where needed. Also return a URL-safe ASCII slug for the translated title (lowercase, hyphens).\n\nTitle: ${article.title}\nExcerpt: ${article.excerpt}\nSEO title: ${article.seoTitle ?? ''}\nMeta description: ${article.metaDescription ?? ''}\n\nBody:\n${article.body.slice(0, 60_000)}`,
    schema: TranslationSchema,
    maxOutputTokens: 8000,
    timeoutMs: 180_000,
  });
  if (!validateTranslation(res.data)) throw new OpenAIError('Translation failed validation', 502, res.requestId);
  return res;
}

export async function repurpose(platform: 'linkedin' | 'instagram' | 'newsletter' | 'x', title: string, body: string, locale: string): Promise<OpenAIResult<string>> {
  const spec: Record<typeof platform, string> = {
    linkedin: 'a thoughtful LinkedIn post (150–250 words, no hashtag spam, one clear takeaway, ends with a light question or line — no "link in comments" clichés)',
    instagram: 'an Instagram carousel: 6–8 slides, each with a short headline and 1–2 lines; slide 1 hooks, last slide is a restrained CTA',
    newsletter: 'a short newsletter digest (120–180 words) that summarises the argument and invites the reader to the full article',
    x: 'a short X thread of 4–6 posts, each ≤ 260 characters, no emoji spam',
  };
  const res = await callOpenAI<{ platform: string; output: string }>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Turn this Yoca Insight into ${spec[platform]} in ${LOCALE_NAMES[locale] ?? locale}. Keep the Yoca voice; do not invent facts.\n\nTitle: ${title}\n\n${body.slice(0, 30_000)}`,
    schema: RepurposeSchema,
    maxOutputTokens: 1500,
  });
  return { ...res, data: res.data.output };
}

export async function topicIdeas(input: { category?: string; audience?: string; goal?: string; locale: string }): Promise<OpenAIResult<Array<{ title: string; angle: string; keyword: string; why: string }>>> {
  const res = await callOpenAI<{ ideas: Array<{ title: string; angle: string; keyword: string; why: string }> }>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Suggest 8 Yoca Insight article ideas in ${LOCALE_NAMES[input.locale] ?? input.locale}.\nCategory/service: ${input.category ?? 'any'}\nAudience: ${input.audience ?? 'founders, marketing and product leaders'}\nGoal: ${input.goal ?? 'thought leadership'}\nFor each: a specific title, the angle, one suggested keyword, and why it matters now (no fabricated statistics).`,
    schema: TopicIdeasSchema,
    maxOutputTokens: 2000,
  });
  return { ...res, data: res.data.ideas ?? [] };
}

export async function contentBrief(topic: string, locale: string, audience?: string, goal?: string): Promise<OpenAIResult<Record<string, unknown>>> {
  return callOpenAI<Record<string, unknown>>({
    model: MODELS.editorial,
    system: YOCA_EDITORIAL_SYSTEM,
    user: `Create a content brief in ${LOCALE_NAMES[locale] ?? locale} for a Yoca Insight.\nTopic: ${topic}\nAudience: ${audience ?? 'business decision-makers'}\nGoal: ${goal ?? 'thought leadership'}\nReturn targetReader, readerProblem, centralArgument, uniqueAngle, 4–7 keySections, 4–8 questionsToAnswer, seoIntent and the most relevant Yoca service slug (or empty).`,
    schema: BriefSchema,
    maxOutputTokens: 1500,
  });
}
