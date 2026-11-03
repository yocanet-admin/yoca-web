/**
 * Yoca — pure helpers for editor-provided sources (no imports; unit-tested).
 * Fetched pages are DATA: the text is fenced before it reaches a prompt and
 * any instruction-like line is reported to the editor, never obeyed.
 */

/** Private, loopback, link-local and other non-public IPv4/IPv6 addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(':')) {
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  const parts = v.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 198 && (b === 18 || b === 19))
  );
}

/** http(s) URL on a normal port with a dotted host, or null. */
export function safeSourceUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    if (u.port && u.port !== '80' && u.port !== '443') return null;
    if (!u.hostname.includes('.') || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && isPrivateAddress(u.hostname)) return null;
    if (u.hostname.startsWith('[')) return null;
    return u;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Readable text from HTML: drops scripts/styles/nav/comments, keeps paragraphs. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  const text = s
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\r]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title: title.slice(0, 300), text };
}

const INJECTION = /(ignore (all |the )?(previous|prior|above) (instructions|prompts)|disregard (the )?(previous|above)|system prompt|you are now|önceki talimatları (yok say|unut)|talimatları görmezden gel|act as )/i;

/** Lines that look like instructions to an AI (reported to the editor, never followed). */
export function suspiciousLines(text: string, max = 5): string[] {
  return text
    .split('\n')
    .filter((line) => INJECTION.test(line))
    .slice(0, max)
    .map((line) => line.slice(0, 200));
}

/** Fence untrusted text so it cannot close its own block. */
export function fence(label: string, text: string): string {
  const clean = text.replace(/<\/?(SOURCE|NOTES|EXISTING_TEXT|TEXT)[^>]*>/gi, '');
  return `<${label}>\n${clean}\n</${label}>`;
}

/** Numbers / percentages / years in a text (for the deterministic source check). */
export function extractNumbers(text: string): string[] {
  const found = text.match(/%\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)*\s?(?:%|yüzde|kat|bin|milyon|milyar)?/gi) ?? [];
  return Array.from(new Set(found.map((f) => f.trim()).filter((f) => /\d/.test(f))));
}

/** Sentences of a Markdown body that contain a number and the number does not appear in any source text. */
export function unsupportedNumberSentences(body: string, sourceTexts: string[], max = 30): Array<{ sentence: string; numbers: string[] }> {
  const haystack = sourceTexts.join('\n').replace(/\s+/g, ' ');
  const digitsIn = (s: string) => s.replace(/[^\d]/g, '');
  const sentences = body
    .replace(/^#+\s.*$/gm, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s));
  const out: Array<{ sentence: string; numbers: string[] }> = [];
  for (const sentence of sentences) {
    const nums = extractNumbers(sentence).filter((num) => {
      const d = digitsIn(num);
      return d.length > 0 && !haystack.includes(num) && !haystack.replace(/[^\d ]/g, ' ').split(/\s+/).includes(d);
    });
    if (nums.length) out.push({ sentence: sentence.slice(0, 300), numbers: nums });
    if (out.length >= max) break;
  }
  return out;
}

/** "[KAYNAK GEREKLİ]" or "[KAYNAK GEREKLİ: note]" — publishing is refused while one remains. */
export const SOURCE_MARKER = /\[KAYNAK GEREKL[İI][^\]]*\]/gi;

export function countSourceMarkers(text: string): number {
  return (text.match(SOURCE_MARKER) ?? []).length;
}
