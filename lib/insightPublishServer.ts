import type { SupabaseClient } from '@supabase/supabase-js';
import { DRAFT_BUCKET, PUBLIC_BUCKET } from '@/lib/ai/images';
import { collectImageRefs, replaceImageRefs } from '@/lib/insightImages';
import { publicFingerprint } from '@/lib/insightGroup';

/**
 * Yoca — server helpers shared by the two publish routes
 * (app/api/admin/insights/publish and …/publish-group). Service role only.
 *
 * Images (selected cover of the group, its 1200×630 crop, every yoca-image:
 * reference in the body) live in the private draft bucket. Publishing makes
 * them public in three steps, so a publish that fails leaves nothing public:
 *   stageImages            copy to the public bucket at a deterministic path
 *                          (existing objects reused, never a second copy);
 *                          remembers which objects THIS attempt created
 *   conditional update     the article row (admin session)
 *   failure → releaseImages        remove what this attempt created unless a
 *                                  published/scheduled version uses it
 *   success → verifyPublishedImages   re-copy anything a concurrent cleanup
 *                                     removed, record public URLs
 * The created objects are also written to the pending publish snapshot, so a
 * retry after a crash can release them (releaseStaleAttempt).
 *
 * Publish records: every publish stores a "publish" revision with the text
 * before publishing (restorable). After the row is public, the revision's
 * data.publish gets the fingerprint of what is now public (and the bulk
 * request key), so a later bulk publish can tell "unchanged" from "changed"
 * and a retried request does not publish twice.
 */

type ImageRow = { bucket: string; path: string; id: string; public_url: string | null; group_id: string | null; selected: boolean; crop: string | null; parent_id: string | null; alt_text: string };

export interface PromoteResult {
  ok: boolean;
  error?: string;
  urls: Record<string, string>;
  cover: ImageRow | null;
  og: ImageRow | null;
  /** Public objects THIS attempt created (did not exist before). Only these may be cleaned up. */
  created: StagedImage[];
}

export interface StagedImage {
  imageId: string;
  path: string;
  draftBucket: string;
  draftPath: string;
}

const PUBLIC_REF = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:png|jpe?g|webp)\b/gi;

export async function findImages(service: SupabaseClient, groupId: string, body: string): Promise<{ wanted: ImageRow[]; missing: string[]; cover: ImageRow | null; og: ImageRow | null }> {
  const draftRefs = collectImageRefs(body);
  // A body that was public already carries public URLs: those images are found by id too.
  const refs = Array.from(new Set([...draftRefs, ...Array.from(body.matchAll(PUBLIC_REF)).map((m) => m[1].toLowerCase())]));
  const { data } = await service.from('insight_images').select('id, bucket, path, public_url, group_id, selected, crop, parent_id, alt_text').eq('group_id', groupId);
  const images = (data ?? []) as ImageRow[];
  const cover = images.find((img) => img.selected) ?? null;
  const og = cover ? images.find((img) => img.parent_id === cover.id && img.crop === '1200x630') ?? null : null;
  const wanted = new Map<string, ImageRow>();
  for (const img of images) if (refs.includes(img.id) || img.id === cover?.id || img.id === og?.id) wanted.set(img.id, img);
  return { wanted: Array.from(wanted.values()), missing: draftRefs.filter((id) => !wanted.has(id)), cover, og };
}

const dbg = (...a: unknown[]) => { if (process.env.INSIGHTS_PUBLISH_DEBUG === '1') console.log('[publish-img]', new Date().toISOString(), ...a); };
const contentType = (ext: string) => (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
/** Deterministic public path: retries and other languages reuse the same object (never a second copy). */
export function publicPathFor(groupId: string, img: { id: string; path: string }): string {
  const ext = img.path.split('.').pop() || 'png';
  return `${groupId}/${img.id}.${ext}`;
}

async function publicObjectExists(service: SupabaseClient, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash), file = path.slice(slash + 1);
  const { data, error } = await service.storage.from(PUBLIC_BUCKET).list(dir, { search: file, limit: 10 });
  if (error) throw new Error(`Depo okunamadı: ${error.message}`);
  return (data ?? []).some((o) => o.name === file);
}

async function copyToPublic(service: SupabaseClient, s: StagedImage, upsert: boolean): Promise<'created' | 'exists' | string> {
  const dl = await service.storage.from(s.draftBucket || DRAFT_BUCKET).download(s.draftPath);
  if (dl.error || !dl.data) return 'Bir görsel okunamadı.';
  const ext = s.path.split('.').pop() || 'png';
  const up = await service.storage.from(PUBLIC_BUCKET).upload(s.path, Buffer.from(await dl.data.arrayBuffer()), { contentType: contentType(ext), upsert });
  if (!up.error) return 'created';
  if (!upsert && /exist|duplicate|409/i.test(`${up.error.message} ${(up.error as { statusCode?: string }).statusCode ?? ''}`)) return 'exists';
  return `Görsel yayına kopyalanamadı: ${up.error.message}`;
}

/**
 * Step 1 of a publish: make the images the version uses available in the
 * public bucket at their deterministic path. Objects that already exist
 * (published earlier, or by another language) are reused and never counted
 * as created. If anything fails, the objects created so far are released
 * again before returning.
 */
export async function stageImages(service: SupabaseClient, groupId: string, body: string): Promise<PromoteResult> {
  const { wanted, missing, cover, og } = await findImages(service, groupId, body);
  const created: StagedImage[] = [];
  if (missing.length) return { ok: false, error: `Metinde bulunamayan görsel referansı var (${missing.length}). Görseli yeniden ekleyin.`, urls: {}, cover, og, created };
  const urls: Record<string, string> = {};
  try {
    for (const img of wanted) {
      const s: StagedImage = { imageId: img.id, path: publicPathFor(groupId, img), draftBucket: img.bucket, draftPath: img.path };
      urls[img.id] = service.storage.from(PUBLIC_BUCKET).getPublicUrl(s.path).data.publicUrl;
      if (await publicObjectExists(service, s.path)) { dbg('stage exists', s.path); continue; }
      const r = await copyToPublic(service, s, false);
      dbg('stage', s.path, r);
      if (r === 'created') created.push(s);
      else if (r !== 'exists') throw new Error(r);
    }
  } catch (e) {
    await releaseImages(service, groupId, created);
    return { ok: false, error: e instanceof Error ? e.message : 'Görseller yayına kopyalanamadı.', urls, cover, og, created: [] };
  }
  return { ok: true, urls, cover, og, created };
}

/** Is this image used by a version that is (or will be) public: published or scheduled, anywhere in the group? */
async function usedByPublicVersion(service: SupabaseClient, groupId: string, imageId: string): Promise<boolean> {
  const { data, error } = await service.from('insights').select('body_md, cover_url, og_image').eq('group_id', groupId).in('status', ['PUBLISHED', 'SCHEDULED']);
  if (error) return true; // unknown → keep (never remove something that may be in use)
  return ((data ?? []) as Array<{ body_md: string | null; cover_url: string | null; og_image: string | null }>).some((r) => `${r.body_md ?? ''} ${r.cover_url ?? ''} ${r.og_image ?? ''}`.includes(imageId));
}

/**
 * After a failed or cancelled publish: removes the public objects this
 * attempt created, unless a published/scheduled version uses the image.
 * Race-safe with a concurrent publish of another language: after removing,
 * it looks again and puts the object back if a public version started
 * using it in the meantime (that publish also re-checks its images after
 * its own update — see verifyPublishedImages).
 */
export async function releaseImages(service: SupabaseClient, groupId: string, created: StagedImage[]): Promise<{ removed: string[]; kept: string[]; restored: string[] }> {
  const out = { removed: [] as string[], kept: [] as string[], restored: [] as string[] };
  for (const s of created) {
    if (await usedByPublicVersion(service, groupId, s.imageId)) { dbg('release keep', s.path); out.kept.push(s.path); continue; }
    const rm = await service.storage.from(PUBLIC_BUCKET).remove([s.path]);
    if (rm.error) { out.kept.push(s.path); continue; }
    out.removed.push(s.path);
    dbg('release removed', s.path);
    if (await usedByPublicVersion(service, groupId, s.imageId)) {
      const r = await copyToPublic(service, s, true);
      dbg('release restore', s.path, r);
      if (r === 'created') out.restored.push(s.path);
    }
  }
  return out;
}

/**
 * After a successful update: every image the now-public version uses must
 * exist (a concurrent failed publish may have released it a moment ago);
 * missing ones are copied again. Records the public URL on the image.
 */
export async function verifyPublishedImages(service: SupabaseClient, groupId: string, body: string): Promise<{ restored: string[]; missing: string[] }> {
  const { wanted } = await findImages(service, groupId, body);
  const out = { restored: [] as string[], missing: [] as string[] };
  for (const img of wanted) {
    const s: StagedImage = { imageId: img.id, path: publicPathFor(groupId, img), draftBucket: img.bucket, draftPath: img.path };
    let ok = false;
    try { ok = await publicObjectExists(service, s.path); } catch { ok = false; }
    dbg('verify', s.path, ok);
    if (!ok) {
      const r = await copyToPublic(service, s, true);
      if (r === 'created') out.restored.push(s.path);
      else { out.missing.push(s.path); continue; }
    }
    const url = service.storage.from(PUBLIC_BUCKET).getPublicUrl(s.path).data.publicUrl;
    if (img.public_url !== url) await service.from('insight_images').update({ public_url: url }).eq('id', img.id);
  }
  return out;
}

/** Cover / social image fields after promotion (same rules as before). */
export function imagePatch(promoted: PromoteResult, article: { cover_alt: string | null; og_image: string | null }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (promoted.cover && promoted.urls[promoted.cover.id]) {
    patch.cover_url = promoted.urls[promoted.cover.id];
    if (!article.cover_alt) patch.cover_alt = promoted.cover.alt_text || null;
  }
  if (promoted.og && promoted.urls[promoted.og.id] && !article.og_image) patch.og_image = promoted.urls[promoted.og.id];
  return patch;
}

export function withPublicUrls(body: string, urls: Record<string, string>): string {
  return replaceImageRefs(body, urls);
}

export interface PublishRecord {
  requestKey?: string;
  fingerprint?: string;
  outcome?: 'published' | 'updated';
  at?: string;
  by?: string;
  firstPublishedAt?: string | null;
  /** Language check confirmed in the publish dialog, for exactly this content. */
  review?: { by: string; at: string; fingerprint: string };
}

/** Stores the pre-publish snapshot; returns its id (null when revisions cannot be written). */
export async function insertPublishSnapshot(service: SupabaseClient, article: { id: string; title: string; excerpt: string; body_md: string }, reason: string, by: string, pending: { requestKey?: string; outcome?: 'published' | 'updated' } = {}): Promise<string | null> {
  const withData = await service.from('insight_revisions').insert({ insight_id: article.id, title: article.title, excerpt: article.excerpt, body_md: article.body_md, reason, kind: 'publish', created_by: by, data: { publish: { pending: true, ...(pending.requestKey ? { pendingKey: pending.requestKey, pendingOutcome: pending.outcome } : {}) } } }).select('id').maybeSingle();
  if (!withData.error) return (withData.data as { id: string } | null)?.id ?? null;
  const plain = await service.from('insight_revisions').insert({ insight_id: article.id, title: article.title, excerpt: article.excerpt, body_md: article.body_md, reason, kind: 'publish', created_by: by }).select('id').maybeSingle();
  return (plain.data as { id: string } | null)?.id ?? null;
}

/** After a successful publish: the fingerprint of what is public now (and the bulk key). */
export async function finalizePublishRecord(service: SupabaseClient, revisionId: string | null, publishedRow: Record<string, unknown>, record: PublishRecord): Promise<void> {
  if (!revisionId) return;
  const fingerprint = await publicFingerprint(publishedRow);
  await service.from('insight_revisions').update({ data: { publish: { ...record, fingerprint, at: new Date().toISOString() } } }).eq('id', revisionId);
}

/** Latest stored fingerprint of the public text (null: published before fingerprints existed). */
export async function lastPublishedFingerprint(service: SupabaseClient, insightId: string): Promise<string | null> {
  const { data, error } = await service.from('insight_revisions').select('data, created_at').eq('insight_id', insightId).eq('kind', 'publish').order('created_at', { ascending: false }).limit(10);
  if (error) return null;
  for (const r of (data ?? []) as Array<{ data?: { publish?: PublishRecord } | null }>) {
    const fp = r.data?.publish?.fingerprint;
    if (fp) return fp;
  }
  return null;
}

/** Earliest recorded first publication of this version (null when none was recorded). */
export async function recordedFirstPublish(service: SupabaseClient, insightId: string): Promise<string | null> {
  const { data, error } = await service.from('insight_revisions').select('data').eq('insight_id', insightId).eq('kind', 'publish').limit(200);
  if (error) return null;
  const times = ((data ?? []) as Array<{ data?: { publish?: PublishRecord } | null }>)
    .flatMap((r) => [r.data?.publish?.firstPublishedAt, r.data?.publish?.outcome === 'published' ? r.data?.publish?.at : null])
    .filter((t): t is string => typeof t === 'string' && Number.isFinite(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return times[0] ?? null;
}

/**
 * A snapshot this request key wrote right before its update, while no
 * final record exists (the function stopped between the update and the
 * record). Returns it with its time, so the caller can tell whether the
 * update went through.
 */
export async function findPendingByKey(service: SupabaseClient, insightId: string, requestKey: string): Promise<{ id: string; created_at: string; outcome?: 'published' | 'updated' } | null> {
  const { data, error } = await service.from('insight_revisions').select('id, created_at, data').eq('insight_id', insightId).eq('kind', 'publish').eq('data->publish->>pendingKey', requestKey).order('created_at', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  const r = data[0] as { id: string; created_at: string; data?: { publish?: { pendingOutcome?: 'published' | 'updated'; aborted?: boolean } } };
  if (r.data?.publish?.aborted) return null;
  return { id: r.id, created_at: r.created_at, outcome: r.data?.publish?.pendingOutcome };
}

/** A finished publish of this version made with this request key (retry / double click). */
export async function findPublishByKey(service: SupabaseClient, insightId: string, requestKey: string): Promise<PublishRecord | null> {
  const { data, error } = await service.from('insight_revisions').select('data').eq('insight_id', insightId).eq('kind', 'publish').eq('data->publish->>requestKey', requestKey).limit(1);
  if (error || !data?.length) return null;
  return ((data[0] as { data?: { publish?: PublishRecord } }).data?.publish) ?? null;
}

/** Writes the objects this attempt created into its pending snapshot (crash recovery). */
export async function recordStaged(service: SupabaseClient, revisionId: string | null, requestKey: string | undefined, outcome: 'published' | 'updated' | undefined, created: StagedImage[]): Promise<void> {
  if (!revisionId) return;
  await service.from('insight_revisions').update({ data: { publish: { pending: true, ...(requestKey ? { pendingKey: requestKey, pendingOutcome: outcome } : {}), staged: created } } }).eq('id', revisionId);
}

/**
 * A pending snapshot of this request key whose update never happened (the
 * function stopped): release the public objects it had created and mark it.
 */
export async function releaseStaleAttempt(service: SupabaseClient, groupId: string, revisionId: string): Promise<void> {
  const { data } = await service.from('insight_revisions').select('data').eq('id', revisionId).maybeSingle();
  const staged = ((data as { data?: { publish?: { staged?: StagedImage[] } } } | null)?.data?.publish?.staged ?? []).filter((x) => x && typeof x.path === 'string' && typeof x.imageId === 'string');
  if (staged.length) await releaseImages(service, groupId, staged);
  await markSnapshotNotPublished(service, revisionId, 'önceki deneme yarıda kaldı; görselleri geri alındı');
}

/** A snapshot whose publish did not happen is kept, marked as such (nothing is deleted). */
export async function markSnapshotNotPublished(service: SupabaseClient, revisionId: string | null, why: string): Promise<void> {
  if (!revisionId) return;
  await service.from('insight_revisions').update({ reason: `Yayımlanmadı: ${why}`.slice(0, 300), data: { publish: { aborted: true } } }).eq('id', revisionId);
}
