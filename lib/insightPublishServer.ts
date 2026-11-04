import type { SupabaseClient } from '@supabase/supabase-js';
import { DRAFT_BUCKET, PUBLIC_BUCKET } from '@/lib/ai/images';
import { collectImageRefs, replaceImageRefs } from '@/lib/insightImages';
import { publicFingerprint } from '@/lib/insightGroup';

/**
 * Yoca — server helpers shared by the two publish routes
 * (app/api/admin/insights/publish and …/publish-group). Service role only.
 *
 * promoteImages: the images an article uses (selected cover of the group, its
 * 1200×630 crop, every yoca-image: reference in the body) are copied from the
 * private draft bucket to the public "insights" bucket — only here, only when
 * a version is published. Nothing is copied when a reference is missing.
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
}

export async function findImages(service: SupabaseClient, groupId: string, body: string): Promise<{ wanted: ImageRow[]; missing: string[]; cover: ImageRow | null; og: ImageRow | null }> {
  const refs = collectImageRefs(body);
  const { data } = await service.from('insight_images').select('id, bucket, path, public_url, group_id, selected, crop, parent_id, alt_text').eq('group_id', groupId);
  const images = (data ?? []) as ImageRow[];
  const cover = images.find((img) => img.selected) ?? null;
  const og = cover ? images.find((img) => img.parent_id === cover.id && img.crop === '1200x630') ?? null : null;
  const wanted = new Map<string, ImageRow>();
  for (const img of images) if (refs.includes(img.id) || img.id === cover?.id || img.id === og?.id) wanted.set(img.id, img);
  return { wanted: Array.from(wanted.values()), missing: refs.filter((id) => !wanted.has(id)), cover, og };
}

export async function promoteImages(service: SupabaseClient, groupId: string, body: string): Promise<PromoteResult> {
  const { wanted, missing, cover, og } = await findImages(service, groupId, body);
  if (missing.length) return { ok: false, error: `Metinde bulunamayan görsel referansı var (${missing.length}). Görseli yeniden ekleyin.`, urls: {}, cover, og };
  const urls: Record<string, string> = {};
  for (const img of wanted) {
    if (img.public_url) {
      urls[img.id] = img.public_url;
      continue;
    }
    const dl = await service.storage.from(img.bucket || DRAFT_BUCKET).download(img.path);
    if (dl.error || !dl.data) return { ok: false, error: 'Bir görsel okunamadı; yayın yapılmadı.', urls, cover, og };
    const ext = img.path.split('.').pop() || 'png';
    const publicPath = `${groupId}/${img.id}.${ext}`;
    const up = await service.storage.from(PUBLIC_BUCKET).upload(publicPath, Buffer.from(await dl.data.arrayBuffer()), { contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', upsert: true });
    if (up.error) return { ok: false, error: `Görsel yayına kopyalanamadı: ${up.error.message}`, urls, cover, og };
    const url = service.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath).data.publicUrl;
    urls[img.id] = url;
    await service.from('insight_images').update({ public_url: url }).eq('id', img.id);
  }
  return { ok: true, urls, cover, og };
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

/** A snapshot whose publish did not happen is kept, marked as such (nothing is deleted). */
export async function markSnapshotNotPublished(service: SupabaseClient, revisionId: string | null, why: string): Promise<void> {
  if (!revisionId) return;
  await service.from('insight_revisions').update({ reason: `Yayımlanmadı: ${why}`.slice(0, 300), data: { publish: { aborted: true } } }).eq('id', revisionId);
}
