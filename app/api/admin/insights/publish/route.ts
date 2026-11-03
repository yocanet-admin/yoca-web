import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { DRAFT_BUCKET, PUBLIC_BUCKET } from '@/lib/ai/images';
import { collectImageRefs, replaceImageRefs } from '@/lib/insightImages';
import { countSourceMarkers } from '@/lib/ai/sourceText';

/**
 * Yoca — explicit publish / schedule / unpublish for one Insight (admin only).
 * The ONLY place an article becomes public. AI actions never call it.
 *  - publish:   status PUBLISHED, publish_at = now
 *  - schedule:  status SCHEDULED, publish_at = the given future time
 *  - unpublish: status DRAFT (already-public image copies stay at their URLs)
 * Before publishing/scheduling, the images the article uses (selected cover,
 * its 1200×630 crop and every yoca-image: reference in the body) are copied
 * from the private draft bucket to the public "insights" bucket and the
 * references are replaced with public URLs. A snapshot revision is stored.
 * The article row is updated with the admin's own session (audit log actor).
 * A translation made from a source article (v15 source_insight_id) needs
 * language_reviewed = true before it can be published or scheduled.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = { bucket: string; path: string; id: string; public_url: string | null; group_id: string | null; selected: boolean; crop: string | null; parent_id: string | null; alt_text: string };

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const service = getSupabaseServiceRole();
  const asUser = getSupabaseAsUser(bearerToken(request));
  if (!service || !asUser) return NextResponse.json({ ok: false, error: 'Sunucu anahtarı yok.' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { insightId?: string; action?: string; publishAt?: string; expectedUpdatedAt?: string };
  if (!/^[0-9a-f-]{36}$/.test(String(body.insightId ?? ''))) return NextResponse.json({ ok: false, error: 'insightId gerekli.' }, { status: 400 });
  const action = body.action;
  if (!['publish', 'schedule', 'unpublish'].includes(String(action))) return NextResponse.json({ ok: false, error: 'Geçersiz işlem.' }, { status: 400 });

  const { data: article } = await service.from('insights').select('*').eq('id', body.insightId).maybeSingle();
  if (!article) return NextResponse.json({ ok: false, error: 'İçerik bulunamadı.' }, { status: 404 });
  const a = article as { id: string; group_id: string; title: string; slug: string; body_md: string; excerpt: string; cover_url: string | null; cover_alt: string | null; og_image: string | null; updated_at: string };
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== a.updated_at) {
    return NextResponse.json({ ok: false, error: 'İçerik bu arada başka bir yerde değişti. Sayfayı yenileyip kaydedin, sonra tekrar deneyin.' }, { status: 409 });
  }

  if (action === 'unpublish') {
    const { error } = await asUser.from('insights').update({ status: 'DRAFT' }).eq('id', a.id);
    return NextResponse.json({ ok: !error, error: error?.message });
  }

  if (!a.title.trim() || !a.slug.trim() || !a.body_md.trim()) return NextResponse.json({ ok: false, error: 'Başlık, slug ve gövde dolu olmalı.' }, { status: 422 });
  // v15: a machine translation is published only after a person who reads
  // that language ticked "Dil kontrolü yapıldı" (and saved).
  const t = article as { source_insight_id?: string | null; language_reviewed?: boolean };
  if (t.source_insight_id && !t.language_reviewed) return NextResponse.json({ ok: false, code: 'language_review', error: 'Bu çeviri için “Dil kontrolü yapıldı” işaretlenmedi. Metni o dili bilen biri okuyup işaretledikten ve kaydettikten sonra yayınlayın.' }, { status: 422 });
  if (countSourceMarkers(a.body_md) > 0) return NextResponse.json({ ok: false, error: 'Metinde hâlâ [KAYNAK GEREKLİ] işareti var. Kaynağı ekleyin ya da iddiayı çıkarın.' }, { status: 422 });
  let publishAt = new Date().toISOString();
  if (action === 'schedule') {
    const at = Date.parse(String(body.publishAt ?? ''));
    if (!Number.isFinite(at) || at <= Date.now() + 60_000) return NextResponse.json({ ok: false, error: 'Zamanlama için ileri bir tarih/saat seçin.' }, { status: 422 });
    publishAt = new Date(at).toISOString();
  }

  // Images to promote: body references + selected cover + its social crop.
  const refs = collectImageRefs(a.body_md);
  const { data: groupImages } = await service.from('insight_images').select('id, bucket, path, public_url, group_id, selected, crop, parent_id, alt_text').eq('group_id', a.group_id);
  const images = (groupImages ?? []) as Row[];
  const cover = images.find((img) => img.selected) ?? null;
  const og = cover ? images.find((img) => img.parent_id === cover.id && img.crop === '1200x630') ?? null : null;
  const wanted = new Map<string, Row>();
  for (const img of images) if (refs.includes(img.id) || img.id === cover?.id || img.id === og?.id) wanted.set(img.id, img);
  const missing = refs.filter((id) => !wanted.has(id));
  if (missing.length) return NextResponse.json({ ok: false, error: `Metinde bulunamayan görsel referansı var (${missing.length}). Görseli yeniden ekleyin.` }, { status: 422 });

  const urls: Record<string, string> = {};
  for (const img of Array.from(wanted.values())) {
    if (img.public_url) {
      urls[img.id] = img.public_url;
      continue;
    }
    const dl = await service.storage.from(img.bucket || DRAFT_BUCKET).download(img.path);
    if (dl.error || !dl.data) return NextResponse.json({ ok: false, error: 'Bir görsel okunamadı; yayın yapılmadı.' }, { status: 500 });
    const ext = img.path.split('.').pop() || 'png';
    const publicPath = `${a.group_id}/${img.id}.${ext}`;
    const up = await service.storage.from(PUBLIC_BUCKET).upload(publicPath, Buffer.from(await dl.data.arrayBuffer()), { contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', upsert: true });
    if (up.error) return NextResponse.json({ ok: false, error: `Görsel yayına kopyalanamadı: ${up.error.message}` }, { status: 500 });
    const url = service.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath).data.publicUrl;
    urls[img.id] = url;
    await service.from('insight_images').update({ public_url: url }).eq('id', img.id);
  }

  const nextBody = replaceImageRefs(a.body_md, urls);
  await service.from('insight_revisions').insert({ insight_id: a.id, title: a.title, excerpt: a.excerpt, body_md: a.body_md, reason: action === 'publish' ? 'Yayın öncesi' : 'Zamanlama öncesi', kind: 'publish', created_by: admin.email ?? admin.id });
  const patch: Record<string, unknown> = {
    body_md: nextBody,
    status: action === 'publish' ? 'PUBLISHED' : 'SCHEDULED',
    publish_at: publishAt,
  };
  if (cover && urls[cover.id]) {
    patch.cover_url = urls[cover.id];
    if (!a.cover_alt) patch.cover_alt = cover.alt_text || null;
  }
  if (og && urls[og.id] && !a.og_image) patch.og_image = urls[og.id];
  const { data: updated, error } = await asUser.from('insights').update(patch).eq('id', a.id).select('id, status, publish_at, updated_at').maybeSingle();
  if (error || !updated) return NextResponse.json({ ok: false, error: error?.message ?? 'Güncellenemedi (yetki?).' }, { status: 500 });
  return NextResponse.json({ ok: true, insight: updated, promoted: Object.keys(urls).length });
}
