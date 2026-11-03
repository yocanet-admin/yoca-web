# Yayın sırası — PR #16 + v11 + v12 + v13

Plan; hiçbir adım onay verilmeden uygulanmaz. Gizli anahtar sohbete yapıştırılmaz.
Vercel Preview (`yoca-web` projesi) canlı Supabase'e bağlıdır; orada deneme yapılmaz.

## 0. Nerede test edildi

- **Gerçek ortam:** ayrı Supabase projesi `yoca-staging` (ücretsiz org `yoca-staging`, ref `lfszdzebopyhaxdmtogd`) + ayrı Vercel projesi `yoca-staging` (Vercel girişi zorunlu). Sentetik veri, iki test hesabı (yönetici / yönetici olmayan), e-posta yerine test tablosu (`staging_notify_capture`), Telegram yok.
- **Test edilen sürümler:** eski uygulama `main` d6c685d; yeni uygulama `audit-fixes` c75d7b0 (son commit 39eb935 yalnızca bir log satırını değiştirir).
- Veri yazan kontroller (`checks/verify-access.sql`, form / yükleme denemeleri) **yalnızca staging'de** çalıştırıldı. Canlıda yalnızca salt okunur `checks/preflight.sql` çalışır.

## 1. Uyumluluk matrisi (gerçek Supabase Auth + PostgREST + Storage, staging)

| Uygulama | Veritabanı | Site | Yönetici | Yetkisiz girişli üye | Ziyaretçi API |
|---|---|---|---|---|---|
| eski | v9 | çalışıyor | çalışıyor | panel açık, sunucu API 200, başvuru okur, bölüm değiştirir | gizli proje + gizli ekip okunuyor |
| yeni | v9 | çalışıyor | **KİLİTLİ** (`check_failed`, API 401) | kapalı | gizli satırlar okunuyor |
| eski | v9 + Part A | çalışıyor | çalışıyor | panel açık, API 200, okur ve yazar | gizli satırlar okunuyor |
| yeni | v9 + Part A | çalışıyor | çalışıyor | panel kapalı, API 401, **doğrudan okur ve yazar** | gizli satırlar okunuyor |
| eski | Part A + v11 + v12 | çalışıyor | çalışıyor | panel açık, **sunucu API 200**, doğrudan 0 satır | yalnız yayındakiler |
| **eski + `ADMIN_EMAILS`** | Part A + v11 + v12 | çalışıyor | çalışıyor | panel kapalı, API 401, doğrudan 0 satır | yalnız yayındakiler |
| **yeni** | Part A + v11 + v12 (+ v13) | çalışıyor | çalışıyor | panel kapalı, API 401, doğrudan 0 satır | yalnız yayındakiler |

Sonuç: **yeni uygulama, Part A ve `admin_users` olmadan yayınlanamaz** (yönetici kilitlenir). Eski uygulama hazırlanmış veritabanıyla çalışır, bu yüzden veritabanı önce hazırlanır. Eski uygulamaya geri dönüş ancak `ADMIN_EMAILS` tanımlı bir dağıtıma yapılırsa güvenlidir.

## 2. Kesin sıra

| # | Adım | Ön koşul / kapı | Doğrulama (canlıda, salt okunur veya yalnız okuma) | Güvenli geri dönüş |
|---|---|---|---|---|
| 0 | `checks/preflight.sql` | — | Çıktı staging ile karşılaştırılır: Part A sonrası 35 politika; `is_admin()` var; `admin_users` maskeli listede sizin e-postanız; dış etkili tetikleyici yok | — |
| 1 | Vercel `yoca-web` Production: `ADMIN_EMAILS` = tüm yönetici e-postaları → main'i **Redeploy** | — | Kendi girişinizle panel açılıyor; site 200 | Değişkeni silmek açığı geri açar; gerekmez |
| 2 | Part A eksikse: v10 (Part A) + `admin_users`'a e-postalar | Adım 0 | preflight: function/admin_users `ok` | Gerekmez (yeni tablo + fonksiyon, hiçbir politika kullanmıyor) |
| 3 | v11 | preflight'ta "v11 kapsamı" 2 adet; dosya beklenmeyen tanımda kendini durdurur | preflight "v11 kapsamı" 0; site listesi aynı | İleri düzeltme (§3) |
| 4 | v12 | `admin_users` dolu (boşsa dosya durur). SQL editörü "Potential issues" sorarsa **Run without RLS** (dosya yedek tabloda RLS'yi kendisi açar) | preflight "v12 kapsamı" 0; panelde Leadler/Müşteriler/Work/Ayarlar açılıyor | İleri düzeltme (§3) |
| 5 | v13 | — | preflight `hit_rate_limit` "var" | `drop function …; drop table …` (yalnız sayaçlar; erişimi etkilemez) |
| 6 | PR #16 merge → production | **Kapı:** preflight'ta `is_admin()` ok, `admin_users` dolu, "v12 kapsamı" 0. Biri eksikse merge yapılmaz | Giriş, Kokpit'te kırmızı kutu yok, site 200, boş form POST 422 | Vercel Instant Rollback → **Adım 1'deki dağıtım** |

Soft 404 (`app/loading.tsx`) ayrı PR.

## 3. Güvenliği koruyan geri dönüş

- **Uygulama sorunu:** Vercel → Deployments → Adım 1'de oluşan main dağıtımı → Instant Rollback. Veritabanı yerinde kalır. Staging'de doğrulandı (matriste "eski + `ADMIN_EMAILS`"). Adım 1'den önceki dağıtımlara dönülmez: onlarda `ADMIN_EMAILS` yok ve yetkisiz üye sunucu API'lerini çağırabilir (staging'de 200 görüldü).
- **v12 sonrası yönetici giremiyor:** SQL editöründe e-postayı küçük harfle `admin_users`'a ekleyin; SQL editörü RLS'den etkilenmez.
- **Açığı yeniden açan scriptler** `supabase/emergency/` altında; plan dışı, yalnız sahibin açık kararıyla.

## 4. Canlıda çalışacak scriptler

- **`checks/preflight.sql`** — salt okunur tek SELECT. Gerçek Supabase'de (staging) ve `default_transaction_read_only=on` ile yerelde çalıştı. Çıktı: politika tanımları, nesne/yetki kontrolleri, sayılar, maskeli e-postalar. Anahtar içermez.
- **`checks/verify-access.sql`** — **canlıda çalıştırılmaz.** Tek DO ifadesi; birer satır günceller ve deneme ekler, sonunda kasıtlı hatayla hepsini geri alır. Staging'de: Part A durumunda U2–U8 + Z1–Z2 FAIL, v11+v12 sonrası 20/20 PASS; çalıştırma sonrası `clients`, `storage.objects`, `audit_log` sayıları değişmedi. Kalıcı iz: kabul edilen eklemelerde sıra numarası boşluğu. Staging'de Supabase Storage'ın kendi tetikleyicileri (`protect_delete`, `update_updated_at`) dış etki üretmiyor; `pg_net` / webhook yok.

## 5. v13 olmadan / RPC hatasında

Staging, iki ayrı Vercel dağıtımı (aynı IP):
- v13 yok: A'da 5×422 sonra 429; B'de 422 → sayaç paylaşılmıyor, form hata vermiyor, kayıtlara "using per-instance memory" uyarısı düşüyor.
- v13 var: A'da 5 istek, B'de 6. istek 429 → paylaşılıyor. `anon`/`authenticated` fonksiyonu çağıramıyor.
- RPC yetkisi kaldırılınca: B 422 (500 değil), DB sayacı artmadı → bellek sayacına döndü. (Bu testte uyarı yalnız ilk seferde loglanıyordu; 39eb935 ile başarılı çağrıdan sonra tekrar loglanıyor.)

## PR #15 ve #16 birleştirme notu

PR #16'nın dalı PR #15'in son commit'ini (`6878a9d`) içerir; GitHub'ın #15'i kendiliğinden "merged" göstermesi garanti değildir.
- **Create a merge commit:** genellikle kendiliğinden "merged" olur.
- **Squash / Rebase:** #15 açık kalır; aşağıdaki kontrolden sonra elle kapatılır.

Kontrol (arada başka PR birleştirilmediyse): `compare/<#16 son commit SHA>..main` (iki nokta) boş olmalı. Boşsa #15 "#16 ile birlikte yayına alındı" notuyla kapatılır; değilse kapatılmaz, fark incelenir.
