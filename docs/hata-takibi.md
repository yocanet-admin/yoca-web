# Hata takibi (GlitchTip)

Kokpit ve yoca.net'in **sunucu tarafı** hataları GlitchTip'e (Sentry protokolü) gider. Tarayıcı hataları henüz toplanmaz; "hareketi azalt" hydration hatası düzeltilmeden açılmaz (her sayfa açılışında olay üretir).

## Açma / kapama

- `GLITCHTIP_DSN` yalnızca **Production** ortamına eklenir. Tanımsızsa SDK hiç başlamaz.
- GlitchTip ücretsiz plan: ayda 1.000 olay, 30 gün saklama. Kota aşılınca olaylar kısılır (yaklaşık %10 düşürme, sınırın iki katında tam engel) ve faturalama kişisine e-posta gider. İsteğe bağlı aşım ücreti (on-demand) varsayılan olarak kapalıdır; açılmaz. Ödeme yöntemi eklenmez.

## Çıkıştan önce ne kalıyor (`lib/observability/scrub.ts`)

SDK ayarı: `sendDefaultPii: false`, istek gövdesi, çerezler, başlıklar (Authorization dahil), sorgu dizesi ve IP toplanmaz; izleme (tracing) ve istemci raporları kapalı.

`beforeSend` ayrıca:

- isteği yalnızca yöntem + URL yoluna indirir (sorgu ve parça gitmez),
- kullanıcı, sunucu adı ve `extra` alanlarını siler; bağlamdan yalnızca trace/runtime/os/app/device kalır,
- kalan tüm metinlerde e-posta, IBAN, JWT/Bearer/API anahtarları, gizli sorgu parametreleri, IP, telefon, kart benzeri numaralar ve para tutarlarını maskeler; `password`, `token`, `cookie`, `authorization`, `iban`, `email` gibi adlı alanları `[gizli]` yapar.

Kalan: hata türü, yığın çerçeveleri (dosya, fonksiyon, satır), rota yolu, sürüm, ortam.

**Sınır:** Kod bir değeri hata mesajının içine kendisi koyarsa, yalnızca tanınabilir biçimler maskelenir (Supabase oturum çerezi JWT biçiminde olduğu için maskelenir; rastgele biçimli bir değer maskelenmez). Kural: istek verisi, kişisel veri veya tutar hata mesajına yazılmaz.

## Kokpit'i etkilememesi

Olaylar arka planda gönderilir. Yerel denemede GlitchTip kapalıyken, yanıt vermezken (Vercel ortamı benzetimiyle de) ve DSN bozukken sayfa, API ve cron yanıt süreleri değişmedi; bozuk DSN yalnızca bir log satırı üretti.

## Derleme

`next.config.mjs` `withSentryConfig` ile sarılır: kaynak haritası yüklenmez, sürüm oluşturulmaz, derleme telemetrisi kapalı, middleware'e dokunulmaz. Tarayıcı paketi değişmez (paylaşılan First Load JS 87,5 kB, önce ve sonra). Next 14 için `experimental.instrumentationHook` açıktır.
