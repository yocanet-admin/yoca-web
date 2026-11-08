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

/**
 * Realistic structured answer for the quote request used in local tests
 * ("Marka kimliği, web sitesi ve sosyal medya yönetimi … Fiyatları da öner."):
 * one-time brand identity and website, first-year domain + hosting included in
 * the website, monthly social media with no stated duration, yearly renewal
 * from year 2. Prices follow the selected currency and are left empty when
 * prices were not requested. Like a real model it returns the whole draft even
 * for a section-level request (the server keeps only the requested section),
 * and its pricing text contains one "average" claim the server must remove.
 */
const MOCK_PRICES: Record<string, { brand: string; web: string; social: string; renew: string }> = {
  TRY: { brand: '85000', web: '140000', social: '32000', renew: '6500' },
  USD: { brand: '2600', web: '4300', social: '990', renew: '200' },
  EUR: { brand: '2400', web: '3950', social: '900', renew: '185' },
  GBP: { brand: '2050', web: '3400', social: '780', renew: '160' },
  AZN: { brand: '4400', web: '7300', social: '1680', renew: '340' },
};
function mockQuoteDraft(input: string, brief: string, scope: string) {
  const cur = /^Selected currency: (\w{3})/m.exec(input)?.[1] ?? 'TRY';
  const priced = /^Prices requested: yes/m.test(input);
  const sample = /^Sample: yes/m.test(input);
  const rec = (/^Recipient: (.+)$/m.exec(input)?.[1] ?? '').replace(/ \(real client record\)$/, '');
  const recipient = rec && rec !== '(not given)' ? rec : sample ? 'ÖRNEK — Kurgusal Kafe Ltd. Şti.' : '';
  let current: { blocks?: Array<{ key: string; body: string }> } = {};
  try { current = JSON.parse(/<CURRENT>\n([\s\S]*?)\n<\/CURRENT>/.exec(input)?.[1] ?? '{}'); } catch { current = {}; }
  const p = MOCK_PRICES[cur] ?? MOCK_PRICES.TRY;
  // "sosyal medya … 6 ay" in the request = a stated duration; otherwise it stays unstated
  const months = /(\d{1,2})\s*ay\b(?!lık)/i.exec(brief)?.[1] ?? '';
  const price = (v: string) => (priced ? v : '');
  const firstSentence = (t: string) => (t.split(/(?<=[.!?])\s+/)[0] ?? t).trim();
  const curNotes = current.blocks?.find((b) => b.key === 'notes')?.body ?? '';
  // "[mock-tarih-eksik]": what the real model did once — the document's dates marked as missing
  const dateGap = brief.includes('[mock-tarih-eksik]');
  const notes = dateGap ? 'Teklif düzenleme tarihi: [EKSİK: teklif düzenleme tarihi]. Teklif [EKSİK: teklifin geçerlilik tarihi] tarihine kadar geçerlidir. Müşteri vergi numarası: [EKSİK: müşterinin vergi numarası].'
    : scope === 'block:notes' && curNotes ? firstSentence(curNotes)
    : 'Fiyatlara KDV dahil değildir; KDV belge ayarlarındaki oranla eklenir. Sosyal medya reklam bütçesi teklife dahil değildir ve müşteri tarafından doğrudan ödenir.';
  const revisions = scope === 'block:revisions'
    ? 'Marka kimliğinde seçilen yön için üç revizyon turu, web sitesi tasarımında sayfa şablonu başına iki revizyon turu dahildir. Sosyal medya içeriklerinde her gönderi için bir revizyon turu dahildir. Ek revizyonlar ayrıca fiyatlandırılır.'
    : 'Marka kimliği ve web sitesi tasarımı için iki revizyon turu dahildir. Ek revizyonlar ayrıca fiyatlandırılır.';
  // "[mock-eksik-plan]": what a real model did once — the plan left as a placeholder, scope points listed as "missing".
  // "[mock-yalniz-plan]": a payment-only answer that does not rewrite the payment-terms text.
  const weak = brief.includes('[mock-eksik-plan]');
  const planOnly = brief.includes('[mock-yalniz-plan]');
  // the document already has a plan: no plan back, the terms text describes that plan
  const existing = /^Existing payment plan: (.+)$/m.exec(input)?.[1] ?? '';
  // "[mock-cakisma]": a terms text whose percentages contradict the document's plan (conflict tests)
  const clash = brief.includes('[mock-cakisma]');
  // "[mock-dogrulanamadi]": a terms text whose first stage can not be read ("peşin")
  const unclear = brief.includes('[mock-dogrulanamadi]');
  const payment = existing && scope === 'all' ? [] : weak ? [{ label: '[EKSİK: Ödeme aşamaları ve oranları]', percent: null, due: '' }] : scope === 'payment'
    ? [{ label: 'Başlangıç ödemesi', percent: 40, due: 'Sözleşme imzasında' }, { label: 'Marka kimliği onayı', percent: 30, due: 'Marka kimliği onaylandığında' }, { label: 'Web sitesi yayını', percent: 30, due: 'Web sitesi yayına alındığında' }]
    : [{ label: 'Başlangıç ödemesi', percent: 50, due: 'Sözleşme imzasında' }, { label: 'Teslim ödemesi', percent: 50, due: 'Web sitesi yayına alındığında' }];
  return {
    title: 'Marka kimliği, web sitesi ve sosyal medya yönetimi teklifi',
    subject: '',
    blocks: [
      { key: 'intro', heading: 'Giriş', body: `Bu teklif${recipient ? `, ${recipient} için` : ''} marka kimliği, kurumsal web sitesi ve sosyal medya yönetimi çalışmalarının kapsamını, tek seferlik ve aylık ücretlerini ve koşullarını içerir.` },
      { key: 'scope', heading: 'Kapsam', body: 'Marka kimliği ve web sitesi tek seferlik işlerdir: önce marka kimliği hazırlanır ve onaylanır, web sitesi onaylanan kimlikle tasarlanıp geliştirilir.\n\nSosyal medya yönetimi aylık bir hizmettir: içerik planı, gönderi tasarımı ve yayın takibi her ay tekrarlanır.' },
      { key: 'deliverables', heading: 'Teslimatlar', body: 'Logo dosyaları (SVG, PDF, PNG), renk paleti, tipografi ve kullanım kılavuzu\nYayında çalışan, mobil uyumlu kurumsal web sitesi ve yönetim paneli erişimi\nİlk yıl için domain ve hosting kurulumu\nHer ay içerik planı ve 12 gönderi tasarımı' },
      { key: 'assumptions', heading: 'Varsayımlar', body: `Metinler ve fotoğraflar müşteri tarafından sağlanır.\n${months ? `Sosyal medya yönetimi ${months} ay için teklif edilmiştir; ücret aylık faturalanır.` : 'Sosyal medya yönetimi için sözleşme süresi belirtilmedi; aylık ücret hizmet sürdükçe her ay faturalanır. Kontrol edilecek öneri: en az 6 ay.'}\nDomain ve hosting ilk yıl web sitesi bedeline dahildir; 2. yıldan itibaren yıllık yenileme ayrıca faturalanır.${weak ? '' : '\nWeb sitesi en çok 8 sayfa olarak varsayılmıştır.\nSosyal medya: 2 platform, ayda 12 gönderi varsayılmıştır.'}` },
      { key: 'out_of_scope', heading: 'Kapsam dışı', body: 'Sosyal medya reklam bütçesi\nFotoğraf ve video çekimi\nE-ticaret ve ödeme altyapısı' },
      { key: 'revisions', heading: 'Revizyon koşulları', body: revisions },
      ...(planOnly ? [] : [{ key: 'terms', heading: 'Ödeme koşulları', body: unclear ? 'Ödeme %30 peşin, %70 teslimde alınır. Sosyal medya yönetimi aylık faturalanır.' : clash ? 'Ödeme %50 başlangıçta, %50 teslimde alınır. Sosyal medya yönetimi aylık faturalanır.' : existing && scope !== 'payment' && !weak ? `Tek seferlik işler için ödeme planı: ${existing}. Sosyal medya yönetimi aylık olarak her ayın başında faturalanır. Domain ve hosting yenilemesi 2. yıldan itibaren yıllık faturalanır; ilk dönem toplamlarına dahil değildir.` : weak ? 'Tek seferlik çalışmaların ödeme planı: [EKSİK: Ödeme aşamaları ve oranları]. Sosyal medya yönetimi aylık, 2. yıldan itibaren domain ve hosting yenilemesi yıllık faturalanır.' : scope === 'payment' ? 'Tek seferlik işlerin ödeme planı: %40 başlangıçta (sözleşme imzasında), %30 marka kimliği onayında, %30 web sitesi yayınında. Sosyal medya yönetimi her ayın ilk iş günü faturalanır. Domain ve hosting yenilemesi 2. yıldan itibaren yıllık faturalanır; ilk dönem toplamlarına dahil değildir.' : 'Ödeme planı tek seferlik işler (marka kimliği ve web sitesi) içindir. Sosyal medya yönetimi aylık olarak her ayın başında faturalanır. Domain ve hosting yenilemesi 2. yıldan itibaren yıllık faturalanır; ilk dönem toplamlarına dahil değildir.' }]),
      { key: 'notes', heading: 'Notlar', body: notes },
    ],
    items: [
      { ref: 'brand', title: 'Marka kimliği', description: 'Logo, renk paleti, tipografi ve temel kullanım kılavuzu.', quantity: '1', unit: 'paket', billing: 'once', term: '', startYear: 1, includedIn: '', unitPrice: price(p.brand), priceBasis: '', priceNote: priced ? 'İki logo yönü, seçilen yönün geliştirilmesi ve kılavuz (yaklaşık 60–70 saat) varsayımıyla.' : '' },
      { ref: 'web', title: 'Kurumsal web sitesi', description: 'En çok 8 sayfa, mobil uyumlu tasarım, içerik yönetim paneli ve iletişim formu. İlk yıl domain ve hosting dahildir.', quantity: '1', unit: 'proje', billing: 'once', term: '', startYear: 1, includedIn: '', unitPrice: price(p.web), priceNote: priced ? 'En çok 8 şablon sayfa ve hazır içerik yönetim paneli (yaklaşık 110–130 saat) varsayımıyla.' : '', priceBasis: '' },
      { ref: 'host1', title: 'Domain ve hosting (1. yıl)', description: 'İlk yıl için alan adı ve barındırma; web sitesi bedeline dahildir.', quantity: '1', unit: 'yıl', billing: 'once', term: '', startYear: 1, includedIn: 'web', unitPrice: price('1500'), priceBasis: '', priceNote: '' },
      { ref: 'social', title: 'Sosyal medya yönetimi', description: 'Aylık içerik planı, ayda 12 gönderi tasarımı, yayın ve yorum takibi, aylık kısa rapor.', quantity: '1', unit: 'ay', billing: 'monthly', term: months, startYear: 1, includedIn: '', unitPrice: price(p.social), priceBasis: '', priceNote: priced ? 'İki platform ve ayda 12 gönderi varsayımıyla; reklam bütçesi hariç.' : '' },
      { ref: 'renew', title: 'Domain ve hosting yıllık yenileme', description: '2. yıldan itibaren her yıl; güncel sağlayıcı tarifesine göre tahmini, yenileme tarihinde güncellenebilir.', quantity: '1', unit: 'yıl', billing: 'yearly', term: '', startYear: 2, includedIn: '', unitPrice: price(p.renew), priceBasis: priced ? 'estimate' : '', priceNote: priced ? 'Güncel sağlayıcı tarifesine göre tahmin.' : '' },
    ],
    payment,
    deliveryTime: 'Marka kimliği 3 hafta; web sitesi marka kimliği onayından sonra 5 hafta (toplam yaklaşık 8 hafta). Sosyal medya yönetimi web sitesi yayınından sonraki ay başlar.',
    validityDays: 30,
    closing: 'Sorularınız için bize her zaman ulaşabilirsiniz.',
    pricing: priced
      ? { basis: 'Fiyatlar canlı piyasa araştırmasına değil, kapsamdaki işler ve tahmini efor üzerinden hazırlanmış tahminlerdir. Fiyatlar Türkiye ortalamasına göre belirlenmiştir.', assumptions: ['Marka kimliği: iki logo yönü ve iki revizyon turu.', 'Web sitesi: en çok 8 sayfa, içerik müşteriden.', 'Sosyal medya: iki platform, ayda 12 gönderi; reklam bütçesi hariç.', 'Yenileme: güncel sağlayıcı tarifesine göre tahmin.'] }
      : { basis: '', assumptions: [] },
    proposed: weak ? ['block:revisions', 'deliveryTime', 'validity'] : ['block:revisions', 'block:assumptions', 'payment', 'deliveryTime', 'validity'],
    requestedCurrency: '',
    sampleRecipient: sample ? { company: 'Kurgusal Kafe Ltd. Şti.', name: 'Deniz Örnek' } : { company: '', name: '' },
    missing: [brief.length > 0 && !recipient ? 'Alıcı firma adı' : '', ...(dateGap ? ['Teklif düzenleme tarihi', 'Teklifin geçerlilik tarihi', 'Müşterinin vergi numarası'] : []), ...(weak ? ['Web sitesinin sayfa sayısı ve işlevleri', 'Sosyal medya kanalları ve aylık içerik adedi', 'Ödeme aşamaları ve oranları'] : [])].filter(Boolean),
  };
}

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
      const brief = /<BRIEF>\n([\s\S]*?)\n<\/BRIEF>/.exec(input)?.[1] ?? input;
      const scope = /^Scope: (\S+)/m.exec(input)?.[1] ?? 'all';
      if (/sosyal medya/i.test(brief) || scope !== 'all') return mockQuoteDraft(input, brief, scope);
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
          { ref: 'brand', title: 'Marka kimliği', description: 'Logo, renk, tipografi ve kullanım kılavuzu.', quantity: '1', unit: 'paket', billing: 'once', term: '', startYear: 1, includedIn: '', unitPrice: '', priceBasis: '', priceNote: '' },
          { ref: 'web', title: 'İki dilli web sitesi', description: 'Türkçe ve İngilizce, mobil uyumlu site.', quantity: '1', unit: 'proje', billing: 'once', term: '', startYear: 1, includedIn: '', unitPrice: '', priceBasis: '', priceNote: '' },
        ],
        payment: [
          { label: 'Başlangıç ödemesi', percent: 50, due: 'Başlangıçta' },
          { label: 'Kalan ödeme', percent: null, due: '[EKSİK: kalan ödemenin zamanı]' },
        ],
        deliveryTime: '6 hafta',
        validityDays: null, closing: '', pricing: { basis: '', assumptions: [] }, proposed: [], requestedCurrency: '', sampleRecipient: { company: '', name: '' },
        missing: ['Kalem fiyatları', 'Kalan ödemenin zamanı', 'Müşterinin vergi numarası'],
      };
    }
    case 'doc_letter': {
      if (input.includes('[mock-hata]')) throw new Error('Mock: yapay zekâ isteği başarısız (test).');
      const facts = /<FACTS>\n([\s\S]*?)\n<\/FACTS>/.exec(input)?.[1] ?? '';
      return {
        title: 'Çalışma hakkında bilgilendirme',
        salutation: 'Sayın Yetkili,',
        body: `Sizi yürüttüğümüz çalışma hakkında bilgilendirmek isteriz.\n\n${facts.split(/\n+/)[0] ?? ''}\n\nBir sonraki adımın tarihi: [EKSİK: bir sonraki adımın tarihi].`,
        closing: 'Saygılarımızla,',
        missing: ['Bir sonraki adımın tarihi'],
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
    case 'seo_suggestion': {
      const subject = /Query \/ subject: (.*)/.exec(input)?.[1]?.trim() || 'konu';
      return {
        title: `Mock: ${subject} — Yoca`.slice(0, 60),
        metaDescription: `Mock meta açıklama (AI_MOCK=1): ${subject} için sayfanın ne sunduğunu tek cümlede anlatan, tıklamaya davet eden kısa bir metin.`,
        outline: [
          { heading: `Mock: ${subject} nedir?`, points: ['Kısa tanım', 'Kimin için'] },
          { heading: 'Mock: Yoca nasıl çalışır?', points: ['Süreç adımları', 'Teslimler'] },
          { heading: 'Mock: Sık sorulan sorular', points: ['Süre', 'Kapsam'] },
        ],
        notes: ['Mock not: gerçek bir proje örneği eklenebilir mi?'],
      };
    }
    default:
      return {};
  }
}
