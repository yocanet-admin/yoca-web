import { OpenAIError } from '@/lib/ai/openai';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca — AI cover images for Insights (server only).
 * Same visual language as the site's key visuals (services, about, check-up):
 * photorealistic abstract studio still life, dark graphite set, matte stone /
 * concrete / frosted glass / brushed metal, one thin lime (#A2FF00) light
 * line, generous negative space on the left. Never text, people or screens.
 *
 *   OPENAI_IMAGE_MODEL   default gpt-image-1
 * The image is stored in the public "insights" bucket and its URL returned.
 */

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

export const COVER_STYLE =
  'Photorealistic abstract studio still life for a premium agency journal. Seamless dark graphite / near-black studio set with a soft floor reflection. ' +
  'Matte stone, concrete, frosted glass and brushed dark metal objects. The only colour accent is one thin lime-green (#A2FF00) light line or edge glow. ' +
  'Calm, minimal, lots of negative space on the left third; main subject centre-right. Soft directional light, shallow depth of field, 3:2 landscape. ' +
  'Strictly no people, hands, faces, text, letters, numbers, logos, watermarks, screens or devices.';

export async function generateCoverImage(subject: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAIError('OPENAI_API_KEY is not configured', 500);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        prompt: `${COVER_STYLE}\n\nScene: ${subject}`,
        size: '1536x1024',
        quality: 'high',
        output_format: 'webp',
        output_compression: 85,
        n: 1,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new OpenAIError(error instanceof Error && error.name === 'AbortError' ? 'Görsel üretimi zaman aşımına uğradı' : 'Görsel isteği başarısız', 504);
  } finally {
    clearTimeout(timer);
  }
  const payload = (await res.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!res.ok) {
    const message = payload.error?.message ?? `OpenAI error ${res.status}`;
    // gpt-image-1 needs a verified OpenAI organisation; say so plainly.
    const hint = /verif/i.test(message) ? 'OpenAI hesabında organizasyon doğrulaması gerekiyor (platform.openai.com → Settings → Organization → Verify).' : message;
    throw new OpenAIError(hint, res.status);
  }
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new OpenAIError('Görsel boş döndü', 502);
  return Buffer.from(b64, 'base64');
}

/** Upload to the public "insights" bucket; returns the public URL. */
export async function storeCover(image: Buffer, groupId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new OpenAIError('Supabase sunucu anahtarı yok', 500);
  const folder = /^[a-zA-Z0-9-]{1,64}$/.test(groupId) ? groupId : 'ai';
  const path = `${folder}/ai-${Date.now()}.webp`;
  const { error } = await supabase.storage.from('insights').upload(path, image, { contentType: 'image/webp', upsert: false });
  if (error) throw new OpenAIError(`Görsel kaydedilemedi: ${error.message}`, 500);
  return supabase.storage.from('insights').getPublicUrl(path).data.publicUrl;
}
