import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, getRequestContext } from '@/lib/seo';
import { getCompanyInfo, getKvkkPublish } from '@/lib/siteSettings';
import { missingForNotice, noticeIsFinal } from '@/lib/companyInfo';
import { integrations } from '@/lib/cockpit/settings';

/**
 * Yoca — Aydınlatma Metni (KVKK) for the contact and Check-Up forms and the
 * Insights newsletter.
 *
 * Generated from Şirket bilgileri (admin) + what the code ACTUALLY collects
 * and where it sends it (app/api/contact, app/api/checkup, app/api/newsletter,
 * lib/newsletter, lib/formGuard, lib/spam, lib/notify, audit triggers, Vercel
 * Analytics, lead AI). Legal
 * basis, retention and cross-border transfer are shown only when filled in
 * after legal review; until then "hukuki inceleme ile doğrulanacak" is shown.
 * Recipients / transfers are listed from the real infrastructure in the code
 * and marked "değerlendirilecek"; retention is "belirlenecek".
 *
 * Until the owner switches cockpit_settings "kvkk_published" ON (default OFF;
 * the admin API refuses while a required field is missing) the page shows the
 * "TASLAK — hukuki inceleme tamamlanmadı" banner, is noindex, is not in the
 * sitemap and is not linked from the footer. The line under the contact and
 * Check-Up forms links here in every state.
 *
 * The contact and Check-Up forms collect no consent. The newsletter form has
 * its own unticked consent box (e-mail newsletter permission); its legal
 * basis (açık rıza / ticari elektronik ileti onayı, İYS) is filled in by the
 * owner after legal review, like the other legal fields.
 * Turkish first; other locales show the Turkish draft with a note.
 */

export const dynamic = 'force-dynamic';

const NOTE: Record<string, string> = {
  en: 'This notice is currently available only as a Turkish draft.',
  az: 'Bu bildiriş hazırda yalnız türkcə qaralama kimi mövcuddur.',
  ar: 'هذا الإشعار متاح حاليًا كمسودة باللغة التركية فقط.',
};

export async function generateMetadata(): Promise<Metadata> {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  const [company, flag] = await Promise.all([getCompanyInfo(), getKvkkPublish()]);
  const draft = !noticeIsFinal(company, flag);
  const meta = buildMetadata({ ctx, path: '/privacy', title: `${t.legal.noticeTitle} | Yoca`, description: 'İletişim formu, Dijital Check-Up ve Insights bülteni ile paylaşılan kişisel verilerin işlenmesine ilişkin aydınlatma metni.' });
  return draft ? { ...meta, robots: { index: false, follow: true } } : meta;
}

const TODO = <span className="font-bold text-amber-300">tamamlanacak</span>;
const LEGAL_REVIEW = <span className="rounded-sm border border-amber-400/50 px-1.5 py-0.5 text-[13px] font-bold text-amber-300">hukuki inceleme ile doğrulanacak</span>;
const TO_ASSESS = <span className="font-bold text-amber-300">değerlendirilecek</span>;
const TO_DECIDE = <span className="rounded-sm border border-amber-400/50 px-1.5 py-0.5 text-[13px] font-bold text-amber-300">belirlenecek</span>;

function Field({ label, value, required = true }: { label: string; value: string; required?: boolean }) {
  return (
    <div className="grid gap-0.5 border-b border-line py-2 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-[13px] font-bold text-subtle">{label}</dt>
      <dd className="text-[15px] text-soft">{value ? <span className="whitespace-pre-line">{value}</span> : required ? TODO : <span className="text-subtle">—</span>}</dd>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line py-8">
      <h2 className="text-[clamp(20px,2vw,26px)] font-extrabold tracking-[-0.01em]">
        <span className="me-3 text-yoca-lime">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="grid gap-3 text-[15px] leading-relaxed text-soft">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const [c, flag] = await Promise.all([getCompanyInfo(), getKvkkPublish()]);
  const missing = missingForNotice(c);
  const draft = !noticeIsFinal(c, flag);
  const env = integrations();
  const controllerType = c.controllerType === 'person' ? 'Gerçek kişi' : c.controllerType === 'company' ? 'Tüzel kişi (şirket)' : '';

  return (
    <>
      <SiteHeader t={t} path="/privacy" />
      <main id="main">
        <PageIntro eyebrow="KVKK" title={t.legal.noticeTitle} sub="İletişim formu, Dijital Check-Up formu ve Insights bülteni" compact />
        <div className="container-y relative z-[7] max-w-4xl pb-20">
          {draft && (
            <div role="note" className="mb-6 rounded-md border border-amber-400/60 bg-amber-400/10 px-5 py-4 text-[15px] text-amber-100">
              <p className="font-extrabold">TASLAK — hukuki inceleme tamamlanmadı</p>
              <p className="mt-1 text-[13px]">Bu metin, sitenin kodunda gerçekten toplanan verilere göre hazırlanmış bir taslaktır. “tamamlanacak”, “hukuki inceleme ile doğrulanacak”, “değerlendirilecek” ve “belirlenecek” olarak işaretli bölümler henüz kesinleşmedi.{missing.length ? ` Eksik: ${missing.length} alan.` : ''}</p>
            </div>
          )}
          {ctx.locale !== 'tr' && <p className="mb-6 text-[14px] text-muted">{NOTE[ctx.locale]}</p>}

          <article lang="tr" dir="ltr">
            <Section n={1} title="Veri sorumlusu">
              <dl>
                <Field label="Veri sorumlusu" value={c.controllerName} />
                <Field label="Türü" value={controllerType} />
                <Field label="Resmî adres" value={c.officialAddress} />
                <Field label="Genel iletişim" value={c.generalEmail} />
                <Field label="Kişisel veri başvuru kanalı" value={c.dataRequestChannel} />
                <Field label="KEP adresi" value={c.kep} required={false} />
                <Field label="MERSİS no" value={c.mersis} required={false} />
                <Field label="Ticaret sicili" value={c.tradeRegistry} required={false} />
                <Field label="Vergi dairesi / no" value={[c.taxOffice, c.taxNumber].filter(Boolean).join(' / ')} required={false} />
              </dl>
              <p className="text-[13px] text-subtle">“{c.brand}” bu sitenin ({c.website}) marka adıdır. Sitede gösterilen adres ({c.siteAddress}) resmî tebligat adresi olarak doğrulanmamıştır.</p>
            </Section>

            <Section n={2} title="Bu metnin kapsamı">
              <p>Bu metin {c.website} üzerindeki <b>İletişim formu</b>, <b>Dijital Check-Up formu</b> ve <b>Insights bülteni</b> kayıt formu ile paylaştığınız kişisel verileri kapsar.</p>
              <p>İletişim ve Check-Up formlarında onay kutusu yoktur; bu formlarda ticari elektronik ileti (pazarlama e-postası) izni <b>toplanmaz</b> ve bu formlarla verdiğiniz adrese bülten gönderilmez.</p>
              <p>Insights bülteni ayrı bir formdur (Insights sayfasında ve sitenin altbilgisinde). Orada, önceden işaretlenmemiş bir kutuyu kendiniz işaretleyerek yeni Insights yazılarının e-postayla gönderilmesini kabul edersiniz. Kayıt, e-postanıza gelen onay bağlantısına tıkladığınızda tamamlanır; onaylanmayan adrese bülten gönderilmez. Her bülten e-postasındaki bağlantıyla istediğiniz an ayrılabilirsiniz.</p>
            </Section>

            <Section n={3} title="Hangi verileri işliyoruz">
              <h3 className="font-extrabold text-white">İletişim formu</h3>
              <ul className="list-disc ps-5">
                <li>Ad soyad, e-posta adresi (zorunlu), şirket veya marka adı (isteğe bağlı)</li>
                <li>Proje mesajınız (zorunlu); isteğe bağlı olarak telefon numarası, web sitesi adresi, ihtiyaç duyulan sistemler, tahmini bütçe aralığı ve hedef başlangıç dönemi — bu isteğe bağlı bilgiler mesaj metninin içinde saklanır</li>
                <li>Formu gönderdiğiniz site dili</li>
              </ul>
              <h3 className="font-extrabold text-white">Dijital Check-Up</h3>
              <ul className="list-disc ps-5">
                <li>16 sorunun yanıtları (sektör, hedef kitle, ekip büyüklüğü, web sitesi, mobil uyum, online satış, SEO, içerik, reklam kanalları, sosyal medya, ölçümleme, müşteri adayı takibi, aylık pazarlama bütçesi aralığı, büyüme hedefi)</li>
                <li>Ad soyad, e-posta adresi (zorunlu), şirket veya marka adı ve telefon numarası (isteğe bağlı), site dili</li>
                <li>Sunucunun yanıtlardan hesapladığı 0–100 arası bir iç değerlendirme puanı (size gösterilmez, yalnızca ekibimizin panelinde görünür)</li>
              </ul>
              <h3 className="font-extrabold text-white">Insights bülteni</h3>
              <ul className="list-disc ps-5">
                <li>E-posta adresiniz (zorunlu) ve kayıt olduğunuz sayfanın dili (bülteni hangi dilde alacağınızı belirler)</li>
                <li>Onay kaydı: kutunun yanında gösterilen metnin kendisi, işaretlediğiniz zaman, formun yeri (Insights sayfası veya altbilgi) ve IP adresinizin tek yönlü SHA-256 özeti (IP adresinin kendisi saklanmaz)</li>
                <li>Abonelik durumu (onay bekliyor, aktif, ayrıldı) ile kayıt, onay ve ayrılma zamanları</li>
                <li>Onay bağlantısının tek yönlü özeti (7 gün geçerli; onaylanınca silinir) ve size özel bir ayrılma anahtarı (her e-postadaki “Bültenden ayrıl” bağlantısı için)</li>
                <li>Gönderim kayıtları: hangi yazının size hangi tarihte gönderildiği, e-posta sağlayıcısının ileti numarası ve varsa gönderim hatası</li>
              </ul>
              <h3 className="font-extrabold text-white">Teknik veriler</h3>
              <ul className="list-disc ps-5">
                <li>IP adresiniz yalnızca kötüye kullanımı sınırlamak için (aynı form için saatte en fazla 5 gönderim) kullanılır ve açık hâliyle saklanmaz: “form türü + IP” bilgisinin tek yönlü SHA-256 özeti, bir saatlik zaman dilimi ve bir sayaç tutulur. İki saatten eski sayaçlar, sonraki bir form gönderiminde otomatik silinir (ayrı bir zamanlanmış temizlik işi yoktur). Veritabanı fonksiyonu kurulu değilse sayaç yalnızca sunucu belleğinde geçici olarak tutulur.</li>
                <li>İstenmeyen gönderim (spam) ve tekrar gönderim kontrolü: formun açık kalma süresi, gizli bir tuzak alanı ve metnin biçimi o an kontrol edilir; reddedilen gönderimlerden yalnızca form türü, ret nedeni ve zaman kaydedilir (spam_log), içerik ve iletişim bilgisi saklanmaz.</li>
                <li>İşlem geçmişi (audit_log): yeni bir başvuru kaydedildiğinde yönetim panelinin işlem geçmişine başvuranın adı ve kayıt numarası yazılır; ekibimiz başvurunun durumunu veya notunu değiştirdiğinde değişen alanlar da kaydedilir.</li>
                <li>Site ölçümü: çerez kullanmayan Vercel Web Analytics ile sayfa görüntülemeleri ve ad, e-posta gibi form içeriği taşımayan form olayları (ör. “iletişim formu gönderildi”, dil, yönlendiren kaynak etiketi) ölçülür. Google Analytics yalnızca yapılandırılmışsa ve çerez bildiriminde isteğe bağlı çerezleri kabul ederseniz yüklenir. Dil tercihiniz bir çerezde (yoca_locale) tutulur. Çerez kullanımına ilişkin ayrıntılı metin {TODO}.</li>
              </ul>
            </Section>

            <Section n={4} title="İşleme amaçları">
              <ul className="list-disc ps-5">
                <li>İletişim formu: talebinizi okumak, değerlendirmek ve size e-postayla dönüş yapmak; gerekirse görüşme planlamak.</li>
                <li>Check-Up: yanıtlarınızı inceleyip markanız, web siteniz ve pazarlama çalışmalarınız için öncelikleri ve önerilen adımları hazırlamak ve size e-postayla göndermek.</li>
                <li>Insights bülteni: abonelik isteğinizi e-posta adresinizin size ait olduğunu doğrulayarak tamamlamak, yeni Insights yazılarını seçtiğiniz dilde e-postayla göndermek, ayrılma isteğinizi uygulamak ve onayınızın ne zaman, hangi metinle verildiğini gösterebilmek.</li>
                <li>Teknik veriler: formların kötüye kullanımını, istenmeyen ve yinelenen gönderimleri önlemek; sitenin nasıl kullanıldığını toplu olarak ölçmek; yönetim işlemlerinin kaydını tutmak.</li>
              </ul>
            </Section>

            <Section n={5} title="Toplama yöntemi">
              <p>Veriler, sitedeki formları doldurmanızla elektronik ortamda, şifreli bağlantı (HTTPS) üzerinden sunucumuza gönderilerek toplanır. Teknik veriler bu gönderim sırasında otomatik olarak oluşur. Bülten aboneliğinin onayı ve ayrılma, e-postalardaki bağlantılara tıklamanızla kaydedilir.</p>
            </Section>

            <Section n={6} title="Hukuki sebep">
              <dl>
                <div className="grid gap-1 border-b border-line py-2"><dt className="text-[13px] font-bold text-subtle">İletişim formu</dt><dd>{c.legalBasisContact ? <span className="whitespace-pre-line">{c.legalBasisContact}</span> : LEGAL_REVIEW}</dd></div>
                <div className="grid gap-1 border-b border-line py-2"><dt className="text-[13px] font-bold text-subtle">Dijital Check-Up</dt><dd>{c.legalBasisCheckup ? <span className="whitespace-pre-line">{c.legalBasisCheckup}</span> : LEGAL_REVIEW}</dd></div>
                <div className="grid gap-1 border-b border-line py-2"><dt className="text-[13px] font-bold text-subtle">Insights bülteni</dt><dd>{c.legalBasisNewsletter ? <span className="whitespace-pre-line">{c.legalBasisNewsletter}</span> : LEGAL_REVIEW}</dd></div>
              </dl>
            </Section>

            <Section n={7} title="Verilerin aktarıldığı taraflar">
              <p>Site, kodunda aşağıdaki hizmet sağlayıcılarla çalışır; veriler yalnızca belirtilen iş için onlara ulaşır. Her birinin aktarım açısından durumu {TO_ASSESS}.</p>
              <ul className="list-disc ps-5">
                <li><b>Supabase</b> — form başvurularının ve bülten abonelik kayıtlarının saklandığı veritabanı ve dosya depolama. Kurulum notu Frankfurt (eu-central) bölgesini önerir; projenin gerçek sunucu bölgesi bu metin için doğrulanmadı — {TO_ASSESS}.</li>
                <li><b>Vercel</b> — sitenin ve form sunucusunun barındırılması; çerezsiz site ölçümü. Bölge: {TO_ASSESS}.</li>
                <li><b>Resend</b> — yeni başvurunun ekibimize e-postayla bildirilmesi (ad, e-posta, şirket, mesaj veya Check-Up özeti).{env.email ? '' : ' Şu anda yapılandırılmamış.'} Bildirim e-postasının ulaştığı posta kutusunun sağlayıcısı: {TODO}. Insights bülteninde onay e-postası ve yazı e-postaları da Resend ile gönderilir; Resend’e e-posta adresiniz, diliniz ve e-postanın içeriği (ayrılma bağlantısı dahil) ulaşır. Aktarım: {TO_ASSESS}.</li>
                <li><b>Telegram</b> — yeni başvurunun ekibimizin Telegram sohbetine bildirilmesi.{env.telegram ? '' : ' Şu anda yapılandırılmamış.'} Aktarım: {TO_ASSESS}.</li>
                <li><b>OpenAI</b> — başvurular OpenAI’ye otomatik olarak gönderilmez. Yalnızca bir yönetici panelde tek bir başvuru için “Özetle” veya “Yanıt taslağı”nı seçerse; ilk ad, şirket, dil ve mesaj/yanıtlar gönderilir. E-posta adresi ve telefon numarası gönderilmez; mesajın içindeki e-posta ve telefon numaraları maskelenir. Form verileri blog/içerik üretiminde kullanılmaz. İçerik editöründe OpenAI’ye yalnızca bir editörün açıkça gönderdiği yazı metni gider. Aktarım: {TO_ASSESS}.</li>
              </ul>
              <p><b>Yurt dışına aktarım:</b> Bu sağlayıcıların sunucuları ve şirketleri yurt dışında bulunabilir. Aktarımın hangi ülkelere yapıldığı ve KVKK m.9 kapsamındaki dayanağı: {c.transferAssessment ? <span className="whitespace-pre-line">{c.transferAssessment}</span> : LEGAL_REVIEW}</p>
            </Section>

            <Section n={8} title="Saklama süresi">
              <dl>
                <div className="grid gap-1 border-b border-line py-2"><dt className="text-[13px] font-bold text-subtle">İletişim formu</dt><dd>{c.retentionContact ? <span className="whitespace-pre-line">{c.retentionContact}</span> : TO_DECIDE}</dd></div>
                <div className="grid gap-1 border-b border-line py-2"><dt className="text-[13px] font-bold text-subtle">Dijital Check-Up</dt><dd>{c.retentionCheckup ? <span className="whitespace-pre-line">{c.retentionCheckup}</span> : TO_DECIDE}</dd></div>
                <div className="grid gap-1 border-b border-line py-2"><dt className="text-[13px] font-bold text-subtle">Insights bülteni</dt><dd>{c.retentionNewsletter ? <span className="whitespace-pre-line">{c.retentionNewsletter}</span> : TO_DECIDE}</dd></div>
              </dl>
              <p>Saklama süreleri {TO_DECIDE}. Belirlenirken kullanılacak ölçüt: başvurunun cevaplanması ve olası iş ilişkisinin değerlendirilmesi için gereken süre ile yasal saklama yükümlülükleri.</p>
              <p className="text-[13px] text-subtle">Bugün sitede başvuruları (contact_submissions, checkup_submissions), işlem geçmişini (audit_log) veya spam kayıtlarını (spam_log) belirli bir sürede otomatik silen bir işlem yoktur; bunlar yönetim panelinden elle silinir. Yalnızca hız sınırı sayaçları sonraki gönderimlerde silinir. Bültenden ayrıldığınızda adresinize bir daha bülten gönderilmez; abonelik kaydı “ayrıldı” durumuyla, onay ve ayrılma zamanlarıyla birlikte kalır ve bugün otomatik olarak silinmez. Onaylanmayan kayıtlar da otomatik silinmez.</p>
            </Section>

            <Section n={9} title="Haklarınız (KVKK m.11)">
              <p>Kişisel verilerinizle ilgili olarak; işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, KVKK m.7’deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme, düzeltme/silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.</p>
              <p>Bülten için verdiğiniz onayı her bülten e-postasındaki “Bültenden ayrıl” bağlantısıyla istediğiniz an geri alabilirsiniz; ayrıca aşağıdaki başvuru yöntemiyle de isteyebilirsiniz.</p>
              <p><b>Başvuru yöntemi:</b> {c.dataRequestChannel ? <span className="whitespace-pre-line">{c.dataRequestChannel}</span> : TODO}</p>
            </Section>

            <Section n={10} title="Sürüm">
              <dl>
                <Field label="Metin sürümü" value={c.noticeVersion} />
                <Field label="Güncelleme tarihi" value={c.noticeUpdatedAt} />
              </dl>
            </Section>
          </article>
        </div>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
