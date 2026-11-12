# Yayın sırası — v30 Kullanıcı yönetimi + İçerik editörü

Hiçbir adım onaysız uygulanmaz. Production migration'ı sahibin açık onayıyla, SQL editöründen çalıştırılır. Gizli anahtar sohbete yapıştırılmaz.

## Ne değişiyor

- **Kimlik:** Supabase Auth aynı kalıyor; ikinci bir kullanıcı sistemi yok. `public.admin_users` tablosuna `editor` rolü, hesap durumu (`active` / `invited` / `disabled`), ad ve davet / kapatma bilgileri ekleniyor. Davet bağlantıları `admin_invites` tablosunda tutuluyor, ancak yalnız token'ın SHA-256 özeti saklanıyor.
- **Erişim kuralları:**
  - `is_admin()`, `is_finance()`, `can_finance()` ve `panel_role()` artık yalnız **etkin** hesaplara yetki veriyor. Mevcut hesapların hepsi etkin sayılıyor, rolleri değişmiyor.
  - Yeni `can_content()` (yönetici veya editör) yalnız içerik tablolarında ve içerik medyası kovalarında kullanılıyor; toplam 25 politika.
  - Editöre bunların dışında hiçbir şey açılmıyor. Finans kuralları değişmiyor.
- **Son yönetici koruması:** Bir tetikleyici son etkin yöneticinin silinmesini, kapatılmasını ve rolünün düşürülmesini engelliyor. SQL editöründen yapılan işlemler de buna dahil.
- **Ortam değişkeni:** Yeni değişken yok. Davet e-postası mevcut `RESEND_API_KEY` ve gönderen adresiyle (`noreply@yoca.net`) gidiyor.
- **`ADMIN_EMAILS` (production'da `mg@yoca.net`):** Bu değişken yöneticileri daraltan ek bir kilit ve davranışı değişmiyor. Panelden **yönetici** rolüyle davet edilen kişi, bu listeye eklenene ya da değişken kaldırılana kadar yönetim API'lerini kullanamaz. Kullanıcılar ekranı bunu uyarı olarak gösteriyor. Finans ve editör hesaplarını etkilemiyor.

## Uyumluluk

| Uygulama | Veritabanı | Sonuç |
|---|---|---|
| bugünkü main | v29 | çalışıyor (bugünkü durum) |
| bugünkü main | v29 + **v30** | çalışıyor. Mevcut hesaplar etkin, roller aynı; eski uygulama yeni fonksiyonları kullanmıyor. Editör rolü atanmadıkça kimsenin erişimi değişmiyor. |
| **yeni uygulama** | v29 (v30 yok) | Kullanıcılar ekranı hata veriyor (`users_list` yok); editör hesabı zaten olamaz. Diğer ekranlar çalışıyor. Yine de bu sıra **önerilmez.** |
| **yeni uygulama** | v29 + v30 | hedef durum |

Sonuç: **önce veritabanı (v30), sonra uygulama.**

## Kesin sıra

| # | Adım | Kapı / doğrulama | Geri dönüş |
|---|---|---|---|
| 0 | SQL editöründe `checks/v30-check.sql` (salt okunur) | Kullanıcı satırları maskeli listeleniyor; "v30" satırları "yok" | — |
| 1 | **Onaydan sonra:** `upgrade-v30-users.sql` | Dosya kendini denetliyor: yönetici yoksa durur; sonunda "mevcut kullanıcılar etkin, en az bir etkin yönetici" kontrolü var. Tekrar çalıştırmak güvenli. | `rollback-v30-users.sql` (aşağıya bakın) |
| 2 | `checks/v30-check.sql` tekrar | Tüm "v30" satırları "ok"; mevcut hesaplar `active` ve rolleri aynı; içerik politikaları "25 / 25"; etkin yönetici ≥ 1; finans politika sayısı adım 0'la aynı | — |
| 3 | Panelde kendi hesabınızla giriş (eski uygulama) | Kokpit, Finans ve İçerik açılıyor | — |
| 4 | PR merge → production | Vercel dağıtımı READY | Vercel Instant Rollback → bir önceki dağıtım (v30 veritabanıyla çalışır) |
| 5 | Canlı kontrol (kayıt oluşturmadan) | Sistem → Kullanıcılar listesi açılıyor; mevcut hesaplar "Etkin"; davet **gönderilmez** | — |
| 6 | İlk gerçek davet (sahibin kararıyla) | Davet ancak e-posta servisi kabul ettiğinde "gönderildi" görünür | Daveti iptal et |

## Mevcut kullanıcılar nasıl korunuyor

- Hiçbir satır silinmiyor, hiçbir rol değişmiyor. Yeni sütunlar varsayılan değerlerle doluyor: `status = active`, `name = ''`.
- Mevcut yöneticinin ve finans kullanıcısının yetkileri aynı fonksiyonlarla, aynı sonuçla çalışıyor. Yalnız artık `status = active` koşulu da aranıyor.
- `admin_users` tablosuna doğrudan erişim politikası yine yok. Liste ve değişiklikler yalnız `is_admin()` denetleyen fonksiyonlarla yapılıyor.
- Panelden hesap kapatmak satırı silmiyor; işlem geçmişi ve `created_by` alanları kalıyor.

## Geri dönüş (yalnız sahibin kararıyla)

1. Önce uygulamayı v30 öncesi bir dağıtıma geri alın (Instant Rollback).
2. Sonra `rollback-v30-users.sql` çalıştırın. Bu dosya:
   - eski kuralların ifade edemediği satırları (editör, bekleyen davet, kapatılmış hesap) `admin_users_v30_backup` tablosuna kopyalayıp `admin_users`'tan çıkarır. Kapatılmış bir hesap bu yolla yeniden açılmaz.
   - fonksiyonları ve politikaları v25 tanımlarına döndürür; işlem geçmişine dokunmaz.

Yerelde doğrulandı: v30 → rollback → v30 sırası hatasız çalışıyor; rollback sonrası editör ve kapatılmış hesaplar erişemiyor, yönetici erişebiliyor.
