# Yerel entegrasyon testleri (Finans)

Uygulamayı gerçek PostgreSQL kuralları (RLS, tetikleyiciler, kısıtlar) üzerinde, Supabase yerine küçük bir **test geçidiyle** çalıştırır. E-posta ve Telegram gönderimleri geçidin yakalayıcısına gider; hiçbir şey gerçek bir kutuya veya sohbete ulaşmaz. **Production'a veya gerçek bir Supabase projesine asla bağlanmaz**; kullanılan veritabanı her kurulumda silinip yeniden oluşturulur.

## Gerekenler

| Araç | Neden | Kurulum (Debian/Ubuntu) |
|---|---|---|
| Node.js 20+ | uygulama, geçit, testler | — |
| PostgreSQL 16 sunucu araçları (`initdb`, `pg_ctl`) ve `psql` | geçici test veritabanı | `apt install postgresql-16 postgresql-client-16` |
| libfaketime | uygulamayı **sabit saatle** çalıştırmak | `apt install faketime` |
| Playwright Chromium | arayüz testleri | `npx --prefix tests/integration playwright install chromium` |
| bash, curl | betikler | — |

Testler Linux'ta doğrulandı. macOS'ta `brew install libfaketime` ile `start.sh` `DYLD_INSERT_LIBRARIES` kullanır; sistem korumaları engellerse testleri bir Linux konteynerinde/VM'inde çalıştırın.

## Çalıştırma

```bash
npm ci                                   # uygulama bağımlılıkları (repo kökü)
npm run build                            # testler derlenmiş uygulamayı (next start) kullanır
npm --prefix tests/integration install   # pg, playwright, tsx (yalnızca testler için)
npx --prefix tests/integration playwright install chromium
bash tests/integration/setup-db.sh       # /var/tmp/yoca-itest, port 54339, veritabanı "itest"
bash tests/integration/run-finance.sh    # tüm Finans paketleri; sonuçlar /tmp/yoca-itest-out
```

`setup-db.sh` yeni bir küme kurar, `db/stubs.sql`'i (Supabase'in sağladığı roller, `auth.jwt()`, `storage` tabloları) ve ardından `supabase/schema.sql` + `upgrade-v3 … v26` dosyalarının **hepsini sırayla** uygular. Sentetik kullanıcılar: `admin@test.local` (v12 öncesi, boş yönetici listesi kuralı için), `finance@test.local` (v25 sonrası, `role = 'finance'`), `intruder@test.local` (yetkisiz). Şifreler geçitte tanımlıdır (`itest-*-pw`).

`make-env.mjs` ilk çalıştırmada `tests/integration/.env.itest` dosyasını üretir (git'e girmez): geçidin herkese açık test anahtarıyla imzalı anon/service JWT'leri, yerel yakalayıcı adresleri, rastgele yerel sırlar. **Hiçbiri production bilgisi değildir**; production ortam değişkenleri okunmaz.

Ortam değişkenleri: `ITEST_DIR`, `ITEST_PORT`, `ITEST_DB` (veritabanı), `ITEST_OUT` (sonuç klasörü), `ITEST_STATE` (geçidin yakalanan gönderimleri). Portlar sabittir: uygulama **3190**, geçit **54331**.

## Sabit saat

Tarihe bağlı paketler (aylık görünüm, ekip özetinin 7 günlük penceresi, Gelirler) uygulamayı **2026-11-07 09:00 UTC = 12:00 İstanbul** saatinde çalıştırır:

```bash
FAKE_NOW="2026-11-07 09:00:00" bash tests/integration/start.sh
```

`start.sh` yalnızca uygulama sürecine libfaketime yükler (`LD_PRELOAD` + `FAKETIME`, `TZ=UTC`); uygulama kodu değişmez. Paketler bunu doğrular (cron sonucu `today = 2026-11-07`) ve pencere sınırlarını sabit verilerle sınar: 14 Kasım (7. gün) özette, 15 Kasım (8. gün) değil. İstanbul gece yarısı geçişi birim testlerinde (`tests/fin.test.ts`, `digest window`) sabit anlarla ayrıca sınanır. Cron paketi kendi tarihlerini gerçek saatten hesapladığı için `run-finance.sh` onu gerçek saatle çalıştırır.

| Paket | Dosya | Saat |
|---|---|---|
| Aylık görünüm (Giderler) | `finance/month-ui.cjs` | sabit |
| Giderler uçtan uca (roller, dönemler, ödemeler, belgeler, özet penceresi) | `finance/expenses-e2e.mts` | sabit |
| Giderler arayüzü | `finance/expenses-ui.cjs` | sabit |
| v25 rol / Operasyon uyumu | `finance/v25-verify.mts` | sabit |
| Gelirler uçtan uca (Operasyon tahsilatı tek kez, kısmi/iade/fazla, düzeltme, yetki) | `finance/income-e2e.mts` | sabit |
| Gelirler arayüzü (masaüstü, mobil, klavye, ay seçici) | `finance/income-ui.cjs` | sabit |
| Cron: dönemler ekran açılmadan, özet, kısmi hata, mükerrer gönderim yok | `finance/cron-roll.mts` | gerçek |

`panel/panel-ui.cjs` (gerçek saat; Finans paketinden sonra): Kokpit ve Giderler'in Tangram düzeni, ortak panel kabuğu (menü grupları, iki sekme eşleşmesi, mobil menü), finans rolü sınırları, Kokpit'in sitelere istek göndermemesi ve Giderler dönemlerini yazmaması, boş/hatalı durumlar, Kokpit kartının Operasyon ve Giderler ile aynı sayıları göstermesi, ziyaretçi grafiklerinin dolu / eksik günlü / sıfır değerli Vercel yanıtlarıyla görünümü (yanıtlar `tests/vercelStub.ts` taklidinden gerçek sunucu koduyla üretilir; hiçbir istek Vercel'e gitmez), Giderler tablosunun 1440–1024 px genişlikleri ve mobil sabit üst çubuk. Çalıştırma: `bash tests/integration/start.sh && node tests/integration/panel/panel-ui.cjs "$ITEST_OUT"`.

`panel/panel-screens.cjs` (gerçek saat; `panel/seed-screens.sql` sentetik kayıtlarıyla): panelin bütün ekranları ortak Yoca panel tasarımında — 40 ekran (menüdekiler ve onlardan açılan detay, oluşturma ve düzenleme sayfaları) 1440, 1024 ve 390 px'te sayfa hatası olmadan açılıyor, panel başlığı düzeninde, yatay kaymıyor, yerel `<input type="date">` yok (Türkçe koyu tarih alanı), tablolar telefonda kart; tarih alanında Escape ve odak dönüşü, seçilen tarihin adres çubuğundaki filtreye yazılması ve silinince kalkması; Yeni belge penceresi; finans kullanıcısının yalnız Finans ekranlarını görmesi. Çalıştırma: `psql -h /var/tmp/yoca-itest -p 54339 -U postgres -d itest -f tests/integration/panel/seed-screens.sql && node tests/integration/panel/panel-screens.cjs "$ITEST_OUT"` (yoksa uygulamanın kendi API'siyle bir taslak belge oluşturur; başka kayıt yazmaz).

`finance/expense-docs.mts`: mevcut gider belgelerinin okunması ve gider yoluna yükleme (migration uyumu kontrolü için tek başına; Giderler paketlerinden hemen sonra, aylık görünüm paketinden önce çalıştırın).

## Bir migration'ı mevcut production koduyla denemek

Örnek: v26'yı production'daki commit'le birlikte sınamak.

```bash
git worktree add /tmp/yoca-prod <production-commit>
(cd /tmp/yoca-prod && npm ci && npm run build)
bash tests/integration/setup-db.sh        # v26 dahil tüm migration'lar
APP_DIR=/tmp/yoca-prod FAKE_NOW="2026-11-07 09:00:00" bash tests/integration/start.sh
export ITEST_FINANCE_HOME=/admin/expenses # v26 öncesi kodda finans kullanıcısının ana sayfası
set -a; . tests/integration/.env.itest; set +a
npx --prefix tests/integration tsx tests/integration/finance/expenses-e2e.mts
node tests/integration/finance/expenses-ui.cjs /tmp/yoca-itest-out "$(node -e "console.log(require('/tmp/yoca-itest-out/fin-e2e.json').opsPeriod)")"
npx --prefix tests/integration tsx tests/integration/finance/expense-docs.mts   # belgeler: Giderler testlerinden hemen sonra
node tests/integration/finance/month-ui.cjs /tmp/yoca-itest-out                  # Giderler tablolarını boşaltır; en sona
APP_DIR=/tmp/yoca-prod bash tests/integration/start.sh
npx --prefix tests/integration tsx tests/integration/finance/cron-roll.mts
```

## Notlar

- İnternet erişimi olmayan bir derleme ortamında `next build` Google Fonts'u indiremez; yalnızca o durumda `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` ile yerel bir yazı tipi yanıtı verin. Normal ortamda gerekmez.
- Paketler veritabanındaki sentetik `TEST …` kayıtlarını siler ve yeniden oluşturur; aylık görünüm paketi Giderler tablolarını tamamen boşaltır. Bu yüzden yalnızca `setup-db.sh` ile kurulan geçici veritabanında çalıştırın.
