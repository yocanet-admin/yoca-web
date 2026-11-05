import { deflateSync } from 'node:zlib';

/**
 * Yoca — AI mock mode for LOCAL tests only (server only).
 *
 *   AI_MOCK=1   → no request leaves the server; canned structured results and a
 *                 small generated PNG are returned, usage is reported as zero and
 *                 every run is logged with status "mock".
 *
 * It refuses to run on Vercel production (VERCEL_ENV=production): there the
 * flag throws instead of silently faking AI output. It never turns itself on.
 */

export class MockRefusedError extends Error {}

export function mockRequested(): boolean {
  return process.env.AI_MOCK === '1';
}

/** True when mock mode is on and allowed. Throws when it is requested on production. */
export function mockEnabled(): boolean {
  if (!mockRequested()) return false;
  if (process.env.VERCEL_ENV === 'production') {
    throw new MockRefusedError('AI_MOCK production ortamında kullanılamaz. Vercel Production ayarlarından AI_MOCK değişkenini kaldırın.');
  }
  return true;
}

// ── PNG (solid background + a few accent bars; no external dependency) ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A small RGB PNG: off-white field, black band, one green accent line. */
export function mockPng(width = 96, height = 64, seed = 0): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      let rgb: [number, number, number] = [244, 244, 241]; // off-white
      if (y > height * 0.62) rgb = [10, 10, 10]; // black band
      if (Math.abs(y - Math.round(height * (0.3 + (seed % 3) * 0.1))) < 1 && x > width * 0.2) rgb = [43, 179, 76]; // green line
      row.set(rgb, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// ── Canned structured results (shape-valid for every schema we send) ──
const MOCK_BODY = `## Mock taslak\n\nBu metin AI_MOCK=1 ile yerel testte üretildi; OpenAI çağrılmadı.\n\nBu sadece bir test değil, aynı zamanda akışın kontrolü. Araştırmalar gösteriyor ki %40 daha hızlı. [KAYNAK GEREKLİ]\n\n## İkinci bölüm\n\nGünümüzün hızla değişen dijital dünyasında randevu formu tek ekranda kalmalı.`;

export function mockStructured(schemaName: string, input: string): unknown {
  switch (schemaName) {
    case 'article_draft':
      return {
        title: 'Mock: randevu akışı', alternativeTitles: ['Mock başlık 2', 'Mock başlık 3'], excerpt: 'Mock özet.', body: MOCK_BODY,
        seoTitle: 'Mock SEO başlığı', metaDescription: 'Mock meta açıklama.', keywords: ['randevu'], faq: [], suggestedCategory: 'digital',
        suggestedTags: ['web'], suggestedService: 'web-digital-experiences', cta: { headline: 'Mock CTA', text: 'Mock CTA metni.' },
      };
    case 'article_direction':
      return { angle: 'Mock açı', centralArgument: 'Mock argüman', titles: ['A', 'B', 'C'], outline: [{ heading: 'Bölüm', summary: 'Özet' }] };
    case 'topic_ideas':
      return { ideas: [{ title: 'Mock fikir', angle: 'Açı', keyword: 'anahtar', why: 'Neden' }] };
    case 'title_options':
      return { titles: ['Mock başlık A', 'Mock başlık B', 'Mock başlık C'] };
    case 'style_review': {
      const text = /<TEXT>\n([\s\S]*?)\n<\/TEXT>/.exec(input)?.[1] ?? input;
      const findings: Array<{ excerpt: string; pattern: string; suggestion: string }> = [];
      const probes: Array<[RegExp, string, string]> = [
        [/Günümüzün hızla değişen dijital dünyasında/, 'empty_opener', 'Girişi kaldırın, doğrudan konuya başlayın.'],
        [/Bu sadece [^.]*değil[^.]*\./, 'binary_contrast', 'İkinci kısmı doğrudan söyleyin.'],
        [/Araştırmalar gösteriyor[^.]*\./, 'weasel_attribution', 'Kaynağı adlandırın ya da cümleyi çıkarın.'],
      ];
      for (const [re, pattern, suggestion] of probes) {
        const m = re.exec(text);
        if (m) findings.push({ excerpt: m[0], pattern, suggestion });
      }
      return { findings };
    }
    case 'style_edit': {
      const body = /<TEXT>\n([\s\S]*?)\n<\/TEXT>/.exec(input)?.[1] ?? input;
      const text = body
        .replace(/Günümüzün hızla değişen dijital dünyasında /g, '')
        .replace(/Bu sadece bir test değil, aynı zamanda akışın kontrolü\./g, 'Bu, akışın kontrolü.');
      return { text, changes: ['Boş giriş kaldırıldı', '“X değil, Y” kalıbı sadeleştirildi'] };
    }
    case 'source_check':
      return { claims: [{ claim: '%40 daha hızlı', status: 'unsupported', source: '', note: 'Verilen kaynaklarda yok.' }] };
    case 'seo_pack':
      return { seoTitle: 'Mock SEO', metaDescription: 'Mock meta', titleOptions: ['A', 'B', 'C', 'D', 'E'], keywords: ['mock'], internalLinks: [{ path: '/contact', anchor: 'iletişim', why: 'mock' }] };
    case 'translation':
      return { title: 'Mock translation', excerpt: 'Mock excerpt', body: 'Mock body', seoTitle: 'Mock', metaDescription: 'Mock', ogTitle: '', ogDescription: '', faq: [], tags: [], coverAlt: '', coverCaption: '', slug: 'mock-translation' };
    case 'rewrite':
      return { text: 'Mock yeniden yazım.' };
    case 'cover_brief':
      return { brief: 'Siyah zemin üzerinde kırık beyaz bir randevu kartı ve tek yeşil çizgi; yazı yok.', approach: 'photo', alt: 'Siyah zeminde kırık beyaz kart ve yeşil çizgi.' };
    case 'faq_pack':
      return { faq: [] };
    case 'email_teaser':
      return { subject: 'Mock konu satırı', preheader: 'Mock önizleme', teaser: 'Mock kanca paragrafı.\n\nMock ikinci paragraf.', quote: '', notes: 'mock' };
    case 'lead_summary':
      return { ozet: 'Mock özet', ihtiyaclar: [], butce: 'belirtilmemiş', aciliyet: 'orta', uygunluk: 3, uygunluk_nedeni: 'mock', spam_olasiligi: 'düşük', sonraki_adim: 'mock', sorular: [] };
    case 'lead_reply':
      return { konu: 'Mock konu', metin: 'Mock metin' };
    // Teklifler ve Belgeler. "[mock-hata]" in the brief/text simulates a failed AI call (local tests only).
    case 'doc_draft': {
      if (input.includes('[mock-hata]')) throw new Error('Mock: yapay zekâ isteği başarısız (test).');
      return {
        title: 'Marka kimliği ve iki dilli web sitesi teklifi',
        subject: '',
        blocks: [
          { key: 'intro', heading: 'Giriş', body: 'Bu teklif, marka kimliği ve iki dilli web sitesi çalışmasının kapsamını ve koşullarını içerir.' },
          { key: 'scope', heading: 'Kapsam', body: 'Çalışma strateji, kimlik ve web olmak üzere üç aşamada yürür. Toplam süre altı haftadır.' },
          { key: 'deliverables', heading: 'Teslimatlar', body: 'Logo ve kimlik dosyaları\nİki dilli (TR/EN) web sitesi' },
          { key: 'assumptions', heading: 'Varsayımlar', body: 'Metinler ve görseller müşteri tarafından sağlanır.' },
          { key: 'out_of_scope', heading: 'Kapsam dışı', body: 'Fotoğraf çekimi\nReklam yönetimi' },
          { key: 'revisions', heading: 'Revizyon koşulları', body: 'Her aşama için iki revizyon turu dahildir.' },
          { key: 'notes', heading: 'Notlar', body: 'Müşterinin vergi numarası: [EKSİK: müşterinin vergi numarası]. Örnek tutar ₺10.000 (mock uyarı testi).' },
          { key: 'body', heading: 'Metin', body: 'Mock yazı gövdesi. Tarih: [EKSİK: yeni yayın tarihi].' },
          { key: 'summary', heading: 'Özet', body: 'Mock rapor özeti.' },
          { key: 'done', heading: 'Tamamlananlar', body: 'Mock tamamlanan iş' },
          { key: 'delivered', heading: 'Teslim edilenler', body: 'Mock teslim edilen' },
        ],
        items: [
          { title: 'Marka kimliği', description: 'Logo, renk, tipografi ve kullanım kılavuzu.', quantity: '1', unit: 'paket' },
          { title: 'İki dilli web sitesi', description: 'Türkçe ve İngilizce, mobil uyumlu site.', quantity: '1', unit: 'proje' },
        ],
        payment: [
          { label: 'Başlangıç ödemesi', percent: 50, due: 'Başlangıçta' },
          { label: 'Kalan ödeme', percent: null, due: '[EKSİK: kalan ödemenin zamanı]' },
        ],
        deliveryTime: '6 hafta',
        missing: ['Kalem fiyatları', 'Kalan ödemenin zamanı', 'Müşterinin vergi numarası'],
      };
    }
    case 'doc_rewrite': {
      if (input.includes('[mock-hata]')) throw new Error('Mock: yapay zekâ isteği başarısız (test).');
      const text = /<TEXT>\n([\s\S]*?)\n<\/TEXT>/.exec(input)?.[1] ?? input;
      return { text: `${text.split(/(?<=[.!?])\s+/)[0]} (mock düzenleme)`, changes: ['Mock: metin kısaltıldı'] };
    }
    case 'doc_translate': {
      const raw = /<TEXT>\n([\s\S]*?)\n<\/TEXT>/.exec(input)?.[1] ?? '{}';
      let p: { title?: string; subject?: string; deliveryTime?: string; blocks?: Array<{ id: string; heading: string; body: string }>; items?: Array<{ id: string; title: string; description: string; unit: string }>; payment?: Array<{ id: string; label: string; due: string }> } = {};
      try { p = JSON.parse(raw); } catch { p = {}; }
      const t = (x: string) => (x ? `[EN] ${x}` : '');
      return {
        title: t(p.title ?? ''), subject: t(p.subject ?? ''), deliveryTime: t(p.deliveryTime ?? ''),
        blocks: (p.blocks ?? []).map((b) => ({ id: b.id, heading: t(b.heading), body: t(b.body) })),
        items: (p.items ?? []).map((i) => ({ id: i.id, title: t(i.title), description: t(i.description), unit: i.unit })),
        payment: (p.payment ?? []).map((x) => ({ id: x.id, label: t(x.label), due: t(x.due) })),
      };
    }
    default:
      return {};
  }
}
