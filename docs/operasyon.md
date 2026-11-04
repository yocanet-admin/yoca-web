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
  - Lead bağlantısı başvuruyu kopyalamaz ve silmez. CRM (fırsatlar, aktiviteler) eski ekranda kalır; aradaki bağlantı detayda.
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
  - günlük özet;
  - müşteri bildirimlerinin genel anahtarı (varsayılan kapalı);
  - lisans yetkileri (işlem başına).

## Bildirimler (`/api/cron/ops`, her gün 09:00 ve 15:00 İstanbul)
- `CRON_SECRET` ile yetkilendirilir.
- Her hatırlatmanın tekil bir anahtarı vardır ve gönderimden önce `ops_notifications`'a yazılarak sahiplenilir. Tekrarlı ya da eşzamanlı bir çağrı ikinci mesaj üretmez.
- Ekibe günde tek bir özet gider. Kesintiden sonra yalnızca en acil kaçırılmış hatırlatma gönderilir; daha eskileri "atlandı" olarak kaydedilir.
- Başarısız gönderimler en çok 3 kez yeniden denenir. Geçmiş, hizmet detayında görünür.
- Müşteri bildirimi yalnızca şu durumda gider: genel anahtar açık, hizmetteki anahtar açık, alıcı seçili. Önizleme hizmet detayındadır.
- Production dışındaki (test/önizleme) bir dağıtım gerçek kişilere hiç mesaj göndermez.
- Vadeler İstanbul takvim günüdür (`date`); kesin zamanlar `timestamptz` olarak saklanır.

## Veri geçişi sırası (onaydan sonra)
1. **Yedek / ön kontrol:** salt okunur `checks/preflight.sql`. `is_admin()` ve `audit_row()` mevcut mu?
2. **`supabase/upgrade-v18-operations.sql`:** yalnızca ekleme yapar. `clients` tablosuna sütun ekler (mevcut satırlar firma ve müşteri olarak kalır), yeni tablolar ve özel `ops-docs` deposu oluşturur. Tekrar çalıştırılabilir. Eski uygulama yeni alanları okumadığı için önce veritabanı hazırlanabilir.
3. **Merge → production dağıtımı:** `vercel.json`'daki yeni cron (`/api/cron/ops`) ile gelir.
4. **Kontrol:** Operasyon sayfaları açılıyor mu, sayfaların boş durumları doğru mu? Cron'u elle tetiklemeyin; ilk planlı çalışmada yalnızca ekip özeti gider.

## Mevcut verilere etkisi
Mevcut satırlarda hiçbir veri değişmez. CRM ekranı aynı çalışır. Operasyon kaydına bağlı bir müşteri silinmek istenirse veritabanı silmeyi reddeder (bağlı geçmiş var); arşivleme kullanılır.

## Geri dönüş
- **Uygulama:** Vercel Instant Rollback ile önceki dağıtıma dönülür. v18 yerinde kalabilir, eski uygulama onu okumaz. Bu yol önerilir; veri kaybı olmaz.
- **Veritabanı:** gerekirse dosyanın sonundaki "Undo" bölümü kullanılır. Bu, v18 tablolarındaki kayıtları siler. Gerçek kayıt girilmeden önce kayıpsızdır, sonrasında önerilmez.

## Ortam değişkenleri (yalnız adlar)
- **Mevcut:** `CRON_SECRET`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `NOTIFY_EMAIL_FROM`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Yeni ve isteğe bağlı (lisans entegrasyonu):** `YOCA_LICENSE_API_URL`, `YOCA_LICENSE_API_KEY_ID`, `YOCA_LICENSE_API_SECRET`.
