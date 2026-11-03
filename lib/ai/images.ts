import { randomUUID } from 'node:crypto';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { OpenAIError } from '@/lib/ai/openai';

/**
 * Yoca — Insights images (server only).
 *
 * Storage policy (documented in upgrade-v14):
 *  - Every generated, edited, uploaded or cropped image is stored in the
 *    PRIVATE bucket "insight-drafts" and recorded in public.insight_images
 *    (prompt, model, created_at, related post, selected version, alt text).
 *    Admins see them through short-lived signed URLs. Temporary OpenAI URLs
 *    are never used (the Image API returns base64, which is stored at once).
 *  - Only when the editor presses "Yayınla" / "Zamanla" are the images the
 *    article uses copied to the public "insights" bucket (lib/insightPublish.ts).
 *  - AI images are illustrations. They are never presented as client work,
 *    team photos or evidence; titles are added later with real typography and
 *    the logo is never drawn by the model.
 */

export const DRAFT_BUCKET = 'insight-drafts';
export const PUBLIC_BUCKET = 'insights';

const APPROACH: Record<string, string> = {
  photo: 'Photographic, natural light, real materials and a real-world setting connected to the subject.',
  illustration: 'Editorial illustration, flat shapes with subtle texture, clear single idea.',
  diagram: 'Abstract diagram of a process or flow made of simple shapes and lines, with absolutely no text, letters or numbers.',
};

/** The full image prompt (style rules + editable brief). Pure; unit-tested. */
export function buildImagePrompt(brief: string, approach: string, variant = 0): string {
  const variation = ['', ' Try a different composition and viewpoint from the obvious one.', ' Use a closer crop and a different arrangement of elements.'][variant % 3];
  return [
    `Cover image for an article on a business website. ${APPROACH[approach] ?? APPROACH.photo}`,
    'Palette: black and off-white as the base, with green used sparingly as the accent colour. Generous negative space on one side so a headline can be placed later with real typography.',
    'The idea must come from this article\'s subject (shown below), not from a house template: no default lime line, no generic graphite still life, no decorative filler shapes (floating lines, blobs, grids, glowing gradients) added for style.',
    'Do NOT include: any text, letters, numbers or captions; any logo or brand mark; robots, glowing brains, circuit boards, holograms or generic futuristic tech imagery; recognisable real people or faces; screens or devices that look like real client work or proof of results; watermarks.',
    `Subject: ${brief.trim().slice(0, 1500)}${variation}`,
  ].join('\n');
}

/** Edit instructions keep the same safety rules. */
export function buildEditPrompt(instruction: string): string {
  return `${instruction.trim().slice(0, 1500)}\nKeep the palette (black, off-white, green accent) unless the instruction says otherwise. Do not add text, letters, numbers, logos, robots, glowing brains or recognisable people.`;
}

function storage() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new OpenAIError('Sunucu anahtarı (SUPABASE_SERVICE_ROLE_KEY) yok; görsel kaydedilemez.', 503, 'server');
  return supabase;
}

export interface ImageRecordInput {
  insightId: string | null;
  groupId: string | null;
  kind: 'generated' | 'alternative' | 'edited' | 'upload' | 'crop';
  origin: 'ai' | 'upload' | 'crop';
  prompt?: string | null;
  brief?: string | null;
  model?: string | null;
  size?: string | null;
  width?: number | null;
  height?: number | null;
  parentId?: string | null;
  altText?: string;
  crop?: string | null;
  aiRunId?: string | null;
  createdBy: string;
  mime: string;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Store bytes in the private bucket and record the image. Throws without side effects on the article. */
export async function storeDraftImage(bytes: Buffer, input: ImageRecordInput): Promise<{ id: string; path: string }> {
  const supabase = storage();
  const ext = EXT[input.mime];
  if (!ext) throw new OpenAIError('Desteklenmeyen görsel türü (PNG, JPEG veya WebP).', 415, 'bad_request');
  const folder = input.groupId && /^[0-9a-f-]{36}$/.test(input.groupId) ? input.groupId : 'unassigned';
  const id = randomUUID();
  const path = `${folder}/${id}.${ext}`;
  const up = await supabase.storage.from(DRAFT_BUCKET).upload(path, bytes, { contentType: input.mime, upsert: false });
  if (up.error) throw new OpenAIError(`Görsel depoya kaydedilemedi: ${up.error.message}`, 500, 'server');
  const { error } = await supabase.from('insight_images').insert({
    id,
    insight_id: input.insightId,
    group_id: input.groupId,
    bucket: DRAFT_BUCKET,
    path,
    kind: input.kind,
    origin: input.origin,
    prompt: input.prompt ?? null,
    brief: input.brief ?? null,
    model: input.model ?? null,
    size: input.size ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    parent_id: input.parentId ?? null,
    alt_text: (input.altText ?? '').slice(0, 300),
    crop: input.crop ?? null,
    ai_run_id: input.aiRunId ?? null,
    created_by: input.createdBy,
  });
  if (error) throw new OpenAIError(`Görsel kaydı oluşturulamadı: ${error.message} (v14 SQL çalıştırıldı mı?)`, 500, 'server');
  return { id, path };
}

export async function readDraftImage(id: string): Promise<{ bytes: Buffer; mime: string; row: Record<string, unknown> }> {
  const supabase = storage();
  const { data: row } = await supabase.from('insight_images').select('*').eq('id', id).maybeSingle();
  if (!row) throw new OpenAIError('Görsel bulunamadı.', 404, 'bad_request');
  const r = row as { bucket: string; path: string };
  const dl = await supabase.storage.from(r.bucket).download(r.path);
  if (dl.error || !dl.data) throw new OpenAIError('Görsel okunamadı.', 500, 'server');
  const bytes = Buffer.from(await dl.data.arrayBuffer());
  const mime = r.path.endsWith('.png') ? 'image/png' : r.path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return { bytes, mime, row: row as Record<string, unknown> };
}

/** PNG/JPEG/WebP dimensions from the header bytes (no dependency). Pure. */
export function imageSize(bytes: Buffer): { width: number; height: number; mime: string } | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mime: 'image/png' };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = bytes.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7), mime: 'image/jpeg' };
      i += 2 + len;
    }
    return null;
  }
  if (bytes.length > 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = bytes.toString('ascii', 12, 16);
    if (fourcc === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), mime: 'image/webp' };
    if (fourcc === 'VP8L') {
      const b = bytes.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, mime: 'image/webp' };
    }
    if (fourcc === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, mime: 'image/webp' };
  }
  return null;
}

// ── Server-side crops (sharp, only if installed) ─────────────────

type SharpChain = { resize: (w: number, h: number, o: { fit: string; position: string }) => SharpChain; png: () => SharpChain; toBuffer: () => Promise<Buffer> };
type SharpFactory = (input: Buffer) => SharpChain;

declare const __non_webpack_require__: NodeRequire | undefined;

/**
 * sharp is NOT a dependency of this project (package.json). If it is present
 * at runtime it is used; otherwise null and the admin UI falls back to the
 * browser (canvas) crop. Under webpack (Next) __non_webpack_require__ is the
 * plain Node require, so the bundler neither resolves nor stubs it (a
 * createRequire() call was compiled to undefined); outside webpack (tests)
 * the module-scope require is used.
 */
export function loadSharp(): SharpFactory | null {
  try {
    // eslint-disable-next-line no-eval
    const req: NodeRequire = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : (eval('require') as NodeRequire);
    const mod = req('sharp') as SharpFactory | { default: SharpFactory };
    return typeof mod === 'function' ? mod : mod.default;
  } catch {
    return null;
  }
}

export const CROP_SIZES: Record<string, { w: number; h: number }> = { '1200x630': { w: 1200, h: 630 }, '1080x1080': { w: 1080, h: 1080 } };

/** Centre crop to an exact size; null when sharp is unavailable. */
export async function serverCrop(bytes: Buffer, key: string): Promise<Buffer | null> {
  const size = CROP_SIZES[key];
  const sharp = loadSharp();
  if (!size || !sharp) return null;
  return sharp(bytes).resize(size.w, size.h, { fit: 'cover', position: 'centre' }).png().toBuffer();
}
