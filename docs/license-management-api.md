# license.yoca.net — yönetim API'si sözleşmesi (kokpit entegrasyonu için)

Durum (Kasım 2026): license.yoca.net'te **sunucudan sunucuya yönetim API'si yok**. Yönetici işlemleri Better Auth + zorunlu 2FA arkasındaki sunucu eylemleriyle yapılıyor. Kod `yocanet/yoca-license-platform` deposunda (Next.js 16, Neon Postgres, Drizzle). Bu oturumun o depoya erişimi yok. Kokpit bu yüzden lisans işlemlerini **göndermiyor**, yalnızca bağlantıları (`ops_license_links`) tutuyor. Lisans sistemi asıl kaynak olarak kalıyor.

Lisans platformuna eklenmesi gereken dar API aşağıda. Kokpit tarafı (`lib/ops/licenseApi.ts`, `app/api/admin/ops/licenses`) bu sözleşmeye göre hazır.

## Kimlik doğrulama
- Her istekte şu başlıklar bulunur:
  - `X-Yoca-Key-Id`
  - `X-Yoca-Timestamp` (unix saniye, ±300 sn)
  - `X-Yoca-Signature` = `hex(HMAC-SHA256(secret, ts + "\n" + METHOD + "\n" + path_with_query + "\n" + hex(sha256(body))))`
- Değişiklik isteklerinde ayrıca `Idempotency-Key: <uuid>` gönderilir. Aynı anahtarla gelen tekrar, ilk sonucu döndürür ve ikinci bir kayıt oluşturmaz.
- Anahtar yalnızca bu API'yi açar. Lisans doğrulama uçlarını (`/api/v1/activate|validate|deactivate`) hiç etkilemez.
- Denetim kaydı (`audit_logs`): `actor_type = 'service'`, `actor = <key id>`, `request_id = Idempotency-Key`.

## Uçlar (yanıt zarfı mevcut biçim: `{ ok, code, message, request_id, data }`)

| Yöntem | Yol | Gövde | `data` |
|---|---|---|---|
| GET | `/api/v1/admin/licenses?limit&cursor` | — | `{ licenses: License[], next_cursor }` |
| GET | `/api/v1/admin/licenses/:id` | — | `{ license: License }` (aktivasyonlarla) |
| POST | `/api/v1/admin/licenses` | `{ product_id, customer: { name, email? }, expires_at \| null, activation_limit, notes? }` | `{ id, license, key? }` (anahtar yalnız bu yanıtta, bir kez) |
| POST | `/api/v1/admin/licenses/:id/extend` | `{ expires_at, note? }` | `{ license }` |
| POST | `/api/v1/admin/licenses/:id/suspend` | `{ reason }` | `{ license }` |
| POST | `/api/v1/admin/licenses/:id/resume` | `{ note? }` | `{ license }` |
| POST | `/api/v1/admin/licenses/:id/revoke` | `{ reason }` | `{ license }` (geri alınamaz) |
| GET | `/api/v1/admin/requests/:idempotencyKey` | — | `{ status: 'succeeded' \| 'failed' \| 'not_found', result? }` |

`License` alanları mevcut şemadan gelir:
- `id`, `product{id,name,slug}`, `customer{id,name,email}`, `key_masked`;
- `status` (active, suspended, revoked);
- `activation_limit`, `expires_at` (null = süresiz), `issued_at`, `suspended_at`, `revoked_at`, `notes`;
- `activations[{domain, environment, status, last_validated_at}]`.

Bugünkü şemada bulunmayan alanlar: deneme bayrağı, plan/paket, destek/güncelleme bitişi. Bunlar eklenene kadar kokpit bu alanları "lisans sisteminde yok" diye gösterir.

## Kokpit tarafı ortam değişkenleri (yalnız adlar)
`YOCA_LICENSE_API_URL`, `YOCA_LICENSE_API_KEY_ID`, `YOCA_LICENSE_API_SECRET`

## Kokpitin davranışı
- **Liste:** her açılışta canlı okunur ve okuma zamanıyla gösterilir. Hata olursa eski veri güncelmiş gibi sunulmaz.
- **İşlemler:** her işlemin istek anahtarı ve sonucu `ops_license_ops`'ta tek satır olarak tutulur.
  - Çift tıklama ya da tekrar aynı satırı döndürür.
  - Zaman aşımında durum "bilinmiyor" olur. "Tekrar dene" önce `GET /requests/:key` ile kontrol eder; lisans sistemi isteği hiç almadıysa aynı anahtarla gönderir, aldıysa yeniden göndermez.
- **Yetkiler:** oluşturma, uzatma, askıya alma, askıdan çıkarma ve iptal ayrı ayrı verilir (Operasyon ayarları, yönetici e-postası başına). Varsayılan olarak kimsede yok.
- **Kokpit erişilemezse:** müşteri kurulumlarının doğrulaması etkilenmez. Doğrulama license.yoca.net ile kurulum arasındadır; Ed25519 imzalı belirteçler ve ek süre kullanılır.
