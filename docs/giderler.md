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

## Operasyon bağlantısı (çift kayıt yok)
Operasyon’daki sağlayıcı ödemeleri (`ops_payments`, yön “out”) Giderler’e kopyalanmaz. Giderler bunları salt-okunur görünümlerden (`fin_ops_periods`, `fin_ops_payments`) okur ve “Kaynak: Operasyon” etiketiyle tek satır olarak gösterir. Finans sorumlusu sağlayıcı ödemesini `fin_ops_pay` ile **aynı Operasyon kaydına** işler, `fin_ops_void` ile gerekçeyle iptal eder; Operasyon ekranı da aynı kaydı gösterir. Müşterinin doğrudan ödediği hizmetler (ödeyen: müşteri/diğer) gider sayılmaz.

Görünümlerde yalnızca işi yapmak için gereken alanlar vardır: hizmet adı ve türü, sağlayıcı adı, dönem tarihleri, maliyet ve ödemeler. Müşteri, satış fiyatı, iç notlar, giriş bilgisi ve `secret_ref` yoktur. Kayıtlı firma seçimi için yalnızca sağlayıcıların adı görünür (`fin_parties`).

v25 ile `ops_payments` da salt-ekleme olur: kayıt yalnızca gerekçeyle iptal edilebilir, tutarı ve tarihi sonradan değiştirilemez (Operasyon ekranı zaten yalnızca iptal ediyordu).

## Finans sorumlusu
- `admin_users` tablosunda `role = 'finance'` olan e-posta. Ayrı bir kullanıcı sistemi yoktur; yönetici satırları `role = 'admin'` olarak kalır.
- **Yapabilir:** gider oluşturma/düzenleme/arşivleme, ödeme, iade ve düzeltme kaydı, gerekçeli iptal, belge yükleme/arşivleme, filtreleme ve CSV. Onay süreci yoktur.
- **Yapamaz:** site içeriği, Insights, CRM, Operasyon ekranları, belgeler (teklif vb.), ayarlar, API anahtarları ve sağlık ekranı, kullanıcı/rol yönetimi, işlem geçmişi (`audit_log`); ödeme geçmişini değiştirme veya silme.
- **Koruma menüde değil, sunucu ve veritabanındadır:** `is_admin()` finans kullanıcısı için yanlıştır, bu yüzden mevcut bütün RLS politikaları, depo kuralları ve yönetici API’leri (`requireAdmin`) onu reddeder. Giderler tabloları `can_finance()` ile açılır. Panelde finans kullanıcısı başka bir adrese giderse Giderler’e yönlendirilir.
- `ADMIN_EMAILS` (Vercel) yalnızca yöneticileri sınırlar; finans kullanıcısını etkilemez.
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

## Veri geçişi
1. **Ön kontrol (salt okunur):** `admin_users` satırları, mevcut politikalar.
2. **`supabase/upgrade-v25-expenses.sql`:** yeni tablolar, roller, görünümler, depo; `is_admin()` yalnızca `role = 'admin'` olacak şekilde yeniden tanımlanır (mevcut satırlar admin kalır). Hiçbir satır değişmez veya silinmez. Tekrar çalıştırılabilir.
3. **Merge → production dağıtımı.**
4. **Finans kullanıcısı** (e-posta sahibinden alınır).

Uygulama, v25 olmadan da çalışır: `panel_role()` yoksa eski `is_admin()` kontrolüne düşer; Giderler sayfası “migration çalıştırılmalı” uyarısı gösterir.

## Geri dönüş
- **Uygulama:** Vercel Instant Rollback; v25 yerinde kalabilir.
- **Veritabanı:** dosyanın sonundaki “Undo”. Gider kayıtları girildikten sonra önerilmez (geçmişi siler).
