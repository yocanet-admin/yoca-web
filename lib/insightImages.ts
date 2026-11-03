/**
 * Yoca — draft image references inside article Markdown (pure, client-safe).
 * While an article is a draft, images inserted with "Yazı içine ekle" are
 * written as ![alt](yoca-image:<uuid>) — they point at the private draft
 * bucket. Publishing copies them to the public bucket and replaces the
 * reference with the public URL (app/api/admin/insights/publish).
 */

const REF = /yoca-image:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

export function imageMarkdown(id: string, alt: string, caption?: string): string {
  const safeAlt = alt.replace(/[[\]\n]/g, ' ').trim();
  return `![${safeAlt}](yoca-image:${id})${caption ? ` *${caption.replace(/[*\n]/g, ' ').trim()}*` : ''}`;
}

export function collectImageRefs(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(REF)).map((m) => m[1])));
}

export function replaceImageRefs(body: string, urls: Record<string, string>): string {
  return body.replace(REF, (whole, id: string) => urls[id] ?? whole);
}

/** Public render safety: a leftover draft reference is dropped instead of shown broken. */
export function stripDraftImageLines(body: string): string {
  return body
    .split('\n')
    .filter((line) => !/^!\[[^\]]*\]\(yoca-image:/.test(line.trim()))
    .join('\n');
}
