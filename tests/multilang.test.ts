/**
 * Insights in every language: translation helpers, schema, SEO helpers.
 * Run: npx tsx --test tests/multilang.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asciiSlug,
  estimateMultilangCost,
  localizeInternalLinks,
  sourceFingerprint,
  sourceFingerprintText,
  targetLocales,
  uniqueSlug,
  type TranslatableFields,
} from '../lib/ai/translateHelpers';
import { TranslationSchema, validateTranslation } from '../lib/ai/schemas';
import { insightLocalePaths, insightSlugFromPath, insightXDefault } from '../lib/insightAlternates';
import { SLOP_PATTERNS, NO_AI_SLOP_RULES } from '../lib/ai/prompts/no-ai-slop';

const src: TranslatableFields = {
  title: 'Randevu formu',
  excerpt: 'Kısa özet',
  body_md: '## Giriş\n\nMetin [bağlantı](/tr/services/web) ve ![alt](yoca-image:abc).',
  seo_title: 'SEO',
  meta_description: 'Meta',
  og_title: null,
  og_description: null,
  faq: [{ q: 'Soru?', a: 'Yanıt.' }],
  tags: ['web'],
  cover_alt: 'Kapak',
  cover_caption: null,
};

test('target languages: every other locale, fixed order', () => {
  assert.deepEqual(targetLocales('tr'), ['en', 'az', 'ar']);
  assert.deepEqual(targetLocales('en'), ['az', 'ar', 'tr']);
  assert.equal(targetLocales('ar').length, 3);
});

test('internal links move to the target language; article and image links stay', () => {
  const body = '[a](/tr/services/web) [b](https://yoca.net/tr/contact) [c](/tr) [d](/tr/insights/eski-yazi) [e](https://example.com/tr/x) ![i](yoca-image:1)';
  const out = localizeInternalLinks(body, 'tr', 'en');
  assert.match(out, /\[a\]\(\/en\/services\/web\)/);
  assert.match(out, /\[b\]\(\/en\/contact\)/);
  assert.match(out, /\[c\]\(\/en\)/);
  assert.match(out, /\[d\]\(\/tr\/insights\/eski-yazi\)/);
  assert.match(out, /\[e\]\(https:\/\/example\.com\/tr\/x\)/);
  assert.match(out, /yoca-image:1/);
  assert.equal(localizeInternalLinks(body, 'tr', 'tr'), body);
});

test('ascii slug: Turkish / Azerbaijani letters, Arabic falls back', () => {
  assert.equal(asciiSlug('Şirketiniz İçin Güçlü Ölçüm'), 'sirketiniz-icin-guclu-olcum');
  assert.equal(asciiSlug('Əməliyyat planı'), 'emeliyyat-plani');
  assert.equal(asciiSlug('نموذج الحجز'), '');
  assert.equal(uniqueSlug('a', ['a', 'a-2'], 'x'), 'a-3');
  assert.equal(uniqueSlug('', [], 'fallback'), 'fallback');
});

test('source fingerprint changes when any translated field changes', async () => {
  const a = await sourceFingerprint(src);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await sourceFingerprint({ ...src, title: ' Randevu formu ' }), 'trim is ignored');
  for (const patch of [{ body_md: src.body_md + '!' }, { meta_description: 'Başka' }, { faq: [] }, { tags: ['x'] }, { cover_alt: 'Y' }] as Array<Partial<TranslatableFields>>) {
    assert.notEqual(await sourceFingerprint({ ...src, ...patch }), a, JSON.stringify(patch));
  }
  assert.ok(sourceFingerprintText(src).startsWith('["Randevu formu"'));
});

test('cost estimate: grows with languages; null without a price', () => {
  const price = { input: 0.25, output: 2 };
  const one = estimateMultilangCost({ bodyChars: 9000, languages: 1, price })!;
  const three = estimateMultilangCost({ bodyChars: 9000, languages: 3, price })!;
  assert.ok(one > 0 && three > one * 2.9 && three < one * 3.1);
  assert.ok(three < 0.2, `3 languages of a 9k-char article stays small (${three})`);
  assert.equal(estimateMultilangCost({ bodyChars: 9000, languages: 3, price: null }), null);
});

test('translation schema covers every field and validator rejects partial output', () => {
  const required = (TranslationSchema as unknown as { schema: { required: string[] } }).schema.required;
  for (const k of ['title', 'excerpt', 'body', 'seoTitle', 'metaDescription', 'ogTitle', 'ogDescription', 'faq', 'tags', 'coverAlt', 'coverCaption', 'slug']) assert.ok(required.includes(k), k);
  const full = { title: 'T', excerpt: 'E', body: 'B', seoTitle: 'S', metaDescription: 'M', ogTitle: '', ogDescription: '', faq: [{ q: 'q', a: 'a' }], tags: ['t'], coverAlt: '', coverCaption: '', slug: 't' };
  assert.equal(validateTranslation(full), true);
  assert.equal(validateTranslation({ ...full, faq: undefined }), false);
  assert.equal(validateTranslation({ ...full, body: '  ' }), false);
  assert.equal(validateTranslation({ title: 'T', excerpt: 'E', body: 'B', seoTitle: 'S', metaDescription: 'M', slug: 't' }), false);
});

test('x-default: English if published, else the source, else current', () => {
  assert.equal(insightXDefault([{ locale: 'tr', slug: 'a', source_insight_id: null }, { locale: 'en', slug: 'b', source_insight_id: 'x' }], 'tr'), 'en');
  assert.equal(insightXDefault([{ locale: 'tr', slug: 'a', source_insight_id: null }, { locale: 'az', slug: 'b', source_insight_id: 'x' }], 'az'), 'tr');
  assert.equal(insightXDefault([{ locale: 'az', slug: 'b' }], 'az'), 'az');
  assert.equal(insightXDefault([], 'ar'), 'ar');
});

test('language menu goes to the real translation or the Insights index', () => {
  const paths = insightLocalePaths([{ locale: 'tr', slug: 'randevu' }, { locale: 'en', slug: 'booking' }], { locale: 'tr', slug: 'randevu' });
  assert.deepEqual(paths, { en: '/insights/booking', tr: '/insights/randevu', az: '/insights', ar: '/insights' });
});

test('insight slug from path (middleware 404 check)', () => {
  assert.equal(insightSlugFromPath('/insights/abc-1'), 'abc-1');
  assert.equal(insightSlugFromPath('/insights/abc/'), 'abc');
  assert.equal(insightSlugFromPath('/insights'), null);
  assert.equal(insightSlugFromPath('/insights/a/b'), null);
  assert.equal(insightSlugFromPath('/work/abc'), null);
});

test('no-ai-slop rules name Azerbaijani and Arabic forms', () => {
  assert.ok(SLOP_PATTERNS.length > 5);
  assert.match(NO_AI_SLOP_RULES, /Azerbaijani \(az\)/);
  assert.match(NO_AI_SLOP_RULES, /Arabic \(ar\)/);
});
