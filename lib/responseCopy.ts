/**
 * Yoca — contact & Check-Up response copy (pure, client-safe; unit-tested).
 *
 * Until the owner ticks "Süreleri sitede göster (sahip onayı)" in Ayarlar →
 * Yanıt süreleri (cockpit_settings key "site_copy", default OFF), the site uses
 * the NEUTRAL texts (no durations). After approval it uses the timed texts with
 * the configured business days (default 1 for contact, 3 for Check-Up); the
 * numbers are never hard-coded in the sentences.
 *
 * Business days are counted in Europe/Istanbul, Monday–Friday. There is NO
 * holiday data in the code (no official Turkish holiday calendar is bundled):
 * only the dates the admin types into the holiday list are skipped. The due
 * date is shown to admins on the Leads page only — never to visitors.
 *
 * Copy also separates the AUTOMATIC receipt (the on-screen confirmation; the
 * code sends no automatic e-mail to the visitor) from the HUMAN review.
 */

export type CopyLocale = 'tr' | 'en' | 'az' | 'ar';

export interface ResponseTimes {
  approved: boolean;
  contactDays: number;
  checkupDays: number;
  /** YYYY-MM-DD dates (Istanbul) that are not business days. */
  holidays: string[];
  approvedAt?: string | null;
  approvedBy?: string | null;
}

export const DEFAULT_RESPONSE_TIMES: ResponseTimes = { approved: false, contactDays: 1, checkupDays: 3, holidays: [] };

export function sanitizeResponseTimes(input: Partial<ResponseTimes> | null | undefined): ResponseTimes {
  const v = input ?? {};
  const days = (x: unknown, d: number) => {
    const n = Math.round(Number(x));
    return Number.isFinite(n) && n >= 1 && n <= 30 ? n : d;
  };
  const holidays = Array.isArray(v.holidays) ? Array.from(new Set(v.holidays.filter((h): h is string => typeof h === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h)))).sort().slice(0, 60) : [];
  return {
    approved: v.approved === true,
    contactDays: days(v.contactDays, 1),
    checkupDays: days(v.checkupDays, 3),
    holidays,
    approvedAt: typeof v.approvedAt === 'string' ? v.approvedAt : null,
    approvedBy: typeof v.approvedBy === 'string' ? v.approvedBy : null,
  };
}

// ── Business days (Europe/Istanbul) ─────────────────────────────

/** Calendar date in Istanbul (YYYY-MM-DD) for an instant. */
export function istanbulDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isBusinessDay(day: string, holidays: string[] = []): boolean {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.includes(day);
}

/**
 * The Istanbul date by which a reply is due: the Nth business day AFTER the
 * day the submission arrived (a Friday message with 1 day → Monday; a
 * Saturday message → Monday).
 */
export function dueBusinessDay(submittedAt: Date, businessDays: number, holidays: string[] = []): string {
  let day = istanbulDay(submittedAt);
  let left = Math.max(1, Math.round(businessDays));
  while (left > 0) {
    day = addDays(day, 1);
    if (isBusinessDay(day, holidays)) left -= 1;
  }
  return day;
}

// ── Copy ────────────────────────────────────────────────────────

function enDays(n: number) {
  return n === 1 ? '1 business day' : `${n} business days`;
}
function arDays(n: number) {
  if (n === 1) return 'يوم عمل واحد';
  if (n === 2) return 'يومَي عمل';
  if (n <= 10) return `${n} أيام عمل`;
  return `${n} يوم عمل`;
}

export interface ResponseCopy {
  contactDescription: string;
  contactSuccess: string;
  checkupDescription: string;
  checkupSuccess: string;
  /** Short line under both success messages: automatic receipt vs. human reply. */
  receiptNote: string;
}

export function buildResponseCopy(locale: CopyLocale, settings: ResponseTimes, questionCount: number): ResponseCopy {
  const timed = settings.approved;
  const c = settings.contactDays;
  const k = settings.checkupDays;
  const q = questionCount;
  switch (locale) {
    case 'en':
      return {
        contactDescription: `Tell us briefly about your project and what you need. We will review your message and reply by e-mail${timed ? ` within ${enDays(c)}` : ''}.`,
        contactSuccess: `Your message has arrived. We will review what you shared and get back to you at your e-mail address${timed ? ` within ${enDays(c)}` : ''}.`,
        checkupDescription: `Answer ${q} questions in about 3 minutes. We will assess where your brand, website and marketing stand today and share your priorities and our suggested steps by e-mail${timed ? ` within ${enDays(k)}` : ''}.`,
        checkupSuccess: `Your answers have arrived. We will prepare your assessment and send it to your e-mail address${timed ? ` within ${enDays(k)}` : ''}.`,
        receiptNote: 'This confirmation is automatic and no automatic e-mail is sent. A member of our team reads your submission and writes the reply.',
      };
    case 'az':
      return {
        contactDescription: `Layihənizi və nəyə ehtiyacınız olduğunu qısaca yazın. Mesajınızı nəzərdən keçirib${timed ? ` ${c} iş günü ərzində` : ''} sizə e-poçtla cavab verək.`,
        contactSuccess: `Mesajınız çatdı. Paylaşdığınız məlumatları nəzərdən keçirib${timed ? ` ${c} iş günü ərzində` : ''} e-poçt ünvanınız vasitəsilə sizinlə əlaqə saxlayacağıq.`,
        checkupDescription: `${q} suala təxminən 3 dəqiqəyə cavab verin. Brendinizin, saytınızın və marketinq işlərinizin hazırkı vəziyyətini qiymətləndirək; prioritetlərinizi və təklif etdiyimiz addımları${timed ? ` ${k} iş günü ərzində` : ''} e-poçtla paylaşaq.`,
        checkupSuccess: `Cavablarınız çatdı. Qiymətləndirmənizi hazırlayıb${timed ? ` ${k} iş günü ərzində` : ''} e-poçt ünvanınıza göndərəcəyik.`,
        receiptNote: 'Bu təsdiq avtomatikdir və avtomatik e-poçt göndərilmir. Müraciətinizi komandamızdan biri oxuyur və cavabı o hazırlayır.',
      };
    case 'ar':
      return {
        contactDescription: `أخبرنا باختصار عن مشروعك وما تحتاج إليه. سنراجع رسالتك ونرد عليك عبر البريد الإلكتروني${timed ? ` خلال ${arDays(c)}` : ''}.`,
        contactSuccess: `وصلت رسالتك. سنراجع المعلومات التي شاركتها ونتواصل معك عبر بريدك الإلكتروني${timed ? ` خلال ${arDays(c)}` : ''}.`,
        checkupDescription: `أجب عن ${q} سؤالًا في نحو 3 دقائق. سنقيّم الوضع الحالي لعلامتك وموقعك وأعمالك التسويقية، ونشاركك أولوياتك والخطوات التي نقترحها عبر البريد الإلكتروني${timed ? ` خلال ${arDays(k)}` : ''}.`,
        checkupSuccess: `وصلت إجاباتك. سنُعدّ تقييمك ونرسله إلى بريدك الإلكتروني${timed ? ` خلال ${arDays(k)}` : ''}.`,
        receiptNote: 'هذا التأكيد آلي ولا تُرسل رسالة بريد آلية. يقرأ أحد أعضاء فريقنا طلبك ويكتب الرد.',
      };
    default:
      return {
        contactDescription: `Projenizi ve neye ihtiyaç duyduğunuzu kısaca anlatın. Mesajınızı inceleyip${timed ? ` ${c} iş günü içinde` : ''} e-postayla size dönüş yapalım.`,
        contactSuccess: timed
          ? `Mesajınız ulaştı. Paylaştığınız bilgileri inceleyip ${c} iş günü içinde e-posta adresinizden size ulaşacağız.`
          : 'Mesajınız ulaştı. Paylaştığınız bilgileri inceleyip e-postayla size dönüş yapacağız.',
        checkupDescription: `${q} soruyu yaklaşık 3 dakikada yanıtlayın. Markanızın, web sitenizin ve pazarlama çalışmalarınızın mevcut durumunu değerlendirelim; önceliklerinizi ve önerdiğimiz adımları${timed ? ` ${k} iş günü içinde` : ''} e-postayla paylaşalım.`,
        checkupSuccess: `Yanıtlarınız ulaştı. Değerlendirmenizi hazırlayıp${timed ? ` ${k} iş günü içinde` : ''} e-posta adresinize göndereceğiz.`,
        receiptNote: 'Bu onay otomatiktir; otomatik bir e-posta gönderilmez. Gönderiminizi ekibimizden biri okur ve yanıtı o hazırlar.',
      };
  }
}
