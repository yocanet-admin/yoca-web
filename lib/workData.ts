import type { CaseStudyRow, Locale } from '@/types';

/**
 * Yoca — selected work / case studies (client-safe data module).
 *
 * Content is managed from the admin panel (Supabase `case_studies` table).
 * The fully localized defaults below (EN/TR/AZ/AR) act as the fallback when
 * the table is empty — and as the "import defaults" source for the admin panel.
 *
 * REAL WORK ONLY: Prime Wash Car, SP Medya, SunSoft and Mehmet Altıoklar (client work) and
 * Cleova (Yoca venture). Facts come from the owner's briefs and the live
 * sites. No metrics, results, quotes or awards are attributed to YOCA —
 * `results` stays empty until a verified, client-approved outcome exists
 * (the case page then hides that module). Empty year/market are not shown.
 */

export type CaseKind = 'client' | 'concept' | 'product' | 'experimental' | 'venture';

export interface CaseStudy {
  slug: string;
  name: string;
  sector: string;
  market: string;
  year: string;
  services: string[];
  image: string;
  kind: CaseKind;
  videoUrl?: string | null;
  liveUrl?: string | null;
  summary: string;
  problem: string;
  approach: string;
  solution: string;
  results: string;
  metricBadge?: string;
  stats?: Array<{ label: string; value: string; bar?: number }>;
  quote?: string;
  quoteAuthor?: string;
}

interface CaseStudyBase {
  slug: string;
  year: string;
  market: string;
  image: string;
  services: string[];
  kind: CaseKind;
  liveUrl: string;
}

const BASE: CaseStudyBase[] = [
  {"slug": "prime-wash-car", "year": "2026", "market": "Türkiye", "services": ["Brand", "Web", "Development"], "kind": "client", "liveUrl": "https://primewashcar.com", "image": "/work/prime-wash-car/hero.webp"},
  {"slug": "sp-medya", "year": "", "market": "Türkiye", "services": ["Web", "Development"], "kind": "client", "liveUrl": "https://www.spmedya.com", "image": "/work/sp-medya/hero.webp"},
  {"slug": "cleova", "year": "2026", "market": "", "services": ["Brand", "Web", "Development"], "kind": "venture", "liveUrl": "https://thecleova.com", "image": "/work/cleova/hero.webp"},
  {"slug": "mehmet-altioklar", "year": "", "market": "Türkiye", "services": ["Web", "Development"], "kind": "client", "liveUrl": "https://mehmetaltioklar.com", "image": "/work/mehmet-altioklar/hero.webp"},
  {"slug": "sunsoft", "year": "2026", "market": "Azerbaijan", "services": ["Identity", "Web", "Development"], "kind": "client", "liveUrl": "https://sunsoft.az", "image": "/work/sunsoft/hero.webp"},
];

type LocalizedFields = Pick<CaseStudy, 'name' | 'sector' | 'summary' | 'problem' | 'approach' | 'solution' | 'results' | 'metricBadge' | 'stats'>;

const CONTENT: Record<Locale, Record<string, LocalizedFields>> = {
  "en": {
    "prime-wash-car": {
      "name": "Prime Wash Car",
      "sector": "Automotive detailing",
      "summary": "A WordPress website for a premium detailing studio in Antalya, built around its services and appointments.",
      "problem": "Prime Wash Car is a premium detailing and vehicle-protection studio in Antalya. Its services range from interior cleaning to paint correction and protective coatings, with a valet service that collects the car and brings it back.",
      "approach": "YOCA designed and built the website on WordPress: one continuous page that moves from the studio’s standard to its four service areas, process, valet service, gallery and an appointment form.",
      "solution": "Each service area opens into its full list of treatments, and a before/after slider compares paint correction, headlight restoration and interior detailing. The appointment form collects the car, the service and a preferred date so the studio can call back; on phones a fixed “Randevu al” bar keeps booking one tap away.",
      "results": ""
    },
    "sp-medya": {
      "name": "SP Medya",
      "sector": "Media planning & buying",
      "summary": "A single-page website for Sparkle Medya, an Istanbul media planning and buying agency.",
      "problem": "Sparkle Medya is an Istanbul-based media planning and buying agency. It manages brands’ communication investment end to end — strategy, planning, buying and measurement — across TV, out-of-home, digital, radio, press and cinema.",
      "approach": "YOCA designed and built the website as one continuous page: about, service structure, working process, industry representation, featured work, leadership and contact.",
      "solution": "The service structure is interactive: four service lines open one at a time beside a diagram that connects the media channels to strategy, planning, activation and measurement. The four-step process — insight, strategy, activation, optimisation — runs as one vertical line on desktop and on phones.",
      "results": ""
    },
    "cleova": {
      "name": "Cleova",
      "sector": "Skincare",
      "summary": "The digital home of Cleova, a skincare brand in the YOCA ecosystem — products, routines and a Routine Finder in English and Turkish.",
      "problem": "Cleova is a skincare brand built within the YOCA ecosystem around four everyday products: Solvera SPF 50+ sun protection, a Deep Hydration hyaluronic serum, a Vita C 15% serum and a salicylic Gel Cleanser.",
      "approach": "YOCA built Cleova’s brand presence and website: product pages, a skincare routine, a Routine Finder, a journal and links into its Instagram, in English and Turkish — on Next.js, with content managed in Sanity.",
      "solution": "The site reads like an editorial magazine — large serif type, the brand’s own photography and generous space. The Routine Finder asks three questions about time, focus and number of steps, then assembles a morning or evening flow from Cleova products.",
      "results": ""
    },
    "sunsoft": {
      "name": "SunSoft",
      "sector": "Digital agency",
      "summary": "A four-language website for Sunsoft, a digital agency for the Azerbaijan market — six services, a blog and an on-site assistant.",
      "problem": "Sunsoft is a digital agency that brings brand, web, marketing, content, AI and digital product services together in one team for companies in the Azerbaijan market.",
      "approach": "YOCA designed and built Sunsoft’s website and the visual language it carries — in Azerbaijani, Turkish, Russian and English, on Next.js: a homepage, six service pages, about, a blog and a project enquiry form.",
      "solution": "The message is one sentence — brand, website and online sales built by one team — and every page follows it: six disciplines explained in plain language, a four-stage way of working and the situations where working together makes sense. The enquiry form asks which area a project belongs to, and the Sunsoft assistant stays one tap away on desktop and phone.",
      "results": ""
    },
    "mehmet-altioklar": {
      "name": "Mehmet Altıoklar",
      "sector": "Coaching & keynote speaking",
      "summary": "A personal website for Mehmet Altıoklar — executive coach, trainer, keynote speaker and author — built around his services, events and writing.",
      "problem": "Mehmet Altıoklar has coached leaders and managers since 2014, runs leadership and personal-development workshops and gives opening keynotes at conferences and company events. He also writes, and storytelling sits at the centre of his work.",
      "approach": "YOCA designed and built the website on WordPress with Elementor: a homepage, an about page, a page for each service — coaching, workshops and keynote talks — a blog and a contact page.",
      "solution": "The homepage opens with his handwritten “ma” mark beside a black-and-white portrait, then moves through who he is, all services, upcoming events, a contact form and his latest posts. Black, warm grey and a single purple accent keep the site personal and calm; on phones the same story reads as one column.",
      "results": ""
    }
  },
  "tr": {
    "prime-wash-car": {
      "name": "Prime Wash Car",
      "sector": "Araç detaylandırma",
      "summary": "Antalya’daki premium bir detailing stüdyosu için hizmetleri ve randevu akışı etrafında kurulan WordPress web sitesi.",
      "problem": "Prime Wash Car, Antalya’da premium detailing ve araç koruma stüdyosu. Hizmetleri iç temizlikten boya düzeltme ve koruma kaplamalarına uzanıyor; vale hizmetiyle araç bulunduğu yerden alınıp geri getiriliyor.",
      "approach": "YOCA web sitesini WordPress üzerinde tasarladı ve geliştirdi: stüdyonun standardından dört hizmet alanına, sürece, vale hizmetine, galeriye ve randevu formuna akan tek ve kesintisiz bir sayfa.",
      "solution": "Her hizmet alanı tüm uygulama listesiyle açılıyor; öncesi/sonrası kaydırıcısı boya düzeltme, far restorasyonu ve iç detaylandırmayı karşılaştırıyor. Randevu formu stüdyonun geri dönebilmesi için aracı, hizmeti ve tercih edilen tarihi alıyor; telefonda sabit “Randevu al” çubuğu randevuyu tek dokunuşta tutuyor.",
      "results": ""
    },
    "sp-medya": {
      "name": "SP Medya",
      "sector": "Medya planlama ve satın alma",
      "summary": "İstanbul merkezli medya planlama ve satın alma ajansı Sparkle Medya için tek sayfalık web sitesi.",
      "problem": "Sparkle Medya, İstanbul merkezli bir medya planlama ve satın alma ajansı. Markaların iletişim yatırımlarını strateji, planlama, satın alma ve ölçümleme odağında; TV, açıkhava, dijital, radyo, basın ve sinemada uçtan uca yönetiyor.",
      "approach": "YOCA web sitesini tek ve kesintisiz bir sayfa olarak tasarladı ve geliştirdi: hakkımızda, hizmet yapısı, çalışma süreci, sektörel temsiliyet, öne çıkan işler, yönetim kadrosu ve iletişim.",
      "solution": "Hizmet yapısı etkileşimli: dört hizmet hattı tek tek açılıyor, yanındaki diyagram mecraları strateji, planlama, aktivasyon ve ölçümlemeye bağlıyor. İçgörü, strateji, aktivasyon ve optimizasyondan oluşan dört adımlı süreç masaüstünde ve telefonda tek bir dikey çizgi olarak ilerliyor.",
      "results": ""
    },
    "cleova": {
      "name": "Cleova",
      "sector": "Cilt bakımı",
      "summary": "YOCA ekosistemindeki cilt bakım markası Cleova’nın dijital evi — ürünler, rutinler ve Routine Finder, İngilizce ve Türkçe.",
      "problem": "Cleova, YOCA ekosistemi içinde dört günlük ürün etrafında kurulan bir cilt bakım markası: Solvera SPF 50+ güneş koruyucu, Deep Hydration hyalüronik serum, Vita C 15% serum ve salisilik Gel Cleanser.",
      "approach": "YOCA, Cleova’nın marka varlığını ve web sitesini kurdu: ürün sayfaları, cilt bakım rutini, Routine Finder, journal ve Instagram bağlantıları; İngilizce ve Türkçe, Next.js üzerinde, içerik Sanity ile yönetiliyor.",
      "solution": "Site bir editoryal dergi gibi okunuyor — büyük serif tipografi, markanın kendi fotoğrafları ve cömert boşluklar. Routine Finder zaman, odak ve adım sayısı üzerine üç soru sorup Cleova ürünlerinden bir sabah ya da akşam akışı kuruyor.",
      "results": ""
    },
    "sunsoft": {
      "name": "SunSoft",
      "sector": "Dijital ajans",
      "summary": "Azerbaycan pazarına hizmet veren dijital ajans Sunsoft için dört dilli web sitesi — altı hizmet, blog ve site içi asistan.",
      "problem": "Sunsoft; marka, web, pazarlama, içerik, yapay zekâ ve dijital ürün hizmetlerini Azerbaycan pazarındaki şirketler için tek bir ekipte bir araya getiren bir dijital ajans.",
      "approach": "YOCA, Sunsoft’un web sitesini ve taşıdığı görsel dili tasarladı ve geliştirdi — Azerbaycanca, Türkçe, Rusça ve İngilizce, Next.js üzerinde: ana sayfa, altı hizmet sayfası, hakkımızda, blog ve proje talep formu.",
      "solution": "Mesaj tek cümle — marka, web sitesi ve online satış tek ekip tarafından — ve her sayfa onu izliyor: sade bir dille anlatılan altı disiplin, dört aşamalı çalışma biçimi ve birlikte çalışmanın anlamlı olduğu durumlar. Talep formu projenin hangi alana ait olduğunu soruyor; Sunsoft asistanı masaüstünde ve telefonda tek dokunuş uzakta duruyor.",
      "results": ""
    },
    "mehmet-altioklar": {
      "name": "Mehmet Altıoklar",
      "sector": "Koçluk ve konuşmacılık",
      "summary": "Yönetici koçu, eğitmen, konuşmacı ve yazar Mehmet Altıoklar için hizmetleri, etkinlikleri ve yazıları etrafında kurulan kişisel web sitesi.",
      "problem": "Mehmet Altıoklar 2014’ten beri liderlere ve yöneticilere koçluk yapıyor; liderlik ve kişisel gelişim atölyeleri düzenliyor, konferans ve kurum etkinliklerinde açılış konuşmaları veriyor. Aynı zamanda yazıyor; işinin merkezinde hikâye anlatıcılığı var.",
      "approach": "YOCA web sitesini WordPress ve Elementor ile tasarladı ve geliştirdi: ana sayfa, hakkında sayfası, her hizmet için ayrı bir sayfa — koçluk, atölyeler ve açılış konuşmaları — blog ve iletişim sayfası.",
      "solution": "Ana sayfa, siyah-beyaz portrenin yanındaki el yazısı “ma” imzasıyla açılıyor; ardından kim olduğu, tüm hizmetler, yaklaşan etkinlikler, iletişim formu ve son yazılarla devam ediyor. Siyah, sıcak gri ve tek bir mor vurgu siteyi kişisel ve sakin tutuyor; telefonda aynı hikâye tek sütunda okunuyor.",
      "results": ""
    }
  },
  "az": {
    "prime-wash-car": {
      "name": "Prime Wash Car",
      "sector": "Avtomobil detailingi",
      "summary": "Antalyadakı premium detailing studiyası üçün xidmətlər və görüş qeydiyyatı ətrafında qurulmuş WordPress veb-saytı.",
      "problem": "Prime Wash Car Antalyada premium detailing və avtomobil qoruma studiyasıdır. Xidmətləri salon təmizliyindən boya bərpasına və qoruyucu örtüklərə qədər uzanır; vale xidməti avtomobili olduğu yerdən götürüb geri gətirir.",
      "approach": "YOCA veb-saytı WordPress üzərində dizayn edib qurdu: studiyanın standartından dörd xidmət sahəsinə, prosesə, vale xidmətinə, qalereyaya və görüş formasına axan vahid səhifə.",
      "solution": "Hər xidmət sahəsi bütün prosedur siyahısı ilə açılır; əvvəl/sonra sürüşdürücüsü boya bərpasını, fara bərpasını və salon detailingini müqayisə edir. Görüş forması studiyanın geri zəng edə bilməsi üçün avtomobili, xidməti və istənilən tarixi soruşur; telefonda sabit “Randevu al” paneli qeydiyyatı bir toxunuş məsafəsində saxlayır.",
      "results": ""
    },
    "sp-medya": {
      "name": "SP Medya",
      "sector": "Media planlama və satınalma",
      "summary": "İstanbulda yerləşən media planlama və satınalma agentliyi Sparkle Medya üçün tək səhifəlik veb-sayt.",
      "problem": "Sparkle Medya İstanbulda yerləşən media planlama və satınalma agentliyidir. Brendlərin kommunikasiya investisiyalarını strategiya, planlama, satınalma və ölçmə üzrə — TV, açıq hava, rəqəmsal, radio, mətbuat və kinoda — başdan sona idarə edir.",
      "approach": "YOCA veb-saytı vahid, fasiləsiz səhifə kimi dizayn edib qurdu: haqqımızda, xidmət strukturu, iş prosesi, sektor təmsilçiliyi, seçilmiş işlər, rəhbərlik və əlaqə.",
      "solution": "Xidmət strukturu interaktivdir: dörd xidmət xətti bir-bir açılır, yanındakı diaqram media kanallarını strategiya, planlama, aktivasiya və ölçmə ilə birləşdirir. Dörd addımlı proses — anlayış, strategiya, aktivasiya, optimallaşdırma — həm masaüstündə, həm telefonda vahid şaquli xətt kimi irəliləyir.",
      "results": ""
    },
    "cleova": {
      "name": "Cleova",
      "sector": "Dəriyə qulluq",
      "summary": "YOCA ekosistemindəki dəriyə qulluq brendi Cleova-nın rəqəmsal evi — məhsullar, rutinlər və Routine Finder, ingilis və türk dillərində.",
      "problem": "Cleova YOCA ekosistemində dörd gündəlik məhsul ətrafında qurulmuş dəriyə qulluq brendidir: Solvera SPF 50+ günəşdən qoruyucu, Deep Hydration hialuron serumu, Vita C 15% serumu və salisil turşulu Gel Cleanser.",
      "approach": "YOCA Cleova-nın brend varlığını və veb-saytını qurdu: məhsul səhifələri, dəriyə qulluq rutini, Routine Finder, jurnal və Instagram keçidləri — ingilis və türk dillərində, Next.js üzərində, məzmun Sanity ilə idarə olunur.",
      "solution": "Sayt redaksiya jurnalı kimi oxunur — iri serif tipoqrafiya, brendin öz fotoşəkilləri və geniş boşluqlar. Routine Finder vaxt, fokus və addım sayı haqqında üç sual verir, sonra Cleova məhsullarından səhər və ya axşam axını qurur.",
      "results": ""
    },
    "sunsoft": {
      "name": "SunSoft",
      "sector": "Rəqəmsal agentlik",
      "summary": "Azərbaycan bazarında fəaliyyət göstərən rəqəmsal agentlik Sunsoft üçün dörddilli veb-sayt — altı xidmət, bloq və saytdaxili köməkçi.",
      "problem": "Sunsoft brend, veb, marketinq, məzmun, süni intellekt və rəqəmsal məhsul xidmətlərini Azərbaycan bazarında fəaliyyət göstərən şirkətlər üçün bir komandada birləşdirən rəqəmsal agentlikdir.",
      "approach": "YOCA Sunsoft-un veb-saytını və onun daşıdığı vizual dili dizayn edib qurdu — Azərbaycan, türk, rus və ingilis dillərində, Next.js üzərində: ana səhifə, altı xidmət səhifəsi, haqqımızda, bloq və layihə sorğusu forması.",
      "solution": "Mesaj bir cümlədir — brend, sayt və onlayn satış bir komanda ilə — və hər səhifə onu izləyir: sadə dildə izah olunan altı istiqamət, dörd mərhələli iş qaydası və birgə işin məntiqli olduğu hallar. Sorğu forması layihənin hansı sahəyə aid olduğunu soruşur; Sunsoft köməkçisi masaüstündə və telefonda bir toxunuş məsafəsindədir.",
      "results": ""
    },
    "mehmet-altioklar": {
      "name": "Mehmet Altıoklar",
      "sector": "Kouçinq və spikerlik",
      "summary": "İcraçı kouç, təlimçi, spiker və müəllif Mehmet Altıoklar üçün xidmətləri, tədbirləri və yazıları ətrafında qurulmuş şəxsi veb-sayt.",
      "problem": "Mehmet Altıoklar 2014-cü ildən liderlərə və menecerlərə kouçinq edir, liderlik və şəxsi inkişaf emalatxanaları keçirir, konfrans və korporativ tədbirlərdə açılış nitqləri söyləyir. O, həm də yazır; işinin mərkəzində hekayə anlatma dayanır.",
      "approach": "YOCA veb-saytı WordPress və Elementor üzərində dizayn edib qurdu: ana səhifə, haqqında səhifəsi, hər xidmət üçün ayrıca səhifə — kouçinq, emalatxanalar və açılış nitqləri — bloq və əlaqə səhifəsi.",
      "solution": "Ana səhifə ağ-qara portretin yanındakı əl yazısı ilə “ma” imzası ilə açılır, sonra onun kim olduğu, bütün xidmətlər, qarşıdakı tədbirlər, əlaqə forması və son yazılarla davam edir. Qara, isti boz və tək bənövşəyi vurğu saytı şəxsi və sakit saxlayır; telefonda eyni hekayə bir sütunda oxunur.",
      "results": ""
    }
  },
  "ar": {
    "prime-wash-car": {
      "name": "Prime Wash Car",
      "sector": "العناية بالسيارات",
      "summary": "موقع ووردبريس لاستوديو فاخر للعناية بالسيارات في أنطاليا، مبني حول خدماته وحجز المواعيد.",
      "problem": "Prime Wash Car استوديو فاخر للعناية بالسيارات وحمايتها في أنطاليا. تمتد خدماته من تنظيف المقصورة إلى تصحيح الطلاء وطبقات الحماية، مع خدمة صفّ تستلم السيارة وتعيدها.",
      "approach": "صمّمت YOCA الموقع وبنته على ووردبريس: صفحة واحدة متصلة تنتقل من معيار الاستوديو إلى مجالات الخدمة الأربعة والعملية وخدمة الصفّ والمعرض ونموذج حجز الموعد.",
      "solution": "ينفتح كل مجال خدمة على قائمة معالجاته الكاملة، ويقارن شريط «قبل/بعد» بين تصحيح الطلاء وترميم المصابيح وتنظيف المقصورة. يجمع نموذج الموعد السيارة والخدمة والتاريخ المفضّل ليتصل الاستوديو لاحقًا، وعلى الهاتف يُبقي شريط «Randevu al» الثابت الحجز على بُعد لمسة.",
      "results": ""
    },
    "sp-medya": {
      "name": "SP Medya",
      "sector": "تخطيط وشراء إعلامي",
      "summary": "موقع من صفحة واحدة لـ Sparkle Medya، وكالة تخطيط وشراء إعلامي في إسطنبول.",
      "problem": "Sparkle Medya وكالة تخطيط وشراء إعلامي مقرها إسطنبول. تدير استثمارات العلامات في التواصل من البداية إلى النهاية — الاستراتيجية والتخطيط والشراء والقياس — عبر التلفزيون والإعلانات الخارجية والرقمية والراديو والصحافة والسينما.",
      "approach": "صمّمت YOCA الموقع وبنته كصفحة واحدة متصلة: من نحن، وهيكل الخدمات، ومنهجية العمل، والتمثيل القطاعي، والأعمال المميزة، والإدارة، والتواصل.",
      "solution": "هيكل الخدمات تفاعلي: تنفتح خطوط الخدمة الأربعة واحدًا تلو الآخر بجانب مخطط يربط القنوات الإعلامية بالاستراتيجية والتخطيط والتفعيل والقياس. وتسير المنهجية ذات الخطوات الأربع — الفهم، الاستراتيجية، التفعيل، التحسين — كخط عمودي واحد على سطح المكتب والهاتف.",
      "results": ""
    },
    "cleova": {
      "name": "Cleova",
      "sector": "العناية بالبشرة",
      "summary": "البيت الرقمي لـ Cleova، علامة العناية بالبشرة ضمن منظومة YOCA — منتجات وروتينات و«Routine Finder» بالإنجليزية والتركية.",
      "problem": "Cleova علامة للعناية بالبشرة نشأت ضمن منظومة YOCA حول أربعة منتجات يومية: واقي الشمس Solvera SPF 50+، وسيروم Deep Hydration بحمض الهيالورونيك، وسيروم Vita C 15%، وغسول Gel Cleanser بحمض الساليسيليك.",
      "approach": "بنت YOCA حضور علامة Cleova وموقعها: صفحات المنتجات، وروتين العناية، و«Routine Finder»، ومدونة، وروابط إلى إنستغرام — بالإنجليزية والتركية على Next.js، مع إدارة المحتوى عبر Sanity.",
      "solution": "يُقرأ الموقع كمجلة تحريرية — حروف سيريف كبيرة، وصور العلامة الخاصة، ومساحات رحبة. يطرح «Routine Finder» ثلاثة أسئلة عن الوقت والتركيز وعدد الخطوات، ثم يركّب روتينًا صباحيًا أو مسائيًا من منتجات Cleova.",
      "results": ""
    },
    "sunsoft": {
      "name": "SunSoft",
      "sector": "وكالة رقمية",
      "summary": "موقع بأربع لغات لـ Sunsoft، وكالة رقمية تعمل في السوق الأذربيجانية — ست خدمات ومدونة ومساعد داخل الموقع.",
      "problem": "Sunsoft وكالة رقمية تجمع خدمات العلامة التجارية والويب والتسويق والمحتوى والذكاء الاصطناعي والمنتجات الرقمية في فريق واحد للشركات العاملة في السوق الأذربيجانية.",
      "approach": "صمّمت YOCA موقع Sunsoft واللغة البصرية التي يحملها وبنته — بالأذربيجانية والتركية والروسية والإنجليزية على Next.js: صفحة رئيسية وست صفحات خدمات وصفحة من نحن ومدونة ونموذج لطلب المشاريع.",
      "solution": "الرسالة جملة واحدة — العلامة والموقع والمبيعات عبر الإنترنت يبنيها فريق واحد — وكل صفحة تتبعها: ستة تخصصات مشروحة بلغة بسيطة، وطريقة عمل من أربع مراحل، والحالات التي يكون فيها التعاون منطقيًا. يسأل نموذج الطلب عن مجال المشروع، ويبقى مساعد Sunsoft على بُعد لمسة على سطح المكتب والهاتف.",
      "results": ""
    },
    "mehmet-altioklar": {
      "name": "Mehmet Altıoklar",
      "sector": "التدريب والخطابة",
      "summary": "موقع شخصي لـ Mehmet Altıoklar — مدرّب تنفيذي ومدرّب ومتحدث وكاتب — مبني حول خدماته وفعالياته وكتاباته.",
      "problem": "يدرّب Mehmet Altıoklar القادة والمديرين منذ عام 2014، ويقدّم ورش عمل في القيادة والتطوير الشخصي، ويلقي الكلمات الافتتاحية في المؤتمرات وفعاليات الشركات. وهو كاتب أيضًا، وفي قلب عمله يقف فن السرد.",
      "approach": "صمّمت YOCA الموقع وبنته على WordPress مع Elementor: صفحة رئيسية وصفحة تعريفية وصفحة لكل خدمة — التدريب وورش العمل والكلمات الافتتاحية — ومدونة وصفحة تواصل.",
      "solution": "تفتتح الصفحة الرئيسية بتوقيع «ma» المكتوب بخط اليد بجانب صورة بالأبيض والأسود، ثم تنتقل إلى من هو، وجميع الخدمات، والفعاليات القادمة، ونموذج التواصل، وأحدث المقالات. الأسود والرمادي الدافئ ولمسة بنفسجية واحدة تُبقي الموقع شخصيًا وهادئًا؛ وعلى الهاتف تُقرأ القصة نفسها في عمود واحد.",
      "results": ""
    }
  }
};

export function staticCaseStudies(locale: Locale): CaseStudy[] {
  const localized = CONTENT[locale] ?? CONTENT.en;
  return BASE.map((base) => ({ ...base, ...(localized[base.slug] ?? CONTENT.en[base.slug]) }));
}

/** Default rows for the admin panel's "import defaults" action. */
export function getDefaultCaseStudyRows(): Array<Omit<CaseStudyRow, 'id'>> {
  return BASE.map((base, index) => ({
    slug: base.slug,
    year: base.year,
    market: base.market,
    image_url: base.image,
    services: base.services,
    order_index: index,
    is_active: true,
    kind: base.kind,
    video_url: null,
    live_url: base.liveUrl,
    content: {
      en: CONTENT.en[base.slug],
      tr: CONTENT.tr[base.slug],
      az: CONTENT.az[base.slug],
      ar: CONTENT.ar[base.slug],
    },
  }));
}
