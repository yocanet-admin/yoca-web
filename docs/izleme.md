# Zamanlanmış işlerin dış izlemesi (Healthchecks)

Kokpit'in üç Vercel Cron işi her çalışmada Healthchecks'e içeriksiz bir sinyal gönderir. İş hiç çalışmazsa, takılırsa veya kısmen başarısız olursa Healthchecks ekibe uyarı gönderir. Uyarı Kokpit'in kendi bildirimlerinden ayrıdır ve onları tekrarlamaz: yalnızca "iş çalışmadı / geç kaldı / hata verdi" der.

## Kontroller

| Kontrol (Healthchecks adı) | Rota | Vercel zamanı (UTC) | Healthchecks cron (UTC) | Tolerans | Ortam değişkeni |
|---|---|---|---|---|---|
| yoca-sabah-ozeti | `/api/cron/morning` | `30 5 * * *` | `30 5 * * *` | 30 dk | `HEALTHCHECKS_URL_MORNING` |
| yoca-operasyon | `/api/cron/ops` | `0 6,12 * * *` | `0 6,12 * * *` | 20 dk | `HEALTHCHECKS_URL_OPS` |
| yoca-site-izleme | `/api/cron/sites` | `*/15 * * * *` | `*/15 * * * *` | 10 dk | `HEALTHCHECKS_URL_SITES` |

Değişkenin değeri kontrolün ping adresidir (`https://hc-ping.com/<uuid>`). Yalnızca **Production** ortamına eklenir; Preview ve yerelde tanımsız kalır ve hiçbir şey gönderilmez.

## Sinyal kuralları (`lib/cockpit/heartbeat.ts`)

Yetkili bir çalışma başlarken `/start`, sonunda başarı (`<url>`) veya `/fail` gider. Yanlış veya eksik `CRON_SECRET` ile gelen çağrı çalışma sayılmaz, sinyal göndermez.

| İş | Başarı | Hata |
|---|---|---|
| Sabah Özeti | Bugün zaten gönderilmiş; ayarlarda kapalı; en az bir kanala ulaştı ve hiçbir kanal hata vermedi | Ayar tablosu okunamadı; bir kanal hata verdi; hiçbir kanala ulaşmadı; beklenmeyen hata |
| Operasyon | Gönderilecek bir şey yok; bugün zaten gönderilmiş; özet kapalı; gönderilmesi gereken her şey gönderildi | Giderler adımı başarısız (kısmi çalışma); özet başarısız veya hiçbir kanala ulaşmadı; bir kanal başarısız ya da sonucu belirsiz; tablo okunamadı; beklenmeyen hata |
| Site izleme | Temiz kontrol (uyarılı veya uyarısız); son 5 dakikada çalışmış olduğu için atlandı; site uyarıları ayarlarda kapalı | Siteler tablosu okunamadı; planlı Insights yayını başarısız; uyarı iletilemedi; beklenmeyen hata |

Sinyal içeriksizdir: gövde, sorgu parametresi, finans veya müşteri bilgisi yoktur. Adreste kullanıcı adı/parola, sorgu veya parça varsa ya da https değilse sinyal hiç gönderilmez.

İzleme servisi işi bozamaz: her sinyal en çok 3 saniye bekler, hata yutulur, işin kendi yanıtı değişmez. Servis yanıt vermezse iş en çok 6 saniye uzar. Loglara adres yazılmaz.

## İlk sinyalle etkinleşme

Healthchecks'te yeni bir kontrol, ilk sinyal gelene kadar "new" durumunda kalır ve uyarı üretmez. Kontroller dağıtımdan **önce** oluşturulur; her işin ilk zamanlanmış çalışması kontrolü etkinleştirir:

- site izleme: dağıtımdan sonraki ilk 15 dakika içinde
- Operasyon: sonraki 06:00 veya 12:00 UTC
- Sabah Özeti: sonraki 05:30 UTC

Bu sürelerden sonra üç kontrolün de "up" olduğu panelden doğrulanır. "new" kalan kontrol, o işin hiç çalışmadığı anlamına gelir. Etkinleştirmek için iş elle tetiklenmez (gerçek bildirim gönderebilir).

## Yerel doğrulama

`tests/heartbeat.test.ts` kuralları ve güvenlik sınırlarını sınar. Uçtan uca deneme: yerel bir Healthchecks örneği, test geçidi ve `HEALTHCHECKS_URL_*=http://127.0.0.1:8000/ping/<uuid>` ile `tests/integration/start.sh`; ardından rotalar `CRON_SECRET` ile çağrılır.
