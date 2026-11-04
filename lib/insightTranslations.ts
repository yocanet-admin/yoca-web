'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyInsight, saveRevision, slugify, toPayload, type EditableInsight } from '@/lib/insightsAdmin';
import { readingMinutes } from '@/lib/markdown';
import { asciiSlug, uniqueSlug } from '@/lib/ai/translateHelpers';
import type { Translation } from '@/lib/ai/schemas';
import type { InsightRow, Locale } from '@/types';

/**
 * Yoca — saves translations of a source article into its group (browser,
 * admin session + RLS). Used by the source editor's "Diller" step and by
 * "Çeviri oluştur" on a missing language tab. Per language:
 *  - no row yet → a new DRAFT in the same group (unique slug in that language);
 *  - a draft row → snapshot revision, then the fields are replaced;
 *  - a published/scheduled row → NOT changed; the new text is stored as a
 *    proposal revision on it.
 * Translating never publishes. Returns a note per locale; "!" = error.
 */
export async function saveTranslationsToGroup(
  supabase: SupabaseClient,
  source: EditableInsight & { id: string },
  items: Array<{ locale: Locale; translation: Translation }>,
  fingerprint: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const { data: fresh } = await supabase.from('insights').select('id,locale,slug,status,title,excerpt,body_md').eq('group_id', source.group_id);
  const group = (fresh ?? []) as Array<Pick<InsightRow, 'id' | 'locale' | 'slug' | 'status' | 'title' | 'excerpt' | 'body_md'>>;
  for (const { locale, translation: t } of items) {
    const fields = {
      title: t.title.trim(),
      excerpt: t.excerpt.trim(),
      body_md: t.body,
      seo_title: t.seoTitle.trim() || null,
      meta_description: t.metaDescription.trim() || null,
      og_title: t.ogTitle.trim() || null,
      og_description: t.ogDescription.trim() || null,
      faq: t.faq.filter((f) => f.q.trim() && f.a.trim()),
      tags: t.tags.map((x) => x.trim()).filter(Boolean),
      cover_alt: t.coverAlt.trim() || source.cover_alt,
      cover_caption: t.coverCaption.trim() || source.cover_caption,
      source_insight_id: source.id,
      source_hash: fingerprint,
      language_reviewed: false,
      language_reviewed_at: null,
      language_reviewed_by: null,
      reading_minutes: readingMinutes(t.body),
    };
    const existing = group.find((g) => g.locale === locale && g.id !== source.id);
    if (existing && (existing.status === 'PUBLISHED' || existing.status === 'SCHEDULED')) {
      const ok = await saveRevision(existing.id, { title: fields.title, excerpt: fields.excerpt, body_md: fields.body_md }, 'Çok dilli çeviri önerisi (yayındaki metin değiştirilmedi)', 'ai_proposal');
      out[locale] = ok ? 'Bu dil yayında; yayındaki metin değiştirilmedi. Yeni çeviri o yazının sürüm geçmişine öneri olarak kaydedildi.' : '!Yayındaki çeviriye öneri kaydedilemedi.';
      continue;
    }
    if (existing) {
      await saveRevision(existing.id, existing, 'Çok dilli güncelleme öncesi');
      const { error } = await supabase.from('insights').update(fields).eq('id', existing.id);
      out[locale] = error ? `!Kaydedilemedi: ${error.message}` : 'Mevcut taslak güncellendi (önceki metin sürüm geçmişinde).';
      continue;
    }
    const base = asciiSlug(t.slug) || asciiSlug(t.title) || `${slugify(source.slug || source.title)}-${locale}`;
    const { data: taken } = await supabase.from('insights').select('slug').eq('locale', locale).like('slug', `${base}%`);
    let slug = uniqueSlug(base, ((taken ?? []) as Array<{ slug: string }>).map((x) => x.slug), `${slugify(source.slug)}-${locale}`);
    const payload = () => toPayload({
      ...emptyInsight(locale, source.group_id),
      ...fields,
      slug,
      category_key: source.category_key,
      author_name: source.author_name,
      author_role: source.author_role,
      related_service: source.related_service,
      related_product: source.related_product,
      cta_type: source.cta_type,
      cover_url: source.cover_url,
      og_image: source.og_image,
      sources: source.sources,
      status: 'DRAFT',
    });
    let ins = await supabase.from('insights').insert(payload()).select('id').single();
    if (ins.error?.code === '23505') {
      slug = `${base}-${Date.now().toString(36)}`;
      ins = await supabase.from('insights').insert(payload()).select('id').single();
    }
    out[locale] = ins.error ? `!Kaydedilemedi: ${ins.error.message}` : `Yeni taslak oluşturuldu (/${locale}/insights/${slug}).`;
  }
  return out;
}

/**
 * "Elle çeviri": an empty DRAFT in that language, linked to the source
 * (so it needs the language check before publishing and shows "kaynak
 * değişti" when the source changes). Category, author, CTA, cover and sources
 * are copied from the source; the text is left empty for the translator.
 */
export async function createManualTranslation(supabase: SupabaseClient, source: EditableInsight & { id: string }, locale: Locale, fingerprint: string): Promise<{ id?: string; error?: string }> {
  const base = `${slugify(source.slug || source.title)}-${locale}`;
  const { data: taken } = await supabase.from('insights').select('slug').eq('locale', locale).like('slug', `${base}%`);
  const slug = uniqueSlug(base, ((taken ?? []) as Array<{ slug: string }>).map((x) => x.slug), base);
  const payload = {
    ...toPayload({
      ...emptyInsight(locale, source.group_id),
      slug,
      category_key: source.category_key,
      author_name: source.author_name,
      author_role: source.author_role,
      related_service: source.related_service,
      related_product: source.related_product,
      cta_type: source.cta_type,
      cover_url: source.cover_url,
      og_image: source.og_image,
      sources: source.sources,
      status: 'DRAFT',
    }),
    source_insight_id: source.id,
    source_hash: fingerprint,
    language_reviewed: false,
  };
  const { data, error } = await supabase.from('insights').insert(payload).select('id').single();
  if (error || !data) return { error: error?.message ?? 'Oluşturulamadı.' };
  return { id: (data as { id: string }).id };
}
