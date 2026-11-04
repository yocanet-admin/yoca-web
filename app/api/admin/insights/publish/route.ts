import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { finalizePublishRecord, imagePatch, insertPublishSnapshot, markSnapshotNotPublished, recordMediaUrls, resolveImages, withMediaUrls } from '@/lib/insightPublishServer';
import { countSourceMarkers } from '@/lib/ai/sourceText';

/**
 * Yoca — explicit publish / schedule / unpublish for one Insight (admin only).
 * The ONLY place an article becomes public. AI actions never call it.
 *  - publish:   status PUBLISHED, publish_at = now
 *  - schedule:  status SCHEDULED, publish_at = the given future time
 *  - unpublish: status DRAFT (its images stop being served: /media/insights)
 * The images the article uses (selected cover, its 1200×630 crop and every
 * yoca-image: reference in the body) stay in the private bucket; the
 * published row refers to them as /media/insights/<id>.<ext>, which serves a
 * file only while a visible version uses it. Nothing is copied, so a failed
 * publish leaves nothing public. A snapshot revision is stored.
 * The article row is updated with the admin's own session (audit log actor).
 * A translation made from a source article (v15 source_insight_id) needs
 * language_reviewed = true before it can be published or scheduled.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // Images: media URLs only (nothing is copied or made public here).
  const by = admin.email ?? admin.id;
  const resolved = await resolveImages(service, a.group_id, a.body_md);
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: 422 });
  const revisionId = await insertPublishSnapshot(service, a, action === 'publish' ? 'Yayın öncesi' : 'Zamanlama öncesi', by);
  const urls = resolved.urls;
  const nextBody = withMediaUrls(a.body_md, urls);
  const patch: Record<string, unknown> = {
    body_md: nextBody,
    status: action === 'publish' ? 'PUBLISHED' : 'SCHEDULED',
    publish_at: publishAt,
    ...imagePatch(resolved, a),
  };
  const { data: updated, error } = await asUser.from('insights').update(patch).eq('id', a.id).eq('updated_at', a.updated_at).select('*').maybeSingle();
  if (error || !updated) {
    // The row did not change, so none of its images is served.
    await markSnapshotNotPublished(service, revisionId, error?.message ?? 'güncellenemedi');
    return NextResponse.json({ ok: false, error: error?.message ?? 'İçerik bu arada başka bir yerde değişti ya da yetki yok; yayın yapılmadı. Sayfayı yenileyip tekrar deneyin.' }, { status: error ? 500 : 409 });
  }
  await recordMediaUrls(service, resolved, updated as Record<string, unknown>);
  // Fingerprint of what is public now: a later bulk publish leaves an unchanged version alone.
  if (action === 'publish') await finalizePublishRecord(service, revisionId, updated as Record<string, unknown>, { outcome: 'published', by });
  else await finalizePublishRecord(service, revisionId, updated as Record<string, unknown>, { by });
  const u = updated as { id: string; status: string; publish_at: string; updated_at: string };
  return NextResponse.json({ ok: true, insight: { id: u.id, status: u.status, publish_at: u.publish_at, updated_at: u.updated_at }, promoted: Object.keys(urls).length });
}
