# Hata takibi (GlitchTip)

Kokpit ve yoca.net'in **sunucu tarafı** hataları GlitchTip'e (Sentry protokolü) gider. Tarayıcı hataları toplanmaz; "hareketi azalt" hydration hatası düzeltilmeden açılmaz (her sayfa açılışında olay üretir).

## Açma / kapama

- `GLITCHTIP_DSN` tanımsızsa SDK hiç başlamaz (varsayılan: kapalı).
- Production'a eklenmesi ayrı onayla yapılır; test için production'dan ayrı bir GlitchTip projesi kullanılır.
- GlitchTip ücretsiz plan (Hobby & Trial): ayda 1.000 olay, 30 gün saklama. Kota aşılınca olaylar kısılır ve faturalama kişisine e-posta gider. İsteğe bağlı aşım ücreti (on-demand) varsayılan olarak kapalıdır; açılmaz. Ödeme yöntemi eklenmez.

## Dışarı ne çıkabilir: izin listesi (`lib/observability/scrub.ts` → `toSafeEvent`)

SDK'nın olayından alan kopyalanmaz; yalnızca şu alanlarla **yeni** bir olay kurulur:

| Alan | Örnek | Not |
|---|---|---|
| Hata türü | `TypeError` | Tür adı gibi görünmüyorsa `Error` |
| Güvenli kod | `code 23505`, `code ECONNRESET`, `code PGRST116` | Yalnızca hatanın `code` alanı kod biçimindeyse; aksi halde sabit metin `(mesaj gönderilmez)` |
| Rota şablonu | `POST /api/admin/fin/collections/[id]` | Parametre değeri yok; yola karışan uuid → `[id]`, sayı → `[n]`, diğer değer → `[param]`; sorgu dizesi gitmez |
| Yığın konumları | dosya, fonksiyon, modül, satır, sütun, in_app | Kaynak satırı ve değişken yok; makineye özgü yol öneki kırpılır |
| Sürüm / ortam | commit SHA, `production` | |
| SDK adı ve sürümü | `sentry.javascript.nextjs 9.47.2` | SDK paket listesini zarfa kendisi ekler (paket adı + sürüm) |

Hiç çıkmaz: ham hata mesajı, istek ve yanıt gövdesi, çerez, başlıklar (Authorization dahil), sorgu parametreleri, kullanıcı ve IP, sunucu adı, `contexts` (işletim sistemi, cihaz, saat dilimi, trace), `extra`, `tags`, `modules`, breadcrumb'lar. İstisnası olmayan olaylar (`captureMessage`, log) hiç gönderilmez.

SDK ayrıca bu verileri toplamaz: `sendDefaultPii: false`, `includeLocalVariables: false`, `maxBreadcrumbs: 0`, tracing kapalı, istemci raporları kapalı; `RequestData`, `ContextLines`, `Modules`, `Console`, `LocalVariables`, `Context` ve `ProcessSession` (oturum/sürüm sağlığı zarfı) entegrasyonları kapalı.

`release` dağıtılan commit'tir (`VERCEL_GIT_COMMIT_SHA`); SDK sürümü ayrı bir alandır ve onun yerine geçmez.

`maskText` ilk sürümden kaldı (yerelde gösterilen metinler için); dışarı giden olayda serbest metin olmadığından olay için gerekmez.

## Kokpit'i etkilememesi

Olaylar arka planda gönderilir. Yerel denemede (8 Kasım, sentetik veri) GlitchTip kapalıyken, yanıt vermezken, 500 dönerken ve DSN bozukken — Vercel ortamı benzetimiyle de — hata rotası, panel sayfası ve API yanıt süreleri değişmedi; bozuk DSN yalnızca `Invalid Sentry Dsn` log satırı üretti.

## Derleme

`next.config.mjs` `withSentryConfig` ile sarılır: kaynak haritası yüklenmez, sürüm oluşturulmaz, derleme telemetrisi kapalı, middleware'e dokunulmaz. Tarayıcı paketi değişmez (paylaşılan First Load JS 87,5 kB). Next 14 için `experimental.instrumentationHook` açıktır.

Kaynak haritası yüklenmediği için yığın konumları derlenmiş dosyalardadır (ör. `.next/server/chunks/7092.js:18`). Kaynak haritası yüklemek ayrı bir karardır (GlitchTip'e kaynak kodu gider).

## Uçtan uca bağlantı doğrulaması (açık)

Olayın GlitchTip'e ulaştığı henüz doğrulanmadı. Sunucu başlangıcına bağlı bir test her sunucu örneğinde yeniden çalışabildiği için (tek olay garanti edilemez, ücretsiz kotayı tüketir) eklenmedi. Tekrar çalıştırılsa da tek olay üretmek kalıcı bir "gönderildi" kaydı gerektirir; bunun için production veritabanına yazmak veya yeni altyapı eklemek gerekir, bu da yapılmadı. Production'da DSN tanımlandıktan sonra ilk gerçek sunucu hatası GlitchTip'te izin listesine göre incelenir.

## Hesap

Mevcut hesap GlitchTip'in **ABD** sunucusunda (app.glitchtip.com), organizasyon `yoca`, Free plan. Dışarı giden olayda kişisel veri olmadığı için bölge ayrı bir hesap gerektirmedi.
