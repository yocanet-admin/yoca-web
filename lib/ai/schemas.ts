/**
 * Yoca — structured-output schemas + runtime validators.
 * Each schema is sent to OpenAI (strict json_schema) AND validated again on
 * the way in, so nothing malformed reaches the database or the editor.
 */

const str = { type: 'string' } as const;
const strArr = { type: 'array', items: str } as const;
const num = { type: 'number' } as const;

export const ArticleDirectionSchema = {
  name: 'article_direction',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['angle', 'centralArgument', 'titles', 'outline'],
    properties: {
      angle: str,
      centralArgument: str,
      titles: strArr,
      outline: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['heading', 'summary'], properties: { heading: str, summary: str } },
      },
    },
  },
};
export interface ArticleDirection {
  angle: string;
  centralArgument: string;
  titles: string[];
  outline: Array<{ heading: string; summary: string }>;
}

export const ArticleDraftSchema = {
  name: 'article_draft',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'alternativeTitles', 'excerpt', 'body', 'seoTitle', 'metaDescription', 'keywords', 'faq', 'suggestedCategory', 'suggestedTags', 'suggestedService', 'cta'],
    properties: {
      title: str,
      alternativeTitles: strArr,
      excerpt: str,
      body: str,
      seoTitle: str,
      metaDescription: str,
      keywords: strArr,
      faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: str, a: str } } },
      suggestedCategory: { type: 'string', enum: ['strategy', 'brand', 'digital', 'growth', 'ai', 'product', ''] },
      suggestedTags: strArr,
      suggestedService: { type: 'string', enum: ['brand-strategy-identity', 'web-digital-experiences', 'growth-performance', 'creative-production', 'ai-automation', 'digital-product-development', ''] },
      cta: { type: 'object', additionalProperties: false, required: ['headline', 'text'], properties: { headline: str, text: str } },
    },
  },
};
export interface ArticleDraft {
  title: string;
  alternativeTitles: string[];
  excerpt: string;
  body: string;
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  faq: Array<{ q: string; a: string }>;
  suggestedCategory: string;
  suggestedTags: string[];
  suggestedService: string;
  cta: { headline: string; text: string };
}

export const EditorialReviewSchema = {
  name: 'editorial_review',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scores', 'clicheRisk', 'unverifiedClaims', 'issues', 'suggestions'],
    properties: {
      scores: {
        type: 'object',
        additionalProperties: false,
        required: ['brandVoice', 'clarity', 'specificity', 'structure', 'seo'],
        properties: { brandVoice: num, clarity: num, specificity: num, structure: num, seo: num },
      },
      clicheRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
      unverifiedClaims: strArr,
      issues: strArr,
      suggestions: strArr,
    },
  },
};
export interface EditorialReview {
  scores: { brandVoice: number; clarity: number; specificity: number; structure: number; seo: number };
  clicheRisk: 'low' | 'medium' | 'high';
  unverifiedClaims: string[];
  issues: string[];
  suggestions: string[];
}

export const SeoPackSchema = {
  name: 'seo_pack',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['seoTitle', 'metaDescription', 'titleOptions', 'keywords', 'internalLinks'],
    properties: {
      seoTitle: str,
      metaDescription: str,
      titleOptions: strArr,
      keywords: strArr,
      internalLinks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'anchor', 'why'], properties: { path: str, anchor: str, why: str } } },
    },
  },
};
export interface SeoPack {
  seoTitle: string;
  metaDescription: string;
  titleOptions: string[];
  keywords: string[];
  internalLinks: Array<{ path: string; anchor: string; why: string }>;
}

export const FaqSchema = {
  name: 'faq_pack',
  schema: { type: 'object', additionalProperties: false, required: ['faq'], properties: { faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: str, a: str } } } } },
};

export const TranslationSchema = {
  name: 'translation',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'excerpt', 'body', 'seoTitle', 'metaDescription', 'slug'],
    properties: { title: str, excerpt: str, body: str, seoTitle: str, metaDescription: str, slug: str },
  },
};
export interface Translation { title: string; excerpt: string; body: string; seoTitle: string; metaDescription: string; slug: string }

export const RepurposeSchema = {
  name: 'repurposed_content',
  schema: { type: 'object', additionalProperties: false, required: ['platform', 'output'], properties: { platform: str, output: str } },
};

export const TopicIdeasSchema = {
  name: 'topic_ideas',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ideas'],
    properties: { ideas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'angle', 'keyword', 'why'], properties: { title: str, angle: str, keyword: str, why: str } } } },
  },
};

export const BriefSchema = {
  name: 'content_brief',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['targetReader', 'readerProblem', 'centralArgument', 'uniqueAngle', 'keySections', 'questionsToAnswer', 'seoIntent', 'relatedService'],
    properties: { targetReader: str, readerProblem: str, centralArgument: str, uniqueAngle: str, keySections: strArr, questionsToAnswer: strArr, seoIntent: str, relatedService: str },
  },
};

export const RewriteSchema = {
  name: 'rewrite',
  schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: str } },
};

/** House-style pass over a finished draft (minimal edits, same facts). */
export const PolishSchema = {
  name: 'polish',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'excerpt', 'body', 'changes'],
    properties: { title: str, excerpt: str, body: str, changes: strArr },
  },
};
export interface Polish {
  title: string;
  excerpt: string;
  body: string;
  changes: string[];
}

/** What the cover image should show (an object metaphor, never text). */
export const CoverConceptSchema = {
  name: 'cover_concept',
  schema: { type: 'object', additionalProperties: false, required: ['subject', 'alt'], properties: { subject: str, alt: str } },
};
export interface CoverConcept {
  subject: string;
  alt: string;
}

// ── Runtime validation (defence in depth) ─────────────────────────
export function isString(v: unknown, max = 200_000): v is string {
  return typeof v === 'string' && v.length <= max;
}
export function isStringArray(v: unknown, max = 50): v is string[] {
  return Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string');
}
export function validateDraft(v: unknown): v is ArticleDraft {
  const d = v as Partial<ArticleDraft>;
  return !!d && isString(d.title, 300) && isString(d.excerpt, 1000) && isString(d.body) && isString(d.seoTitle, 200) && isString(d.metaDescription, 400) && isStringArray(d.keywords) && Array.isArray(d.faq) && isStringArray(d.suggestedTags) && typeof d.suggestedCategory === 'string' && typeof d.suggestedService === 'string' && !!d.cta && isString(d.cta.headline, 200) && isString(d.cta.text, 600);
}
export function validateDirection(v: unknown): v is ArticleDirection {
  const d = v as Partial<ArticleDirection>;
  return !!d && isString(d.angle, 1000) && isString(d.centralArgument, 1000) && isStringArray(d.titles, 10) && Array.isArray(d.outline) && d.outline.every((o) => o && isString(o.heading, 200) && isString(o.summary, 600));
}
export function validateReview(v: unknown): v is EditorialReview {
  const d = v as Partial<EditorialReview>;
  return !!d && !!d.scores && ['brandVoice', 'clarity', 'specificity', 'structure', 'seo'].every((k) => typeof (d.scores as Record<string, unknown>)[k] === 'number') && isStringArray(d.unverifiedClaims) && isStringArray(d.issues) && isStringArray(d.suggestions);
}
export function validateTranslation(v: unknown): v is Translation {
  const d = v as Partial<Translation>;
  return !!d && isString(d.title, 300) && isString(d.excerpt, 1000) && isString(d.body) && isString(d.seoTitle, 200) && isString(d.metaDescription, 400) && isString(d.slug, 200);
}
export function validatePolish(v: unknown): v is Polish {
  const d = v as Partial<Polish>;
  return !!d && isString(d.title, 300) && isString(d.excerpt, 1000) && isString(d.body) && isStringArray(d.changes, 40);
}
