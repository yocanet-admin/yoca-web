# Yayın sırası — PR #16 + v11 + v12 + v13

Bu dosya bir plandır; hiçbir adım onay verilmeden uygulanmaz. Gizli anahtar
sohbete yapıştırılmaz. Vercel **Preview** canlı Supabase'e bağlıdır; preview'da
deneme yapılmaz.

## 1. Uyumluluk matrisi (ölçülen)

Ortam: yerel `next start` derlemeleri (main = mevcut, #16 = yeni), yerel
Postgres 16 üzerinde kendi yazdığım PostgREST benzeri ağ geçidi, sahte girişler.
**Gerçek Supabase değildir.** `ADMIN_EMAILS` Vercel'deki gibi tanımsız.
"Doğrudan" = kullanıcının kendi oturumuyla veri API'sine gitmesi (panel de böyle çalışır).

| Uygulama | Veritabanı | Site | Yönetici | Yetkisiz girişli üye |
|---|---|---|---|---|
| mevcut | v9 (Part A yok) | çalışıyor | çalışıyor | panel açık, sunucu API 200, doğrudan okur **ve yazar** |
| mevcut | v9 + v10 Part A | çalışıyor | çalışıyor | panel açık, sunucu API 200, doğrudan okur **ve yazar** |
| mevcut | Part A + v11 + v12 (ve + v13) | çalışıyor | çalışıyor | panel açık, **sunucu API 200**, doğrudan 0 satır |
| mevcut + `ADMIN_EMAILS` | Part A + v11 + v12 | çalışıyor | çalışıyor | panel kapalı, sunucu API 401, doğrudan 0 satır |
| yeni | v9 (Part A yok) | çalışıyor | **KİLİTLİ** (`check_failed`, API 401) | kapalı |
| yeni | v9 + Part A | çalışıyor | çalışıyor | panel kapalı, API 401, doğrudan okur **ve yazar** |
| yeni | Part A + v11 + v12 | çalışıyor | çalışıyor | panel kapalı, API 401, doğrudan 0 satır |
| yeni | Part A + v11 + v12 + v13 | çalışıyor | çalışıyor | panel kapalı, API 401, doğrudan 0 satır |
| yeni + `ADMIN_EMAILS` | Part A + v11 + v12 | çalışıyor | çalışıyor | panel kapalı, API 401, doğrudan 0 satır |

Sonuçlar:
- **Yeni uygulama + Part A'sız veritabanı uyumsuz:** yönetici paneli kilitlenir (güvenli tarafta kalır ama erişim kesilir). Bu yüzden önce veritabanı, sonra uygulama.
- **Mevcut uygulama hazırlanmış veritabanıyla uyumlu:** site ve yönetici çalışıyor. Bu, uygulamayı geri almanın veritabanı düzeltmelerini geri almayı gerektirmediğini gösterir.
- **Bugün canlıda ek bir açık var:** mevcut uygulamada `ADMIN_EMAILS` tanımsızken girişli **her** kullanıcı sunucu tarafındaki yönetici API'lerini (trafik, site sağlığı, bildirim ayarları, lead-AI) çağırabiliyor. Veritabanı düzeltmesi bunu kapatmaz (bu API'ler sunucu anahtarıyla çalışır). `ADMIN_EMAILS` kapatır; yeni uygulama ayrıca `is_admin()` ister.
- **v13 isteğe bağlı:** yeni uygulama v13 yokken hata vermez; form çalışır, sınır her sunucu örneğinde ayrı sayılır (bkz. §4).

## 2. Kesin sıra

| # | Adım | Ön koşul | Beklenen etki | Doğrulama | Güvenli geri dönüş |
|---|---|---|---|---|---|
| 0 | `checks/preflight.sql` (salt okunur) | — | Yok | Çıktı paylaşılır: politika listesi, `is_admin()`, `admin_users` (maskeli), tetikleyiciler | — |
| 1 | Vercel Production'a `ADMIN_EMAILS` (yönetici e-postaları, gizli değil) ekle → mevcut main'i **Redeploy** | — | Mevcut uygulamada sunucu yönetici API'leri yalnız bu e-postalara açılır. Bu dağıtım güvenli geri dönüş hedefi olur. | Sizin girişinizle panel açılıyor; site 200 | Değişkeni silip yeniden dağıtmak (açığı geri açar; gerekmez) |
| 2 | Part A eksikse: v10'un Part A bölümü + `admin_users`'a e-postalar | Adım 0 | `is_admin()` var, kimsenin erişimi değişmez | preflight: function/admin_users `ok` | Gerekmez (yeni tablo ve fonksiyon; hiçbir politika bunları kullanmıyor) |
| 3 | v11 | Adım 0'da iki politika `using=true`; dosya başka bir şey görürse kendini durdurur | Ziyaretçi API'den gizli satır okuyamaz | `checks/verify-access.sql` Z1–Z4 PASS; site listesi aynı | İleri düzeltme (§3) |
| 4 | v12 | `admin_users` tüm yöneticileri içeriyor (boşsa dosya durur) | Yalnız yöneticiler yönetim verisine erişir | verify-access tümü PASS; panelde Leadler/Müşteriler/Work/Ayarlar açılıyor | İleri düzeltme (§3) |
| 5 | v13 | — | Hız sınırı tüm örneklerde ortak | preflight: `hit_rate_limit` var | `drop function …; drop table …` — erişimi etkilemez |
| 6 | PR #16 merge → production | 1–4 tamam (Part A + `admin_users` şart) | Panel `is_admin()` ile doğrular | Giriş, Kokpit (kırmızı kutu yok), site 200, boş form POST 422 | Vercel Instant Rollback → **Adım 1'deki dağıtım** |

Soft 404 (`app/loading.tsx`) ayrı PR olarak sonra.

## 3. Güvenliği koruyan geri dönüş

- **Uygulama sorunu (Adım 6 sonrası):** Vercel → Deployments → **Adım 1'de oluşan main dağıtımı** → Instant Rollback. Veritabanı (v11/v12/v13) yerinde kalır. Bu eşleşme test edildi (matristeki "mevcut + `ADMIN_EMAILS`" satırı): site ve yönetici çalışıyor, yetkisiz üye her yerde engelli. Adım 1'den **önceki** bir dağıtıma geri dönülmez: o dağıtımlarda `ADMIN_EMAILS` yok (Vercel ortam değişkenlerini her dağıtımda sabitler).
- **v12 sonrası bir yönetici giremiyor:** SQL editöründe e-postasını `admin_users`'a küçük harfle ekleyin. SQL editörü RLS'den etkilenmez, bu yüzden kilitlenme kalıcı olamaz.
- **v11/v12 sonrası beklenmedik bir panel işlevi bozuldu:** yalnız o tablonun politikası düzeltilir. Panel işlevlerinin tümü yönetici oturumuyla çalıştığı ve yönetici `is_admin()=true` olduğu için yerelde böyle bir durum görülmedi.
- **Açığı yeniden açan scriptler** `supabase/emergency/` altında, başlıklarında uyarıyla duruyor. Planın parçası değiller; yalnızca proje sahibinin açık kararıyla.

## 4. Scriptlerin canlıdaki etkisi

**`checks/preflight.sql` — salt okunur.** Tek SELECT ifadesi. Yalnızca katalog fonksiyonlarını ve SELECT metniyle `query_to_xml()` çağırır. Yerelde `default_transaction_read_only=on` iken hatasız çalıştı (yazma olsaydı hata verirdi). Çıktıda anahtar yok; e-postalar maskeli (`m***@alan`).

**`checks/verify-access.sql` — salt okunur DEĞİL.** Tek DO ifadesi; her zaman `RAISE EXCEPTION` ile biter, Postgres ifadenin yaptığı her şeyi geri alır.
- Geçici olarak yaptığı şeyler:
  - rol ve JWT claim'lerini değiştirir (`SET LOCAL`, yalnız o işlem);
  - `sections`, `case_studies` ve `cockpit_settings`'te **birer satırı** kendi değeriyle günceller (milisaniyelik satır kilidi; `updated_at` tetikleyicisi çalışır);
  - `clients`'a bir satır ve `storage.objects`'e dosyasız bir kayıt eklemeyi dener (izin varsa audit tetikleyicisi `audit_log`'a yazar).
- Kalıcı iz: kabul edilen bir ekleme bir sıra numarası (ör. `audit_log` id) tüketir; kimlik numaralarında boşluk kalır. Yerelde `audit_log` sırası 2 → 3 oldu; satır sayıları ve `sections` içeriği (md5) aynı kaldı.
- Transaction dışı etki: Realtime ve pg_net webhook'ları yalnız commit edilmiş veriyi işler. Script, yazmadan önce bu tablolardaki tetikleyicileri tarar; pg_net/http/dblink/pg_notify çağıran biri varsa hiçbir şey yazmadan durur (yerelde `pg_notify` tetikleyicisiyle denendi, durdu).
- Hata durumunda geri alma: ifade atomik; herhangi bir hata ya da sondaki kasıtlı hata tümünü geri alır.

## 5. v13 olmadan yeni uygulama

Form normal çalışır. `hit_rate_limit()` bulunamayınca sunucu örneği başına bellek sayacına döner ve kayıtlara bir kez uyarı yazar. Ölçüm: aynı IP ile 1. örnekte 5 × 422, 6. istek 429; aynı IP 2. örnekte 422 (sayaç paylaşılmıyor). v13 ile 2. örnekte de 429. Kalan sınır: v13 yoksa etkin limit "5 × açık örnek sayısı"dır ve örnek yeniden başlayınca sayaç sıfırlanır.

## 6. Gerçek Supabase doğrulaması — AÇIK yayın koşulu

Ziyaretçi, girişli yetkisiz üye ve yönetici için gerçek Auth + PostgREST testi **yapılmadı**.
- Bu oturumdan `*.supabase.co`'ya bağlantı ağ izin listesinde kapalı ve Docker imajları indirilemiyor (yerel Supabase kurulamıyor).
- Bağlı olan Neon gerçek bir PostgREST sunuyor ama Supabase Auth değil; bu koşulun yerine geçmez.

Yol: Supabase bağlayıcısı + ayrı bir test projesi. Şema bağlayıcıyla kurulur, test kullanıcıları SQL ile oluşturulur. Auth/PostgREST çağrıları tarayıcı üzerinden yapılır (CORS açık). Anahtar sohbete yapıştırılmaz.

## PR #15 ve #16 birleştirme notu

PR #16'nın dalı PR #15'in son commit'ini (`6878a9d`) içerir; GitHub'ın #15'i
kendiliğinden "merged" göstermesi garanti değildir.
- **Create a merge commit:** genellikle kendiliğinden "merged" olur.
- **Squash / Rebase:** #15 açık kalır; aşağıdaki kontrolden sonra elle kapatılır.

Birleştirme sonrası kontrol (arada başka PR birleştirilmediyse):
`compare/<#16 son commit SHA>..main` (iki nokta) boş olmalı. Ben de
`git diff <SHA> origin/main --stat` ile kontrol edebilirim. Boşsa #15 "#16 ile
birlikte yayına alındı" notuyla kapatılır; değilse kapatılmaz, fark incelenir.
