# Teklifler ve Belgeler

Yönetim paneli → Operasyon → **Teklifler ve Belgeler** (`/admin/documents`).

Bu modülle beş belge türü hazırlanır: fiyat teklifi, proforma, antetli yazı / bilgilendirme, proje durum raporu ve teslim belgesi. Belgeler panelde düzenlenir, sürümleri saklanır, PDF olarak indirilir ve istenirse ayrı bir “Gönder” adımıyla e-postayla gönderilir. Aynı bölümdeki **Kurumsal materyaller** sekmesinde boş antet, kartvizit, e-posta imzası ve proje bilgilendirme e-postası hazırlanır.

Bu modülün yapmadıkları:

- E-fatura veya muhasebe kaydı oluşturmaz.
- Kendiliğinden e-posta göndermez: PDF üretmek veya kesinleştirmek hiçbir şey göndermez; gönderim yalnızca “E-postayla gönder → Gönder” ile olur.
- Herkese açık paylaşım bağlantısı vermez.
- Elektronik imza almaz.

## Ekranlar

**Liste** (`/admin/documents`)
- Sütunlar: belge no, başlık, tür, müşteri veya alıcı, tarih, durum ve para birimiyle toplam.
- Arama ile tür, müşteri ve durum filtreleri var.
- Satır işlemleri: Düzenle / Aç, Çoğalt, PDF indir, Arşivle.

**Yeni belge**
- Tür seçilir.
- Müşteri isteğe bağlıdır: mevcut müşteri seçilir ya da alıcı firma/kişi pencerede elle yazılır.
- Proje isteğe bağlıdır (Operasyon projeleri; müşteri seçildiyse yalnızca onun projeleri). Proje adı belgeye kopyalanır.
- Dil seçilir.
- Elle doldurma ya da yapay zekâ seçilir (antetli yazıda: “AI ile kurumsal metin hazırla”).

**Taslak düzenleyici** (`/admin/documents/[id]`, durum: taslak)
- Alanlar türe göre değişir: antetli yazıda kalem ve ödeme alanı yoktur.
- Alanlar açılır/kapanır gruplardadır: Belge bilgileri, Alıcı, İş kalemleri, Ödeme planı, Banka bilgileri, Bölümler, Kapanış ve imza. Kapalı grubun başlığında özet görünür (ör. "5 kalem · genel toplam …", "toplamla uyuşmuyor"). "Tümünü aç / kapat" vardır.
- Uzun belgelerde dolu metin bölümleri kapalı açılır, ilk satırları önizleme olarak görünür.
- Grup kapatmak yazılanı silmez. Kaydedilmemiş değişiklikler ayrıca bu tarayıcıda saklanır (`yoca-doc-unsaved:<id>`). Sayfa yenilenir veya panelde başka sayfaya geçilirse, dönüşte "Geri yükle / Sil" sorulur; kendiliğinden uygulanmaz. Kaydedince yedek silinir.
- Canlı toplam ve eksik bilgi listesi gösterilir.
- Önizle: taslak PDF yeni sekmede açılır.
- İşlemler: Kaydet, Önizle, PDF indir, Kesinleştir, Çoğalt, Arşivle; daha önce kesinleşmiş sürüm varsa Sürüm geçmişi ve (teklifte) Proforma oluştur.

**Kesinleşmiş belge** (durum: kesinleştirildi veya arşivlendi)
- Form alanı yerine okunur özet gösterilir: belge bilgileri, alıcı, kalemler ve toplamlar, ödeme planı, belgede basılı banka bilgisi, bölümler. Özet, son sürümün dondurulmuş içeriğinden gelir.
- Üstte: PDF indir, Önizle (kayıtlı PDF yeni sekmede), E-postayla gönder, Sürüm geçmişi, Revize et, Proforma oluştur, Çoğalt, Arşivle.
- Düzenleme "Revize et" ile açılır.
- Teklif takibi ve sürüm/PDF geçmişi yan sütundadır.

**Antetli yazı / Bilgilendirme**
- Numara mevcut YZI serisinden gelir; taslak → kesinleştirme → sürüm akışı diğer belgelerle aynıdır (ikinci bir belge sistemi yok).
- Alanlar: başlık, konu, hitap (“Sayın Yetkili,” varsayılan; boşsa basılmaz), metin, kapanış ve imza. Proje ve ilgi isteğe bağlıdır.
- “AI ile kurumsal metin hazırla”: konu ve “yapılan iş / iletilecek bilgiler” yazılır. Öneri başlık, hitap, metin ve kapanıştan oluşur; yalnızca verilen bilgilere dayanır. Yapılmamış iş, test sonucu, tarih, garanti veya taahhüt eklememesi istenir; eksik bilgi “[EKSİK: …]” ile işaretlenir ve listelenir (bu işaret kesinleştirmeyi engeller). Öneride verilen bilgilerde olmayan sayı, tarih, ay adı veya garanti/taahhüt sözcüğü varsa uyarı çıkar. “Uygula” denmeden belgeye hiçbir şey yazılmaz. Yapay zekâ olmadan da tüm akış çalışır.
- Boş antet (numarasız) bu akışta değil, Kurumsal materyaller sekmesindedir.

**E-postayla gönder** (kesinleşmiş belge; v20 gerekir)
- Pencerede alıcı (en fazla 10), CC (isteğe bağlı), konu, mesaj ve eklenecek kesinleşmiş sürüm görünür ve düzenlenir. Varsayılan konu “NUMARA — başlık”, mesaj kısa bir ek yazısıdır.
- Ek, “PDF indir” ile aynı dosyadır: sürümün sabit içeriği + güncel şirket profili + onaylı şablon. Dosya `doc_renders`'ta saklıdır; gönderim kaydı o dosyanın kimliğini ve SHA-256 özetini tutar. “Gönderilen PDF” tam o dosyayı açar.
- **E-posta teması:** “Açık” (varsayılan; beyaz kart, açık zemin logosu, kurumsal set) veya “Koyu”. Koyu tema, kokpitin “Sabah özeti” e-postasının düzenini kullanır (`lib/notifyTemplates.ts` → `emailLayout`): #050505 zemin, 600 px koyu kart, 3 px lime üst çizgi, kartın üstünde beyaz logo ve küçük “BELGE” etiketi, eğik lime kareli üst etiket (belge türü · numara), başlık (konu), yazılan mesaj, “Ek” bölümünde belge (numara · başlık) ve PDF satırları, kartın altında şirket bilgileri. Sabah özetindeki sayılar, listeler ve kokpit bağlantıları yoktur. Pencerede seçilen temanın önizlemesi görünür; önizleme gönderilecek HTML'in kendisidir. Tema yalnızca e-posta gövdesini değiştirir, ekteki PDF iki temada aynı dosyadır. Seçilen tema gönderim kaydında (`doc_emails.theme`, v22) saklanır, geçmişte görünür ve sonradan değiştirilemez. E-posta istemcilerinin kendi koyu mod dönüşümleri renkleri değiştirebilir.
- Sürümdeki banka bilgisi güncel ayarlardan farklıysa hiçbir şey gönderilmez; “Sürümdeki bilgilerle göndermeyi seç” ya da revizyon seçilir (indirmedeki kararla aynı).
- Tek pencere = tek istek anahtarı. Çift tıklama, aynı anda birkaç basış veya “Yeniden dene” ikinci e-posta göndermez (Resend `Idempotency-Key` = istek anahtarı; servis anahtarı 24 saat hatırlar; 23 saatten eski belirsiz gönderim kendiliğinden tekrarlanmaz).
- Sonuç olduğu gibi gösterilir: **Servis kabul etti** (teslim edildi demek değildir) · **Gönderilemedi** (servis reddetti; hiçbir şey gönderilmedi) · **Sonuç belirsiz** (zaman aşımı / bağlantı / 5xx; aynı gönderim güvenle yeniden denenebilir). Hata hiçbir zaman başarı olarak gösterilmez.
- “Durumu yenile” teslim durumunu servisten okur: teslim edildi, gecikiyor, geri döndü, istenmeyen işaretlendi. Bunun için tam yetkili Resend anahtarı gerekir; yalnızca gönderim yetkili anahtarda durum “servis kabul etti” kalır ve panel bunu söyler.
- Geçmiş (yan sütun “E-posta gönderimleri” + İşlem geçmişi): gönderen kullanıcı, alıcı/CC, zaman, sürüm, PDF dosyası ve sonuç. Kayıtlar değiştirilemez ve silinemez.
- Arşivdeki ve hiç kesinleşmemiş belge gönderilemez. Gönderen adresi `DOCUMENTS_EMAIL_FROM` (yoksa `NOTIFY_EMAIL_FROM`, yoksa `Yoca <noreply@yoca.net>`); yanıt adresi şirket profilindeki e-posta.
- Canlı olmayan ortamlarda (preview / development) yalnızca `DOCUMENTS_EMAIL_TEST_ALLOW` listesindeki adreslere veya `@alan` adlarına gönderilir; yerel testler `NOTIFY_RESEND_ENDPOINT` ile yakalama sunucusuna gider. Geliştirme kontrollerinde gerçek müşteriye e-posta gitmez.

**Kurumsal materyaller** (`/admin/documents/materials`)
- Belge numarası kullanmaz, kesinleştirme yoktur, hiçbir şey kaydedilmez veya gönderilmez. Şirket bilgileri “Şirket bilgileri”nden, kişiler ekip kayıtlarından (`team_members`: ad, unvan) gelir; bu kayıtlar değişince yeni çıktılar da değişir.
- **Boş antet:** A4 PDF; motif, orijinal logo, altbilgide güncel şirket bilgileri.
- **Kartvizit:** ekip üyesi seçilir; ad ve unvan dolar, telefon ve e-posta şirket profilinden başlar (ekip kayıtlarında kişisel telefon/e-posta tutulmaz, herkese açık olurdu). Alanlar üretmeden önce düzenlenir, kaydedilmez. Ön/arka önizleme; iki sayfalık PDF: kesim 85 × 55 mm, taşma payı ayrı seçilir (2/3/5 mm), kesim işaretleri taşma alanının dışında. Renkler RGB'dir: dosya bir provadır; matbaaya göndermeden önce taşma payı ve CMYK profili matbaayla teyit edilir.
- **E-posta imzası:** önizleme, biçimlendirilmiş kopyalama (HTML + düz metin), HTML indirme.
- **Proje bilgilendirme e-postası:** müşteri/proje isteğe bağlı; konu, başlık, hitap, metin ve bağlantı (yalnızca http/https; buton gerçek bağlantıya gider) düzenlenir. AI önerisi “Uygula” denmeden alanları değiştirmez. Önizleme, biçimlendirilmiş kopyalama, düz metin, HTML indirme. Panelden gönderilmez.
- E-posta HTML'i tablo düzeni ve satır içi stildir (Gmail, Outlook, mobil); Manrope yüklenmezse sistem yazı tipi kullanılır. Logo `https://yoca.net/brand/email/yoca-logo-light.png` (orijinal açık zemin SVG'den 500 px PNG).

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
8. **Banka bilgileri:** Şirket profilinden farklı olarak, sürümde basılı banka bilgisi ödeme koşulunun parçasıdır ve kendiliğinden değişmez.
   - Kesinleşmiş bir sürüm indirilirken, basılı hesap Belge ayarlarında değişmiş veya kaldırılmışsa PDF üretilmez; panel farkı gösterir (belgedeki IBAN ↔ şimdiki IBAN, değişen alanlar) ve sorar:
     - **Sürümdeki bilgilerle indir:** PDF sürümdeki (eski) banka bilgisini taşır; bu durum panelde açıkça yazılıdır.
     - **Güncel banka bilgileriyle revize et:** belge taslak olur, aynı hesapların güncel bilgileri kullanılır, kesinleştirince yeni sürüm oluşur. Önceki sürüm ve PDF'leri saklanır.
   - Belgeye yalnızca işaretlenen hesaplar basılır. Sonradan eklenen bir hesap kendiliğinden eklenmez.
   - Seçili bir hesap ayarlardan kaldırılmışsa taslak kesinleştirilemez; yönetici seçimi kaldırır ya da başka hesap seçer.
   - Karşılaştırma yalnızca hesap kimliğiyle eşleşen hesaplar arasında yapılır (`bankChanges`, `lib/documents/settings.ts`).

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

**Para birimi:** TRY, USD, EUR (“Euro (EUR)”) seçicilerde önce; GBP ve AZN “Diğer para birimleri” altında seçilebilir kalır. Bir belgede tek para birimi kullanılır; “Yeni belge” penceresinde seçilir (seçilmezse Belge ayarlarındaki varsayılan). Döviz kuru altyapısı yoktur: tutar girilmiş bir belgede para birimi değiştirilirken yönetici açıkça seçer — “Tutarları aynen koru” (aynı sayılar, çevrim yapılmaz) veya “Fiyatları temizle”; “Kurla çevir” kullanılamaz olarak gösterilir.

**Tek seferlik / tekrarlayan kalemler** (belge içeriğinde saklanır; migration yok)
- **Adet / Süre** (eski “Miktar”; veri alanı yine `quantity` + `unit`, eski belgeler aynen basılır): tek seferlik kalemde adet ve birim birlikte okunur (“1 proje”, “1 paket”, “12 saat”). Aylık / yıllık kalemde Adet / Süre teklif edilen süredir (`term`: “6 ay”); birim dönemdir (ay / yıl), birim fiyat dönem başına tutardır ve süreyle çarpılmaz (miktar 1). Süre yazılmadıysa “süre belirtilmedi” yazar; 1 ay varsayılmaz. Faturalama sıklığı (“aylık faturalanır”) süreden ayrı gösterilir.
- Her kalemin faturalaması vardır: tek seferlik (varsayılan; eski belgelerin tümü), aylık, yıllık. Tekrarlayan kalemde süre (ay/yıl; boşsa “süre belirtilmedi” yazar, tahmin edilmez) ve başlangıç yılı (1 = başlangıçtan, 2 = 2. yıldan itibaren yenileme) seçilir.
- “Başka kaleme dahil” kalemin kendi fiyatı yoktur (ör. ilk yıl domain + hosting web sitesine dahil); PDF’te “Dahil” ve “… kalemine dahil” yazar, “fiyat eksik” sayılmaz.
- 2. yıldan itibaren geçerli fiyat için “sabit fiyat (taahhüt)” veya “güncel tarifeye göre tahmini” seçilmeden belge kesinleştirilemez.
- Genel toplam (listedeki tutar, ödeme planı, “Tek seferlik toplam”) yalnızca tek seferlik kalemlerden oluşur. Aylık ve yıllık / gelecek dönem kalemleri ayrı gruplarda, kendi dönem toplamlarıyla gösterilir (“Tekrarlayan ve sonraki dönem ücretleri”); tek seferlik toplama eklenmez. Aylık toplam (aylık kalemlerin toplamı, ay başına) ve yalnızca süre verilmişse “N aylık hizmet toplamı” gösterilir; 2. yıl yenilemesi ilk dönem toplamlarına girmez. Aylık birim fiyat, toplam aylık hizmet bedelidir. Ödeme planı tek seferlik toplam üzerinden hesaplanır (PDF’te ve panelde yazılır).
- Teklif hazırlamak Operasyon hizmeti, borç veya yenileme kaydı oluşturmaz.

**Ödeme planı ve metin tutarlılığı:** Dolu bir ödeme planının yanında metinde “[EKSİK: ödeme …]” kalırsa belge kesinleştirilemez (ayrı uyarı) ve taslak PDF’in ilk sayfasında “Doldurulmamış yer var (N)” yazar. Yapay zekâ önerisinden ödeme planı uygulandığında metindeki ödeme işareti planın kendisiyle doldurulur (“%50 Başlangıç ödemesi (…), %50 …”); plan uygulanmazsa işaret kalır. Eksikler kutusunda “İşareti ödeme planıyla doldur” düğmesi vardır. Metindeki ödeme yüzdeleri (yalnızca ödeme cümlelerinde; KDV / vergi yüzdeleri sayılmaz) dolu planla uyuşmazsa — planda olmayan bir yüzde veya %100’e tamamlanan farklı bir bölüşüm — inceleme ekranı uyarır, taslak PDF’in ilk sayfasında “Ödeme metni ile plan uyuşmuyor” yazar ve kesinleştirme engellenir. Karşılaştırma yüzdeler kadar aşamaları ve ödeme zamanlarını da kapsar (ör. metinde “teslimde”, planda “yayından 30 gün sonra”; 30 / 45 gün); eş anlamlılar (imza = sözleşme = başlangıç) çelişki sayılmaz, okunamayan zaman ifadesi çelişki üretmez; kontrol editörde yazarken canlı çalışır. Standart %50 / %50 önerisi yalnızca tam taslakta ve belgede plan yokken eklenir; belgede plan varsa tam taslak ve yalnızca metin istekleri planı değiştirmez, ödeme metnini o plana göre yazar. “Ödeme planını yeniden oluştur” (yalnızca ödeme planı) yeni plan önerebilir; plan, önerinin ödeme koşulları metniyle birlikte uygulanır, öneride metin yoksa mevcut metnin ödeme cümlesi yeni plandan yeniden yazılır.

**PDF’te sıra ve etiketler:** Kalem numaraları basılan sırayı izler (tek seferlik + dahil, sonra aylık, sonra yıllık grup); kayıtlı kalem kimlikleri değişmez. 2. yıldan itibaren yenilemede Adet / Süre “Yıllık yenileme · 2. yıldan itibaren” yazar (toplam süre varsayılmaz). Tablo başlığında “Tutarlar KDV hariç”.

**Dosya adları:** “Yoca-Teklif-TKL-2026-0003-Taslak.pdf”, kesinleşmiş “Yoca-Teklif-TKL-2026-0003-v1.pdf”, geçmiş PDF “…-v1-r3.pdf”; türler: Teklif, Proforma, Yazı (ASCII yedeği Yazi), Durum-Raporu, Teslim-Belgesi. İndirmede `Content-Disposition` (ASCII `filename` + `filename*=UTF-8''…`), depolama indirmelerinde imzalı bağlantının indirme adı kullanılır; depolama anahtarları ve geçmiş PDF içerikleri değişmez. Önizleme sekmesinde PDF ve “İndir” düğmesi aynı adla kaydeder.

**ÖRNEK belge:** kurgusal adlar içerebilir; PDF’te “ÖRNEK” ve “ÖRNEK belge · gerçek teklif değildir” yazar; kesinleştirilemez, gönderilemez, müşteri kaydına bağlanamaz.

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
- **Taslak (tüm teklif):** başlık, giriş, kalemler (faturalama, dahil ilişkisi, yenileme), kapsam, teslimatlar, varsayımlar, kapsam dışı, revizyon ve ödeme koşulları, ödeme planı (yalnızca tek seferlik toplam için), takvim, geçerlilik ve kapanış önerir. Kullanıcının vermediği ticari koşullar (revizyon sayısı, süre, ödeme yüzdeleri, geçerlilik) “Kontrol edilecek öneri” olarak işaretlenir.
- **Fiyat önerisi:** yalnızca kullanıcı açıkça isterse (“Fiyatları da öner” veya “AI fiyat önerisi” seçeneği). Belgenin para biriminde, KDV hariç tahmini birim fiyatlar gelir; “AI fiyat önerisi — kontrol edilmeli” işaretlidir ve kontrol edilene kadar belge kesinleştirilemez. Kontrolü belgeyi düzenleyen yetkili kullanıcı yapar (“Fiyatı kontrol ettim”); fiyatı elle değiştirmek de kontrol sayılır (fiyat artık kullanıcının fiyatıdır). Yapay zekâ bir kalemin fiyatını yeniden yazarsa (kalemleri yeniden öner / yeniden uygula) o kalem yeniden “kontrol edilmeli” olur. “Piyasa / Türkiye ortalaması” iddiası öneriden çıkarılır; tahminin dayanağı ve varsayımları gösterilir. KDV oranı her zaman Belge ayarlarından gelir.
- **Bölüm bazında yeniden yazma:** “Ne hazırlansın?” ile tek bölüm (ör. yalnızca revizyon koşulları, notlar, ödeme planı) istenir; sunucu yalnızca o bölümü döndürür, diğer alanlar ve elle yapılan değişiklikler değişmez.
- **İnceleme ekranı:** her alan düzenlenebilir; seçilen bölümler veya hepsi uygulanır; boş öneri dolu alanı silmez; “Vazgeç” hiçbir şey yazmaz. Toplamlar uygulamanın hesaplama kurallarıyla gösterilir.
- **Para birimi:** istek belgenin para birimini taşır (yoksa istek reddedilir; TRY’ye düşülmez). Talep başka bir para birimi geçiriyorsa “Para birimi çakışması” gösterilir ve fiyatlar onay verilmeden uygulanmaz.
- **Gerçek / örnek:** müşteri kaydına bağlı belgede öneri alıcıya, firma veya iletişim bilgilerine dokunmaz; örnek taslak yalnızca müşteriye bağlı olmayan belgede, “ÖRNEK” işaretli kurgusal adlarla gelir ve CRM’e yazılmaz. Banka, IBAN, vergi, adres ve iletişim bilgisi uydurulmaz.
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

Şablon: Bolt'ta seçilen Yoca kurumsal set (`yoca-kurumsal-claude-teslim`), `TEMPLATE_VERSION = 'belge-2026-11-h'`. Bolt önizlemesi sabit 794 × 1123 px'lik bir sahnedir; burada aynı görünüm gerçek verilerle ve otomatik sayfalamayla yeniden kurulur (1 px = 0,75 pt).

- Beyaz sayfa, 42 pt kenar boşluğu. İlk sayfa: sağ üstte marka motifi, orijinal açık zemin logosu, küçük büyük-harf üst başlık, büyük başlık ve yeşil marka noktası. Devam sayfalarında motif yerine küçük logo ve “TÜR · NUMARA” satırı.
- **Teklif / proforma:** belge başlığı alt başlık olarak; proformada “FATURA YERİNE GEÇMEZ”. “Hazırlanan” ve “Belge / tarih” sütunları. Üç lime hücreli tablo başlığı her sayfada tekrarlanır. Satırda kod, başlık, açıklama, miktar ve tutar; birim fiyat, indirim ve (birden çok KDV oranı varsa) satır KDV'si miktarın altında. Ara toplam, indirim, KDV ve büyük genel toplam + nokta. Sonda 1,5 pt mürekkep çizgili kapanış: solda “Ödeme ve koşullar” (ödeme planı), banka bilgileri, kapanış cümlesi; sağda logo ve imza yetkilisi.
- **Proforma kapanışı** (6 Kasım 2026 onayı): 1,5 pt mürekkep çizginin altında “Ödeme ve koşullar” (ödeme planı) ve “Banka bilgileri” yan yana, kısa koşul metni ikisinin altında, sonra kapanış cümlesi ve imza yetkilisi (doluysa, sağda). Kapanışta ikinci logo yoktur; sayfanın üstündeki orijinal logo kalır. Yazı boyutları teklif kapanışıyla aynıdır. 3 hesaba kadar blok bütün halde kalır (sığmazsa bütün halde sonraki sayfaya geçer); daha çok hesapta satırlar arasında bölünerek akar, hiçbir hesap kesilmez. Üç kalem, tek satırlık koşul metni, normal adres/vergi bilgileri ve bir banka hesabıyla proforma (taslak da, kesinleşmiş de) tek sayfadır; koşul metni iki satır ve üzeri olduğunda boşluklar daha fazla sıkıştırılmaz, kapanış ikinci sayfaya geçer. Teklif ve diğer türlerin kapanışı değişmedi.
- **Proformada kısa Notlar:** serbest ödeme/koşul metni mevcut “Notlar” alanından gelir. Kapanış sütununda yaklaşık 9 satıra kadar ise “Ödeme ve koşullar” içinde, ödeme planının hemen altında basılır ve ayrıca bölüm olarak tekrarlanmaz; bu yüzden birkaç cümle için “Plan ve koşullar” sayfası açılmaz. Daha uzun Notlar normal bölüm olarak kalır ve gerekirse sonraki sayfaya akar. Başlık varsayılan “Notlar” değilse metnin üstünde gösterilir. Diğer belge türleri değişmedi.
- **Antetli yazı / durum raporu / teslim belgesi:** “Alıcı” ve “Sayı / tarih” sütunları, mürekkep çizgi, “Konu” + başlık, hitap, metin, “Saygılarımızla,” ve logo (imza yetkilisi doluysa altında). Antetli yazının büyük başlığı Bolt'taki “Birlikte. / bir sonraki adıma.”; rapor “Rapor.”, teslim belgesi “Teslim.”.
- **Her sayfa:** altbilgide 1,5 pt çizgi, solda resmî unvan ve şirket bilgileri (adres · telefon · e-posta · vergi dairesi · VKN · MERSİS …), sağda web sitesi ve sayfa numarası (“01” ya da “01 / 03”). Taslak ve örnek belgelerde lime “TASLAK / ÖRNEK” etiketi.
- Şirket bilgileri yalnızca o anki şirket profilinden gelir; boş alan ve etiketi basılmaz. Resmî unvan (“Yoca Teknoloji Ltd Şti”) profilde girilmelidir; koda yazılmadı.
- Büyük harf belgenin diliyle yapılır (tr-TR: “İLETİŞİM”).
- Logo `public/brand/yoca-logo-light-bg.svg` (koyu kartvizit önünde `yoca-logo-primary.svg`), motif `public/brand/yoca-motif.svg`; dosyaların kendi vektörleri ve oranlarıyla, ek yazı yok.
- Font: Manrope (OFL, `lib/documents/fonts/OFL.txt`), PDF'e gömülü.

Sayfalama (`lib/documents/pdf.tsx`, `@react-pdf/renderer`):
- Sayfa sonları otomatiktir, sayfa sayısına sınır yoktur.
- Kısa bölümler (≈130 pt'ye kadar) tek parça taşınır; uzunlar akar: başlık en az iki satırla kalır, paragraflar sayfa sonunda en az iki satır bırakır, son iki madde birlikte kalır, listesi yeni sayfaya geçen bölümde “… — DEVAM” etiketi çıkar.
- Toplam bloğu son kalemle birlikte taşınır. Kapanış bloğu son bölümle birlikte kalır; bölüm yoksa toplamdan sonra gelir, sığmazsa bir sonraki sayfaya geçer (kesilmez).
- Teklif/proforma iki geçişle üretilir: “Plan ve koşullar” bir sayfada başlayıp son sayfaya taşıyorsa yeni sayfada başlatılır; sayfa sayısı artmıyorsa bu sonuç kullanılır.
- Kısa teklif/proforma ikinci sayfaya yalnızca biraz taşıyorsa (ör. üç kalem, toplam ve ödeme koşulları) dikey boşluklar dengeli azaltılarak yeniden dizilir (×0,85, ×0,7, gerekirse ×0,6 — en alt sınır; canlıdaki altbilgi e-posta satırı ve taslak durum satırı birlikteyken bile kısa proforma tek sayfaya sığar: bloklar arası boşluk, satır iç boşluğu, altbilgi üstü boşluk; yazı boyutları ve içerik değişmez). Bu düzen yalnızca belgenin tamamı TEK sayfaya sığıyorsa kullanılır; uzun belgeler normal aralıkla gerektiği kadar sayfaya akar.
- Altbilginin yüksekliği metin alanından ayrılır; çok satırlı adres, vergi bilgileri, MERSİS, ticaret sicil ve KEP eklendikçe altbilgi büyür ve metin alanı buna göre küçülür (üst üste binme olmaz). Bilgiler arttığında kısa proforma tek sayfaya sığmayabilir; o zaman kapanış bloğu bütün halde ikinci sayfaya akar, hiçbir şey kesilmez.

Şablon değişince ne olur:
- “Önizle” ve “PDF indir”, kesinleşmiş belgelerde de güncel onaylı şablonu ve güncel şirket profilini kullanır. Kalemler, tutarlar, alıcı, numara, tarih ve onay geçmişi değişmez; yeni numara veya içerik sürümü oluşmaz.
- Her yeni üretim (sürüm, şirket profili revizyonu, şablon sürümü) ile `doc_renders`'a kaydedilir. “Geçmiş PDF” ve e-postayla gönderilen PDF'ler byte düzeyinde aynı kalır.
- Banka değişikliği uyarısı ve açık seçim aynen sürer.

## Yönetici panelinde çerezler

Yönetim paneli yalnızca çalışması için gerekli tarayıcı depolamasını kullanır, kendi çerezini koymaz:
- `yoca-admin-auth`: oturum;
- `yoca-doc-unsaved:*`, `yoca-insight-unsaved:*`, çeviri işi listesi: kaydedilmemiş işin bu cihazdaki yedeği;
- `yoca_consent`: çerez tercihi.

Panelde Google Analytics yüklenmez. Vercel Web Analytics çerezsizdir ve panel olaylarını göndermeden düşürür.

Ziyaretçi sitesindeki İngilizce, sağ altta duran tercih kutusu `/admin` altında gösterilmez. Panelde onun yerine sayfa sonunda Türkçe bir bilgi kutusu çıkar (`components/admin/AdminPrivacyNotice.tsx`). Formun üzerine binmez ve yalnızca tercih yapılmamışsa görünür. Seçim, sitenin kullandığı aynı `yoca_consent` anahtarına yazılır; ziyaretçi sitesindeki tercih mekanizması değişmedi.

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
5. **Şirket bilgileri:** resmî unvan alanında “Yoca Teknoloji Ltd Şti” yazdığını kontrol et (PDF ve e-posta altbilgisi bu alandan okunur; kodda sabit değildir). Bilinmeyen diğer alanlar boş bırakılır, boş alan basılmaz.
6. **Canlı kontroller:**
   - Belge ekranları açılıyor mu?
   - Şirket bilgileri sayfasında telefon alanı görünüyor mu?
   - `[TEST]` işaretli, müşteriye bağlı olmayan bir antetli yazı taslağının önizlemesi açılıyor mu?
   - Bu taslak kesinleştirilmez, gönderilmez.

### v20 — e-postayla gönderim (ayrı yayın onayıyla)
1. Yedeği kontrol et.
2. Ön kontrol: `select to_regclass('public.doc_renders'), to_regclass('public.doc_emails');` → ilki dolu, ikincisi `null`.
3. `supabase/upgrade-v20-document-emails.sql` (yalnızca `doc_emails`, üç fonksiyon, koruma tetikleyicileri; `doc_events` türlerine `emailed` eklenir; mevcut satırlar değişmez).
4. Ortam değişkenleri: `RESEND_API_KEY` zaten var. İsteğe bağlı `DOCUMENTS_EMAIL_FROM` (yoca.net alanından bir adres). Teslim durumunu görmek için anahtarın tam yetkili olması gerekir. Preview ortamında `DOCUMENTS_EMAIL_TEST_ALLOW` yalnızca test adresleri.
5. v20 uygulanmadan yayınlanırsa belgeler çalışır; gönderim ekranı “veritabanı güncellemesi uygulanmadı” der ve hiçbir şey göndermez.
6. Canlı kontrol gerçek müşteriye değil, şirketin kendi adresine gönderimle yapılır.

### v21 — belge tablolarında TRUNCATE yetkisi kapatıldı (5 Kasım 2026, production'a uygulandı)
- `supabase/upgrade-v21-document-grants.sql`: `anon` ve `authenticated` rollerinden doc_* tablolarındaki TRUNCATE yetkisini kaldırır. TRUNCATE satır güvenliğine (RLS) ve satır düzeyindeki “silinemez” korumalarına takılmadığı için istemci rollerinde bulunmamalı.
- Başka hiçbir şey değişmez: tablo boşaltılmaz, kayıt silinmez; panelin kullandığı SELECT / UPDATE ve `service_role` yetkileri yerinde kalır. Tekrar çalıştırılabilir.

### v22 — e-posta teması kaydı (yayından önce uygulanır)
- `supabase/upgrade-v22-document-email-theme.sql`: `doc_emails.theme` (`'light'` | `'dark'`, varsayılan `'light'`), `doc_email_begin`'e varsayılanlı `p_theme` parametresi, temanın sonradan değiştirilemesini engelleyen koruma. Mevcut kayıtlar `light` olur (zaten açık temayla gönderilmişlerdi); satır silinmez veya yeniden yazılmaz. Tekrar çalıştırılabilir.
- Önceki uygulama sürümüyle uyumludur (`p_theme` göndermez, sütunun varsayılanı vardır). Bu yüzden önce v22 uygulanır, sonra yeni sürüm yayına alınır. v22 yoksa yeni sürümde koyu tema “veritabanı güncellemesi uygulanmadı” der ve göndermez; açık tema çalışır.

## Geri dönüş

- **Uygulama:** Önceki production dağıtımına geri al (Vercel → Instant Rollback). v19 tabloları yerinde kalabilir; eski uygulama onları okumaz.
- **Veritabanı:** `upgrade-v20-document-emails.sql` / `upgrade-v19-documents.sql` sonundaki "Undo" bölümleri. Gerçek belge oluştuktan sonra çalıştırılırsa belgeler ve sürümler silinir. Bu durumda yalnızca uygulamayı geri almak tercih edilmelidir. `yoca-docs` deposu geri alma ile silinmez.
