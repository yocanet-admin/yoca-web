/**
 * Yoca — URLs of Insights images on the public site (pure, client-safe).
 *
 * Images are never copied to a public bucket. A published version refers to
 * /media/insights/<image id>.<ext>; app/media/insights/[file]/route.ts serves
 * the file from the PRIVATE draft bucket only while a version visible to
 * visitors refers to exactly that URL (see lib/insightPublishServer.ts).
 */

export const MEDIA_PREFIX = '/media/insights/';

const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
const FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpe?g|webp)$/;

export function extensionOf(path: string): string {
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  return (EXTENSIONS as readonly string[]).includes(ext) ? ext : 'png';
}

/** The media URL of one image (id + extension of the stored file). */
export function mediaPathFor(img: { id: string; path: string }): string {
  return `${MEDIA_PREFIX}${img.id}.${extensionOf(img.path)}`;
}

/** "<uuid>.<ext>" → its parts, anything else → null. */
export function parseMediaFile(file: string): { id: string; ext: string } | null {
  const m = FILE_RE.exec(String(file ?? '').toLowerCase());
  return m ? { id: m[1], ext: m[2] } : null;
}

export function mediaContentType(ext: string): string {
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}

/** True when a visible version uses exactly this media URL (body, cover or social image). */
export function referencesMedia(row: { body_md?: unknown; cover_url?: unknown; og_image?: unknown }, url: string): boolean {
  return [row.body_md, row.cover_url, row.og_image].some((v) => typeof v === 'string' && v.includes(url));
}

/** Media paths are site-relative; e-mails and feeds need an absolute URL. */
export function absoluteMedia(url: string | null | undefined, site: string): string | null {
  if (!url) return null;
  return url.startsWith(MEDIA_PREFIX) ? `${site.replace(/\/$/, '')}${url}` : url;
}
