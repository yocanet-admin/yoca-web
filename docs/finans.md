# Finans — Genel bakış, Gelirler, Giderler

Kokpit › Finans üç ekrandan oluşur. Hepsi kayıt ve takip içindir: banka işlemi, otomatik ödeme, muhasebe kaydı veya müşteriye/sağlayıcıya mesaj yoktur.

| Ekran | Adres | İçerik |
|---|---|---|
| Genel bakış | `/admin/finance` | Seçili ayın nakit hareketi ve dönem takibi; ayın para hareketleri listesi |
| Gelirler | `/admin/finance/income` | Elle eklenen gelir/alacaklar + Operasyon müşteri tahsilatları |
| Giderler | `/admin/expenses` | Giderler (bkz. `docs/giderler.md`) + Operasyon sağlayıcı ödemeleri |

Üç ekran da aynı koyu **ay/yıl seçiciyi** kullanır (`components/admin/fin/MonthPicker.tsx`): ‹ › ile önceki/sonraki ay, açılan panelde yıl ve 12 ay. Klavye: ↓/Enter açar, oklar ay değiştirir (↑/↓ üç ay), PageUp/PageDown yıl, Home/End, Enter seçer, Escape veya Tab kapatır; dışarı tıklama kapatır. Tarayıcının beyaz `input type="month"` takvimi kullanılmaz.

## İki ayrı bakış

- **Dönem takibi:** seçili aya **ait** alacak ve giderler ve bunların ne kadarının tahsil edildiği/ödendiği. Bir gider dönemi vade ayına, elle eklenen alacak “ait olduğu dönem” ayına, Operasyon tahsilatı müşteri tahsilat vadesinin ayına aittir. Tahsil edilen/ödenen, o kayıtlara yapılan **net** tutardır (iadeler düşülür); ödemenin tarihi başka ay olabilir.
- **Nakit hareketi:** seçili ayda **gerçek tarihiyle** giren ve çıkan para. Tahsilat = Gelirler + Operasyon müşteri tahsilatları (müşteriye iadeler düşülür); Ödeme = Giderler + Operasyon sağlayıcı ödemeleri (gelen iadeler düşülür). Düzeltme kayıtları para hareketi değildir; listede “nakit değil” olarak görünür, toplamlara girmez. İptal edilmiş kayıtlar hiçbir yerde sayılmaz.

Örnek: Kasım kirası Aralık’ta ödenirse Kasım dönem takibinde “ödendi”, nakit olarak Aralık çıkışında görünür.

**Net nakit farkı** = giren − çıkan, her para birimi ayrı. Kâr veya zarar değildir (tahakkuk, vergi, kur farkı içermez). Farklı para birimleri kur tanımlanmadığı için hiçbir kartta toplanmaz. Tutarı bilinmeyen kayıtlar sayılır ama 0 olarak eklenmez ve gecikmiş borç/alacak sayılmaz. Kaynakta “Ödendi” işaretli, ödeme tarihi beklenen gider dönemi (su) ayrı gösterilir: ödeme sayılmaz, kalan veya gecikmiş borca girmez.

Fazla ödeme/tahsilat gerçek değeriyle gösterilir; toplamlar eşitlensin diye hiçbir değer değiştirilmez. Ay için: beklenen = tahsil edilen − fazla − tutarı bilinmeyenlere tahsil edilen + kalan (giderlerde ayrıca + ödeme tarihi bekleyen).

## Operasyon bağlantısı (kopya yok)

Operasyon’daki “Ödemeler ve yenilemeler” hizmet takibi olarak kalır. Para kayıtları tek yerde, `ops_payments` tablosunda durur:

| Operasyon’da | Finans’ta |
|---|---|
| Müşteri tahsilatı (`direction = 'in'`) | Gelirler’de tahsilat (`fin_ops_collections`), nakitte giren |
| Sağlayıcı ödemesi (`direction = 'out'`) | Giderler’de ödeme (`fin_ops_payments`), nakitte çıkan |
| İade / gerekçeli iptal | Aynı satır üzerinden iki tarafta da aynı görünür |
| Hizmet yenilemesi, teklif/proforma, belge kesinleştirme | Para hareketi oluşturmaz |

Finans’tan Operasyon’a bağlı ödeme yalnızca kontrollü yollarla kaydedilir ve aynı satırı yazar: tahsilat `fin_ops_collect` / `fin_ops_collect_void` (yalnızca `'in'`), sağlayıcı ödemesi `fin_ops_pay` / `fin_ops_void` (yalnızca `'out'`). Yön karıştırılamaz, para birimi dönemin satış/maliyet para birimiyle aynı olmalıdır, ileri tarih kabul edilmez, aynı istek anahtarı ikinci kayıt açmaz. Veritabanında `ops_payments`’a satır ekleyen fonksiyon yalnızca bu ikisidir.

Finans kullanıcısı Operasyon tahsilatında hizmet adı/türü, müşterinin görünen adı, dönem, tahsilat vadesi, beklenen satış tutarı ve ödeme alanlarını görür; maliyet, iç notlar, giriş ipuçları, gizli referanslar ve iletişim bilgileri görünmez.

## Gelirler (elle)

`fin_receivables` (beklenen alacak) ve `fin_collections` (gerçekleşen tahsilat) ayrıdır.

- Alanlar: açıklama, kategori, isteğe bağlı kayıtlı müşteri (veya serbest metin ödeyen), ait olduğu dönem (ay), isteğe bağlı vade, beklenen tutar (boş = “Tutar bekleniyor”, asla 0), para birimi, tahsilat hesabı/yöntemi, sorumlu, not, belgeler.
- Tahsilat türleri: tahsilat, müşteriye iade, düzeltme (+/−). Kısmi ve fazla tahsilat desteklenir. Tarih gerçek tahsilat tarihidir; ileri tarih kabul edilmez, uydurulmaz.
- Tahsilatlar düzenlenmez, silinmez; yanlış kayıt gerekçeyle iptal edilir (kim/ne zaman/neden kalır).
- **Yanlış girilen beklenen tutar** tahsilattan sonra da düzeltilebilir, ama yalnızca gerekçeyle (alacak sayfasında “Beklenen tutarı düzelt”). Tahsilatlar silinmez ve değişmez; veritabanı kimin, ne zaman, hangi gerekçeyle düzelttiğini saklar, işlem geçmişi eski → yeni tutarı gösterir. Her düzeltme kendi gerekçesini ister; gerekçe sonradan değiştirilemez. Tahsilattan sonra tutar boşaltılamaz ve para birimi değiştirilemez (yanlış para biriminde açılmışsa yeni alacak açılır, yanlış tahsilatlar gerekçeyle iptal edilir).
- Alacak yalnızca geçerli tahsilatı yokken gerekçeyle iptal edilir, silinmez.
- Belgeler özel `fin-docs` deposunda (`receivable/`, `collection/`, `ops_receivable/`, `ops_collection/` yolları), üzerine yazma ve silme yok, 60 saniyelik bağlantı.

## Yetki

Finans sorumlusu (`admin_users.role = 'finance'`) Genel bakış, Gelirler ve Giderler’i yönetir: kayıt ekleme, düzenleme, tahsilat/ödeme, iade, iptal, belge, CSV. Onay veya tutar sınırı yoktur. Kural menüde değil veritabanındadır (RLS: `can_finance()`, korumalı tetikleyiciler, `security definer` fonksiyonlar) ve yönetici API’leri (`requireAdmin`) finans oturumunu reddeder. Operasyon tabloları, CRM, ayarlar/şirket sırları, kullanıcı/rol yönetimi, site içerikleri ve genel işlem geçmişi kapalıdır. Finans geçmişi (`fin_audit`) ilgili kayıtlardaki **tüm** işlemleri (yönetici dahil) gösterir; Operasyon ödemelerinde yalnızca ödeme alanları.

## Testler (yerel)

Kurulum ve çalıştırma: `tests/integration/README.md` (`setup-db.sh` → `run-finance.sh`; gerekenler: Node 20+, PostgreSQL 16, libfaketime, Playwright Chromium). Tarihe bağlı testler yerel uygulamayı sabit saatle (libfaketime, `2026-11-07 09:00 UTC` = 12:00 İstanbul) çalıştırır; uygulama kodu değişmez. Ekip özetinin 7 günlük penceresi birim testinde İstanbul gece yarısı sınırlarıyla doğrulanır (`digestExpenseItems`, `digestUntil`).

## Migration

`supabase/upgrade-v26-income.sql` (v25 gerekli). Mevcut satırlara dokunmaz; yeni tablolar/görünümler/fonksiyonlar ekler ve v25’ten üç nesneyi genişleterek yeniden oluşturur: `fin_audit` görünümü, `fin_documents_entity_check` ve “finance add fin docs” depolama kuralı. Tekrar çalıştırılabilir; geri alma adımları dosyanın sonundadır (gelir kaydı girildikten sonra önerilmez).
