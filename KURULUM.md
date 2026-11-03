# Yoca Next.js — Kurulum Rehberi (Türkçe)

Bu rehber projeyi sıfırdan yayına almanın tüm adımlarını içerir.
Gereksinimler: **Node.js 18.17+**, bir **Supabase** hesabı, bir **Vercel** hesabı
ve domainlerinizin DNS paneline erişim.

---

## 1. Supabase (veritabanı) — ~5 dakika

1. [supabase.com](https://supabase.com) → **New project** (bölge: Frankfurt/eu-central önerilir).
2. Sol menü → **SQL Editor** → projedeki `supabase/schema.sql` dosyasının tamamını
   yapıştırın → **Run**. Bu tek komut şunları kurar:
   - `sections` (bölüm aç/kapa anahtarları), `menus` (header/footer menüleri),
     `team_members` (ekip), `checkup_submissions` (check-up başvuruları),
     `contact_submissions` (iletişim formu)
   - RLS güvenlik kuralları (ziyaretçi yalnızca içerik okuyabilir ve form
     gönderebilir; başvuruları yalnızca siz okursunuz)
   - Varsayılan bölüm ve menü kayıtları
3. **Project Settings → API** sayfasından üç değeri not alın:
   - `Project URL`
   - `anon public` key
   - `service_role` key (gizli — yalnızca sunucu tarafında kullanılır)

> `schema.sql` tekrar çalıştırılabilir (idempotent) — mevcut verinize dokunmaz.

> **Mevcut (eski sürüm) veritabanını yükseltiyorsanız:** `supabase/upgrade-v3.sql`,
> `supabase/upgrade-v4.sql` ve `supabase/upgrade-v5.sql` dosyalarını SQL
> Editor'de sırayla birer kez çalıştırın (v5: work durum etiketleri
> concept/experimental + canlı proje linki). Mevcut veriye dokunulmaz.

### 1b. Admin Paneli Kullanıcısı — ~2 dakika

Site, `/admin` adresinde tam kapsamlı bir yönetim paneli içerir
(bölümler, menüler, metinler, work, ekip, başvurular).

1. Supabase → **Authentication → Users → Add user → Create new user**:
   e-posta + güçlü bir şifre girin (panele bu bilgilerle gireceksiniz).
2. **ÖNEMLİ (güvenlik):** Authentication → **Sign In / Providers → Email**
   bölümünde **"Allow new users to sign up"** seçeneğini **kapatın**.
   Böylece panele yalnızca sizin oluşturduğunuz kullanıcılar girebilir.

## 2. Yerel Kurulum

```bash
unzip yoca-next.zip -d yoca-next && cd yoca-next
npm install
cp .env.example .env.local
```

`.env.local` içine Supabase değerlerini girin:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

İsteğe bağlı satırlar:

```
NEXT_PUBLIC_GA4_ID=G-XXXXXXX      # Analytics (cookie onayından sonra yüklenir)
RESEND_API_KEY=re_...             # Form bildirimlerini e-posta ile almak için
NOTIFY_EMAIL_TO=connect@yoca.net
NOTIFY_EMAIL_FROM=Yoca <noreply@yoca.net>
```

Çalıştırın ve derlemeyi doğrulayın:

```bash
npm run build   # ilk derlemenin hatasız geçtiğini görün
npm run dev     # http://localhost:3000
```

Localhost, bilinmeyen host sayıldığından site **yoca.net (İngilizce)**
yapılandırmasıyla açılır. Türkçe/Azerbaycanca davranışı yerelde test etmek için
`/etc/hosts` dosyanıza `127.0.0.1 yoca.tr` ve `127.0.0.1 yoca.az` ekleyip
`http://yoca.tr:3000` adresini açabilirsiniz.

## 3. Vercel Dağıtımı

1. Projeyi bir GitHub reposuna push'layın → Vercel'de **Add New → Project** ile içe aktarın.
2. **Settings → Environment Variables**: `.env.local` içindeki tüm değişkenleri ekleyin
   (Production + Preview), sonra **Redeploy**.
3. **Settings → Domains**: dört domaini de ekleyin —
   `yoca.net`, `yoca.tr`, `yoca.com.tr`, `yoca.az` (dilerseniz `www.` varyantları da).
4. Vercel'in her domain için gösterdiği DNS kayıtlarını domain sağlayıcınıza girin
   (genellikle apex için `A 76.76.21.21`, www için `CNAME cname.vercel-dns.com`).

DNS yayıldıktan sonra middleware her şeyi otomatik yönetir:

| İstek | Sonuç |
|---|---|
| `yoca.net` | İngilizce site |
| `yoca.tr` | Türkçe site |
| `yoca.com.tr` | 308 → `yoca.tr` (duplicate content önlenir) |
| `yoca.az` | Azerbaycanca site |
| `www.*` | 308 → apex |

## 4. İçerik Yönetimi — Admin Paneli (`/admin`)

Siteniz yayına girdikten sonra `https://siteniz/admin` adresine gidin ve
1b adımında oluşturduğunuz kullanıcı ile giriş yapın. Panel Türkçedir.

| Modül | Ne yönetir |
|---|---|
| **Bölümler** | Ana sayfa bloklarını tek tıkla aç/kapat (hero, bento, hizmetler, müşteriler, partnerler, ekip, saatler, check-up, CTA) |
| **Menüler** | Header/footer linkleri: ekle, düzenle, sırala (↑↓), gizle, sil. Bilinen sayfaların başlıkları sitede ziyaretçinin dilinde gösterilir |
| **Metinler** | Hero, CTA, bölüm başlıkları gibi ana metinleri **3 dilde (TR/EN/AZ)** düzenleyin; boş bırakılan alan koddaki varsayılana döner |
| **Work / Projeler** | Vaka çalışmalarını 3 dilde yönetin (slug, yıl, pazar, görsel, hizmetler + tüm anlatı alanları). Tablo boşsa "Varsayılan 4 projeyi içe aktar" ile başlayın |
| **Ekip** | Gerçek ekip üyeleri: ad, unvan, fotoğraf URL'i, LinkedIn, uzmanlık etiketleri, sıralama. Liste boşken ekip bölümü sitede görünmez |
| **Başvurular** | İletişim mesajları ve skorlu (0–100) Check-Up lead'leri; tek tıkla e-posta ile yanıtlayın veya silin |

Ekip fotoğrafı yüklemek için: Supabase → **Storage → New bucket** (`public`
işaretli, adı örn. `team`) → fotoğrafı yükleyin → **Get URL** → panelde
`Fotoğraf URL` alanına yapıştırın.

### Dil davranışı (v4 — path tabanlı i18n)

Site 4 dilde, URL öneki ile çalışır: `/en/…`, `/tr/…`, `/az/…` ve `/ar/…`
(Arapça tam **RTL** düzeniyle). Önek olmadan gelen ziyaretçi, çerezde
hatırlanan diline (varsayılan EN) 308 ile yönlendirilir. `hreflang`
etiketleri ve sitemap dört dili de aynı host üzerinde işaretler; domainler
bağlandığında yapı aynen çalışmaya devam eder.

### Yayın öncesi ÖNEMLİ kontroller

- **Metrik dürüstlüğü (v5):** Varsayılan 4 proje artık "Konsept Proje"
  olarak etiketlenir ve HİÇBİR örnek metrik içermez. Metrik rozeti ve sonuç
  çubukları yalnızca /admin → Work'ten girdiğiniz doğrulanmış, müşteri onaylı
  verilerle görünür. Konsept projelerde sonuç bölümü otomatik olarak
  "Tasarlanan Sonuç" başlığıyla sunulur.
- **Partner rozetleri kaldırıldı (v5):** Resmi doğrulama URL'i olmadan
  "Google Premier Partner" vb. rozet gösterilmez. Yerine "Modern dijital
  büyümenin arkasındaki platformlarla inşa ediyoruz" başlıklı Ölç/Büyüt/İnşa Et
  araç kategorileri sunulur. Sertifikasyon aldığınızda rozetleri doğrulama
  linkleriyle yeniden ekleyebiliriz.
- **Calendly:** /admin → Metinler → "İletişim — Calendly linki" alanına
  `https://calendly.com/kullanici-adiniz` yazdığınızda iletişim sayfasında
  canlı randevu takvimi otomatik açılır.
- **Müşteri yorumları:** Vaka detayındaki 5. modül (Müşteri Yorumu) yalnızca
  /admin'den GERÇEK bir yorum girildiğinde görünür.

## 4b. Marka Varlıkları (v9)

Tüm logo dosyaları gerçek logo SVG'sinden (Artboard 9) üretilmiştir:

| Dosya | Kullanım |
|---|---|
| `public/brand/yoca-logo-primary.svg` | Koyu zemin (header, admin, schema.org logo) |
| `public/brand/yoca-logo-light-bg.svg` | Açık zemin |
| `public/brand/yoca-logo-mono-black.svg` / `-mono-white.svg` | Tek renk |
| `public/brand/yoca-symbol.svg` / `-dark-ink.svg` | Yalnız Y işareti |
| `public/favicons/*`, `public/favicon.ico` | Y işareti, koyu kare |
| `public/brand/og-default.png` | 1200×630 sosyal paylaşım görseli |

Sitedeki her eğik öğe (`.slant`, `.intro-slab`, eyebrow işareti, durum
etiketleri) logodaki modüllerin **4,83°** eğimini kullanır. `components/ui/BrandMark.tsx`
işareti birebir geometriyle çizer — başka yerde yeniden çizmeyin.

## 4c. Insights (İçgörüler) + AI Editoryal Motor (v6)

1. Supabase SQL editöründe `supabase/upgrade-v6-insights.sql` dosyasını çalıştırın
   (tablolar: `insights`, `insight_categories`, `insight_revisions`, `ai_runs`;
   `insights` storage bucket'ı; RLS: herkese açık okuma yalnızca YAYINDA + yayın saati geçmiş).
2. Vercel → Environment Variables:
   - `OPENAI_API_KEY` (zorunlu — yalnız sunucu; hiçbir route, ayar ya da log bu değeri göstermez)
   - Model kimlikleri tahmin edilmez, koda gömülü varsayılan yoktur. Ya Ayarlar → Yapay zekâ
     bölümünden seçin (“Modelleri doğrula” hesabın erişebildiği modelleri listeler) ya da env ile verin:
     `OPENAI_TEXT_MODEL_ECONOMY`, `OPENAI_TEXT_MODEL_QUALITY`, `OPENAI_IMAGE_MODEL_ECONOMY`,
     `OPENAI_IMAGE_MODEL_QUALITY` (eski `OPENAI_EDITORIAL_MODEL` / `OPENAI_IMAGE_MODEL` de okunur).
   - `AI_MONTHLY_BUDGET_USD` (isteğe bağlı başlangıç bütçesi; 0 ya da boşken yapay zekâ kapalıdır,
     Ayarlar’dan değiştirilebilir)
   - `INSIGHTS_PREVIEW_SECRET` (herkese açık sayfa önizlemesi için; editör içi önizleme anahtar istemez)
   - `SUPABASE_SERVICE_ROLE_KEY` zaten tanımlı olmalı (kullanım kaydı, görseller, ayarlar).
   - `AI_MOCK=1` YALNIZCA yerel test içindir; `VERCEL_ENV=production` iken reddedilir.
3. `supabase/upgrade-v14-content.sql` (İçerik stüdyosu, kullanım kaydı, özel görsel
   deposu, ekip doğrulaması, vaka sonuçları). İsteğe bağlı: `supabase/seed/insights-drafts-tr.sql`
   beş Türkçe TASLAK yazı ekler (yayınlanmaz).
4. `/admin/insights` → "+ Yeni içerik". Sağdaki İçerik stüdyosu adım adım ilerler:
   Konu → Taslak → Editörlük kontrolü → Görsel → Önizleme → İnceleme → Yayın. Yapay zekâ
   **yalnızca öneri** üretir (sürüm geçmişine kaydedilir); “Yayınla” / “Zamanla” ayrı düğmelerdir.
   “Web’de araştır” isteğe bağlıdır (OpenAI web araması): bulunan adresler “doğrulanmadı” olarak
   gösterilir; bir adres ancak sunucu sayfayı gerçekten indirip okuduğunda (“Kaynakları şimdi oku”)
   kaynak sayılır. Web arama ücreti tahmini maliyete dahil değildir.
   Modeller: “Ekonomik” / “Yüksek kalite” yalnızca etikettir; bir model ancak “Modelleri doğrula”
   (GET /v1/models) onu bu anahtar için listelediyse kullanılır.
5. Insights bağlantısı menüde, bir dilde en az bir yazı yayımlanınca kendiliğinden görünür.
   Ayar anahtarları (cockpit_settings): `site_copy` (yanıt süreleri + “Süreleri sitede göster”),
   `company_info` (veri sorumlusu bilgileri), `kvkk_published` (Aydınlatma Metni nihai mi; varsayılan
   kapalı), `about_intro` (Hakkımızda taslak metni), `ai` (yapay zekâ ayarları).
   Testler (ağ ve veritabanı gerekmez): `npx tsx --test tests/*.test.ts`
6. Herkese açık önizleme: `/{dil}/insights/{slug}?preview={id}&token=…` — noindex, yalnız anahtarla açılır.

## 5. Yayın Sonrası Kontrol Listesi

- [ ] Dört domain de açılıyor, `yoca.com.tr` → `yoca.tr`'ye yönleniyor
- [ ] Sayfa kaynağında `hreflang` etiketleri dört varyantı gösteriyor
- [ ] Her domainde `/sitemap.xml` ve `/robots.txt` çalışıyor
- [ ] `/checkup` sihirbazını tamamlayınca kayıt `checkup_submissions`'a düşüyor
- [ ] `/contact` formu `contact_submissions`'a düşüyor
- [ ] (Resend kuruluysa) bildirim e-postaları geliyor
- [ ] Google Search Console'a üç kanonik domain de eklendi
- [ ] Partner rozetlerindeki seviyeler gerçek sertifikasyonlarınızla uyumlu

## Sorun Giderme

| Belirti | Çözüm |
|---|---|
| Bölümler görünmüyor | `sections` tablosunda ilgili satırın `is_active` değeri |
| Form 503 dönüyor | Supabase env değişkenleri eksik/yanlış — Vercel'de kontrol edin |
| Form 500 dönüyor | `schema.sql` çalıştırılmamış olabilir (tablo yok) |
| Yanlış dil açılıyor | Domain, Vercel'e eklendi mi? Middleware yalnızca tanıdığı hostları eşler |
| E-posta gelmiyor | `RESEND_API_KEY` doğru mu, `NOTIFY_EMAIL_FROM` Resend'de doğrulanmış bir domain mi |
