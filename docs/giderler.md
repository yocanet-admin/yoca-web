# Giderler ve “Finans sorumlusu” rolü

Giderler, şirketin düzenli ve tek seferlik giderlerini kaydetmek ve takip etmek içindir. Banka transferi veya otomatik ödeme yapmaz; kimseye mesaj göndermez.

## Ekranlar (Yönetim → Finans → Giderler)
- **Genel bakış:** bu ay ödenen, bu ay kalan, geciken ve 30 gün içinde vadesi gelen tutarlar. Her para birimi ayrı toplanır; kur dönüşümü yapılmaz. Tutarı bilinmeyen dönemler sayılır, toplama 0 olarak eklenmez.
- **Dönemler ve ödemeler:** kategori, durum, sağlayıcı/firma, vade aralığı, kaynak (Giderler / Operasyon) ve metin filtresi. Filtreler adres çubuğunda durur. “CSV indir” yalnızca filtrelenmiş satırları indirir.
- **Gider tanımları:** düzenli giderlerin listesi (arşivdekiler isteğe bağlı).
- **Gider ayrıntısı:** tanım, dönemler, ödeme geçmişi, belgeler.
- **Operasyon sağlayıcı maliyeti:** Operasyon’daki bir hizmetin maliyet dönemi, “Kaynak: Operasyon” etiketiyle.

## Kurallar
- **Düzenli gider:** aylık, üç aylık veya yıllık. İlk dönem gider kaydedilince oluşur; sonraki dönemler vadesine 45 gün kala oluşur (sayfa açılınca ve her sabah özet çalışmasında). Aynı dönem iki kez oluşamaz (`unique (expense_id, seq)`).
- **Yeni dönem kendiliğinden “ödendi” sayılmaz.** Otomatik talimat işareti yalnızca bilgidir; ödeme kaydı girilene kadar dönem “Bekliyor”dur.
- **Tutar değişikliği geçmişi değiştirmez.** Her dönem kendi tutarını ve para birimini saklar. Tanımdaki tutar yalnızca bundan sonra oluşacak dönemlere uygulanır. Ödemesi olmayan tek bir dönemin tutarı veya vadesi düzeltilebilir.
- **Takvim kilitlenir.** Dönemi oluşmuş giderin türü, sıklığı, ilk vadesi ve para birimi değiştirilemez; takvim değişecekse bitiş tarihi verilip yeni gider açılır.
- **Durum hesaplanır, saklanmaz:** dönem tutarı, vade ve geçerli ödemelerden. Bekliyor, Kısmen ödendi, Ödendi, Gecikti; ayrıca “Gecikti (kısmen ödendi)”, “Fazla ödendi”, “Tutar bilinmiyor”, “İptal edildi”.
- **Ödeme geçmişi silinmez, değiştirilemez.** Kısmi ödeme, iade (toplamdan düşer) ve düzeltme (+/−) kaydedilir. Hatalı kayıt gerekçeyle iptal edilir; kim, ne zaman, neden iptal ettiği görünür ve iptal edilen kayıt toplamlara katılmaz. Bu kural yönetici dahil herkes için geçerlidir.
- **Çift tıklama tek kayıttır:** her ödeme formunun bir istek anahtarı vardır (`request_key`).
- **Para birimi karışmaz:** ödeme, dönemin para biriminde olmalıdır.
- **Dönem iptali:** yalnızca geçerli ödemesi olmayan dönem, gerekçeyle iptal edilir.

## Excel’den aktarım (Giderler → Aktarım)
- .xlsx / .xlsm (en çok 5 MB). Dosya sunucuda yalnızca okunur ve saklanmaz; formüller hesaplanmaz, makrolar çalıştırılmaz. Sayılar dosyadaki tam metinle okunur (uzun numaralar yuvarlanmaz, bilimsel gösterime çevrilmez).
- Başlık satırı etiketlerinden bulunur (“Gider kalemi”, “Aylık tutar”, “Son ödeme tarihi”, “Ödeme durumu”, “Ödeme yöntemi”, “Notlar”). Dönem satırlardaki vade tarihlerinden belirlenir; “Örnek: …” yazan hücre veri sayılmaz.
- **Önizleme hiçbir şey yazmaz.** Gruplar: oluşturulacak giderler ve dönemler, ödeme olarak aktarılacak bilgiler, tutarı/tarihi eksik olanlar, tekrar ayarı önerileri, gider tanımı önerileri, olası mükerrerler, atlanan boş satırlar; ayrıca Excel toplamları ile satırlardan bağımsız hesaplanan toplamların karşılaştırması.
- Kurallar: boş, “?” ve “-” tutarlar sıfır sayılmaz (“Tutar bekleniyor”, toplam dışında). Boş ödeme durumu “Ödenmedi” sayılmaz. Vade, sağlayıcı, hesap, belge veya vergi bilgisi uydurulmaz. Yalnızca başlığı olan satırlar aylık borç yapılmaz (öneri). “Diğer gider N” boş satırları atlanır. Domain/hosting/sunucu/veritabanı/e-posta/bulut gibi Operasyon’la kesişen satırlar kendiliğinden oluşturulmaz.
- Kira, aidat, internet, muhasebe aylık önerilir (kaynak tutarı sonraki dönemlerin başlangıç tutarı). Elektrik, su, doğalgaz aylık ama **sabit tutarsız** önerilir: yeni dönem “Tutar bekleniyor” açılır.
- **“Ödendi” ama ödeme tarihi yok:** ödeme kaydı oluşturulmaz (vade veya bugün ödeme tarihi yapılmaz). Dönem “İnceleme bekliyor” olur: gecikmiş sayılmaz, özette listelenmez, ödenen veya kalan toplamına girmez. Gerçek tarih girilip ödeme kaydedilince normale döner; yanlışsa “İncelemeyi kapat”.
- **Tekrar yükleme:** her kaynak satırın anahtarı (sayfa + dönem + satır + kalem) ve içerik özeti saklanır (`fin_import_rows`: dosya adı, sayfa, satır). Aynı dosya ikinci kez gider/dönem/ödeme üretmez. Değişmiş satır “Kaynakta değişmiş” olarak işaretlenir; mevcut finans kaydı değiştirilmez.
- Eksik bilgili satırlar “Aktarımdan bekleyenler” listesinde kalır; finans sorumlusu “Gider olarak aç” ile tamamlar (form, yalnızca kaynakta olan değerlerle dolar) veya gerekçeyle kapatır.
- Aktarım bildirim göndermez. Gerçek dosya ve tutarları repoya veya migration’a konmaz; testler sentetik örnek dosyayla (`tests/fixtures/fin-import-sample.xlsx`) yapılır.

## Operasyon bağlantısı (çift kayıt yok)
Operasyon’daki sağlayıcı ödemeleri (`ops_payments`, yön “out”) Giderler’e kopyalanmaz. `fin_ops_pay` yalnızca ödeme / iade / düzeltme türlerini kabul eder, kaydı her zaman yön “out” ile, müşteri bağlantısı ve not olmadan yazar; yalnızca Yoca’nın ödediği (Giderler görünümündeki) dönemlere çalışır. Müşteri tahsilatı (yön “in”), satış fiyatı, yenileme onayı ve diğer Operasyon alanları bu yoldan erişilemez; `fin_ops_void` yalnızca sağlayıcı ödemesini iptal eder. Giderler bunları salt-okunur görünümlerden (`fin_ops_periods`, `fin_ops_payments`) okur ve “Kaynak: Operasyon” etiketiyle tek satır olarak gösterir. Finans sorumlusu sağlayıcı ödemesini `fin_ops_pay` ile **aynı Operasyon kaydına** işler, `fin_ops_void` ile gerekçeyle iptal eder; Operasyon ekranı da aynı kaydı gösterir. Müşterinin doğrudan ödediği hizmetler (ödeyen: müşteri/diğer) gider sayılmaz.

Görünümlerde yalnızca işi yapmak için gereken alanlar vardır: hizmet adı ve türü, sağlayıcı adı, dönem tarihleri, maliyet ve ödemeler. Müşteri, satış fiyatı, iç notlar, giriş bilgisi ve `secret_ref` yoktur. Kayıtlı firma seçimi için yalnızca sağlayıcıların adı görünür (`fin_parties`).

v25 ile `ops_payments` da salt-ekleme olur: kayıt yalnızca gerekçeyle iptal edilebilir, tutarı ve tarihi sonradan değiştirilemez (Operasyon ekranı zaten yalnızca iptal ediyordu).

## Finans sorumlusu
- `admin_users` tablosunda `role = 'finance'` olan e-posta. Ayrı bir kullanıcı sistemi yoktur; yönetici satırları `role = 'admin'` olarak kalır.
- **Yapabilir:** gider oluşturma/düzenleme/arşivleme, ödeme, iade ve düzeltme kaydı, gerekçeli iptal, belge yükleme/arşivleme, filtreleme ve CSV. Onay süreci yoktur.
- **Yapamaz:** site içeriği, Insights, CRM, Operasyon ekranları, belgeler (teklif vb.), ayarlar, API anahtarları ve sağlık ekranı, kullanıcı/rol yönetimi, işlem geçmişi (`audit_log`); ödeme geçmişini değiştirme veya silme.
- **Koruma menüde değil, sunucu ve veritabanındadır:** `is_admin()` finans kullanıcısı için yanlıştır, bu yüzden mevcut bütün RLS politikaları, depo kuralları ve yönetici API’leri (`requireAdmin`) onu reddeder. Giderler tabloları `can_finance()` ile açılır. Panelde finans kullanıcısı başka bir adrese giderse Giderler’e yönlendirilir.
- `ADMIN_EMAILS` (Vercel) yalnızca yöneticileri sınırlar; finans kullanıcısını etkilemez.
- **Kendi işlem geçmişi:** `fin_audit` görünümü yalnızca Giderler kayıtlarının (gider, dönem, ödeme, belge, aktarım) ve Operasyon sağlayıcı ödemelerinin (yalnızca ödeme alanları) geçmişini gösterir; genel `audit_log` ve diğer modüller kapalıdır. Geçmiş değiştirilemez.
- **Kim ne yaptı:** `created_by`, `voided_by`, `cancelled_by`, `uploaded_by`, `archived_by` istekten değil, oturumdan veritabanında yazılır. Her değişiklik `audit_log`’a düşer (yönetici “İşlem geçmişi”nde görür).

### Finans kullanıcısı ekleme (sahibin verdiği e-posta ile)
1. Supabase → Authentication → Users: kullanıcıyı davet edin veya oluşturun.
2. SQL editöründe:
   `insert into public.admin_users (email, note, role) values ('<e-posta>', 'Finans sorumlusu', 'finance');`
3. Kaldırma: `delete from public.admin_users where email = '<e-posta>' and role = 'finance';` (bu satır geçmiş değildir; giderler ve ödemeler kalır).

## Belgeler
Özel depo `fin-docs` (20 MB; PDF, görsel, metin, CSV, Word, Excel). Yalnızca yönetici ve finans sorumlusu yükler ve görür. Bağlantılar 60 saniyelik imzalı bağlantıdır; herkese açık adres yoktur. Dosyalar API üzerinden silinemez veya üzerine yazılamaz; kayıt arşivlenir.

## Bildirim
Geciken ve 7 gün içinde vadesi gelen giderler, mevcut ekip içi **Operasyon özetine** (09:00, `/api/cron/ops`) “Giderler” bölümü olarak eklenir. Ayrı bir bildirim yoktur; günde en çok bir özet kuralı aynıdır. Operasyon sağlayıcı ödemeleri “Ödemeler” bölümünde kalır, Giderler’de tekrarlanmaz. Müşteriye veya sağlayıcıya otomatik mesaj gönderilmez.

## v25’in mevcut sisteme etkileri
- `is_admin()` artık yalnızca `role = 'admin'` satırları için doğrudur. Mevcut satırlar `admin` olduğundan yöneticilerin giriş, içerik, Insights, belge ve Operasyon yetkileri değişmez (eski ve yeni uygulama koduyla test edildi).
- `ops_payments` salt-ekleme olur: kayıt yalnızca gerekçeyle iptal edilebilir; tutar, tarih, yön vb. sonradan değiştirilemez. Operasyon ekranı zaten yalnızca iptal ediyordu.
- Yeni tablolar, görünümler, fonksiyonlar ve `fin-docs` deposu eklenir; mevcut satırlar değişmez.
- Migration uygulanıp eski uygulama kodu çalışırken: yöneticiler etkilenmez; finans kullanıcısı eski panelde “erişim yok” görür (yeni kod yayına alınana kadar erişemez).

## Veri geçişi
1. **Ön kontrol (salt okunur):** `admin_users` satırları, mevcut politikalar.
2. **`supabase/upgrade-v25-expenses.sql`:** yeni tablolar, roller, görünümler, depo; `is_admin()` yalnızca `role = 'admin'` olacak şekilde yeniden tanımlanır (mevcut satırlar admin kalır). Hiçbir satır değişmez veya silinmez. Tekrar çalıştırılabilir.
3. **Merge → production dağıtımı.**
4. **Finans kullanıcısı** (e-posta sahibinden alınır).

Uygulama, v25 olmadan da çalışır: `panel_role()` yoksa eski `is_admin()` kontrolüne düşer; Giderler sayfası “migration çalıştırılmalı” uyarısı gösterir.

## Geri dönüş
- **Uygulama:** Vercel Instant Rollback; v25 yerinde kalabilir.
- **Veritabanı:** dosyanın sonundaki “Undo”. Gider kayıtları girildikten sonra önerilmez (geçmişi siler).
