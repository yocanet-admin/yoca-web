/**
 * Synthetic sample documents for tests and the design preview.
 * Every person, firm, amount and account number here is invented and marked
 * as a sample ("ÖRNEK"); the issuer only uses facts already shown on yoca.net.
 */
import { newContent, type DocContent, type Issuer } from '../lib/documents/model';
import type { BankAccount } from '../lib/documents/settings';

/** As the design kit's sample profile: only the brand and the website are filled. */
export const SAMPLE_ISSUER: Issuer = {
  brand: 'Yoca', legalName: '', address: '', taxOffice: '', taxNumber: '', mersis: '', tradeRegistry: '',
  email: '', phone: '', website: 'https://yoca.net', kep: '',
};

/** A fully filled SYNTHETIC profile (long legal name, multi-line address) for layout checks only. */
export const FULL_TEST_ISSUER: Issuer = {
  brand: 'Yoca', legalName: 'ÖRNEK Yaratıcı Ajans Danışmanlık Yazılım ve Reklam Hizmetleri Limited Şirketi',
  address: 'Örnek Mahallesi, Uzun Bir Cadde Adı Sokağı No: 131 Kat: 4 Daire: 12\nKadıköy / İstanbul 34710', taxOffice: 'Örnek Vergi Dairesi', taxNumber: '0000000000',
  mersis: '0000000000000000', tradeRegistry: 'İstanbul Ticaret Sicil Müdürlüğü 000000-0', email: 'ornek@yoca.example', phone: '+90 000 000 00 00', website: 'https://yoca.net', kep: '',
};

export const SAMPLE_BANK: BankAccount = { id: 'bank1', label: 'ÖRNEK hesap', bank: 'ÖRNEK Bankası', holder: 'ÖRNEK — hesap sahibi', iban: 'TR000000000000000000000000', currency: 'TRY', swift: '', branch: '' };

const NOW = new Date('2026-11-05T09:00:00Z');

export function sampleQuote(): DocContent {
  const c = newContent('quote', { now: NOW, validityDays: 30 });
  c.recipient = { name: 'Elif Şahin (ÖRNEK)', company: 'Örnek Çiçekçilik ve Peyzaj Ltd. Şti. (ÖRNEK)', attention: 'Pazarlama Müdürü', address: 'Örnek Mah. Gül Sok. No: 7, Üsküdar / İstanbul', taxOffice: 'Örnek VD', taxNumber: '0000000000', email: 'elif@ornek.example', phone: '' };
  c.projectName = 'Marka kimliği ve iki dilli web sitesi';
  c.deliveryTime = 'Sözleşme ve ilk ödemeden sonra 6 hafta (müşteri geri bildirimleri 3 iş günü içinde gelirse).';
  c.items = [
    { id: 'i1', title: 'Marka stratejisi ve konumlandırma', description: 'İki atölye çalışması (her biri en çok 3 saat), rakip ve kategori incelemesi, hedef kitle tanımı, marka sözü ve ton rehberi. Çıktı: 12–16 sayfalık strateji dokümanı; Türkçe.', quantity: '1', unit: 'paket', unitPrice: '45.000', discountPct: '', taxRate: '20' },
    { id: 'i2', title: 'Logo ve görsel kimlik sistemi', description: 'Üç logo yönü, seçilen yönün iki tur revizyonla geliştirilmesi; renk paleti, tipografi, ikon dili, kartvizit ve antetli kâğıt şablonları; yüksek çözünürlüklü dosyalar (SVG, PDF, PNG) ve kısa kullanım kılavuzu. Kılavuzda mağaza tabelası, araç giydirme, sosyal medya şablonları ve sunum dosyası kullanımı ayrı başlıklarla anlatılır; her uygulama için doğru ve yanlış kullanım örnekleri verilir.', quantity: '1', unit: 'paket', unitPrice: '68.500,00', discountPct: '10', taxRate: '20' },
    { id: 'i3', title: 'Web sitesi tasarımı ve geliştirme (TR/EN)', description: 'En çok 8 şablon sayfa, mobil uyumlu arayüz, içerik yönetim paneli, iletişim formu, temel SEO ayarları ve hız optimizasyonu. İçerik girişi müşteriden gelen metinlerle yapılır.', quantity: '1', unit: 'proje', unitPrice: '124.750,50', discountPct: '', taxRate: '20' },
    { id: 'i4', title: 'İngilizce metin uyarlaması', description: 'Türkçe sayfa metinlerinin İngilizceye uyarlanması (en çok 6.000 kelime).', quantity: '6', unit: 'bin kelime', unitPrice: '2.333,33', discountPct: '', taxRate: '20' },
    { id: 'i5', title: 'Alan adı ve barındırma (1 yıl)', description: 'Üçüncü taraf sağlayıcı ücreti, yansıtma bedeli.', quantity: '1', unit: 'yıl', unitPrice: '3.600', discountPct: '', taxRate: '0' },
  ];
  c.payment = [
    { id: 'p1', label: 'Başlangıç ödemesi', mode: 'percent', value: '50', due: 'Sözleşme imzasında' },
    { id: 'p2', label: 'Tasarım onayı', mode: 'percent', value: '30', due: 'Web tasarımı onaylandığında' },
    { id: 'p3', label: 'Yayın', mode: 'percent', value: '20', due: 'Site yayına alındığında' },
  ];
  c.bankAccountIds = ['bank1'];
  const set = (key: string, body: string) => { const b = c.blocks.find((x) => x.key === key); if (b) b.body = body; };
  set('intro', 'Bu teklif, Örnek Çiçekçilik ve Peyzaj için marka kimliği ve iki dilli (Türkçe / İngilizce) web sitesi çalışmasının kapsamını, takvimini ve bedelini içerir.');
  set('scope', 'Çalışma üç aşamada yürür: strateji, kimlik ve web. Her aşamanın sonunda müşteri onayı alınır; onay alınmadan bir sonraki aşamaya geçilmez.\n\nProje yönetimi, haftalık durum e-postası ve paylaşılan bir takvim üzerinden yapılır.');
  set('deliverables', 'Strateji dokümanı (PDF)\nLogo dosyaları (SVG, PDF, PNG) ve kullanım kılavuzu\nKartvizit ve antetli kâğıt şablonları\nYayında çalışan iki dilli web sitesi ve yönetim paneli erişimi\nYarım günlük panel kullanım eğitimi (çevrim içi)');
  set('assumptions', 'Sayfa metinleri ve fotoğraflar müşteri tarafından sağlanır.\nGeri bildirimler tek bir yetkili kişi üzerinden, toplu olarak iletilir.\nÜçüncü taraf ücretleri (alan adı, barındırma, yazı tipi lisansı) ayrıca gösterilmiştir.');
  set('out_of_scope', 'Fotoğraf ve video çekimi\nSosyal medya yönetimi ve reklam bütçesi\nE-ticaret, ödeme altyapısı ve üye girişi\nÜçüncü dil eklenmesi');
  set('revisions', 'Kimlik aşamasında seçilen logo yönü için iki revizyon turu, web tasarımında sayfa başına iki revizyon turu dahildir. Ek revizyonlar saatlik ücretle ayrıca teklif edilir.');
  set('notes', 'Fiyatlara KDV dahil değildir; KDV oranları kalem bazında gösterilmiştir. Teklif, geçerlilik tarihine kadar geçerlidir.');
  c.signatory = { name: 'ÖRNEK İmza Yetkilisi', title: 'Proje Direktörü' };
  return c;
}

export function sampleLetter(): DocContent {
  const c = newContent('letter', { now: NOW });
  c.recipient = { name: 'Murat Yıldız (ÖRNEK)', company: 'Örnek Lojistik A.Ş. (ÖRNEK)', attention: '', address: 'Örnek Cad. No: 21, Çankaya / Ankara', taxOffice: '', taxNumber: '', email: '', phone: '' };
  c.subject = 'Web sitesi yayın takvimindeki değişiklik hakkında';
  c.reference = 'TKL-2026-0012 sayılı teklif (ÖRNEK)';
  c.salutation = 'Sayın Yıldız,';
  c.blocks[0].body = 'Şirketiniz için hazırladığımız web sitesinin yayın tarihi, 28 Kasım 2026 olarak planlanmıştı. Ürün kataloğu verilerinin tarafımıza 12 Kasım yerine 19 Kasım’da ulaşması nedeniyle yayın tarihi 5 Aralık 2026 olarak güncellenmiştir.\n\nBu değişiklik kapsamı, bedeli ve ödeme planını etkilemez. Tasarım ve geliştirme çalışmaları sürmektedir; katalog dışındaki tüm sayfalar test ortamında incelemenize açıktır.\n\nYayın öncesinde aşağıdaki iki konuda onayınıza ihtiyaç duyuyoruz:\n- Kurumsal e-posta adreslerinin iletişim sayfasında gösterilmesi\n- İngilizce sayfalarda fiyat bilgisinin yer almaması\n\nSorularınız için proje ekibimize her zaman ulaşabilirsiniz.';
  c.signatory = { name: 'ÖRNEK İmza Yetkilisi', title: 'Proje Direktörü' };
  return c;
}

export function sampleStatusReport(): DocContent {
  const c = newContent('status_report', { now: NOW });
  c.recipient = { name: 'Can Demir (ÖRNEK)', company: 'Örnek Gıda San. ve Tic. A.Ş. (ÖRNEK)', attention: 'Dijital Pazarlama', address: 'Örnek OSB 4. Cad. No: 12, Gebze / Kocaeli', taxOffice: '', taxNumber: '', email: '', phone: '' };
  c.projectName = 'Kurumsal web sitesi ve ürün kataloğu';
  c.period = '20 Ekim – 3 Kasım 2026';
  const set = (key: string, body: string) => { const b = c.blocks.find((x) => x.key === key); if (b) b.body = body; };
  set('summary', 'Tasarım aşaması planlanan tarihte kapandı ve geliştirme başladı. Ürün kataloğu verilerinin gecikmesi nedeniyle katalog sayfalarının teslimi bir hafta kaydı; diğer sayfalar takvime uygun ilerliyor.\n\nBu dönemde ana sayfa, kurumsal sayfalar ve iletişim akışı test ortamına alındı. Yayın öncesi kalan işler aşağıda sıralandı.');
  set('done', 'Ana sayfa ve kurumsal sayfaların tasarım onayı (22 Ekim)\nRenk ve tipografi sisteminin web bileşenlerine aktarılması\nİletişim formu, KVKK aydınlatma metni bağlantısı ve teşekkür sayfası\nTest ortamının kurulması ve erişim bilgilerinin paylaşılması\nGörsel arşivinin düzenlenmesi: 214 ürün fotoğrafı yeniden adlandırıldı ve boyutlandırıldı\nİngilizce sayfa yapısının hazırlanması (metinler bekleniyor)\nArama motoru için sayfa başlıkları ve açıklamalarının ilk taslağı');
  set('in_progress', 'Ürün kataloğu şablonu: filtreleme (kategori, ambalaj, raf ömrü) ve ürün detay sayfası\nYönetim paneli: ürün ekleme ve toplu içe aktarma (CSV)\nSayfa hızı iyileştirmeleri: görsel sıkıştırma ve önbellek ayarları\nErişilebilirlik kontrolleri: kontrast, klavye ile gezinme, görsel açıklamaları');
  set('waiting', 'Ürün kataloğu verilerinin son hâli (CSV): ürün adı, kategori, ambalaj, içerik bilgisi\nİngilizce sayfa metinleri\nKurumsal e-posta adreslerinin iletişim sayfasında gösterilip gösterilmeyeceği kararı\nAlan adı yönetim paneline teknik erişim (DNS kaydı için)');
  set('next_steps', 'Katalog verileri geldikten sonra 5 iş günü içinde katalog sayfalarının test ortamına alınması\nİngilizce sayfaların yerleştirilmesi ve çeviri kontrolü\nYayın öncesi son kontrol toplantısı (tarih birlikte belirlenecek)\nYayın ve ilk hafta izleme raporu');
  c.signatory = { name: 'ÖRNEK Proje Yöneticisi', title: 'Proje Yöneticisi' };
  return c;
}

export function sampleDelivery(): DocContent {
  const c = newContent('delivery', { now: NOW });
  c.recipient = { name: 'Elif Şahin (ÖRNEK)', company: 'Örnek Çiçekçilik ve Peyzaj Ltd. Şti. (ÖRNEK)', attention: '', address: 'Örnek Mah. Gül Sok. No: 7, Üsküdar / İstanbul', taxOffice: '', taxNumber: '', email: '', phone: '' };
  c.projectName = 'Marka kimliği';
  c.reference = 'TKL-2026-0001 sayılı teklif (ÖRNEK)';
  const set = (key: string, body: string) => { const b = c.blocks.find((x) => x.key === key); if (b) b.body = body; };
  set('scope', 'Bu belge, teklifte yer alan marka kimliği aşamasının teslimini kayda geçirir. Web sitesi aşaması bu belgenin kapsamında değildir.');
  set('delivered', 'Logo dosyaları: SVG, PDF ve PNG (renkli, siyah, beyaz)\nRenk paleti ve tipografi tanımları\nKartvizit ve antetli kâğıt şablonları (baskıya hazır PDF)\nMarka kullanım kılavuzu (24 sayfa, PDF)');
  set('open_issues', 'Araç giydirme uygulaması için ölçü bilgisi bekleniyor\nKılavuzun İngilizce sürümü, web sitesi aşamasıyla birlikte teslim edilecek');
  set('acceptance', 'Teslim edilen dosyalar paylaşılan klasöre yüklenmiştir. Dosyalarla ilgili sorularınızı proje ekibine iletebilirsiniz.');
  c.signatory = { name: 'ÖRNEK İmza Yetkilisi', title: 'Proje Direktörü' };
  return c;
}
