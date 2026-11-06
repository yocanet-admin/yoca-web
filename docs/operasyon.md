# Operasyon modülü — kullanım, veri geçişi ve geri dönüş

## Ekranlar (Yönetim → Operasyon)
- **Genel bakış:**
  - önümüzdeki 7/30/90 gün içindeki yenilemeler, bitişi geçenler ve doğrulama bekleyenler;
  - bu ayın sağlayıcı giderleri ve beklenen tahsilatlar (para birimine göre ayrı);
  - eksik bilgiler, doğrulanmamış otomatik yenilemeler, yaklaşan lisanslar ve son işlemler.

  Her kart filtreli listeyi açar. Veri yoksa sayı uydurulmaz.
- **Müşteriler ve firmalar:** kayıt için yalnızca ad gerekir.
  - Bireysel ya da firma; bir firma hem müşteri hem sağlayıcı olabilir.
  - Detay sekmeleri: Özet, Kişiler, Projeler, Hizmetler, Finans, Lisanslar, Belgeler, İşlem geçmişi.
  - CRM (fırsatlar, aktiviteler) eski ekranda kalır; iki ekran birbirine bağlantı verir.
  - **Tek müşteri kaynağı, zorunlu birleştirme yok:** CRM (Kokpit → "CRM · fırsatlar") ve bu ekran aynı `clients` tablosunu kullanır; ayrı bir müşteri listesi yoktur. Aynı ya da benzer ad tek başına aynı müşteri demek değildir: CRM'de yeni müşteri açarken veya bir lead'i "Müşteri yap" ile dönüştürürken benzer kayıtlar (aynı e-posta, kişinin e-postası, benzer firma/kişi adı) gerekçesiyle **aday** olarak gösterilir; yönetici mevcut kaydı seçer ya da yeni müşteri oluşturur. E-posta ile firma bilgisi farklı kayıtları gösteriyorsa aday "Dikkat" notuyla gelir; hiçbir durumda kendiliğinden bağlanmaz. Yalnız sağlayıcı olan bir firma, ancak yönetici onu seçerse müşteri rolü alır.
  - **Lead bağlantısı:** lead kendi kaydı, durumu ve geçmişiyle Leadler'de kalır; müşteriye yalnızca `client_id` ile bağlanır (bir müşterinin birden çok lead'i olabilir). Bağlantı kaldırılınca lead silinmez. Müşteri silinirse lead kalır (bağ boşalır).
- **Hizmetler ve varlıklar:** kayıt için yalnızca ad ve tür gerekir; kalan alanlar açılır bölümlerde.
  - Bir hizmet birden çok müşteriye ya da projeye bağlanabilir (ortak sunucu tek kayıttır).
  - Hizmet durumu, tahsilat, sağlayıcı ödemesi ve yenileme ayrı gösterilir.
  - CSV içe aktarmada önce sütunlar eşlenir ve önizleme açılır. Hatalı satırlar gerekçesiyle gösterilir, olası mükerrerler varsayılan olarak seçilmez. İçe aktarma yalnızca yeni kayıt ekler.
  - "Çoğalt" ödeme, dönem, belge ve lisans kopyalamaz.
- **Ödemeler ve yenilemeler:** yenilemeler, tahsilatlar, sağlayıcı maliyetleri, ödeme kayıtları ve takvim.
  - "Sağlayıcıda yenileme doğrulandı" tek veritabanı işleminde eski dönemi kapatır ve yeni dönemi açar.
  - Tahsilat ya da sağlayıcı ödemesi yenilemeyi tamamlamaz.
  - Ödemeler silinmez; yanlış kayıt iptal (void), iade ya da düzeltme kaydıyla düzeltilir.
- **Sağlayıcılar:** aynı sağlayıcıda birden çok hesap tutulabilir. Şifre yazılmaz; yalnızca nerede saklandığı yazılır (`secret_ref`).
- **Lisanslar:** asıl kaynak license.yoca.net'tir. Yönetim API'si eklenene kadar bağlantı tablosu ve panel bağlantısı çalışır, işlem düğmeleri kapalıdır (bkz. `license-management-api.md`).
- **Operasyon ayarları:**
  - hatırlatma günleri (varsayılan 30/14/7/1) ve iptal son günü hatırlatmaları;
  - günlük özet (yalnızca ekibe);
  - bildirimlerin akışı (salt okunur: alıcı, saatler, müşteriye otomatik gönderim yok);
  - lisans yetkileri (işlem başına).

## Bildirimler

**Otomatik bildirimler yalnızca ekip içidir** (6 Kasım 2026 kararı). Müşteriye otomatik e-posta yoktur; müşteri kaydındaki e-posta gönderim izni değildir.

### Ekip içi günlük Operasyon özeti (`/api/cron/ops`)
- Zamanlama (`vercel.json`): `0 6,12 * * *` → 09:00 ve 15:00 İstanbul. Özet 09:00'da gider; 15:00 çalışması yalnızca gönderilemeyen kanalı yeniden dener. Günde en çok bir özet (`digest:YYYY-MM-DD`).
- Alıcı: kokpit bildirim adresi (Ayarlar → Bildirimler, `cockpit_settings.notify.email_to`; bugün mg@yoca.net) ve ekip Telegram grubu. Ayrı bir alıcı listesi yoktur.
- İçerik (yalnızca Operasyon): bugünün hatırlatmaları (bitiş / iptal son günü; 30/14/7/1 gün önce, gün, “tarihi geçti”), bitişi geçen veya doğrulama bekleyen yenilemeler, geciken tahsilat ve sağlayıcı ödemeleri, geciken Operasyon görevleri. Her satır hizmet sayfasına bağlanır. Takip edilecek bir şey yoksa e-posta gitmez.
- Sabah özeti (08:30) ayrıdır: leadler, CRM takipleri, site izleme (SSL / alan adı / hosting), trafik. Operasyon özeti bunları tekrar etmez. (İzlenen bir sitenin alan adı aynı zamanda Operasyon'da hizmet olarak kayıtlıysa ikisinde de görünebilir: biri WHOIS izlemesinden, diğeri yenileme kaydından.)
- `CRON_SECRET` ile yetkilendirilir. Her hatırlatmanın tekil anahtarı vardır ve gönderimden önce `ops_notifications`'a yazılarak sahiplenilir; tekrarlı ya da eşzamanlı bir çağrı ikinci mesaj üretmez. Kesintiden sonra yalnızca en acil kaçırılmış hatırlatma gönderilir. Başarısız gönderim en çok 3 kez yeniden denenir.
- **E-posta ve Telegram ayrı takip edilir.** Özet satırı (`digest:YYYY-MM-DD`) ilk çalışmada içeriği ve her kanalın durumunu (`payload.channels.email/telegram`: bekliyor, gönderildi, gönderilemedi, sonuç belirsiz, kanal yok) saklar. 15:00 tekrarı yalnızca “gönderilemedi” durumundaki kanalı, saklanan aynı içerikle dener; başarılı kanala aynı özet tekrar gitmez. En çok 3 deneme.
- **Sonucu belirsiz gönderim** (zaman aşımı, bağlantı kopması, 5xx): e-postada aynı `Idempotency-Key` (`yoca-ops-digest-<gün>`) ile tekrar istenir; Resend 24 saat içinde ikinci e-posta üretmez. Telegram'da tekilleştirme olmadığından belirsiz Telegram gönderimi otomatik tekrarlanmaz; Operasyon Ayarları'nda “Son ekip özeti” altında “sonuç belirsiz, grupta kontrol edin” notuyla görünür.
- Production dışındaki bir dağıtım gerçek kişilere mesaj göndermez.
- “Günlük özet” Operasyon ayarlarından kapatılabilir; kapalıyken hatırlatmalar “engellendi” olarak kaydedilir.

### Elle iletme: “E-postayla ilet” (`/api/admin/ops/forward`)
- Hizmet sayfasında (“Hatırlatma ve iletme” bölümü ve bildirim geçmişindeki ekip hatırlatmalarının yanında). Yalnızca yönetici açar ve gönderir.
- Alıcı alanı boş açılır. Firma kaydının ve kişilerinin e-postaları düğme olarak gösterilir; yalnızca tıklanınca alıcıya eklenir. CC isteğe bağlı.
- Konu ve mesaj nötr bir metinle başlar (yalnızca hizmet adı, tarih ve müşteri adı) ve düzenlenebilir. Sağlayıcı maliyeti, kâr, iç notlar, erişim bilgileri ve ekip değerlendirmeleri metne eklenmez; mesajda bunlara benzeyen bir şey varsa göndermeden önce uyarı çıkar (engellemez).
- Ekler: yalnızca bu hizmetin dosyaları, hiçbiri işaretli gelmez; en çok 10 dosya, toplam 15 MB.
- “Kurumsal dille düzenle”: yalnızca mesaj metni yapay zekâya gider; öneri ayrı gösterilir, “Uygula” denmeden mesaj değişmez.
- Önizleme, sunucunun göndereceği e-postanın kendisidir (kurumsal açık şablon, şirket profilindeki bilgiler).
- “Gönder” dışında hiçbir şey göndermez; kaydetmek, yenilemeyi onaylamak veya bir bildirimi kapatmak e-posta başlatmaz.
- Mevcut e-posta altyapısı (Resend, belge e-postasıyla aynı hesap ve kurallar) kullanılır. Tek pencere = tek istek anahtarı = tek kayıt = tek e-posta (Resend `Idempotency-Key`); çift tıklama veya “Yeniden dene” ikinci e-posta göndermez.
- Kayıt: `ops_notifications` satırı (`dedupe_key = forward:<anahtar>`, `kind = customer_reminder`, `audience = customer`, `recipients` = alıcılar; `payload` içinde konu, mesaj, CC, ekler (ad, boyut, SHA-256), gönderen yönetici, sonuç, Resend kimliği, teslim durumu). Bildirim geçmişinde “Elle iletildi” olarak görünür; “Durumu yenile” teslim durumunu okur. Ekip cron'u bu satırlara dokunmaz. Yeni tablo yoktur.
- **Kayıt sonradan değiştirilemez (v23).** `supabase/upgrade-v23-ops-forward-guard.sql` yalnızca `forward:` satırları için bir tetikleyici ekler: alıcı, konu, mesaj, CC, yanıt adresi, ekler, gönderen, tarih ve anahtar hiç kimse tarafından değiştirilemez; kayıt silinemez; gönderen bilgisi istekten değil oturumdan (`doc_actor()`) yazılır. Gönderim sonucu (durum, deneme sayısı, hata, Resend kimliği, teslim durumu) yalnızca sunucu tarafından servis rolüyle, Resend yanıtına göre yazılır; yönetici oturumu bir iletmeyi “gönderildi” yapamaz. `authenticated` rolünün bu tablodaki TRUNCATE yetkisi kaldırılır. Ekip hatırlatmaları ve özet satırları etkilenmez.
- **Sistem iç veriyi dış mesaja ekleyemez.** Dış e-postayı üreten `forwardEmail` yalnızca yöneticinin yazdığı konu ve mesajı, seçtiği dosyaların adlarını ve şirket profilini alır; hizmet, dönem, ödeme, sağlayıcı ve not verisi bu fonksiyona hiç verilmez. Başlangıç metni (`forwardDefaults`) yalnızca hizmet adı, tarih ve müşteri adından oluşur. Anahtar kelime uyarıları yalnızca yöneticinin elle yazdığı içerik için ek bir kontroldür.
- Production dışında yalnızca `DOCUMENTS_EMAIL_TEST_ALLOW` listesindeki adreslere gönderilir; yerel testler yakalama sunucusuna gider.

## Veri geçişi sırası (onaydan sonra)
1. **Yedek / ön kontrol:** salt okunur `checks/preflight.sql`. `is_admin()` ve `audit_row()` mevcut mu?
2. **`supabase/upgrade-v18-operations.sql`:** yalnızca ekleme yapar. `clients` tablosuna sütun ekler (mevcut satırlar firma ve müşteri olarak kalır), lead tablolarına boş `client_id` bağlantı sütunu ekler (mevcut leadler değişmez), yeni tablolar ve özel `ops-docs` deposu oluşturur. Tekrar çalıştırılabilir. Eski uygulama yeni alanları okumadığı için önce veritabanı hazırlanabilir.
3. **Merge → production dağıtımı:** ilk yayında bildirim görevi zamanlanmamıştı; 6 Kasım 2026'dan itibaren ekip içi özet `vercel.json`'da zamanlanır (yukarıya bakın).
4. **`supabase/upgrade-v23-ops-forward-guard.sql`** (merge'den önce, onayla): elle iletme kayıtlarını kilitler. Satır değiştirmez; tekrar çalıştırılabilir; geri alma dosyanın sonunda.
5. **Kontrol:** Operasyon sayfaları açılıyor mu, sayfaların boş durumları doğru mu? Cron Jobs listesinde `/api/cron/ops` (09:00 / 15:00 İstanbul) görünür.

## Mevcut verilere etkisi
Mevcut satırlarda hiçbir veri değişmez. CRM ekranı aynı çalışır. Operasyon kaydına bağlı bir müşteri silinmek istenirse veritabanı silmeyi reddeder (bağlı geçmiş var); arşivleme kullanılır.

## Geri dönüş
- **Uygulama:** Vercel Instant Rollback ile önceki dağıtıma dönülür. v18 yerinde kalabilir, eski uygulama onu okumaz. Bu yol önerilir; veri kaybı olmaz.
- **Veritabanı:** gerekirse dosyanın sonundaki "Undo" bölümü kullanılır. Bu, v18 tablolarındaki kayıtları siler. Gerçek kayıt girilmeden önce kayıpsızdır, sonrasında önerilmez.

## Ortam değişkenleri (yalnız adlar)
- **Mevcut:** `CRON_SECRET`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `NOTIFY_EMAIL_FROM`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Yeni ve isteğe bağlı (lisans entegrasyonu):** `YOCA_LICENSE_API_URL`, `YOCA_LICENSE_API_KEY_ID`, `YOCA_LICENSE_API_SECRET`.
