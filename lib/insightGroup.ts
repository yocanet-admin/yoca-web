/**
 * Yoca — one article in every language (pure, no imports from the app;
 * server + browser; unit-tested in tests/insight-group.test.ts).
 *
 * An article's language versions are the rows of public.insights that share
 * a group_id (v6). Translations made in the studio are created in the
 * source's group and also remember their source (v15 source_insight_id).
 * Grouping uses group_id only — never title similarity. Anything that does
 * not fit (two rows in the same language, a translation whose source sits in
 * another group) is shown as a warning and left as it is.
 */

/** Display order in the admin (TR first). */
export const GROUP_LOCALES = ['tr', 'en', 'ar', 'az'] as const;
export type GroupLocale = (typeof GROUP_LOCALES)[number];

export const LOCALE_NAME: Record<GroupLocale, string> = { tr: 'Türkçe', en: 'English', ar: 'العربية', az: 'Azərbaycanca' };

export type LangState = 'missing' | 'draft' | 'review' | 'ready' | 'published' | 'scheduled';

/** Shown as text next to every colour (never colour alone). */
export const LANG_STATE_LABEL: Record<LangState, string> = {
  missing: 'Yok',
  draft: 'Taslak',
  review: 'Kontrol bekliyor',
  ready: 'Hazır',
  published: 'Yayında',
  scheduled: 'Zamanlandı',
};

export interface GroupMember {
  id: string;
  group_id: string;
  locale: string;
  title: string;
  slug: string;
  body_md: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  publish_at: string | null;
  updated_at: string;
  source_insight_id?: string | null;
  language_reviewed?: boolean;
  source_hash?: string | null;
  author_name?: string;
  category_key?: string | null;
  featured?: boolean;
}

export type BlockerCode = 'title' | 'slug' | 'body' | 'source_marker' | 'language_review' | 'image' | 'slug_taken' | 'conflict' | 'group';
export interface Blocker {
  code: BlockerCode;
  text: string;
}

const SOURCE_MARKER = /\[KAYNAK GEREKL[İI][^\]]*\]/gi;

/**
 * What stops one language version from being published, checked on the text
 * as it is (saved or unsaved). The server repeats these checks and adds the
 * ones that need the database (images, slug in use, concurrent edits).
 */
export function publishBlockers(row: Pick<GroupMember, 'title' | 'slug' | 'body_md' | 'source_insight_id' | 'language_reviewed'>): Blocker[] {
  const out: Blocker[] = [];
  if (!row.title?.trim()) out.push({ code: 'title', text: 'Başlık boş.' });
  if (!row.slug?.trim()) out.push({ code: 'slug', text: 'Slug (adres) boş.' });
  if (!row.body_md?.trim()) out.push({ code: 'body', text: 'Gövde metni boş.' });
  const markers = (row.body_md ?? '').match(SOURCE_MARKER)?.length ?? 0;
  if (markers > 0) out.push({ code: 'source_marker', text: `Metinde ${markers} adet [KAYNAK GEREKLİ] işareti var. Kaynağı ekleyin ya da iddiayı çıkarın.` });
  if (row.source_insight_id && !row.language_reviewed) out.push({ code: 'language_review', text: 'Dil kontrolü yapılmadı: metni o dili bilen biri okuyup onaylamalı.' });
  return out;
}

/** State of one language version. Undefined row → "Yok". */
export function langState(row: Pick<GroupMember, 'title' | 'slug' | 'body_md' | 'status' | 'source_insight_id' | 'language_reviewed'> | undefined | null): LangState {
  if (!row) return 'missing';
  if (row.status === 'PUBLISHED') return 'published';
  if (row.status === 'SCHEDULED') return 'scheduled';
  const blockers = publishBlockers(row);
  if (blockers.some((b) => b.code !== 'language_review')) return 'draft';
  if (blockers.length) return 'review';
  return 'ready';
}

export interface ArticleGroup<M extends GroupMember = GroupMember> {
  groupId: string;
  /** Turkish title when there is a Turkish version, else the source's, else the first one. */
  title: string;
  titleLocale: string;
  /** Rows per language. Normally one; two or more means an unclear relation (see warnings). */
  byLocale: Partial<Record<GroupLocale, M[]>>;
  members: M[];
  /** The row a click on the title opens (Turkish, else the source, else the newest). */
  primary: M;
  updatedAt: string;
  /** Earliest publish time of a published version (first publication of the article). */
  firstPublishedAt: string | null;
  warnings: string[];
}

/** Groups rows by group_id. Rows are never moved between groups. */
export function groupInsights<M extends GroupMember>(rows: M[]): ArticleGroup<M>[] {
  const byGroup = new Map<string, M[]>();
  for (const r of rows) byGroup.set(r.group_id, [...(byGroup.get(r.group_id) ?? []), r]);
  const ids = new Map(rows.map((r) => [r.id, r]));
  const out: ArticleGroup<M>[] = [];
  byGroup.forEach((members, groupId) => {
    const sorted = [...members].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const byLocale: Partial<Record<GroupLocale, M[]>> = {};
    const warnings: string[] = [];
    for (const m of sorted) {
      const l = m.locale as GroupLocale;
      if (!(GROUP_LOCALES as readonly string[]).includes(l)) {
        warnings.push(`Tanınmayan dil kodu (${m.locale}) — kayıt değiştirilmedi.`);
        continue;
      }
      byLocale[l] = [...(byLocale[l] ?? []), m];
    }
    for (const l of GROUP_LOCALES) {
      const list = byLocale[l];
      if (list && list.length > 1) warnings.push(`${l.toUpperCase()} için ${list.length} ayrı kayıt var. Otomatik birleştirilmedi; hangisinin geçerli olduğuna siz karar verin.`);
    }
    for (const m of sorted) {
      if (!m.source_insight_id) continue;
      const src = ids.get(m.source_insight_id);
      if (src && src.group_id !== groupId) warnings.push(`${m.locale.toUpperCase()} çevirisinin kaynağı başka bir yazı grubunda (“${src.title || src.slug}”). Otomatik birleştirilmedi.`);
    }
    const tr = byLocale.tr?.[0];
    const source = sorted.find((m) => !m.source_insight_id && m.title.trim());
    const primary = tr ?? source ?? sorted[0];
    const titled = [tr, source, ...sorted].find((m) => m && m.title.trim()) ?? primary;
    const published = sorted.filter((m) => m.status === 'PUBLISHED' && m.publish_at).map((m) => m.publish_at as string).sort();
    out.push({
      groupId,
      title: titled.title,
      titleLocale: titled.locale,
      byLocale,
      members: sorted,
      primary,
      updatedAt: sorted[0].updated_at,
      firstPublishedAt: published[0] ?? null,
      warnings: Array.from(new Set(warnings)),
    });
  });
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The version shown for a language (the newest when there are several). */
export function memberFor<M extends GroupMember>(group: ArticleGroup<M>, locale: GroupLocale): M | undefined {
  return group.byLocale[locale]?.[0];
}

export interface GroupFilter {
  locale: GroupLocale | 'all';
  state: LangState | 'all';
}

/**
 * Language + state filter on whole articles:
 *  - language only: articles that have that language;
 *  - state only: articles where some language is in that state ("Yok" = a language is missing);
 *  - both: articles where that language is in that state (e.g. AZ · Yok).
 */
export function matchesFilter(group: ArticleGroup, filter: GroupFilter): boolean {
  if (filter.locale === 'all' && filter.state === 'all') return true;
  if (filter.state === 'all') return Boolean(memberFor(group, filter.locale as GroupLocale));
  const locales = filter.locale === 'all' ? GROUP_LOCALES : [filter.locale];
  return locales.some((l) => langState(memberFor(group, l)) === filter.state);
}

/* ── Bulk publish ─────────────────────────────────────────────── */

/**
 * Fields the bulk publish may save from an open editor. Status, publish
 * time, language, group, source link and the language-check fields are
 * never taken from the browser.
 */
export const EDITABLE_FIELDS = [
  'title', 'slug', 'excerpt', 'body_md', 'cover_url', 'cover_alt', 'cover_caption', 'category_key', 'tags',
  'author_name', 'author_role', 'featured', 'related_service', 'related_product', 'related_insight_id', 'cta_type',
  'seo_title', 'meta_description', 'canonical_override', 'og_title', 'og_description', 'og_image', 'noindex', 'sources', 'faq',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

const TEXT = new Set<string>(['title', 'slug', 'excerpt', 'body_md', 'author_name']);
const NULLABLE_TEXT = new Set<string>(['cover_url', 'cover_alt', 'cover_caption', 'category_key', 'author_role', 'related_service', 'related_product', 'related_insight_id', 'seo_title', 'meta_description', 'canonical_override', 'og_title', 'og_description', 'og_image']);
const CTA = ['none', 'contact', 'checkup', 'service', 'product'];
/** Longer than this is refused (reported), never cut. */
export const FIELD_MAX: Record<string, number> = { body_md: 400_000, excerpt: 5_000, title: 500, slug: 300 };
const DEFAULT_MAX = 5_000;

/**
 * Keeps only known editable fields with the right type; values are kept as
 * they are (nothing is cut or rewritten). Pure.
 */
export function sanitizeChanges(input: unknown): Partial<Record<EditableField, unknown>> {
  const out: Partial<Record<EditableField, unknown>> = {};
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  // The language check can be withdrawn from the editor, never given: giving
  // it is the explicit confirmation in the publish dialog (confirmReview).
  if (src.language_reviewed === false) (out as Record<string, unknown>).language_reviewed = false;
  for (const key of EDITABLE_FIELDS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (TEXT.has(key)) {
      if (typeof v === 'string') out[key] = v;
    } else if (NULLABLE_TEXT.has(key)) {
      if (v === null || typeof v === 'string') out[key] = v;
    } else if (key === 'tags') {
      if (Array.isArray(v) && v.every((t) => typeof t === 'string')) out.tags = v;
    } else if (key === 'featured' || key === 'noindex') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (key === 'cta_type') {
      if (typeof v === 'string' && CTA.includes(v)) out.cta_type = v;
    } else if (key === 'faq') {
      if (Array.isArray(v) && v.every((f) => f && typeof f === 'object' && typeof (f as { q?: unknown }).q === 'string' && typeof (f as { a?: unknown }).a === 'string')) out.faq = v;
    } else if (key === 'sources') {
      if (Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof (x as { url?: unknown }).url === 'string')) out.sources = v;
    }
  }
  return out;
}

/** Fields that are too long to save (reported as a reason, not cut). Pure. */
export function oversizedFields(changes: Partial<Record<EditableField, unknown>>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    const len = typeof v === 'string' ? v.length : Array.isArray(v) ? JSON.stringify(v).length / 10 : 0;
    if (len > (FIELD_MAX[k] ?? DEFAULT_MAX)) out.push(k);
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only the fields whose value differs from the stored row. Pure. */
export function diffChanges(stored: Record<string, unknown>, changes: Partial<Record<EditableField, unknown>>): Partial<Record<EditableField, unknown>> {
  const out: Partial<Record<EditableField, unknown>> = {};
  for (const key of Object.keys(changes) as EditableField[]) if (!same(stored[key], changes[key])) out[key] = changes[key];
  return out;
}

/** Editable fields of a row (what an open editor sends). Pure. */
export function editableFields(row: Record<string, unknown>): Partial<Record<EditableField, unknown>> {
  const out: Partial<Record<EditableField, unknown>> = {};
  for (const key of EDITABLE_FIELDS) if (key in row) out[key] = row[key];
  // A withdrawn language check travels with the editor's text (see sanitizeChanges).
  if (row.language_reviewed === false) (out as Record<string, unknown>).language_reviewed = false;
  return out;
}

/** Images in a published body are public URLs, in a draft they are references: read both as the image id. */
function normalizeImages(body: string): string {
  return body.replace(/(?:yoca-image:|https?:\/\/[^)\s]*\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.(?:png|jpe?g|webp))?/gi, 'img:$1');
}

/**
 * Canonical text of everything a visitor sees of one language version. The
 * publish routes store its SHA-256 with the publish record; a published
 * version whose fingerprint still matches is "unchanged" and is not
 * published again.
 */
export function publicFingerprintText(row: Record<string, unknown>): string {
  const s = (k: string) => String(row[k] ?? '').trim();
  return JSON.stringify([
    s('title'), s('slug'), s('excerpt'), normalizeImages(String(row.body_md ?? '')).trim(),
    row.cover_url ? normalizeImages(String(row.cover_url)) : '', s('cover_alt'), s('cover_caption'), s('category_key'),
    (Array.isArray(row.tags) ? row.tags : []).map((t) => String(t).trim()), s('author_name'), s('author_role'),
    s('related_service'), s('related_product'), s('related_insight_id'), s('cta_type'),
    s('seo_title'), s('meta_description'), s('canonical_override'), s('og_title'), s('og_description'),
    row.og_image ? normalizeImages(String(row.og_image)) : '', Boolean(row.noindex), Boolean(row.featured),
    (Array.isArray(row.faq) ? row.faq : []).map((f) => [String((f as { q?: string }).q ?? '').trim(), String((f as { a?: string }).a ?? '').trim()]),
    (Array.isArray(row.sources) ? row.sources : []).map((x) => String((x as { url?: string }).url ?? '')),
  ]);
}

export async function publicFingerprint(row: Record<string, unknown>): Promise<string> {
  const data = new TextEncoder().encode(publicFingerprintText(row));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What a bulk publish does with one version:
 *  publish   — not public yet (draft, in review, scheduled, archived) → public now
 *  update    — already public and its text changed → saved again through publishing ("Güncelle")
 *  unchanged — already public, nothing changed → left alone
 * `changed` null = unknown (published before fingerprints were stored) → treated as unchanged.
 */
export type BulkMode = 'publish' | 'update' | 'unchanged';
export function bulkMode(status: GroupMember['status'], changed: boolean | null): BulkMode {
  if (status !== 'PUBLISHED') return 'publish';
  return changed ? 'update' : 'unchanged';
}

export type BulkOutcome = 'published' | 'updated' | 'unchanged' | 'failed';
export const OUTCOME_LABEL: Record<BulkOutcome, string> = { published: 'Yayımlandı', updated: 'Güncellendi', unchanged: 'Değişmedi', failed: 'Başarısız' };

/** One honest sentence about a bulk run; never "all published" when one failed. Pure. */
export function summarizeOutcomes(results: Array<{ locale: string; outcome: BulkOutcome }>): string {
  if (!results.length) return 'Hiçbir dil işlenmedi.';
  const by = (o: BulkOutcome) => results.filter((r) => r.outcome === o).map((r) => r.locale.toUpperCase());
  const failed = by('failed');
  const done = [...by('published'), ...by('updated')];
  const parts: string[] = [];
  if (by('published').length) parts.push(`Yayımlandı: ${by('published').join(', ')}`);
  if (by('updated').length) parts.push(`Güncellendi: ${by('updated').join(', ')}`);
  if (by('unchanged').length) parts.push(`Değişmedi: ${by('unchanged').join(', ')}`);
  if (failed.length) parts.push(`Başarısız: ${failed.join(', ')}`);
  if (!failed.length && done.length === results.length) return `Seçilen ${results.length} dilin tümü tamamlandı. ${parts.join(' · ')}.`;
  if (!done.length && failed.length) return `Hiçbir dil yayımlanmadı. ${parts.join(' · ')}.`;
  return `Kısmen tamamlandı (${results.length} dilden ${done.length} tanesi). ${parts.join(' · ')}.`;
}

/**
 * Same moment? Timestamps reach the server from PostgREST and from other
 * clients in slightly different spellings (+00:00 / Z, trailing zeros);
 * compares down to the microsecond. Pure.
 */
export function sameTimestamp(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return a === b;
  if (a === b) return true;
  const sa = Date.parse(a), sb = Date.parse(b);
  if (!Number.isFinite(sa) || !Number.isFinite(sb) || Math.floor(sa / 1000) !== Math.floor(sb / 1000)) return false;
  const fa = /\.(\d+)/.exec(a)?.[1] ?? '', fb = /\.(\d+)/.exec(b)?.[1] ?? '';
  // One side may carry only milliseconds: compare as far as both are precise.
  const len = Math.max(3, Math.min(fa.length || 3, fb.length || 3));
  return (fa + '000000').slice(0, len) === (fb + '000000').slice(0, len);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
