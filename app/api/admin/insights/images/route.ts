import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { CROP_SIZES, DRAFT_BUCKET, imageSize, readDraftImage, serverCrop, shouldBrand, storeDraftImage } from '@/lib/ai/images';
import { OpenAIError } from '@/lib/ai/openai';

/**
 * Yoca — Insights image library (admin only).
 * GET  ?groupId=…            → images of the article group with 1-hour signed URLs
 * POST multipart (file, groupId, insightId, kind=upload|crop, parentId?, crop?, alt?)
 *                            → own upload or a social/mobile crop, stored PRIVATE
 * POST JSON { action: 'select_cover' | 'alt' | 'crop', … }
 *   crop: { imageId, crop: '1200x630' | '1080x1080' } — server-side crop
 *   (sharp) of the logo-free original; crops of AI images get the logo again.
 *   (The browser crop in ImageStudio is only a fallback for an old server.)
 * Nothing here publishes or makes an image public: visitors see an image only
 * through /media/insights while a published version uses it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
const isId = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const supabase = getSupabaseServiceRole();
  if (!supabase) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY yok.' }, { status: 503 });
  const groupId = request.nextUrl.searchParams.get('groupId') ?? '';
  if (!isId(groupId)) return NextResponse.json({ ok: false, error: 'groupId gerekli.' }, { status: 400 });
  const { data, error } = await supabase.from('insight_images').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: false, error: `Görseller okunamadı (v14 SQL çalıştırıldı mı?): ${error.message}` }, { status: 503 });
  const rows = (data ?? []) as Array<Record<string, unknown> & { bucket: string; path: string }>;
  const signed = await Promise.all(
    rows.map(async (row) => {
      const s = await supabase.storage.from(row.bucket).createSignedUrl(row.path, 3600);
      return { ...row, url: s.data?.signedUrl ?? null };
    }),
  );
  return NextResponse.json({ ok: true, images: signed });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  const supabase = getSupabaseServiceRole();
  if (!supabase) return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY yok.' }, { status: 503 });
  const createdBy = admin.email ?? admin.id;
  const type = request.headers.get('content-type') ?? '';

  if (type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof Blob)) return NextResponse.json({ ok: false, error: 'Dosya yok.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Görsel 8 MB’tan küçük olmalı.' }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const dims = imageSize(bytes);
    if (!dims) return NextResponse.json({ ok: false, error: 'Yalnızca PNG, JPEG veya WebP yüklenebilir.' }, { status: 415 });
    const kind = form.get('kind') === 'crop' ? 'crop' : 'upload';
    const groupId = String(form.get('groupId') ?? '');
    const insightId = String(form.get('insightId') ?? '');
    const parentId = String(form.get('parentId') ?? '');
    const crop = String(form.get('crop') ?? '');
    try {
      const saved = await storeDraftImage(bytes, {
        insightId: isId(insightId) ? insightId : null,
        groupId: isId(groupId) ? groupId : null,
        kind,
        origin: kind === 'crop' ? 'crop' : 'upload',
        parentId: isId(parentId) ? parentId : null,
        crop: /^\d{2,4}x\d{2,4}$/.test(crop) ? crop : null,
        width: dims.width,
        height: dims.height,
        size: `${dims.width}x${dims.height}`,
        altText: String(form.get('alt') ?? '').slice(0, 300),
        createdBy,
        mime: dims.mime,
      });
      return NextResponse.json({ ok: true, imageId: saved.id });
    } catch (error) {
      const e = error instanceof OpenAIError ? error : new OpenAIError('Görsel kaydedilemedi.', 500);
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string; imageId?: string; groupId?: string; alt?: string; crop?: string };
  if (!isId(body.imageId)) return NextResponse.json({ ok: false, error: 'imageId gerekli.' }, { status: 400 });
  if (body.action === 'alt') {
    const { error } = await supabase.from('insight_images').update({ alt_text: String(body.alt ?? '').slice(0, 300) }).eq('id', body.imageId);
    return NextResponse.json({ ok: !error, error: error?.message });
  }
  if (body.action === 'crop') {
    const key = String(body.crop ?? '');
    if (!CROP_SIZES[key]) return NextResponse.json({ ok: false, error: 'Geçersiz kırpım.' }, { status: 400 });
    try {
      // Crop the logo-free original; the logo is added to the crop afterwards (AI images).
      const source = await readDraftImage(body.imageId as string, { master: true });
      const cropped = await serverCrop(source.bytes, key);
      if (!cropped) return NextResponse.json({ ok: false, code: 'no_sharp', error: 'Sunucuda görsel işleme (sharp) yok; tarayıcıda kırpılacak.' }, { status: 501 });
      const dims = imageSize(cropped);
      const row = source.row as { insight_id: string | null; group_id: string | null; alt_text: string; origin: string };
      const saved = await storeDraftImage(cropped, { insightId: row.insight_id, groupId: row.group_id, kind: 'crop', origin: 'crop', parentId: body.imageId as string, crop: key, width: dims?.width, height: dims?.height, size: key, altText: row.alt_text ?? '', createdBy, mime: 'image/png', brand: shouldBrand(row) });
      return NextResponse.json({ ok: true, imageId: saved.id, server: true });
    } catch (error) {
      const e = error instanceof OpenAIError ? error : new OpenAIError('Kırpım yapılamadı.', 500);
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
  }
  if (body.action === 'select_cover') {
    const { data: row } = await supabase.from('insight_images').select('group_id').eq('id', body.imageId).maybeSingle();
    const groupId = (row as { group_id: string | null } | null)?.group_id;
    if (!groupId) return NextResponse.json({ ok: false, error: 'Görsel bulunamadı.' }, { status: 404 });
    await supabase.from('insight_images').update({ selected: false }).eq('group_id', groupId).eq('selected', true);
    const { error } = await supabase.from('insight_images').update({ selected: true }).eq('id', body.imageId);
    return NextResponse.json({ ok: !error, error: error?.message, bucket: DRAFT_BUCKET });
  }
  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
