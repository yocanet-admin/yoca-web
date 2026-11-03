# Yayın sırası — PR #16 + v11 + v12 (+ v13)

Bu dosya bir plandır; hiçbir adım onay verilmeden uygulanmaz. Her adımdan sonra
**yönetici erişimi** ve **ziyaretçi sitesi** birlikte kontrol edilir. Bir adım
kontrolden geçmezse sonraki adıma geçilmez, o adımın geri dönüşü uygulanır.

Hiçbir adımda gizli anahtar sohbete yapıştırılmaz. SQL dosyaları anahtar içermez;
Supabase SQL editörüne proje sahibi olarak giriş yapmış hâlde çalıştırılır.

> Not: Vercel **Preview** ortamı da canlı Supabase projesine bağlı
> (`NEXT_PUBLIC_SUPABASE_URL` hem preview hem production'da tanımlı). Preview'da
> panelden yapılan her değişiklik canlı veriyi değiştirir. Preview yalıtılmış bir
> test ortamı değildir.

## Adım 0 — Ön inceleme (yalnızca okur)

| | |
|---|---|
| Ön koşul | Yok |
| Çalıştır | `supabase/checks/preflight.sql`, ardından `supabase/checks/verify-access.sql` |
| Beklenen etki | Hiçbir şey değişmez. `verify-access` her zaman kırmızı bir hata kutusuyla biter; bu kasıtlıdır ve yaptığı her denemeyi geri alır. |
| Doğrulama | Sonuç tablosu paylaşılır (anahtar içermez; admin e-postalarını isterseniz kapatın). Kontrol: `policy` satırları yereldeki listeyle **satır satır** karşılaştırılır (yerelde 31 public + 4 storage). `is_admin()` ve `audit_row()` var, `admin_users` içinde tüm yöneticiler küçük harfle var, `audit_*` tetikleyicileri var. `verify-access` bugünkü durumda U2–U8 için **FAIL** göstermelidir (açık burada görünür). |
| Geri dönüş | Gerekmez |

Farklılık çıkarsa (ek politika, eksik tablo, büyük harfli e-posta) durulur ve dosyalar canlı duruma göre düzeltilir.

## Adım 1 — Uygulama sürümü (PR #16; PR #15'i içerir)

| | |
|---|---|
| Ön koşul | Adım 0 temiz. `is_admin()` canlıda var ve `admin_users` sizin e-postanızı içeriyor (yoksa panel "yönetici kontrolü yapılamadı" diyerek açılmaz). Vercel Production'da `SUPABASE_SERVICE_ROLE_KEY` tanımlı (3 Kas'ta Vercel API'sinden **ad olarak** görüldü; değeri okunmadı). |
| Beklenen etki | Panel ve yönetici API'leri yetkiyi veritabanındaki `is_admin()` ile doğrular. Ziyaretçi sitesindeki proje listesi değişmez. Anahtar okunamazsa koddaki projeler sitede **gösterilmez** ve panelin her sayfasında kırmızı "Yapılandırma hatası" kutusu çıkar. v13 kurulana kadar hız sınırı eskisi gibi örnek başına bellekte sayılır (Vercel kayıtlarında bir kez uyarı yazar). |
| Doğrulama (birlikte) | **Yönetici:** /admin'e giriş, Kokpit açılıyor, kırmızı kutu yok; Leadler, Müşteriler, Work/Projeler, Ayarlar açılıyor. **Site:** yayından önce not edilen `/tr/work` proje listesi ile sonrası aynı; `/tr`, `/en`, `/tr/work/<her proje>` 200. **Form hattı:** gerçek kayıt üretmeden, boş gövdeyle `POST /api/contact` → 422 (doğrulama hatası) döner. |
| Geri dönüş | Vercel → Deployments → bir önceki Production sürümü → **Instant Rollback**. Bu adımda veritabanı değişmez. |

## Adım 2 — v11 (ziyaretçiler gizli proje/ekip satırlarını okuyamaz)

| | |
|---|---|
| Ön koşul | Adım 0'da `public read case studies` ve `public read team` politikaları `roles={anon,authenticated} · using=true` görünüyor. Dosyanın içindeki koruma başka bir şey görürse hiçbir şeyi değiştirmeden durur. |
| Çalıştır | `supabase/upgrade-v11-public-reads.sql` |
| Beklenen etki | Anon anahtarla API'den yalnızca `is_active = true` satırlar okunur. Site görünümü değişmez (yayındaki sürüm zaten yalnızca aktif satırları okuyor; PR #16 gizli slug'ları sunucu anahtarıyla okur). |
| Doğrulama (birlikte) | `verify-access.sql` → Z1, Z2, Z3, Z4 **PASS**. Site: `/tr/work` listesi Adım 1 ile aynı. Yönetici: Work/Projeler'de gizli projeler görünmeye devam ediyor. |
| Geri dönüş | `supabase/rollback-v11.sql` (eski `using (true)` politikalarını geri koyar; açık yeniden açılır, yalnızca acil durumda). |

## Adım 3 — v12 (yalnızca yöneticiler yönetim verisine erişir)

| | |
|---|---|
| Ön koşul | Adım 1 yayında ve yönetici girişi doğrulandı. `admin_users` tüm yöneticileri içeriyor (dosya boşsa kendiliğinden durur). |
| Çalıştır | `supabase/upgrade-v12-admin-only.sql` |
| Beklenen etki | Rolü yalnızca `authenticated` olan 25 politika (yerel sayım; canlı sayı Adım 0'dan) mevcut koşuluna `and public.is_admin()` ekler; `insights` görsel kovası dahil. Ziyaretçi politikalarına dokunmaz; dokunursa kendini geri alır. Değişmeden önceki tanımlar `policy_backup_v12` tablosuna yazılır. |
| Doğrulama (birlikte) | `verify-access.sql` → tüm satırlar **PASS** (U1–U9 üye engelleniyor, Y1–Y5 yönetici çalışıyor). Yönetici: çıkış-giriş, Leadler / Müşteriler / Work / Metinler / Ayarlar açılıyor, bir metni değiştirip geri almak. Site: `/tr`, `/tr/work`, `/tr/insights` 200. |
| Geri dönüş | `supabase/rollback-v12.sql` — politikaları yedekteki **birebir** tanımlara döndürür ve kendini doğrular. Yerel testte uygulama → geri alma → politika listesi önceki hâliyle birebir aynı çıktı. |

## Adım 4 — v13 (isteğe bağlı: tüm sunucu örneklerinde ortak hız sınırı)

| | |
|---|---|
| Ön koşul | Adım 1 yayında (uygulama fonksiyonu arar, yoksa bellek sayacına döner). |
| Çalıştır | `supabase/upgrade-v13-rate-limit.sql` |
| Beklenen etki | 5 gönderim / IP / saat / form sınırı Postgres'te sayılır. IP saklanmaz, yalnızca SHA-256 özeti. Yeni servis yok; gönderim başına bir ek veritabanı çağrısı. |
| Doğrulama | `preflight.sql` → `hit_rate_limit` satırı "var". Vercel kayıtlarında `[rate-limit] … memory` uyarısı yeni yayında görünmüyor. Gerçek başvuru üretecek test yapılmaz. |
| Geri dönüş | `drop function public.hit_rate_limit(text, integer, integer); drop table public.form_rate_limits;` — yalnızca sayaçlar; uygulama otomatik olarak bellek sayacına döner. |

## PR #15 ve #16 birleştirme notu

PR #16'nın dalı PR #15'in son commit'ini (`6878a9d`) içerir. GitHub'ın #15'i
kendiliğinden "merged" göstermesi garanti değildir:

- **Create a merge commit:** #15'in commit'leri main'e aynı SHA ile girer; GitHub genellikle #15'i "merged" yapar. Olmazsa aşağıdaki kontrolle doğrulayıp kapatın.
- **Squash and merge / Rebase and merge:** commit'ler yeni SHA alır; #15 açık kalır ve fark göstermeye devam edebilir. Kontrolden sonra elle kapatılır.

Birleştirme sonrası kontrol (üç yöntemde de aynı; arada başka PR birleştirilmediyse): main'in içeriği #16'nın son
commit'iyle birebir aynı olmalı; #16 #15'i kapsadığı için bu, #15'in tüm
değişikliklerinin main'de olduğunu gösterir.

- GitHub'da: `https://github.com/yocanet-admin/yoca-web/compare/<#16 son commit SHA>..main`
  (iki nokta) → "There isn't anything to compare" / 0 dosya. SHA, birleştirmeden hemen
  önce #16'nın Commits sekmesindeki en üst commit'tir.
- İstenirse bu kontrolü ben `git diff <SHA> origin/main --stat` ile yapar, sonucu yazarım.

Sonuç boşsa: merge commit yönteminde #15 genellikle kendiliğinden "merged" olur;
olmadıysa veya squash/rebase kullanıldıysa #15 "#16 ile birlikte yayına alındı" notuyla
kapatılır. Sonuç boş değilse #15 kapatılmaz, fark incelenir. (Üç noktalı
`compare/main...notify-design` squash/rebase sonrasında da fark gösterir; bu kontrol
için kullanılmaz.)
