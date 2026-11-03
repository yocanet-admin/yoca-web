-- ═══════════════════════════════════════════════════════════════
-- Yoca — five Turkish Insights DRAFTS (status DRAFT, publish_at NULL).
-- Written by Claude from the house style (no OpenAI call). Source of truth:
-- docs/insights-drafts/*.md — this file is generated from them; edit the
-- Markdown, then regenerate. Client projects are mentioned only with the
-- scope stated in lib/workData.ts; no statistics, no quotes, no results.
-- Idempotent: a row is inserted only when no row with the same (locale,
-- slug) exists; existing rows are never changed or deleted.
-- Requires v6 (insights). NOT APPLIED ANYWHERE.
-- ═══════════════════════════════════════════════════════════════

begin;

-- docs/insights-drafts/01-randevu-talebi-akisi.md
insert into public.insights (locale, slug, title, excerpt, body_md, category_key, tags, author_name, status, publish_at, related_service, cta_type, seo_title, meta_description, reading_minutes, sources, faq)
select 'tr', $yoca$hizmet-isletmelerinde-randevu-talebi-akisi$yoca$, $yoca$Hizmet işletmelerinde randevu talebini kolaylaştıran web sitesi akışı$yoca$, $yoca$Randevu formu sayfanın sonunda bekleyen bir kutu olarak kalırsa ziyaretçi oraya varmadan vazgeçebilir. Hizmet, kanıt ve talep adımlarını tek bir akışta sıralamanın pratik yolları.$yoca$, $yoca$Bir oto bakım stüdyosu, bir diş kliniği ya da bir güzellik salonu için web sitesinin en önemli işi çoğu zaman tek bir şeydir: ziyaretçinin randevu talebini kolayca bırakması. Bunun için sayfaya bir form eklemek yetmez. Ziyaretçi formu doldurmadan önce birkaç soruya yanıt arar ve bu yanıtları bulamazsa formu hiç görmeden ayrılabilir.

## Ziyaretçi formdan önce neyi bilmek ister?

Randevu almaya gelen biri genellikle üç şeyi merak eder: Bu işletme benim ihtiyacım olan hizmeti veriyor mu, işi nasıl yapıyor ve benden ne isteyecek? Sayfa bu sırayı izlediğinde form doğal bir sonraki adım olur.

İlk soru için hizmetlerin adları tek başına yeterli değildir. "İç temizlik" ya da "boya koruma" gibi başlıklar, altında hangi uygulamaların bulunduğu görülünce anlam kazanır. Her hizmet alanının açıldığında tam uygulama listesini gösterdiği bir yapı, ziyaretçinin kendi ihtiyacını o listede bulmasını sağlar. Telefonla sorulacak soruların bir kısmı da böylece sayfada yanıtlanmış olur.

İkinci soru, işin nasıl yapıldığı, en iyi görsellerle yanıtlanır. Öncesi ve sonrası karşılaştırmaları, süreç adımları ve işletmenin kendi çalışmalarından fotoğraflar burada işe yarar. Stok fotoğraflar ve genel ifadeler aynı güveni vermez; ziyaretçi bu işletmenin kendi işini görmek ister.

Üçüncü soru çoğu sitede atlanır. Form hangi bilgileri isteyecek, talep gönderildikten sonra ne olacak? Bunu formun hemen üstünde bir iki cümleyle söylemek, formu doldurma kararını kolaylaştırır.

## Bir örnek: Prime Wash Car

Prime Wash Car, Antalya'da detailing ve araç koruma hizmeti veren bir stüdyo. Yoca, stüdyonun web sitesini WordPress üzerinde tasarladı ve geliştirdi. Site, stüdyonun standardından dört hizmet alanına, sürece, vale hizmetine, galeriye ve randevu formuna akan tek ve kesintisiz bir sayfa olarak kuruldu.

Bu yapının birkaç parçası yukarıdaki üç soruya karşılık geliyor:

- Her hizmet alanı, açıldığında tüm uygulama listesini gösteriyor.
- Öncesi/sonrası kaydırıcısı boya düzeltme, far restorasyonu ve iç detaylandırmayı karşılaştırıyor.
- Randevu formu stüdyonun geri dönebilmesi için aracı, hizmeti ve tercih edilen tarihi alıyor.
- Telefonda sabit bir "Randevu al" çubuğu, sayfanın neresinde olunursa olunsun randevuya tek dokunuşla ulaşmayı sağlıyor.

Bu örneği bir yöntem göstermek için kullanıyoruz. Sitenin randevu sayısına etkisine dair ölçülmüş bir sonuç paylaşmıyoruz; böyle bir veri, müşterinin onayıyla ve kaynağıyla birlikte ayrıca yayımlanmalıdır.

## Formda hangi alanlar olmalı?

Randevu talebi formu, işletmenin geri dönerken gerçekten kullanacağı bilgileri istemelidir. Her ek alan, formu dolduran kişi için küçük bir engeldir. Bu yüzden alanları seçerken şu soruyu sormak yararlı olur: Bu bilgi olmadan geri dönüş yapabilir miyiz?

Bir oto bakım stüdyosu için araç bilgisi gerçekten gereklidir, çünkü fiyat ve süre araca göre değişir. Tercih edilen tarih de gereklidir. Buna karşılık ayrıntılı adres ya da "bizi nereden duydunuz" sorusu ilk talepte beklemeye alınabilir.

Formun bir randevu talebi mi yoksa kesin bir randevu mu oluşturduğu da açıkça yazılmalıdır. Takvime bağlı bir rezervasyon sistemi yoksa, "Talebinizi aldıktan sonra sizi arayıp uygun saati birlikte belirliyoruz" gibi bir cümle ziyaretçinin beklentisini doğru kurar. Ekibin gerçekten ne kadar sürede döndüğü bilinmiyorsa süre vermemek, tutulamayacak bir söz vermekten daha iyidir.

## Mobilde randevuya ulaşmak

Ziyaretçilerinizin ne kadarının telefondan geldiğini kendi analitik verinizden kontrol edin; bu oran işletmeden işletmeye değişir ve tahminle karar vermek için iyi bir yer değildir.

Telefonda uzun bir sayfayı kaydıran kişi, formu sayfanın sonunda aramak istemez. Sabit bir randevu çubuğu ya da düğmesi bu sorunu çözer. Burada dikkat edilecek birkaç ayrıntı var:

Düğme içeriğin önemli bir kısmını kapatmamalı. Metni kısa ve fiil ile başlayan bir ifade olmalı, örneğin "Randevu al". Dokunulduğunda kullanıcıyı formun başına götürmeli ve form alanları telefon klavyesine uygun olmalı: telefon numarası alanı sayısal klavyeyi, tarih alanı tarih seçiciyi açmalı.

## Talep geldikten sonra

Formun gönderilmesi akışın sonu değildir. Ziyaretçi gönder düğmesine bastıktan sonra ekranda ne göreceği, talebin ulaştığından emin olmasını sağlar. Bu mesaj kısa olmalı ve sıradaki adımı söylemeli.

İşletme tarafında da talebin kaybolmaması gerekir. Talepler bir e-posta kutusuna ya da bir panele düşüyorsa, kimin bakacağı ve ne zaman yanıt verileceği önceden belli olmalıdır. Sitede bir yanıt süresi yazacaksanız, bu sürenin hafta sonları ve tatiller dahil gerçekten tutulabildiğinden emin olun.

Spam ve tekrarlanan gönderimler için de basit önlemler alınabilir. Aynı içeriğin kısa sürede iki kez gönderilmesini tek talep saymak, ekibin aynı kişiyi iki kez aramasını önler.

## Kontrol listesi

Kendi sitenizi gözden geçirirken şu sorularla başlayabilirsiniz:

1. Her hizmetin altında hangi uygulamaların bulunduğu sayfada görülüyor mu?
2. İşin nasıl yapıldığını gösteren, işletmenin kendi çalışmalarından görseller var mı?
3. Form yalnızca geri dönüş için gereken bilgileri mi istiyor?
4. Formun bir talep mi yoksa kesin randevu mu oluşturduğu açıkça yazıyor mu?
5. Telefonda sayfanın her yerinden randevuya tek dokunuşla ulaşılabiliyor mu?
6. Gönderimden sonra ekranda ne olacağı söyleniyor mu?

Bu sorulardan birine "hayır" yanıtı veriyorsanız, formun renklerini ya da düğme metnini değiştirmeden önce oradan başlayın. Sitenizi bu açıdan birlikte incelemek isterseniz, iletişim sayfasından bize yazabilirsiniz.
$yoca$, $yoca$digital$yoca$, array[$yoca$web sitesi$yoca$, $yoca$randevu$yoca$, $yoca$form$yoca$, $yoca$mobil$yoca$, $yoca$hizmet işletmesi$yoca$]::text[], $yoca$Yoca$yoca$, 'DRAFT', null, $yoca$web-digital-experiences$yoca$, $yoca$contact$yoca$, $yoca$Randevu talebini kolaylaştıran web sitesi akışı$yoca$, $yoca$Hizmet işletmeleri için randevu talebi akışı: hizmet detayları, iş örnekleri, form alanları ve mobilde sabit randevu erişimi nasıl birlikte planlanır?$yoca$, 4, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.insights where locale = 'tr' and slug = $yoca$hizmet-isletmelerinde-randevu-talebi-akisi$yoca$);

-- docs/insights-drafts/02-tek-sayfalik-web-sitesi.md
insert into public.insights (locale, slug, title, excerpt, body_md, category_key, tags, author_name, status, publish_at, related_service, cta_type, seo_title, meta_description, reading_minutes, sources, faq)
select 'tr', $yoca$tek-sayfalik-web-sitesi-ne-zaman-yeterli$yoca$, $yoca$Tek sayfalık web sitesi hangi ihtiyaçlarda yeterli olur?$yoca$, $yoca$Tek sayfalık bir site, anlatılacak hikâye kısa ve ziyaretçinin yapacağı iş belliyse iyi çalışır. İçerik büyüdüğünde, birden fazla kitle olduğunda ya da arama trafiği hedeflendiğinde sınırlarına gelir.$yoca$, $yoca$Yeni bir web sitesi planlayan işletmelerin sık sorduğu sorulardan biri, her şeyin tek bir sayfada anlatılıp anlatılamayacağıdır. Tek sayfalık site daha hızlı kurulur, daha az içerik ister ve ziyaretçiyi baştan sona tek bir akışta taşır. Ancak her işletme için doğru seçim değildir.

## Tek sayfa ne zaman iyi çalışır?

Tek sayfalık site, anlatılacak hikâyenin bir oturuşta okunabilecek uzunlukta olduğu durumlarda iyi çalışır. Ziyaretçinin siteye gelme sebebi belliyse ve sayfanın sonunda yapması beklenen tek bir şey varsa, örneğin bir talep bırakmak, aramak ya da mesaj göndermek, tek sayfa bu yolu kısaltır.

Bu genellikle şu durumlarda geçerlidir:

- İşletmenin sunduğu hizmetler sınırlı sayıda ve birbirine yakın.
- Hedef kitle tek bir grup ya da birkaç yakın gruptan oluşuyor.
- Sitenin ana işi tanıtmak ve iletişim kurmak; düzenli yazı, ürün kataloğu ya da çok sayıda proje sayfası yok.
- Hızlı yayına çıkmak gerekiyor ve içerik zamanla genişleyebilir.

Uzun bir tek sayfada yükleme süresine ayrıca dikkat etmek gerekir. Galeriler, videolar ve büyük görseller aynı sayfada toplandığında, ilk ekranın açılması gecikebilir. Görselleri ziyaretçi o bölüme yaklaştıkça yüklemek ve telefon için küçültülmüş sürümler kullanmak bu gecikmeyi azaltır.

Tek sayfalık bir site kısa olmak zorunda da değildir. Bölümler net ayrıldığında ve sayfa içi menü ziyaretçiyi istediği bölüme götürdüğünde, uzun bir sayfa da rahat okunur.

## İki örnek

Yoca'nın tamamladığı iki proje bu yapıyı farklı amaçlarla kullanıyor.

SP Medya için hazırlanan site, İstanbul merkezli bir medya planlama ve satın alma ajansını tek ve kesintisiz bir sayfada anlatıyor: hakkımızda, hizmet yapısı, çalışma süreci, sektörel temsiliyet, öne çıkan işler, yönetim kadrosu ve iletişim. Hizmet yapısı etkileşimli; dört hizmet hattı tek tek açılıyor ve yanındaki diyagram mecraları strateji, planlama, aktivasyon ve ölçümlemeye bağlıyor.

Prime Wash Car'ın WordPress sitesi de tek bir sayfa: stüdyonun standardından dört hizmet alanına, sürece, vale hizmetine, galeriye ve randevu formuna akıyor. Burada tek sayfa yapısı, ziyaretçiyi hizmetlerden randevu talebine kesintisiz taşımak için kullanılıyor.

İki örnekte de sayfanın bir yönü var. Bölümler rastgele sıralanmamış; her biri bir sonrakine geçiş için gerekçe veriyor. Tek sayfalık bir sitenin işe yaraması büyük ölçüde bu sıralamaya bağlı.

## Hangi işaretler çok sayfalı yapıya geçmeyi gösterir?

Bazı durumlarda tek sayfa, işletmenin ihtiyacını karşılamakta zorlanır. Aşağıdaki işaretlerden biri ya da birkaçı varsa çok sayfalı bir yapıyı düşünmek gerekir.

**Hizmetler birbirinden çok farklı.** Bir işletme hem kurumsal danışmanlık hem de bireysel eğitim veriyorsa, iki farklı kitleye aynı sayfada seslenmek zorlaşır. Her hizmetin kendi sayfası olduğunda içerik o kitlenin sorularına göre yazılabilir.

**Arama motorlarından trafik hedefleniyor.** Tek bir sayfa birçok farklı konuda aranmaya çalıştığında, hiçbirinde güçlü bir sayfa olamayabilir. Hizmetlere, konulara ya da bölgelere göre ayrılmış sayfalar, belirli aramalara karşılık veren içerik üretmeyi kolaylaştırır. Bunun etkisi sektöre ve rekabete göre değişir; kendi arama verinizle değerlendirilmelidir.

**Düzenli içerik üretiliyor.** Blog yazıları, vaka çalışmaları, duyurular ya da etkinlikler eklenecekse, bunların ayrı sayfalara ihtiyacı vardır. Örneğin Mehmet Altıoklar için hazırlanan site; ana sayfa, hakkında sayfası, her hizmet (koçluk, atölyeler, açılış konuşmaları) için ayrı bir sayfa, blog ve iletişim sayfasından oluşuyor.

**Birden fazla dil var.** Çok dilli bir site tek sayfa olarak da kurulabilir, ancak her dilde aynı uzunlukta içerik ve doğru dil yönlendirmesi gerektiği için yapı genellikle karmaşıklaşır.

## Karar verirken sorulacak sorular

Seçim yapmadan önce şu soruları yanıtlamak işe yarar:

1. Ziyaretçi siteye hangi tek iş için geliyor? Bu iş birden fazlaysa, her biri ayrı bir sayfayı hak ediyor mu?
2. Önümüzdeki yıl siteye düzenli olarak ne eklenecek?
3. Sitenin arama motorlarından ziyaretçi getirmesi bekleniyor mu, yoksa ziyaretçiler çoğunlukla doğrudan, sosyal medyadan ya da reklamdan mı gelecek?
4. Kaç farklı kitleye sesleniliyor ve bu kitlelerin soruları birbirine ne kadar yakın?

Bu soruların çoğuna "tek iş, az ekleme, doğrudan trafik, tek kitle" yanıtı veriliyorsa, tek sayfa iyi bir başlangıçtır.

## Tek sayfadan büyümek

Tek sayfayla başlamak, sonradan büyümeyi engellemez. Sayfa bölümleri baştan net ayrılır ve içerik bölüm bölüm yazılırsa, ileride bir bölümü ayrı bir sayfaya taşımak kolaylaşır. Örneğin hizmetler bölümündeki her hizmet, gerektiğinde kendi sayfasına dönüşebilir.

Bunun için iki şeye baştan dikkat etmek yeterlidir. Birincisi, içerik bir yönetim panelinden düzenlenebilir olmalı; böylece yeni bölümler eklemek için her seferinde geliştirici gerekmez. İkincisi, ölçüm baştan kurulmalı. Ziyaretçilerin hangi bölümde ayrıldığını ve formu nereden doldurduğunu bilmek, hangi bölümün ayrı sayfaya dönüşmesi gerektiğine karar verirken somut bir dayanak sağlar.

Tek sayfa mı çok sayfa mı sorusunun her işletme için tek bir doğru yanıtı yok. Sitenizin bugünkü ve bir yıl sonraki ihtiyacını konuşmak isterseniz, Dijital Check-Up formuyla başlayabilirsiniz.
$yoca$, $yoca$digital$yoca$, array[$yoca$web sitesi$yoca$, $yoca$tek sayfa$yoca$, $yoca$site yapısı$yoca$, $yoca$içerik planı$yoca$]::text[], $yoca$Yoca$yoca$, 'DRAFT', null, $yoca$web-digital-experiences$yoca$, $yoca$contact$yoca$, $yoca$Tek sayfalık web sitesi ne zaman yeterli olur?$yoca$, $yoca$Tek sayfalık web sitesi hangi işletmeler için uygun, hangi durumlarda çok sayfalı yapıya geçmek gerekir? Karar verirken sorulacak sorular.$yoca$, 4, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.insights where locale = 'tr' and slug = $yoca$tek-sayfalik-web-sitesi-ne-zaman-yeterli$yoca$);

-- docs/insights-drafts/03-cok-dilli-web-sitesi.md
insert into public.insights (locale, slug, title, excerpt, body_md, category_key, tags, author_name, status, publish_at, related_service, cta_type, seo_title, meta_description, reading_minutes, sources, faq)
select 'tr', $yoca$cok-dilli-web-sitesinde-ceviri-disinda-kontrol-edilecekler$yoca$, $yoca$Çok dilli web sitesinde çevirinin ötesinde kontrol edilmesi gerekenler$yoca$, $yoca$Metni çevirmek çok dilli bir sitenin yalnızca bir parçası. Dil seçimi, adresler, formlar, sağdan sola yazım, tarih ve para biçimleri ile arama motoru etiketleri ayrı ayrı kontrol edilmeli.$yoca$, $yoca$Bir web sitesini ikinci ya da üçüncü bir dile açmak çoğu zaman bir çeviri işi olarak planlanır. Metinler çevrilir, sayfalar kopyalanır ve site yayına alınır. Ziyaretçi ise metnin yanında başka şeylerle de karşılaşır: hangi dilde açıldığı, menünün nasıl göründüğü, formun hangi dilde hata verdiği, tarihin nasıl yazıldığı. Bunların her biri ayrı bir kontrol gerektirir.

## Ziyaretçi hangi dilde karşılanıyor?

İlk karar, ziyaretçinin siteye girdiğinde hangi dili göreceği. Seçenekler genellikle şunlardır: tarayıcı dili, daha önce seçilmiş dil ya da varsayılan bir dil. Hangisi seçilirse seçilsin, ziyaretçinin dili kolayca değiştirebilmesi ve seçiminin hatırlanması gerekir.

Dil değiştirildiğinde ziyaretçinin aynı sayfanın diğer dildeki karşılığına gitmesi de önemlidir. Bir hizmet sayfasındayken dili değiştiren kişinin ana sayfaya atılması, aradığını yeniden bulmasını gerektirir.

## Adres yapısı ve arama motorları

Her dilin kendi adresi olmalıdır. Bu, ya alan adının altında dil klasörleriyle (örneğin /tr/, /en/) ya da ayrı alan adlarıyla yapılır. Aynı adresin ziyaretçiye göre farklı dilde içerik göstermesi, arama motorlarının sayfaları doğru dizinlemesini zorlaştırır.

Arama motorlarına bir sayfanın diğer dillerdeki karşılıklarını bildirmek için `hreflang` etiketleri kullanılır. Bu etiketlerin her dilde karşılıklı olması gerekir: Türkçe sayfa İngilizce karşılığını gösteriyorsa, İngilizce sayfa da Türkçeyi göstermelidir. Bir dilde henüz çevrilmemiş bir sayfa varsa, o dil için etiket eklenmemelidir.

Sayfa başlıkları, meta açıklamalar ve sosyal paylaşım metinleri de çevrilmelidir. Bunlar ziyaretçinin sayfayı açmadan önce gördüğü ilk metinlerdir ve çoğu zaman unutulur.

## Formlar ve hata mesajları

Formlar çok dilli sitelerde en sık atlanan yerdir. Kontrol edilecek noktalar:

- Alan etiketleri, yer tutucu metinler ve zorunlu alan uyarıları her dilde mi?
- Hata mesajları (geçersiz e-posta, eksik alan) ziyaretçinin dilinde mi geliyor?
- Gönderim sonrası onay mesajı doğru dilde mi?
- Formdan gelen talep, ekibe hangi dilden geldiği bilgisiyle mi ulaşıyor? Bu bilgi, yanıtın doğru dilde yazılması için gereklidir.
- Telefon numarası alanı farklı ülke kodlarını kabul ediyor mu?

Formun yanında yer alan kişisel veri bilgilendirmesi ve bağlantı verdiği metin de her dilde erişilebilir olmalıdır. Hukuki metinlerin çevirisi ayrıca hukuki kontrol gerektirebilir.

## Sağdan sola yazılan diller

Arapça gibi sağdan sola yazılan bir dil eklendiğinde, sayfanın yalnızca metni değil düzeni de değişir. Menü, oklar, ikonlar ve hizalamalar ters yöne dönmelidir. Bir "ileri" okunun Arapça sayfada sola bakması gerekir.

Bu yüzden tasarımın baştan yönden bağımsız kurulması işi kolaylaştırır: sol ve sağ yerine başlangıç ve bitiş kavramlarıyla çalışmak gibi. Telefon numaraları, e-posta adresleri ve Latin harfli marka adları ise sağdan sola metin içinde bile soldan sağa kalmalıdır.

## Tarih, sayı ve para biçimleri

Tarihler, sayılar ve para birimleri dillere göre farklı yazılır. Ondalık ayırıcı kimi dillerde virgül, kimisinde noktadır. Bir fiyat aralığı ya da bütçe seçeneği gösteriliyorsa, para biriminin ve biçimin her dilde doğru olduğu kontrol edilmelidir. Bu biçimleri elle yazmak yerine dilin kurallarını bilen biçimlendirme araçlarını kullanmak hataları azaltır.

## İçerik eşitliği ve yönetim

Çok dilli sitelerde zamanla diller arasında fark oluşur. Bir dilde yeni bir hizmet eklenir, diğerinde unutulur. Bunu önlemek için içerik yönetiminde her sayfanın hangi dillerde hazır olduğunu görmek gerekir.

Yoca'nın tamamladığı iki proje farklı ölçekte örnek. Sunsoft'un web sitesi Azerbaycanca, Türkçe, Rusça ve İngilizce olarak Next.js üzerinde geliştirildi; ana sayfa, altı hizmet sayfası, hakkımızda, blog ve proje talep formunu içeriyor. Cleova'nın sitesi İngilizce ve Türkçe; içerik Sanity ile yönetiliyor. Dört dilli bir sitede, iki dilli bir siteye göre her güncellemede kontrol edilecek sürüm sayısı iki katına çıkar; hangi sayfanın hangi dilde güncel olduğunu gösteren bir liste bu yüzden bakımın parçası olmalıdır.

Sayfa adreslerinin kendisi de dile göre düşünülmelidir. Türkçe bir sayfanın adresinde Türkçe, İngilizce sayfanın adresinde İngilizce kelimeler kullanmak hem ziyaretçi hem de arama motorları için daha anlaşılırdır. Adres değiştiğinde eski adresin yeni adrese yönlendirilmesi de unutulmamalıdır.

Yayın sürecine her dil için bir kontrol adımı eklemek yararlıdır. Makine çevirisi ya da yapay zekâ ile hazırlanan metinler, o dili ana dili olarak konuşan biri tarafından okunmadan yayımlanmamalıdır. Terimlerin ve marka adlarının her dilde nasıl yazılacağını gösteren kısa bir sözlük de tutarlılığı korur.

## Yayın öncesi kontrol listesi

1. Her dil kendi adresinde mi ve dil seçimi hatırlanıyor mu?
2. Dil değiştirildiğinde ziyaretçi aynı sayfanın karşılığına mı gidiyor?
3. `hreflang` etiketleri karşılıklı ve yalnızca var olan çeviriler için mi?
4. Başlıklar, meta açıklamalar ve paylaşım metinleri çevrildi mi?
5. Form etiketleri, hata ve onay mesajları her dilde mi?
6. Sağdan sola diller için düzen, oklar ve ikonlar ters çevrildi mi?
7. Tarih, sayı ve para biçimleri dile uygun mu?
8. Her dildeki metni o dili iyi bilen biri okudu mu?

Bu listedeki maddelerin çoğu, site kurulurken planlanırsa az iş çıkarır; sonradan eklendiğinde ise sayfa sayfa düzeltme gerektirir. Çok dilli bir site planlıyorsanız, kapsamı birlikte netleştirmek için bize yazabilirsiniz.
$yoca$, $yoca$digital$yoca$, array[$yoca$çok dilli site$yoca$, $yoca$çeviri$yoca$, $yoca$hreflang$yoca$, $yoca$RTL$yoca$, $yoca$form$yoca$]::text[], $yoca$Yoca$yoca$, 'DRAFT', null, $yoca$web-digital-experiences$yoca$, $yoca$contact$yoca$, $yoca$Çok dilli web sitesi: çeviriden sonra kontrol listesi$yoca$, $yoca$Çok dilli bir web sitesinde çeviri dışında neler kontrol edilmeli? Dil yönlendirmesi, hreflang, formlar, RTL düzen ve içerik yönetimi için pratik liste.$yoca$, 4, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.insights where locale = 'tr' and slug = $yoca$cok-dilli-web-sitesinde-ceviri-disinda-kontrol-edilecekler$yoca$);

-- docs/insights-drafts/04-form-gonderimi-ve-musteri-adayi.md
insert into public.insights (locale, slug, title, excerpt, body_md, category_key, tags, author_name, status, publish_at, related_service, cta_type, seo_title, meta_description, reading_minutes, sources, faq)
select 'tr', $yoca$form-gonderim-sayisi-ve-gercek-musteri-adayi$yoca$, $yoca$Web sitesi formlarında gönderim sayısı ile gerçek müşteri adayını ayırmak$yoca$, $yoca$Form raporundaki sayı; spam, tekrar gönderim, test kayıtları ve gerçek talepleri birlikte sayar. Gerçek müşteri adayını görmek için gönderimleri ayıklamak ve sonucunu takip etmek gerekir.$yoca$, $yoca$Bir web sitesinin form raporunda ay sonunda görünen sayı, çoğu zaman tek başına yorumlanır: Geçen ay kırk form gelmiş, bu ay altmış. Bu sayı arttığında pazarlamanın iyi gittiği, azaldığında kötü gittiği düşünülür. Oysa form gönderimi ile gerçek bir müşteri adayı aynı şey değildir. Aradaki farkı görmeden alınan kararlar, bütçenin yanlış kanala kaymasına yol açabilir.

## Gönderim sayısına neler karışır?

Bir formdan gelen kayıtlar genellikle birkaç gruba ayrılır.

**Otomatik spam.** Botlar, internetteki formları bulup içine bağlantı, reklam ya da anlamsız metin bırakır. Bu kayıtların bir kısmı kolay fark edilir, bir kısmı ise gerçek bir talebe benzeyecek şekilde yazılmıştır.

**Tekrar gönderimler.** Yavaş yanıt veren bir sayfada ziyaretçi düğmeye iki kez basar ya da sayfayı yeniler. Aynı kişi, aynı mesajla iki kayıt oluşturur.

**Test kayıtları.** Siteyi kuran ya da güncelleyen ekip formu dener. Bu kayıtlar raporda ayrılmazsa, özellikle yayın dönemlerinde sayıyı belirgin biçimde etkiler.

**İlgisiz talepler.** İş başvuruları, tedarikçi teklifleri, yanlış adrese yazılmış müşteri şikâyetleri. Bunlar gerçek insanlardan gelir ama satış açısından müşteri adayı değildir.

**Gerçek talepler.** Hizmetinizle ilgilenen, ihtiyacını anlatan ve iletişim bilgisi bırakan kişiler.

Raporda yalnızca toplam sayı görülüyorsa, bu grupların oranı değiştiğinde neyin değiştiğini anlamak mümkün olmaz.

## Gönderim anında ayıklamak

Bazı kayıtlar daha veritabanına girmeden ayıklanabilir. Kullanılan yöntemlerin çoğu ziyaretçiye görünmez ve formu zorlaştırmaz:

- **Gizli tuzak alanı.** İnsanların görmediği ama botların doldurduğu bir alan. Bu alan doluysa gönderim spam sayılır.
- **Formda geçen süre.** Form açıldıktan bir iki saniye sonra gönderilen kayıtlar büyük olasılıkla otomatiktir.
- **Hız sınırı.** Aynı kaynaktan kısa sürede çok sayıda gönderim yapılmasını sınırlamak. Bunu yaparken IP adresini düz metin olarak saklamamak, yalnızca tek yönlü bir özetini kısa süreliğine tutmak kişisel veri açısından daha temkinli bir yaklaşımdır.
- **Aynı içeriğin tekrarı.** Aynı e-posta adresinden, kısa süre içinde, birebir aynı içerikle gelen ikinci gönderimi tek kayıt saymak.

Bu önlemlerin her biri tek başına yeterli değildir ve hiçbiri her spamı yakalamaz. Ama birlikte kullanıldıklarında ekibin her sabah ayıklaması gereken kayıt sayısı azalır.

Bazı formlar, botlar neyin yakalandığını öğrenmesin diye spam sayılan gönderimde de ziyaretçiye başarılı bir onay gösterir. Böyle bir formda ayıklama kurallarını gereğinden sıkı tutmak, gerçek bir talebin kimse fark etmeden kaybolmasına yol açabilir. Reddedilen gönderimlerin nedenini (içeriği değil) kaydetmek, kuralların ne kadar sık devreye girdiğini görmeyi sağlar.

## Gerçek müşteri adayını tanımlamak

Ayıklamadan sonra kalan kayıtların hepsi de aynı değerde değildir. Ekibin neyi "müşteri adayı" saydığını yazılı olarak tanımlaması, raporların tutarlı olmasını sağlar. Bu tanım işletmeye göre değişir; örneğin:

- Hizmet verdiğiniz bölgede ya da pazarda mı?
- Talep ettiği iş, sunduğunuz hizmetlerden biri mi?
- Bir zaman aralığı ya da bütçe sinyali var mı?
- Ulaşılabilir bir iletişim bilgisi bırakmış mı?

Formun kendisi de bu ayrımı kolaylaştırabilir. Hangi hizmetle ilgilenildiğini, hedef başlangıç dönemini ya da yaklaşık bütçe aralığını isteğe bağlı seçenekler olarak sormak, gelen talebi okumadan önce kabaca sınıflandırmayı sağlar. Burada denge önemlidir: Her yeni zorunlu alan, formu dolduranların bir kısmını vazgeçirebilir.

## Formdan sonraki adımı ölçmek

Gerçek müşteri adayını görmenin en güvenilir yolu, formun sonrasını takip etmektir. Her talep için birkaç basit durum kaydı tutmak yeterlidir: yanıtlandı, görüşme yapıldı, teklif verildi, iş başladı ya da sonuçlanmadı.

Bu kayıtlar bir müşteri yönetim aracında, bir tabloda ya da sitenin yönetim panelinde tutulabilir. Önemli olan, her talebin hangi kanaldan geldiğinin de kaydedilmesidir. Böylece ay sonunda "hangi kanal kaç form getirdi" sorusunun yanında "hangi kanal kaç görüşmeye ve işe dönüştü" sorusu da yanıtlanabilir.

Reklam platformlarına dönüşüm olarak form gönderimini bildiriyorsanız, bu verinin spam ve tekrarları da içerebileceğini hesaba katın. Kampanyanız bildirilen dönüşümlere göre otomatik ayarlanıyorsa, şişkin bir sayı ayarı da yanlış yöne çeker; kullandığınız platformun dönüşüm ayarlarını bu açıdan kontrol edin.

## Ayıklanan kayıtları ara ara gözden geçirmek

Otomatik kurallar zamanla eskir. Botlar davranış değiştirir, form değişir, yeni bir kampanya farklı bir kitle getirir. Bu yüzden ayda bir kez, reddedilen gönderimlerin nedenlerine ve gerçek talep olarak kaydedilenlerin bir örneğine bakmak iyi bir alışkanlıktır. Bir kuralın beklenenden çok sık devreye girdiği görülüyorsa, gerçek ziyaretçileri de yakalıyor olabilir. Gerçek talep listesinde aynı türden spam tekrar ediyorsa, yeni bir kural gerekebilir.

## Kontrol listesi

1. Form raporunuz spam, tekrar ve test kayıtlarını ayırıyor mu?
2. Formda görünmez spam önlemleri var mı ve reddedilen gönderimlerin nedeni kaydediliyor mu?
3. Ekip "müşteri adayı"nın ne olduğunu yazılı olarak tanımladı mı?
4. Her talebin hangi kanaldan geldiği kaydediliyor mu?
5. Talebin sonrası (görüşme, teklif, iş) takip ediliyor mu?
6. Reklam platformlarına bildirilen dönüşüm, ayıklanmış veriye mi dayanıyor?

Gönderim sayısı yine de izlenmeye değer bir göstergedir; yalnızca tek başına okunmamalıdır. Formlarınızın ve ölçüm yapınızın bugünkü durumunu görmek isterseniz, Dijital Check-Up ile başlayabilirsiniz.
$yoca$, $yoca$growth$yoca$, array[$yoca$form$yoca$, $yoca$müşteri adayı$yoca$, $yoca$spam$yoca$, $yoca$ölçümleme$yoca$, $yoca$dönüşüm$yoca$]::text[], $yoca$Yoca$yoca$, 'DRAFT', null, $yoca$growth-performance$yoca$, $yoca$checkup$yoca$, $yoca$Form gönderimi mi, gerçek müşteri adayı mı?$yoca$, $yoca$Web sitesi formlarında gönderim sayısı neden yanıltır? Spam, tekrar gönderim ve test kayıtlarını ayırıp gerçek müşteri adaylarını izlemenin yolları.$yoca$, 4, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.insights where locale = 'tr' and slug = $yoca$form-gonderim-sayisi-ve-gercek-musteri-adayi$yoca$);

-- docs/insights-drafts/05-marka-site-reklam-birlikte.md
insert into public.insights (locale, slug, title, excerpt, body_md, category_key, tags, author_name, status, publish_at, related_service, cta_type, seo_title, meta_description, reading_minutes, sources, faq)
select 'tr', $yoca$marka-kimligi-web-sitesi-ve-reklam-mesajini-birlikte-planlamak$yoca$, $yoca$Marka kimliği, web sitesi ve reklam mesajını birlikte planlamak$yoca$, $yoca$Logo bir ekipte, site başka bir ekipte, reklamlar üçüncü bir yerde hazırlandığında ziyaretçi her adımda farklı bir işletmeyle karşılaşır. Ortak bir mesaj ve sıralı bir plan bu kopukluğu azaltır.$yoca$, $yoca$Birçok işletme marka kimliğini, web sitesini ve reklamlarını farklı zamanlarda, farklı kişilerle hazırlar. Önce bir logo yaptırılır, birkaç yıl sonra bir site kurulur, ardından bir ajans ya da serbest çalışan reklam vermeye başlar. Her parça kendi içinde iyi olabilir. Sorun, ziyaretçinin bu parçaları birkaç dakika içinde art arda görmesidir: reklamda bir vaat okur, siteye geldiğinde başka bir dil görür, formda üçüncü bir tonla karşılaşır.

## Kopukluk nerede ortaya çıkar?

Ziyaretçi bir reklamı tıkladığında, reklamda gördüğü şeyin devamını bekler. Reklam belirli bir hizmeti öne çıkarıyorsa ama tıklama genel bir ana sayfaya gidiyorsa, ziyaretçi o hizmeti kendisi aramak zorunda kalır. Reklamdaki görsel dil ile sitedeki görsel dil birbirine benzemiyorsa, doğru yere gelip gelmediğinden emin olamaz.

Benzer bir kopukluk marka ile site arasında da oluşur. Marka kimliği hazırlanırken belirlenen renkler, yazı tipleri ve ses tonu, site yapılırken bir kılavuz olarak kullanılmazsa, site markanın küçük bir uyarlaması olarak kalır. Zamanla reklam görselleri de bu iki kaynaktan birini ya da hiçbirini izlemeye başlar.

Bu kopukluğun maliyeti için genel bir oran vermiyoruz; her işletmede farklıdır ve ancak kendi verinizle ölçülebilir. Nedenini görmek ise kolaydır: Ziyaretçi her adımda yeniden karar vermek zorunda kalır.

## Ortak bir mesajla başlamak

Birlikte planlamanın ilk adımı, üç parçanın da dayanacağı kısa bir mesaj belgesi hazırlamaktır. Bu belge uzun olmak zorunda değildir. Şu sorulara yanıt vermesi yeterlidir:

- İşletme kime, hangi işi yapıyor?
- Bu kişiler bizi neden seçmeli? (Kanıtlanabilir nedenler: deneyim yılı, sertifika ya da ölçülmüş sonuç yazılacaksa kaynağı belli olmalı.)
- Hangi hizmetler öne çıkacak ve her birinin tek cümlelik açıklaması ne?
- Ses tonu nasıl? Resmî mi, samimi mi, teknik mi?
- Ziyaretçiden beklediğimiz ilk adım ne? Arama, form, randevu talebi, mağaza ziyareti?

Bu belge hazır olduğunda marka tasarımı, site metinleri ve reklam metinleri aynı kaynaktan beslenir. Yeni bir kampanya hazırlanırken de ilk bakılacak yer burası olur.

## Görsel dili bir sistem olarak kurmak

Marka kimliği yalnızca bir logodan ibaret olmadığında, site ve reklam için kullanılabilir hâle gelir. Renk paleti, yazı tipleri, fotoğraf ya da illüstrasyon tarzı ve sık kullanılan bileşenler (düğmeler, başlık yapıları, etiketler) bir arada tanımlanırsa, her yeni materyal sıfırdan tasarlanmaz.

Yoca'nın projelerinden Cleova ve Sunsoft'ta kapsam marka ve siteyi birlikte içeriyordu. Cleova için Yoca, cilt bakım markasının marka varlığını ve web sitesini kurdu: ürün sayfaları, cilt bakım rutini, Routine Finder ve journal; site büyük serif tipografi, markanın kendi fotoğrafları ve cömert boşluklarla bir editoryal dergi gibi okunuyor. Sunsoft için Yoca, web sitesini ve sitenin taşıdığı görsel dili tasarlayıp geliştirdi; sitedeki mesaj tek cümle etrafında kuruldu: marka, web sitesi ve online satış tek ekip tarafından. Bu örnekler kapsamı göstermek içindir; projelerin reklam sonuçlarına dair ölçülmüş bir veri paylaşmıyoruz.

## Reklamdan siteye giden yolu planlamak

Reklam hazırlanırken her reklam grubunun hangi sayfaya gideceği baştan belirlenmelidir. Genel bir ana sayfa yerine, reklamda söz edilen hizmetin sayfası ya da o hizmetin anlatıldığı bölüm hedef olmalıdır. Sayfanın ilk ekranında reklamdaki vaadin devamı görünmeli: aynı ifade, benzer görsel, aynı çağrı.

Bunun için sitenin yapısının reklam planına uygun olması gerekir. Her önemli hizmetin kendi sayfası ya da kendi bölümü yoksa, reklamlar için ayrı açılış sayfaları hazırlanabilir. Bu sayfalar da aynı görsel sistemi ve mesaj belgesini izlemelidir.

## Ölçümü ortak kurmak

Üç parça birlikte planlandığında ölçüm de birlikte kurulabilir. Bir reklamın getirdiği ziyaretçinin hangi sayfada formu doldurduğu, gönderimlerden hangilerinin gerçek müşteri adayı olduğu ve hangilerinin işe dönüştüğü tek bir zincirde izlenir. Böylece "reklam çalışıyor mu" sorusu, "hangi mesaj hangi müşteriyi getiriyor" sorusuna dönüşür.

Ölçüm planında şu noktaları baştan kararlaştırmak işe yarar: Kampanya bağlantılarında hangi etiketler kullanılacak, sitede hangi olaylar sayılacak, form gönderimleri hangi durumlarla takip edilecek ve bu verilere kim bakacak.

Bu verilere düzenli bakan birinin olması da planın parçasıdır. Ölçüm kurulup kimse raporu okumazsa, kopukluk yine fark edilmeden sürer.

## Küçük bir ekiple nereden başlanır?

Her şeyi aynı anda yenilemek gerekmez. Sırayla ilerlemek için:

1. Mesaj belgesini yazın ve mevcut site metinlerini bu belgeyle karşılaştırın.
2. Marka kimliğinizde site ve reklam için eksik kalan parçaları (renk kodları, yazı tipleri, görsel tarzı) tamamlayın.
3. En çok reklam verdiğiniz hizmet için reklamdan siteye giden yolu kontrol edin: ilk ekran reklamın devamı mı?
4. Ölçüm zincirini bu tek hizmet için kurun ve bir dönem izleyin.

Bu adımlar küçük görünür ama her biri bir sonrakini kolaylaştırır. Marka, site ve reklamı birlikte ele almak isterseniz, mevcut durumunuzu konuşmak için bize yazabilirsiniz.
$yoca$, $yoca$brand$yoca$, array[$yoca$marka kimliği$yoca$, $yoca$web sitesi$yoca$, $yoca$reklam$yoca$, $yoca$mesaj$yoca$, $yoca$planlama$yoca$]::text[], $yoca$Yoca$yoca$, 'DRAFT', null, $yoca$brand-strategy-identity$yoca$, $yoca$contact$yoca$, $yoca$Marka, web sitesi ve reklamı birlikte planlamak$yoca$, $yoca$Marka kimliği, web sitesi ve reklam mesajı ayrı ayrı hazırlandığında ne olur? Ortak mesaj, görsel dil ve ölçüm için birlikte planlama adımları.$yoca$, 4, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.insights where locale = 'tr' and slug = $yoca$marka-kimligi-web-sitesi-ve-reklam-mesajini-birlikte-planlamak$yoca$);

commit;
