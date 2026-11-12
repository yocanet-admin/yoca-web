# Yayın sırası — v30 Kullanıcı yönetimi + İçerik editörü

Hiçbir adım onaysız uygulanmaz. Production migration'ı sahibin açık onayıyla, SQL editöründen çalıştırılır. Gizli anahtar sohbete yapıştırılmaz.

**Durum (2026-11-12, salt okunur kontrol):** Production'da v30 **uygulanmamış**. `can_content` fonksiyonu yok; kontrol olarak bakılan `can_finance` var. Supabase Auth ayarları: "Allow new users to sign up" **açık**, "Confirm email" **açık**.

## Ne değişiyor

- **Kimlik:** Supabase Auth ve e-postayla giriş aynı kalıyor; ikinci bir kullanıcı sistemi yok, kullanıcı adıyla giriş yok.
- **`admin_users` tablosuna eklenenler:**
  - `editor` rolü;
  - hesap durumu (`active` / `invited` / `disabled`);
  - `must_change_password`, `email_verified_at`, `created_via` (`legacy` / `invite` / `direct`);
  - ad, Auth kullanıcısına bağ (`user_id`), davet ve kapatma bilgileri.
- **Davet bağlantıları:** `admin_invites` tablosunda tutuluyor; yalnız token'ın SHA-256 özeti saklanıyor.
- **Tek yetki kaynağı veritabanı:** Rol yalnız "geçerli" satırdan geliyor. Geçerli satır: durumu etkin, bekleyen şifre değişikliği yok, panelde oluşturulmuşsa giriş yapan Auth kullanıcısıyla bağlı (`user_id = auth.uid()`). Mevcut satırlar `user_id` taşımadığı için eskisi gibi e-postayla eşleşiyor. `is_admin()`, `is_finance()` ve `can_finance()` bu kuraldan türüyor; `can_content()` yeni.
- **İçerik editörü:** Yalnız 25 içerik politikası ve içerik medya kovaları `can_content()` ile açılıyor. Finans kuralları değişmiyor.
- **Son yönetici koruması:** Tetikleyici, son *geçerli* yöneticinin silinmesini, kapatılmasını ve rolünün düşürülmesini engelliyor. Geçici şifresini değiştirmemiş bir yönetici bu sayıma girmiyor. SQL editöründen yapılan işlemler de korumaya dahil.
- **Uygulama `ADMIN_EMAILS` değişkenini artık okumuyor.** Ayrıntı ve geçiş sırası aşağıda.
- **Yeni ortam değişkeni ve yeni servis yok.** Davet e-postası mevcut `RESEND_API_KEY` ve `noreply@yoca.net` ile gidiyor. Doğrudan oluşturmada e-posta gönderilmiyor.

## Doğrudan oluşturma — mevcut Supabase ayarlarıyla nasıl çalışıyor

- Sunucu `auth.admin.createUser` ile hesabı geçici şifreyle açıyor. Bu çağrı Supabase'de **e-posta göndermez.**
- **E-posta onayı:** "Confirm email" açık olduğu için onaysız bir kullanıcı hiç giriş yapamaz. Bu yüzden hesap `email_confirm: true` ile açılıyor. Supabase'in Users ekranında bu kişi "onaylı" görünür, ama gerçekte e-posta sahipliği kanıtlanmış değildir.
  - Panel bunu dürüstçe gösteriyor: `email_verified_at` boş kalıyor ve listede "E-posta doğrulanmadı (yönetici oluşturdu)" yazıyor.
  - Davet bağlantısıyla açılan hesapta `email_verified_at` dolduruluyor.
- **İlk giriş:** Kişi giriş yapabiliyor ama rolü yok. Panel yalnız "Şifreni değiştir" ekranını gösteriyor. API rotaları ve RLS de reddediyor, çünkü `panel_role()` bekleyen şifre değişikliği olan satırı yok sayıyor.
- **Şifre değişikliği:**
  - Sunucu önce geçici şifreyi Auth'a karşı doğruluyor, sonra yeni şifreyi Auth'a yazıyor.
  - Bayrağı ancak bundan sonra servis rolüyle kaldırıyor. Kullanıcı bayrağı kendisi kaldıramaz.
  - Şifre hiçbir tabloya, işlem geçmişine, uygulama günlüğüne ya da yanıta yazılmıyor. GlitchTip zaten istek verisi toplamıyor.
- **Kısmi başarısızlık:** Auth hesabı açılıp panel satırı yazılamazsa Auth hesabı siliniyor. Silinemezse giriş engelleniyor ve yöneticiye "Supabase'den silin" deniyor. İstek başarılı görünmüyor.
- **Aynı e-posta:** Panel hesabı, bekleyen davet ya da panel dışı bir Auth hesabı varsa ikinci hesap açılmıyor. Panel dışı Auth hesabı için davet öneriliyor, çünkü davet bağlantısı e-posta sahipliğini kanıtlıyor.
- **Not:** Herkese açık kayıt ("Allow new users to sign up") açık. Bu panel için gerekli değil. Bu şekilde açılan hesapların panelde hiçbir yetkisi yok, ama kapatılması önerilir (ayar değişikliği; sahibin kararı).

## ADMIN_EMAILS geçişi

**Bugün:** Production'da `ADMIN_EMAILS=mg@yoca.net` var. Eski uygulama yöneticiyi hem bu listeye hem `admin_users`'a bakarak kabul ediyor.

**Yeni uygulama:** Değişkeni okumuyor. Yönetici yalnız veritabanındaki geçerli yönetici satırıyla tanınıyor. Panelden oluşturulan ya da davet edilen yönetici, Vercel'e dokunmadan çalışıyor.

**Giriş yapmış sıradan kullanıcılar** (herkese açık kayıtla açılanlar dahil) hiçbir yetki almıyor: `admin_users` satırları yok, `is_admin()` false dönüyor. Bu, yerelde değişken tanımlıyken de tanımsızken de test edildi.

Sıra (mevcut yöneticinin erişimi hiçbir adımda kesilmez):

1. Değişkene dokunmayın. v30'u uygulayın; eski uygulama hâlâ değişkeni ve `admin_users`'ı kullanır ve `mg@yoca.net` her ikisinde de var.
2. Yeni uygulamayı yayınlayın. Kullanıcılar ekranında "ADMIN_EMAILS hâlâ tanımlı" bilgisi görünür; erişim etkilenmez.
3. Kendi hesabınızla doğrulayın: Kokpit, Kullanıcılar ve Operasyon açılmalı.
4. **Ancak bundan sonra**, isteğe bağlı olarak Vercel Production'dan `ADMIN_EMAILS`'i silin ve yeniden dağıtın.
   - Silmeden önce eski dağıtıma (Instant Rollback) dönülürse eski uygulama listeyi okur: `mg@yoca.net` çalışır, panelden eklenen yeni yöneticiler o eski sürümde çalışmaz.
   - Sildikten sonra eski sürüme dönülürse eski uygulama yalnız `is_admin()`'e bakar. Bu da güvenlidir (v12 sonrası).

## Uyumluluk

| Uygulama | Veritabanı | Sonuç |
|---|---|---|
| bugünkü main | v29 | çalışıyor (bugünkü durum) |
| bugünkü main | v29 + **v30** | Çalışıyor. Mevcut hesaplar geçerli, roller aynı. Editör ya da geçici şifreli hesap eski uygulamada açılmaz (eski kod bu rolleri tanımıyor), yani fazladan yetki oluşmaz. |
| **yeni uygulama** | v29 (v30 yok) | Kullanıcılar ekranı hata verir. **Önerilmez.** |
| **yeni uygulama** | v29 + v30 | hedef durum |

Sonuç: **önce veritabanı (v30), sonra uygulama, en son (isteğe bağlı) `ADMIN_EMAILS`'in silinmesi.**

## Kesin sıra

| # | Adım | Kapı / doğrulama | Geri dönüş |
|---|---|---|---|
| 0 | SQL editöründe `checks/v30-check.sql` (salt okunur) | Kullanıcılar maskeli listeleniyor; "v30" satırları "yok" | — |
| 1 | **Onaydan sonra:** `upgrade-v30-users.sql` | Dosya kendini denetliyor (yönetici yoksa durur; sonda mevcut hesapların etkin olduğunu ve etkin yönetici bulunduğunu kontrol ediyor). Tekrar çalıştırmak güvenli. | `rollback-v30-users.sql` |
| 2 | `checks/v30-check.sql` tekrar | "v30" satırları "ok"; mevcut hesaplar `active` ve rolleri aynı; içerik politikaları 25/25; etkin yönetici ≥ 1; finans politika sayısı adım 0'la aynı | — |
| 3 | Eski uygulamayla kendi girişiniz | Kokpit, Finans ve İçerik açılıyor | — |
| 4 | PR merge → production | Dağıtım READY | Instant Rollback (v30 veritabanıyla çalışır) |
| 5 | Canlı kontrol (kayıt oluşturmadan) | Kullanıcılar listesi açılıyor; mevcut hesaplar "Etkin" | — |
| 6 | İsteğe bağlı: `ADMIN_EMAILS`'i silip yeniden dağıtmak | Kendi girişiniz çalışıyor | Değişkeni geri eklemek |
| 7 | İlk gerçek davet ya da hesap (sahibin kararıyla) | Davet ancak e-posta servisi kabul ederse "gönderildi" görünür. Doğrudan oluşturulan hesap ilk girişte şifre değiştirir. | Daveti iptal etmek / erişimi kapatmak |

## Mevcut kullanıcılar nasıl korunuyor

- Hiçbir satır silinmiyor, hiçbir rol değişmiyor.
- Yeni sütunlar varsayılanlarla geliyor: `status = active`, `must_change_password = false`, `created_via = legacy`, `user_id` boş. Boş `user_id` mevcut hesapların eskisi gibi e-postayla eşleşmesi demek.
- Panelden hesap kapatmak satırı silmiyor; işlem geçmişi kalıyor.

## Gerçek Supabase entegrasyonu — doğrulama durumu

- **Yerelde sınanan:** Davet, doğrudan oluşturma, ilk şifre değişikliği, erişim kapatma ve ADMIN_EMAILS geçişi gerçek PostgreSQL kurallarıyla (RLS, tetikleyiciler, fonksiyonlar) ama **taklit Auth** ile sınandı. Taklit, production'daki "Confirm email açık" davranışını, `createUser` / `updateUserById` / ban / `listUsers` çağrılarını kopyalıyor. Bu gerçek Supabase Auth'un davranışını **kanıtlamaz.**
- **Ayrı test ortamı:** `yoca-staging` Supabase projesi var ama **duraklatılmış** (Free plan; 17 Aralık 2027'ye kadar ücretsiz yeniden başlatılabilir). Bu dala bağlı bir staging dağıtımı yok; Vercel'deki staging değişkenleri yalnız eski iki dala tanımlı. Bu yüzden gerçek entegrasyon doğrulanmadı.
- **En küçük test planı** (ücretli kaynak ve production hesabı olmadan; her adım sahibin onayıyla):
  1. `yoca-staging` projesini dashboard'dan **Resume** edin (ücretsiz). Auth ayarlarını production'la eşleyin: Confirm email açık.
  2. Staging SQL editöründe v30'u (ve staging eksikse v26–v29'u) çalıştırın, ardından `checks/v30-check.sql`.
  3. Bu dalı push ettikten sonra Vercel'de yalnız bu dal için Preview değişkenleri ekleyin: staging URL, anon ve service anahtarları; e-postanın staging yakalama tablosuna gitmesi için `NOTIFY_RESEND_ENDPOINT`. Bunlar eski dallardaki staging değerlerinin aynısı; production değişkenine dokunulmaz.
  4. Preview'da test edilecekler:
     - (a) Kendi test adresinize davet → bağlantıyla şifre belirleme → giriş.
     - (b) Doğrudan oluşturma: e-posta gitmediğini yakalama tablosundan doğrulayın → geçici şifreyle giriş → yalnız şifre ekranı → değiştirme → rolle giriş. Staging Users ekranında hesabın "confirmed" göründüğünü not edin (beklenen; panel "doğrulanmadı" der).
     - (c) Erişim kapatma: açık oturum bir sonraki işlemde reddedilir; giriş ve oturum yenileme "banned" hatası verir.
     - (d) Aynı e-postayla ikinci hesap denemesi reddedilir.
  5. Bitince staging'i yeniden duraklatabilirsiniz.

## Geri dönüş (yalnız sahibin kararıyla)

1. Önce uygulamayı v30 öncesi bir dağıtıma geri alın.
2. Sonra `rollback-v30-users.sql` çalıştırın. Dosya, eski kuralların ifade edemediği satırları `admin_users_v30_backup` tablosuna kopyalayıp `admin_users`'tan çıkarır: editör, bekleyen davet, kapatılmış hesap ve bekleyen geçici şifre değişikliği. Kapatılmış hesap yeniden açılmaz, geçici şifre de değiştirilmeden çalışmaya başlamaz. Fonksiyonlar ve politikalar v25 tanımlarına döner; işlem geçmişine dokunulmaz.

Yerelde doğrulandı: v30 → rollback → v30 sırası hatasız çalışıyor.
