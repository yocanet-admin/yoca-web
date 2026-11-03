---
status: DRAFT
locale: tr
slug: cok-dilli-web-sitesinde-ceviri-disinda-kontrol-edilecekler
title: Çok dilli web sitesinde çevirinin ötesinde kontrol edilmesi gerekenler
excerpt: Metni çevirmek çok dilli bir sitenin yalnızca bir parçası. Dil seçimi, adresler, formlar, sağdan sola yazım, tarih ve para biçimleri ile arama motoru etiketleri ayrı ayrı kontrol edilmeli.
seo_title: Çok dilli web sitesi: çeviriden sonra kontrol listesi
meta_description: Çok dilli bir web sitesinde çeviri dışında neler kontrol edilmeli? Dil yönlendirmesi, hreflang, formlar, RTL düzen ve içerik yönetimi için pratik liste.
category: digital
tags: [çok dilli site, çeviri, hreflang, RTL, form]
related_service: web-digital-experiences
cta_type: contact
author: Yoca
note: Taslak (Claude tarafından yazıldı, OpenAI kullanılmadı). Yayından önce editör kontrolü gerekir; istatistik ve alıntı içermez. Müşteri örnekleri yalnızca lib/workData.ts'deki doğrulanmış kapsamla anlatılır.
---

Bir web sitesini ikinci ya da üçüncü bir dile açmak çoğu zaman bir çeviri işi olarak planlanır. Metinler çevrilir, sayfalar kopyalanır ve site yayına alınır. Ziyaretçi ise metnin yanında başka şeylerle de karşılaşır: hangi dilde açıldığı, menünün nasıl göründüğü, formun hangi dilde hata verdiği, tarihin nasıl yazıldığı. Bunların her biri ayrı bir kontrol gerektirir.

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
