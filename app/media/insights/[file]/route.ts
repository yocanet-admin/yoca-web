import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { DRAFT_BUCKET } from '@/lib/ai/images';
import { extensionOf, mediaContentType, mediaPathFor, parseMediaFile, referencesMedia } from '@/lib/insightMedia';

/**
 * Yoca — Insights images for visitors: /media/insights/<image id>.<ext>
 *
 * The file lives in the PRIVATE draft bucket. It is served only while a
 * version that visitors can see right now refers to exactly this URL — the
 * same rule as the public pages: status PUBLISHED and publish_at ≤ now.
 *   - never-published draft, scheduled-but-not-yet-live, failed or
 *     interrupted publish → 404 (the published row never changed);
 *   - unpublished → 404 from the next uncached request;
 *   - shared by several languages → served while any of them is visible.
 * Caching: browsers 5 minutes, Vercel CDN 60 seconds; a 404 is never cached.
 * So an unpublished image can still be served from a cache for at most that
 * long, and of course anyone who saw it while it was public may have a copy.
 * Files above 4 MB (Vercel response limit) are redirected to a signed URL
 * that expires after 10 minutes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });

async function serve(file: string, head: boolean) {
  const parsed = parseMediaFile(file);
  if (!parsed) return notFound();
  const service = getSupabaseServiceRole();
  if (!service) return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const { data: img } = await service.from('insight_images').select('id, bucket, path, group_id').eq('id', parsed.id).maybeSingle();
  const image = img as { id: string; bucket: string | null; path: string; group_id: string | null } | null;
  if (!image || !image.group_id || (image.bucket || DRAFT_BUCKET) !== DRAFT_BUCKET) return notFound();
  const ext = extensionOf(image.path);
  if (ext !== parsed.ext) return notFound();

  const url = mediaPathFor(image);
  const { data: live, error } = await service
    .from('insights')
    .select('body_md, cover_url, og_image')
    .eq('group_id', image.group_id)
    .eq('status', 'PUBLISHED')
    .lte('publish_at', new Date().toISOString());
  if (error) return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!((live ?? []) as Array<Record<string, unknown>>).some((row) => referencesMedia(row, url))) return notFound();

  const headers: Record<string, string> = {
    'Content-Type': mediaContentType(ext),
    'Cache-Control': 'public, max-age=300, s-maxage=60',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (head) return new NextResponse(null, { status: 200, headers });
  const dl = await service.storage.from(DRAFT_BUCKET).download(image.path);
  if (dl.error || !dl.data) return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (dl.data.size > 4 * 1024 * 1024) {
    const signed = await service.storage.from(DRAFT_BUCKET).createSignedUrl(image.path, 600);
    if (signed.error || !signed.data?.signedUrl) return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.redirect(signed.data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return new NextResponse(Buffer.from(await dl.data.arrayBuffer()), { status: 200, headers });
}

export async function GET(_request: NextRequest, { params }: { params: { file: string } }) {
  return serve(params.file, false);
}

export async function HEAD(_request: NextRequest, { params }: { params: { file: string } }) {
  return serve(params.file, true);
}
