import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireContent } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { sourceFingerprint, type TranslatableFields } from '@/lib/ai/translateHelpers';
import { readingMinutes } from '@/lib/markdown';
import {
  bulkMode,
  diffChanges,
  publicFingerprint,
  publishBlockers,
  oversizedFields,
  sameTimestamp,
  sanitizeChanges,
  summarizeOutcomes,
  UUID_RE,
  type Blocker,
  type BulkMode,
  type BulkOutcome,
  type GroupMember,
} from '@/lib/insightGroup';
import { findPendingByKey, findPublishByKey, finalizePublishRecord, imagePatch, insertPublishSnapshot, lastPublishedFingerprint, markSnapshotNotPublished, recordedFirstPublish, recordMediaUrls, resolveImages, withMediaUrls } from '@/lib/insightPublishServer';

/**
 * Yoca — publish several language versions of ONE article at once (admin or content editor).
 *
 * POST {
 *   groupId, requestKey (uuid, one per dialog), dryRun?,
 *   keepFirstPublishDate? (default true),
 *   items: [{ insightId, expectedUpdatedAt, changes?, confirmReview? }]
 * }
 *
 * dryRun: nothing is written; every item gets what would happen
 *   (publish / update / unchanged) and what blocks it, evaluated on the text
 *   as it is in the editor (changes) — the same checks as the real run.
 *
 * Real run, per item, independently (a failing language never stops the others):
 *   1. same request key already finished for this version → its result is returned (retry / double click);
 *   2. the version must belong to the group and be unchanged since the editor loaded it (expectedUpdatedAt);
 *   3. unsaved editor changes (whitelisted fields only) are merged;
 *   4. confirmReview sets the language check for a translation that lacks it —
 *      only when the admin ticked it in the dialog for these languages; never implied;
 *   5. checks: title, slug, body, [KAYNAK GEREKLİ], language check, slug in use, image references;
 *   6. already public and nothing changed → "unchanged", nothing written;
 *   7. image references → /media/insights URLs (nothing is copied: an image is
 *      served only while a visible version uses it), pre-publish snapshot revision,
 *      ONE conditional update with the admin's own session (RLS + audit log
 *      actor) that saves the changes and publishes; an update keeps the first
 *      publish date unless asked otherwise;
 *   8. the snapshot gets the fingerprint of what is now public + the request key.
 * Languages not listed are not read for writing and never changed.
 * Publishing sends no e-mail (newsletter is a separate, once-per-article send).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Article = GroupMember & Record<string, unknown> & { excerpt: string; cover_alt: string | null; og_image: string | null };

interface ItemIn {
  insightId?: string;
  expectedUpdatedAt?: string;
  changes?: unknown;
  confirmReview?: boolean;
  /** The content the admin confirmed the language check for (fingerprint from the dry run). */
  reviewFingerprint?: string;
  /** Published before fingerprints were stored: the admin chose to publish it again anyway. */
  forceUpdate?: boolean;
}

export interface ItemResult {
  insightId: string;
  locale: string;
  title: string;
  mode: BulkMode | null;
  outcome?: BulkOutcome;
  blockers: Blocker[];
  warnings: string[];
  changed: boolean | null;
  needsReview: boolean;
  reviewSet?: boolean;
  /** Fingerprint of the content as it would be published (dry run → confirmation). */
  fingerprint?: string;
  publishAt?: string | null;
  updatedAt?: string;
  replay?: boolean;
}

const SOURCE_FIELDS = 'id,locale,title,excerpt,body_md,seo_title,meta_description,og_title,og_description,faq,tags,cover_alt,cover_caption';

export async function POST(request: NextRequest) {
  const admin = await requireContent(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const service = getSupabaseServiceRole();
  const asUser = getSupabaseAsUser(bearerToken(request));
  if (!service || !asUser) return NextResponse.json({ ok: false, error: 'Sunucu anahtarı yok.' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { groupId?: string; requestKey?: string; dryRun?: boolean; keepFirstPublishDate?: boolean; items?: ItemIn[] };
  const groupId = String(body.groupId ?? '');
  if (!UUID_RE.test(groupId)) return NextResponse.json({ ok: false, error: 'groupId gerekli.' }, { status: 400 });
  const dryRun = body.dryRun === true;
  const requestKey = String(body.requestKey ?? '');
  if (!dryRun && !UUID_RE.test(requestKey)) return NextResponse.json({ ok: false, error: 'requestKey gerekli.' }, { status: 400 });
  const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
  if (!items.length) return NextResponse.json({ ok: false, error: 'Yayınlanacak dil seçilmedi.' }, { status: 400 });
  if (new Set(items.map((i) => i.insightId)).size !== items.length) return NextResponse.json({ ok: false, error: 'Aynı dil iki kez gönderildi.' }, { status: 400 });
  const keepFirst = body.keepFirstPublishDate !== false;
  const by = admin.email ?? admin.id;

  // Only the listed rows are read; each must be in this group.
  const ids = items.map((i) => String(i.insightId ?? '')).filter((id) => UUID_RE.test(id));
  const { data: rows, error: readError } = await service.from('insights').select('*').in('id', ids);
  if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  const byId = new Map(((rows ?? []) as Article[]).map((r) => [r.id, r]));

  const results: ItemResult[] = [];
  for (const item of items) {
    const id = String(item.insightId ?? '');
    const article = byId.get(id);
    if (!article) {
      results.push({ insightId: id, locale: '?', title: '', mode: null, outcome: dryRun ? undefined : 'failed', blockers: [{ code: 'group', text: 'Bu sürüm bulunamadı.' }], warnings: [], changed: null, needsReview: false });
      continue;
    }
    results.push(await handle(article, item));
  }

  async function handle(article: Article, item: ItemIn): Promise<ItemResult> {
    const base: ItemResult = { insightId: article.id, locale: article.locale, title: article.title, mode: null, blockers: [], warnings: [], changed: null, needsReview: false };

    // 1. Retry of a request that already went through for this version.
    if (!dryRun) {
      const done = await findPublishByKey(service!, article.id, requestKey);
      if (done?.outcome) return { ...base, mode: done.outcome === 'updated' ? 'update' : 'publish', outcome: done.outcome, changed: done.outcome === 'updated', publishAt: article.publish_at, updatedAt: article.updated_at, replay: true };
      // The function stopped after its update but before the final record: the
      // pending snapshot of this key exists and the version is public since then.
      const pending = await findPendingByKey(service!, article.id, requestKey);
      if (pending && article.status === 'PUBLISHED' && Date.parse(article.updated_at) >= Date.parse(pending.created_at)) {
        const outcome: BulkOutcome = pending.outcome ?? 'published';
        await finalizePublishRecord(service!, pending.id, article, { requestKey, outcome, by });
        return { ...base, mode: outcome === 'updated' ? 'update' : 'publish', outcome, changed: outcome === 'updated', publishAt: article.publish_at, updatedAt: article.updated_at, replay: true };
      }
      // …or it stopped before its update: nothing became public; mark the snapshot and go on normally.
      if (pending) await markSnapshotNotPublished(service!, pending.id, 'önceki deneme yarıda kaldı');
    }

    // 2. Group and concurrency.
    if (article.group_id !== groupId) return fail(base, [{ code: 'group', text: 'Bu sürüm bu yazıya ait değil; işlem yapılmadı.' }]);
    if (!dryRun && !item.expectedUpdatedAt) return fail(base, [{ code: 'conflict', text: 'Sürüm bilgisi gönderilmedi; güvenli kaydetme yapılamaz. Sayfayı yenileyip tekrar deneyin.' }]);
    if (item.expectedUpdatedAt && !sameTimestamp(item.expectedUpdatedAt, article.updated_at)) {
      return fail(base, [{ code: 'conflict', text: 'Bu dil siz açtıktan sonra başka bir yerde kaydedildi. Bu dili yenileyip karşılaştırın; düzenlemeleriniz editörde duruyor.' }]);
    }

    // 3. Unsaved changes from the editor (whitelisted, only what differs).
    const changes = diffChanges(article, sanitizeChanges(item.changes));
    const merged = { ...article, ...changes } as Article;

    // 4. Language check: the editor's current state counts (a withdrawn check is
    // withdrawn); giving it again is the dialog's explicit confirmation, bound to
    // exactly the content that is published (fingerprint of the dry run).
    const isTranslation = Boolean(article.source_insight_id);
    const needsReview = isTranslation && !merged.language_reviewed;
    const contentFingerprint = await publicFingerprint(merged);
    const reviewSet = needsReview && item.confirmReview === true && item.reviewFingerprint === contentFingerprint;
    const reviewStale = needsReview && item.confirmReview === true && !reviewSet;
    if (reviewSet) merged.language_reviewed = true;

    // 5. Checks.
    const blockers = publishBlockers(merged);
    if (reviewStale && !dryRun) blockers.push({ code: 'language_review', text: 'Dil kontrolü onayı, onaylanan metinle eşleşmiyor (metin onaydan sonra değişti). Ekranı yeniden açıp güncel metni onaylayın.' });
    const tooLong = oversizedFields(changes);
    if (tooLong.length) blockers.push({ code: 'body', text: `Çok uzun alan: ${tooLong.join(', ')}. Kısaltın; metin kesilerek kaydedilmez.` });
    const slug = String(merged.slug ?? '').trim();
    if (slug) {
      const { data: taken } = await service!.from('insights').select('id').eq('locale', article.locale).eq('slug', slug).neq('id', article.id).limit(1);
      if (taken?.length) blockers.push({ code: 'slug_taken', text: `“${slug}” adresi bu dilde başka bir yazıda kullanılıyor.` });
    }
    const resolved = await resolveImages(service!, article.group_id, String(merged.body_md ?? ''));
    if (!resolved.ok) blockers.push({ code: 'image', text: resolved.error ?? 'Görsel referansı çözülemedi.' });

    const warnings: string[] = [];
    if (isTranslation && article.source_hash) {
      const { data: src } = await service!.from('insights').select(SOURCE_FIELDS).eq('id', article.source_insight_id as string).maybeSingle();
      if (src && (await sourceFingerprint(src as unknown as TranslatableFields)) !== article.source_hash) warnings.push(`Kaynak yazı (${String((src as { locale: string }).locale).toUpperCase()}) bu çeviriden sonra değişti; çeviri eski olabilir.`);
    }
    if (Object.keys(changes).length) warnings.push('Kaydedilmemiş düzenlemeler bu işlemle kaydedilecek.');

    // 6. Changed since it was published?
    let changed: boolean | null = null;
    if (article.status === 'PUBLISHED') {
      if (Object.keys(changes).length) changed = true;
      else {
        const stored = await lastPublishedFingerprint(service!, article.id);
        changed = stored ? stored !== (await publicFingerprint(article)) : null;
      }
    }
    const mode: BulkMode = item.forceUpdate === true && changed === null ? 'update' : bulkMode(article.status, changed);
    if (article.status === 'SCHEDULED') warnings.push(`Zamanlanmıştı (${article.publish_at ?? '—'}); şimdi yayımlanır.`);
    const verdict: ItemResult = { ...base, title: String(merged.title || article.title), mode, blockers, warnings, changed, needsReview, reviewSet, fingerprint: contentFingerprint };
    if (dryRun) return verdict;
    if (blockers.length) return fail(verdict, blockers);
    if (mode === 'unchanged') return { ...verdict, outcome: 'unchanged', publishAt: article.publish_at, updatedAt: article.updated_at };

    // 7. Snapshot, one conditional update.
    // Last look before writing: still the version the editor loaded?
    const { data: fresh } = await service!.from('insights').select('updated_at').eq('id', article.id).maybeSingle();
    if (!fresh || !sameTimestamp((fresh as { updated_at: string }).updated_at, article.updated_at)) {
      const done = await findPublishByKey(service!, article.id, requestKey);
      if (done?.outcome) return { ...verdict, outcome: done.outcome, replay: true };
      return fail(verdict, [{ code: 'conflict', text: 'Bu dil tam o sırada başka bir yerde değişti; yayımlanmadı. Yenileyip tekrar deneyin.' }]);
    }
    const plannedOutcome: BulkOutcome = mode === 'update' ? 'updated' : 'published';
    const revisionId = await insertPublishSnapshot(service!, article, mode === 'update' ? 'Toplu güncelleme öncesi' : 'Toplu yayın öncesi', by, { requestKey, outcome: plannedOutcome as 'published' | 'updated' });
    const now = new Date().toISOString();
    // First publication: the earliest recorded one, else the current publish time.
    const recorded = mode === 'update' ? await recordedFirstPublish(service!, article.id) : null;
    const candidates = [recorded, article.publish_at].filter((t): t is string => Boolean(t)).sort((a, b) => Date.parse(a) - Date.parse(b));
    const firstPublishedAt = candidates[0] ?? null;
    const publishAt = mode === 'update' && keepFirst && firstPublishedAt ? firstPublishedAt : now;
    const patch: Record<string, unknown> = {
      ...changes,
      body_md: withMediaUrls(String(merged.body_md), resolved.urls),
      status: 'PUBLISHED',
      publish_at: publishAt,
      ...imagePatch(resolved, merged),
      ...(reviewSet ? { language_reviewed: true, language_reviewed_at: now, language_reviewed_by: by } : {}),
      ...((changes as Record<string, unknown>).language_reviewed === false && !reviewSet ? { language_reviewed: false, language_reviewed_at: null, language_reviewed_by: null } : {}),
    };
    if ('body_md' in changes) patch.reading_minutes = readingMinutes(String(changes.body_md));
    const { data: updated, error } = await asUser!.from('insights').update(patch).eq('id', article.id).eq('updated_at', article.updated_at).select('*');
    const row = (updated ?? [])[0] as Record<string, unknown> | undefined;
    if (error || !row) {
      // Not published: the row did not change, so none of its images is served.
      // Lost a race (double click / second tab): maybe the other request was this same one.
      for (let i = 0; i < 3; i += 1) {
        await new Promise((r) => setTimeout(r, 300));
        const done = await findPublishByKey(service!, article.id, requestKey);
        if (done?.outcome) {
          await markSnapshotNotPublished(service!, revisionId, 'aynı istek zaten tamamlanmıştı');
          return { ...verdict, outcome: done.outcome, replay: true };
        }
      }
      await markSnapshotNotPublished(service!, revisionId, error?.message ?? 'sürüm bu arada değişti');
      return fail(verdict, [{ code: 'conflict', text: error ? `Kaydedilemedi: ${error.message}` : 'Bu dil tam o sırada başka bir yerde değişti; yayımlanmadı. Yenileyip tekrar deneyin.' }]);
    }
    const outcome: BulkOutcome = plannedOutcome;
    await recordMediaUrls(service!, resolved, row);
    // 8. What is public now, for "unchanged" next time and for retries.
    await finalizePublishRecord(service!, revisionId, row, { requestKey, outcome, by, firstPublishedAt: firstPublishedAt ?? null, ...(reviewSet ? { review: { by, at: now, fingerprint: contentFingerprint } } : {}) });
    return { ...verdict, outcome, publishAt: String(row.publish_at ?? ''), updatedAt: String(row.updated_at ?? '') };
  }

  function fail(r: ItemResult, blockers: Blocker[]): ItemResult {
    return { ...r, blockers, outcome: dryRun ? undefined : 'failed' };
  }

  const summary = dryRun ? null : summarizeOutcomes(results.map((r) => ({ locale: r.locale, outcome: r.outcome ?? 'failed' })));
  return NextResponse.json({ ok: true, dryRun, results, summary });
}
