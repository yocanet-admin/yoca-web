# Teklifler ve Belgeler

Yönetim paneli → Operasyon → **Teklifler ve Belgeler** (`/admin/documents`).

Bu modülle beş belge türü hazırlanır: fiyat teklifi, proforma, antetli yazı, proje durum raporu ve teslim belgesi. Belgeler panelde düzenlenir, sürümleri saklanır ve PDF olarak indirilir.

Bu modülün yapmadıkları:

- E-fatura veya muhasebe kaydı oluşturmaz.
- Otomatik e-posta göndermez.
- Herkese açık paylaşım bağlantısı vermez.
- Elektronik imza almaz.

## Ekranlar

**Liste** (`/admin/documents`)
- Sütunlar: belge no, başlık, tür, müşteri veya alıcı, tarih, durum ve para birimiyle toplam.
- Arama ile tür, müşteri ve durum filtreleri var.
- Satır işlemleri: Düzenle / Aç, Çoğalt, PDF indir, Arşivle.

**Yeni belge**
- Tür seçilir.
- Mevcut bir müşteri seçilir ya da "müşteriye bağlamadan" alıcı elle yazılır.
- Dil seçilir.
- Elle doldurma ya da yapay zekâ ile ilk taslak seçilir.

**Düzenleyici** (`/admin/documents/[id]`)
- Alanlar türe göre değişir: antetli yazıda kalem ve ödeme alanı yoktur.
- Canlı toplam ve eksik bilgi listesi gösterilir.
- Önizle: taslak PDF yeni sekmede açılır.
- Diğer işlemler: Kaydet, PDF indir, Kesinleştir, Revize et, Çoğalt, Proforma oluştur (tekliften), Arşivle.
- Teklif takibi ve sürüm/PDF geçmişi buradadır.

**Belge ayarları** (`/admin/documents/settings`)
- Banka hesapları (IBAN kontrol hanesi doğrulanır).
- Varsayılanlar: para birimi, dil, geçerlilik süresi, yeni kalemlerde KDV.
- İmza yetkilisi ve proforma notu.

**Müşteri detayı** (Operasyon → müşteri → Belgeler)
- O müşterinin belgeleri listelenir.
- "+ Yeni belge" müşteri seçili olarak açılır.

## Şirket bilgileri

Tek kaynak **Şirket bilgileri** ekranıdır (`cockpit_settings.company_info`). Belgelerde şu alanlar kullanılır:

- unvan, resmî adres, telefon, e-posta, web sitesi;
- vergi dairesi, vergi no, MERSİS, ticaret sicil, KEP.

Telefon alanı bu sürümde bu ekrana eklendi.

1. **Profil revizyonu:** Şirket bilgilerinde ya da belge ayarlarında yapılan her değişiklik yeni bir revizyon oluşturur (`doc_company_revisions`). Bir PDF her zaman tek bir revizyondan üretilir; sayfalar arasında eski ve yeni bilgi karışmaz.
2. **Önizleme ve taslak PDF:** Güncel profille üretilir.
3. **Kesinleşmiş belgede "PDF indir":** Sürümün dondurulmuş içeriği ve güncel şirket profili birleştirilir. Kalemler, tutarlar, alıcı, tarih, banka bilgisi ve onay geçmişi değişmez. Yeni belge numarası verilmez.
4. **Önbellek:** Aynı (sürüm, profil revizyonu, şablon sürümü) için PDF bir kez üretilir ve saklanır (`doc_renders`). Revizyon artınca bir sonraki indirme yeniden üretir.
5. **Geçmiş PDF'ler:** Hiçbir PDF ezilmez. Kesinleştirme anındaki PDF ve sonraki her üretim, sürüm, profil revizyonu, şablon sürümü ve tarihle "Geçmiş PDF" olarak açılabilir.
6. **Daha önce gönderilen dosyalar:** Önceden indirilen veya e-postayla gönderilen dosyalar değişmez; yeni indirme güncel bilgilerle üretilir.
7. **Boş alanlar:** Belgede hiç görünmez. Etiket, ayırıcı, kutu ya da "telefon giriniz" gibi yer tutucu basılmaz. Yapay zekâ şirket bilgisi doldurmaz.

## Tutarlar

Tutarları uygulama hesaplar; yapay zekâ hesaplamaz. Hesap kuruş cinsinden tam sayılarla yapılır (`lib/documents/calc.ts`).

**Yuvarlama:** yarım yukarı, kuruşa. Yuvarlamanın yapıldığı yerler:
- satır tutarı = miktar × birim fiyat;
- satır indirimi;
- KDV: aynı orandaki satırların net toplamı üzerinden, her oran için bir kez;
- ödeme adımları.

**Ödeme planı**
- Tüm adımlar yüzde ise ve toplamları %100 ise, son adım kuruş farkını alır.
- Diğer planlar genel toplama tam eşit olmalıdır; değilse belge kesinleştirilemez.

**Eksik fiyat:** Fiyatı boş kalem 0 sayılmaz. Genel toplam hesaplanmaz ve belge kesinleştirilemez.

**Para birimi:** TRY, USD, EUR, GBP, AZN. Bir belgede tek para birimi kullanılır.

## Kesinleştirme ve sürümler

**Durumlar:** Taslak → Kesinleştirildi → Arşivlendi.

**Teklif takibi:** gönderildi / kabul edildi / reddedildi / süresi doldu. Elle işaretlenir; kim ve ne zaman işaretlediği kaydedilir. Elektronik imza veya doğrulanmış müşteri onayı değildir.

**Kesinleştirme sırası**
1. PDF üretilir.
2. PDF özel depoya kaydedilir.
3. Sürüm ve durum değişikliği tek işlemde yazılır.
- PDF üretilemezse belge taslak kalır.
- Aynı tıklama iki kez gelirse tek sürüm oluşur.

**Revize et:** Belge yeniden taslak olur. Sonraki kesinleştirme n+1. sürümü oluşturur; önceki sürümler ve PDF'leri saklanır.

**Numaralar:** `TKL / PRF / YZI / RPR / TSL-YYYY-NNNN`. Tek bir atomik sayaçtan verilir; eşzamanlı oluşturmalarda çakışmaz.

**Tekliften proforma**
- Teklifin son kesinleşmiş sürümünden kopyalanır.
- İlişki korunur; teklif değişmez.
- Tahsilat kaydı oluşturmaz; Operasyon ödemelerine dokunmaz.

## Yapay zekâ

Mevcut sunucu altyapısı kullanılır: OpenAI anahtarı, model ayarı, aylık bütçe ve `ai_runs` kaydı. Tarayıcıya anahtar gitmez.

Yapay zekânın yaptıkları:
- **Taslak:** kapsam, teslimatlar, varsayımlar, kapsam dışı işler ve ödeme koşulları önerir. Kalemler fiyatsız gelir.
- **Seçili metin:** kısaltır, resmîleştirir veya sadeleştirir.
- **Çeviri:** TR ↔ EN.

Kurallar:
- Bilinmeyen gerçekler `[EKSİK: …]` olarak işaretlenir. Bu işaret kalırken belge kesinleştirilemez.
- Metinde tutar geçerse uyarı gösterilir.
- Öneriler, yönetici "Uygula" demedikçe belgeye girmez.
- No AI Slop kuralları uygulanır.

## Güvenlik

- Tüm tablolar yalnızca yöneticiye açıktır (`is_admin()` ve RLS) ve işlem geçmişine yazılır.
- Yaşam döngüsü alanları (durum, sürüm, numara) yalnızca `doc_*` fonksiyonlarıyla değişir.
- Kesinleşmiş sürümler ve PDF kayıtları değiştirilemez, silinemez.
- PDF'ler özel `yoca-docs` deposundadır: yalnızca PDF, en çok 15 MB.
- Yöneticiler dosya okuyup ekleyebilir; değiştiremez, silemez.
- İndirme bağlantıları 5 dakikalık imzalı bağlantılardır.

## PDF tasarımı

Referans: "Yoca kurumsal belge tasarım kiti" (5 Kasım 2026).

- **Teklif ve proforma:** yan bant düzeni.
- **Yazı, rapor ve teslim belgesi:** antet düzeni.

Uygulama `lib/documents/pdf.tsx` içindedir:
- `@react-pdf/renderer` kullanılır.
- Sayfa sonları otomatik ayarlanır. Tablo başlığı devam sayfasında tekrarlanır.
- Bölüm başlığı ilk paragrafıyla, imza son içerikle birlikte kalır.
- Altlıktaki iletişim bloğunun yüksekliği metin alanından ayrılır.

Kitteki `render.py` sabit örnekler içindir ve kullanılmaz.

Diğer ayrıntılar:
- **Logo:** `public/brand/yoca-logo-primary.svg`, dosyanın kendi oranıyla.
- **Font:** Manrope (OFL, `lib/documents/fonts/OFL.txt`).
- **Şablon sürümü:** `TEMPLATE_VERSION`. Tasarım değişirse artırılır; böylece yeni indirmeler yeni şablonla üretilir.

## Kurulum sırası (production)

1. **Yedeği kontrol et:** Supabase → Database → Backups.
2. **Ön kontrol (salt okunur):**
   ```sql
   select to_regclass('public.clients'), to_regprocedure('public.is_admin()'), to_regprocedure('public.audit_row()'),
          to_regclass('public.doc_documents');
   ```
   İlk üç değer dolu, sonuncusu `null` olmalı.
3. **`supabase/upgrade-v19-documents.sql`'i çalıştır.**
   - Yalnızca yeni tablo, fonksiyon, tetikleyici ve depo ekler.
   - Mevcut satırları değiştirmez.
   - İlk şirket profili revizyonunu mevcut ayarlardan oluşturur.
4. **Uygulamayı yayınla.** Eski uygulama bu tabloları okumadığı için sıra bozulsa da mevcut ekranlar çalışır.
5. **Canlı kontroller:**
   - Belge ekranları açılıyor mu?
   - Şirket bilgileri sayfasında telefon alanı görünüyor mu?
   - `[TEST]` işaretli, müşteriye bağlı olmayan bir antetli yazı taslağının önizlemesi açılıyor mu?
   - Bu taslak kesinleştirilmez, gönderilmez.

## Geri dönüş

- **Uygulama:** Önceki production dağıtımına geri al (Vercel → Instant Rollback). v19 tabloları yerinde kalabilir; eski uygulama onları okumaz.
- **Veritabanı:** `upgrade-v19-documents.sql` sonundaki "Undo" bölümü. Gerçek belge oluştuktan sonra çalıştırılırsa belgeler ve sürümler silinir. Bu durumda yalnızca uygulamayı geri almak tercih edilmelidir. `yoca-docs` deposu geri alma ile silinmez.
