/**
 * Yoca — "No AI Slop" editing rules, vendored as a static module.
 *
 * Source:        https://github.com/petergyang/no-ai-slop
 * Pinned commit: 000650b156983f5159695b441477f4e63b25dc85 (2026-09-01,
 *                "Drop planning ritual and process self-check; add skill-folder agent metadata (#49)")
 * Files read:    README.md, skills/no-ai-slop/SKILL.md, skills/no-ai-slop/eval.md, LICENSE
 * Licence:       MIT — Copyright (c) 2026 Peter Yang. The upstream LICENSE is copied
 *                unchanged to lib/ai/prompts/NO_AI_SLOP_LICENSE and reproduced here:
 *
 * MIT License
 *
 * Copyright (c) 2026 Peter Yang
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * ADAPTED: the rules below are a condensed adaptation of SKILL.md and eval.md for
 * Yoca's server-side OpenAI prompts, with Turkish, Azerbaijani and Arabic
 * equivalents added by Yoca. They are NOT the upstream text verbatim. Nothing is
 * downloaded at runtime: updating means re-reading the repository at a new commit,
 * editing this file by hand and changing the pinned commit above.
 *
 * How the rules are used (all server side, lib/ai/editorial.ts):
 *   - NO_AI_SLOP_RULES is part of YOCA_EDITORIAL_SYSTEM, sent as the Responses API
 *     `instructions` on every text request (drafts, rewrites, titles, SEO, FAQ,
 *     translation, research, lead summaries use their own system prompt).
 *   - NO_AI_SLOP_DETECT drives "Yazım kalıplarını incele" (findings only, no score).
 *   - NO_AI_SLOP_EDIT drives "Metni düzenle" (minimum effective edit).
 *   - NO_AI_SLOP_EVAL is the self-check the model runs once before returning an edit.
 * It is not a blind word ban: technical terms, real uncertainty, quotations and the
 * writer's own phrasing stay. The model must never insert deliberate errors to make
 * text "look human".
 */

export const NO_AI_SLOP_SOURCE = {
  url: 'https://github.com/petergyang/no-ai-slop',
  commit: '000650b156983f5159695b441477f4e63b25dc85',
  licence: 'MIT',
  copyright: 'Copyright (c) 2026 Peter Yang',
} as const;

/** Pattern ids shown to editors (Turkish labels) — also the enum the model must use. */
export const SLOP_PATTERNS: Array<{ id: string; label: string }> = [
  { id: 'empty_opener', label: 'Boş giriş / sahne kurma' },
  { id: 'binary_contrast', label: '“X değil, Y” karşıtlığı' },
  { id: 'faux_insight', label: 'Sahte içgörü kurgusu' },
  { id: 'colon_reveal', label: 'İki noktalı dramatik açılış' },
  { id: 'superficial_analysis', label: 'Yüzeysel anlam yükleme (-arak, -ması açısından)' },
  { id: 'puffery', label: 'Dayanaksız övgü / önem şişirme' },
  { id: 'metadiscourse', label: 'Okura neye dikkat edeceğini söyleme' },
  { id: 'weasel_attribution', label: 'Kaynaksız “araştırmalar gösteriyor”' },
  { id: 'fake_strong_verb', label: 'Şişirilmiş fiil (konumlanıyor, rol oynuyor)' },
  { id: 'synonym_cycling', label: 'Eş anlamlı döndürme' },
  { id: 'negative_listing', label: '“X değil. Y değil. Z.” dizisi' },
  { id: 'dramatic_fragments', label: 'Dramatik kısa cümle yığını' },
  { id: 'robotic_rhythm', label: 'Her paragrafta aynı ritim / uzunluk' },
  { id: 'rhetorical_setup', label: 'Retorik soru kurgusu' },
  { id: 'fake_profound_ending', label: 'Sahte derin kapanış' },
  { id: 'summary_ending', label: 'Tüm yazıyı tekrar eden kapanış' },
  { id: 'formatting_slop', label: 'Biçim kalabalığı (emoji, gereksiz kalın, madde)' },
  { id: 'em_dash', label: 'Uzun tire kalabalığı' },
  { id: 'banned_word', label: 'Boş kelime / klişe' },
  { id: 'portability', label: 'Her şirkete uyan genel cümle' },
  { id: 'unsupported_claim', label: 'Kaynaksız sayı veya iddia' },
];

export const SLOP_PATTERN_IDS = SLOP_PATTERNS.map((p) => p.id);

export const NO_AI_SLOP_RULES = `No AI slop (adapted from petergyang/no-ai-slop, MIT; Yoca adds Turkish/Azerbaijani/Arabic equivalents):
Principles
- Preserve the writer's point and real voice: vocabulary, cadence, bluntness, uncertainty, digressions. Make the minimum effective edit; leave strong sentences alone.
- Never invent claims, examples, numbers, quotes, sources or opinions. If something needs a source and none is given, flag it instead of inventing one.
- Lead with the point when the setup adds nothing. Use active voice with a human or named subject. Concrete beats abstract: names, mechanisms, dates, examples.
- Portability test: a sentence that would fit any company's blog unchanged is filler. Cut it or make it specific to this subject.
- Show, do not label: cut commentary that calls a point important, surprising or obvious.
- Keep technical terms, quotations, product names, real hedges ("muhtemelen", "bizim gözlemimiz") and the writer's own phrasing. Do not flatten everything into the same tidy prose. Never insert typos or deliberate errors to look "human".
Patterns to remove (with the Turkish forms that matter most)
- Empty openers / scene-setting: "In today's fast-paced digital world", "Günümüzün hızla değişen dijital dünyasında", "Dijital çağda", "Teknolojinin baş döndürücü hızla geliştiği bu dönemde", "Hiç düşündünüz mü…?". Start with the point.
- Binary contrast as a crutch: "It's not X, it's Y", "Bu sadece X değil, aynı zamanda Y", "Mesele X değil, Y". Especially when repeated. State Y directly.
- Faux-insight setups: "What nobody tells you", "Kimsenin size söylemediği", "Çoğu kişinin atladığı nokta". Make the claim.
- Colon reveals for drama ("İşin sırrı: …"). Use colons for lists and labels only.
- Superficial analysis: trailing clauses that claim meaning without content ("…, highlighting…", "…, bu da önemini bir kez daha gösteriyor", "…açısından kritik bir öneme sahip"). Say the actual consequence.
- Importance puffery and unsupported praise: "pivotal", "a testament to", "devrim niteliğinde", "benzersiz çözümler", "eşsiz deneyim", "oyunun kurallarını değiştiren", "çığır açan", "kritik bir rol oynuyor", "hayati önem taşıyor". State the fact.
- Interpretive metadiscourse: "Burada dikkat edilmesi gereken", "Altını çizmek gerekir ki", "Önemle belirtmek gerekir", "Kısacası" used as a crutch.
- Weasel attribution: "studies show", "experts agree", "araştırmalar gösteriyor", "uzmanlar hemfikir", "bilindiği üzere". Name the source or flag the claim as unsupported.
- Fake-strong verbs: "serves as", "konumlanıyor", "bir köprü görevi görüyor", "kilit rol üstleniyor". Prefer "is", "has", "does", "-dır", plain verbs.
- Synonym cycling: repeat the clear word instead of rotating synonyms for variety.
- Negative listing ("X değil. Y değil. Z.") and stacks of dramatic one-line fragments.
- Robotic rhythm: the same sentence shape, the same paragraph length and a three-item list in every section. Vary only when it helps the point.
- Rhetorical setups: "What if I told you", "Peki ya…?" / self-answered question pairs as section openers.
- Fake-profound kickers and summary endings: "Sonuç olarak", "Özetle", "Unutmayın ki…", a closing paragraph that repeats the whole article, a cute aphorism. End on the last concrete point or a next step.
- Formatting slop: emoji, bold sprinkled mid-sentence, bullets where prose argues better, headings over two-sentence sections.
- Em dashes: none in short copy; at most one or two in a long article, never clustered.
- Empty words (cut unless they carry meaning): delve, leverage, utilize, robust, seamless, empower, elevate, transformative, cutting-edge, game changer, tapestry, realm, journey (figurative), holistic, synergy; Turkish: "yolculuk" (mecaz), "dönüşüm yolculuğu", "sinerji", "bütüncül" (dolgu), "kapıları aralamak", "bir adım öne çıkın", "gerçekten", "inanılmaz derecede", "son derece".
Same patterns in the other site languages (apply them when the text is in that language; the principles above are identical):
- English: the English examples above are the reference list. Also: "In an era where…", "Let's dive in", "It's worth noting that", "plays a crucial role", "unlock the potential", "navigate the complexities", "In conclusion,".
- Azerbaijani (az):
  - Empty openers: "Müasir sürətlə dəyişən rəqəmsal dünyada", "Rəqəmsal əsrdə", "Texnologiyanın sürətlə inkişaf etdiyi bu dövrdə", "Heç düşünmüsünüzmü…?".
  - Binary contrast: "Bu sadəcə X deyil, həm də Y", "Məsələ X-də deyil, Y-dədir".
  - Weasel attribution: "Araşdırmalar göstərir ki", "Mütəxəssislər hesab edir ki", "Hamıya məlumdur ki", "Bildiyimiz kimi" — name the source or flag it.
  - Puffery: "inqilabi", "misilsiz", "unikal həllər", "oyunun qaydalarını dəyişən", "əvəzolunmaz", "həyati əhəmiyyət daşıyır", "əsas rol oynayır".
  - Metadiscourse: "Qeyd etmək lazımdır ki", "Xüsusilə vurğulamaq istərdik ki", "Diqqət yetirilməli olan məqam".
  - Fake-strong verbs: "körpü rolunu oynayır", "mövqelənir", "açar rol oynayır".
  - Endings: "Nəticə olaraq", "Yekun olaraq", "Xülasə", "Unutmayın ki…" with a slogan.
  - Empty words: "səyahət" (figurative), "transformasiya səyahəti", "sinergiya", "yeni üfüqlər açmaq", "bir addım öndə olun", "həqiqətən", "inanılmaz dərəcədə", "son dərəcə".
- Arabic (ar):
  - Empty openers: "في عالمنا الرقمي المتسارع", "في ظل التطورات المتلاحقة", "في عصرنا الحالي", "في عصر التكنولوجيا", "هل تساءلت يوماً…؟".
  - Binary contrast: "ليس مجرد … بل …", "لا يقتصر الأمر على … بل يتعداه إلى", "المسألة ليست … وإنما …" used as a crutch.
  - Weasel attribution: "تشير الدراسات إلى", "يرى الخبراء أن", "من المعروف أن", "كما هو معلوم" — name the source or flag it.
  - Puffery: "ثوري", "فريد من نوعه", "لا مثيل له", "نقلة نوعية", "يغيّر قواعد اللعبة", "بالغ الأهمية", "يلعب دوراً محورياً".
  - Metadiscourse: "تجدر الإشارة إلى أن", "من الجدير بالذكر", "لا بد من التأكيد على".
  - Fake-strong verbs: "يمثّل جسراً", "يتموضع", "يضطلع بدور رئيسي".
  - Endings: "وفي الختام", "خلاصة القول", "ختاماً", "تذكّر دائماً أن…" with a slogan.
  - Empty words: "رحلة" (figurative), "رحلة التحول", "تآزر", "آفاق جديدة", "خطوة إلى الأمام", "حقاً", "للغاية", "بشكل لا يصدق".
  - Write Modern Standard Arabic; keep Latin product and brand names as they are; do not add tatweel or decorative punctuation.`;

export const NO_AI_SLOP_DETECT = `Job: DETECT only. Read the full text. For every place where one of the listed patterns appears, return the exact excerpt (copy it character for character from the text, a sentence or shorter), the pattern id, and a short fix suggestion (max ~15 words, in Turkish). Do not rewrite the text, do not score it, do not guess whether AI wrote it, do not report a "% AI" figure. Report each distinct occurrence once; at most 40 findings. A repeated construction across paragraphs (e.g. "Bu sadece X değil" three times, identical paragraph shapes) is one finding per occurrence for binary contrasts and one finding for robotic rhythm. Do not flag technical terms, quotations, real hedges or concrete detail. If there are no findings, return an empty list.`;

export const NO_AI_SLOP_EDIT = `Job: EDIT with the minimum effective change. Fix only what matches the listed patterns, real errors, repetition and genuinely tangled sentences. Keep meaning, facts, numbers, links, Markdown, headings (wording may tighten), quotations and the writer's voice. Do not add claims, examples, numbers, sources or opinions. Length stays within about ±10% unless cutting filler. Leave strong sentences untouched character for character.`;

export const NO_AI_SLOP_EVAL = `Before returning, check your edit once (one pass, no loops): (1) no new claims, numbers or sources; (2) voice and structure kept; (3) strong sentences untouched; (4) listed patterns and empty words gone unless quoted; (5) no summary ending or fake-profound kicker; (6) em dashes sparse; (7) no robotic symmetry. Fix what fails, then return.`;
