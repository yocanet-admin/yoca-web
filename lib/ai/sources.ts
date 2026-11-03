import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { htmlToText, isPrivateAddress, safeSourceUrl, suspiciousLines } from '@/lib/ai/sourceText';
import { mockEnabled } from '@/lib/ai/mock';

/**
 * Yoca — server-side fetch of sources the EDITOR provided (server only).
 * Only URLs typed or pasted by the editor are fetched; a URL the model
 * "remembers" is never treated as a source. Limits: 5 URLs, 8 s each,
 * 1.5 MB per response, 3 redirects, public http(s) hosts only (DNS checked
 * against private ranges on every hop), text/html or text/plain only.
 * Result per URL says whether it was actually fetched and read.
 */

export interface FetchedSource {
  url: string;
  finalUrl?: string;
  status: 'fetched' | 'failed' | 'skipped';
  reason?: string;
  title?: string;
  chars?: number;
  text?: string;
  sha256?: string;
  fetchedAt: string;
  warnings?: string[];
}

export const SOURCE_LIMITS = { maxUrls: 5, timeoutMs: 8_000, maxBytes: 1_500_000, maxRedirects: 3, maxChars: 20_000 } as const;

async function hostIsPublic(hostname: string): Promise<boolean> {
  try {
    const addrs = await lookup(hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

export async function fetchSource(raw: string): Promise<FetchedSource> {
  const fetchedAt = new Date().toISOString();
  let url = safeSourceUrl(raw);
  if (!url) return { url: raw.slice(0, 500), status: 'skipped', reason: 'Geçersiz veya izin verilmeyen adres (yalnızca herkese açık http/https).', fetchedAt };
  if (mockEnabled()) {
    const text = `Mock kaynak metni (${url.hostname}). Randevu formu tek ekranda tutuldu. 2025 yılında yayımlandı.`;
    return { url: url.toString(), finalUrl: url.toString(), status: 'fetched', title: 'Mock kaynak', chars: text.length, text, sha256: createHash('sha256').update(text).digest('hex'), fetchedAt };
  }
  const started = Date.now();
  for (let hop = 0; hop <= SOURCE_LIMITS.maxRedirects; hop += 1) {
    if (!(await hostIsPublic(url.hostname))) return { url: raw, status: 'failed', reason: 'Adres herkese açık bir sunucuya çözülmüyor.', fetchedAt };
    const remaining = SOURCE_LIMITS.timeoutMs - (Date.now() - started);
    if (remaining <= 0) return { url: raw, status: 'failed', reason: 'Zaman aşımı.', fetchedAt };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'YocaSourceCheck/1.0 (+https://yoca.net)', Accept: 'text/html,text/plain;q=0.9' }, cache: 'no-store' });
    } catch (error) {
      clearTimeout(timer);
      return { url: raw, status: 'failed', reason: error instanceof Error && error.name === 'AbortError' ? 'Zaman aşımı.' : 'Bağlantı kurulamadı.', fetchedAt };
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const next = safeSourceUrl(new URL(res.headers.get('location') ?? '', url).toString());
      if (!next) return { url: raw, status: 'failed', reason: 'Yönlendirme izin verilmeyen bir adrese gidiyor.', fetchedAt };
      url = next;
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      return { url: raw, status: 'failed', reason: `Sunucu HTTP ${res.status} döndürdü.`, fetchedAt };
    }
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      clearTimeout(timer);
      return { url: raw, status: 'failed', reason: `Desteklenmeyen içerik türü (${type.split(';')[0] || 'bilinmiyor'}).`, fetchedAt };
    }
    const body = await readLimited(res, SOURCE_LIMITS.maxBytes).catch(() => null);
    clearTimeout(timer);
    if (body === null) return { url: raw, status: 'failed', reason: 'Sayfa çok büyük (1,5 MB sınırı) ya da okunamadı.', fetchedAt };
    const { title, text } = /html/i.test(type) ? htmlToText(body) : { title: '', text: body };
    if (text.trim().length < 80) return { url: raw, status: 'failed', reason: 'Sayfadan okunabilir metin çıkmadı (JavaScript ile yükleniyor olabilir). Metni “Notlar” alanına yapıştırın.', fetchedAt };
    const trimmed = text.slice(0, SOURCE_LIMITS.maxChars);
    const warnings = suspiciousLines(trimmed);
    return {
      url: raw,
      finalUrl: url.toString(),
      status: 'fetched',
      title: title || url.hostname,
      chars: trimmed.length,
      text: trimmed,
      sha256: createHash('sha256').update(trimmed).digest('hex'),
      fetchedAt,
      warnings: warnings.length ? warnings.map((w) => `Talimat benzeri satır (yok sayıldı): ${w}`) : undefined,
    };
  }
  return { url: raw, status: 'failed', reason: 'Çok fazla yönlendirme.', fetchedAt };
}

export async function fetchSources(urls: string[]): Promise<FetchedSource[]> {
  const unique = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
  const take = unique.slice(0, SOURCE_LIMITS.maxUrls);
  const skipped = unique.slice(SOURCE_LIMITS.maxUrls).map((u) => ({ url: u, status: 'skipped' as const, reason: `En fazla ${SOURCE_LIMITS.maxUrls} kaynak okunur.`, fetchedAt: new Date().toISOString() }));
  return [...(await Promise.all(take.map(fetchSource))), ...skipped];
}
