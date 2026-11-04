import type { Locale } from '@/types';

/**
 * Yoca — newsletter wording in every site language (form, status page,
 * e-mails). Kept here instead of the main dictionary so the feature is one
 * place to read and review. AZ and AR should be read once by a native
 * speaker before the first send.
 */

export interface NewsletterCopy {
  form: {
    heading: string;
    sub: string;
    emailLabel: string;
    placeholder: string;
    consent: string;
    privacy: string;
    submit: string;
    sending: string;
    success: string;
    errorEmail: string;
    errorConsent: string;
    errorGeneric: string;
    tooMany: string;
    langLabel: string;
  };
  page: {
    metaTitle: string;
    confirmed: { title: string; body: string };
    unsubscribed: { title: string; body: string };
    invalid: { title: string; body: string };
    expired: { title: string; body: string };
    unsubscribePrompt: { title: string; body: string; button: string };
    prefs: { title: string; body: string; save: string; saved: string; leave: string };
    working: string;
    back: string;
  };
  confirmEmail: { subject: string; preheader: string; heading: string; body: string; button: string; ignore: string };
  issue: { kicker: string; read: string; minRead: string; why: string; unsubscribe: string; preferences: string; site: string; more: string; reply: string };
}

export const NEWSLETTER_COPY: Record<Locale, NewsletterCopy> = {
  tr: {
    form: {
      heading: 'Yeni yazılar e-postanıza gelsin',
      sub: 'Yoca Insights’ta yeni bir yazı yayınlandığında kısa bir e-posta gönderiyoruz. Başka bir şey göndermiyoruz.',
      emailLabel: 'E-posta adresi',
      placeholder: 'ad@sirket.com',
      consent: 'Yoca Insights yazılarının e-postayla gönderilmesini kabul ediyorum. Her e-postadaki bağlantıyla tek tıkla ayrılabilirim.',
      privacy: 'Aydınlatma metni',
      submit: 'Abone ol',
      sending: 'Gönderiliyor…',
      success: 'Bir onay e-postası gönderdik. Aboneliği tamamlamak için e-postadaki bağlantıya tıklayın.',
      errorEmail: 'Geçerli bir e-posta adresi yazın.',
      errorConsent: 'Devam etmek için onay kutusunu işaretleyin.',
      errorGeneric: 'Şu an kaydedilemedi. Lütfen biraz sonra tekrar deneyin.',
      tooMany: 'Kısa sürede çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
      langLabel: 'Bülten dili',
    },
    page: {
      metaTitle: 'Bülten | Yoca',
      confirmed: { title: 'Aboneliğiniz onaylandı', body: 'Yeni bir Yoca Insights yazısı yayınlandığında size e-posta göndereceğiz.' },
      unsubscribed: { title: 'Bültenden ayrıldınız', body: 'Artık Yoca Insights e-postası almayacaksınız. Fikrinizi değiştirirseniz yeniden abone olabilirsiniz.' },
      invalid: { title: 'Bağlantı geçersiz', body: 'Bu bağlantı kullanılmış ya da hatalı olabilir. Gerekirse formdan yeniden abone olun.' },
      expired: { title: 'Bağlantının süresi doldu', body: 'Onay bağlantıları 7 gün geçerlidir. Formdan yeniden abone olursanız yeni bir bağlantı göndeririz.' },
      unsubscribePrompt: { title: 'Bültenden ayrılmak istiyor musunuz?', body: 'Onaylarsanız bu adrese Yoca Insights e-postası gönderilmez.', button: 'Bültenden ayrıl' },
      working: 'İşleniyor…',
      prefs: { title: 'Bülten tercihleri', body: 'Bülteni hangi dilde alacağınızı seçebilir ya da bültenden ayrılabilirsiniz.', save: 'Dili kaydet', saved: 'Kaydedildi. Sonraki e-postalar bu dilde gelir (yazının bu dildeki sürümü yayındaysa).', leave: 'Bültenden ayrılmak' },
      back: 'Insights’a dön',
    },
    confirmEmail: {
      subject: 'Yoca Insights aboneliğinizi onaylayın',
      preheader: 'Aboneliği tamamlamak için tek bir tıklama yeterli.',
      heading: 'Aboneliğinizi onaylayın',
      body: 'yoca.net üzerinden Yoca Insights bültenine kaydoldunuz. Yeni yazıları almak için aşağıdaki düğmeye tıklayın. Bağlantı 7 gün geçerlidir.',
      button: 'Aboneliği onayla',
      ignore: 'Bu kaydı siz yapmadıysanız bu e-postayı yok sayın; onaylanmayan adreslere bülten gönderilmez.',
    },
    issue: {
      kicker: 'Yoca Insights',
      read: 'Yazıyı oku',
      minRead: 'dk okuma',
      why: 'Bu e-postayı yoca.net üzerinden Yoca Insights bültenine abone olduğunuz için alıyorsunuz.',
      unsubscribe: 'Bültenden ayrıl',
      preferences: 'Dil tercihi',
      more: 'Ayrıca okuyun',
      reply: 'Sorunuz ya da yorumunuz varsa bu e-postayı yanıtlayın; yanıtınız ekibimize ulaşır.',
      site: 'yoca.net',
    },
  },
  en: {
    form: {
      heading: 'Get new articles by e-mail',
      sub: 'When a new Yoca Insights article is published, we send one short e-mail. Nothing else.',
      emailLabel: 'E-mail address',
      placeholder: 'name@company.com',
      consent: 'I agree to receive Yoca Insights articles by e-mail. I can leave with one click from any e-mail.',
      privacy: 'Privacy notice',
      submit: 'Subscribe',
      sending: 'Sending…',
      success: 'We sent you a confirmation e-mail. Click the link in it to complete your subscription.',
      errorEmail: 'Please enter a valid e-mail address.',
      errorConsent: 'Please tick the consent box to continue.',
      errorGeneric: 'We could not save this right now. Please try again shortly.',
      tooMany: 'Too many attempts. Please try again later.',
      langLabel: 'Newsletter language',
    },
    page: {
      metaTitle: 'Newsletter | Yoca',
      confirmed: { title: 'Subscription confirmed', body: 'We will e-mail you when a new Yoca Insights article is published.' },
      unsubscribed: { title: 'You have unsubscribed', body: 'You will no longer receive Yoca Insights e-mails. You can subscribe again at any time.' },
      invalid: { title: 'This link is not valid', body: 'It may have been used already or be incomplete. You can subscribe again from the form.' },
      expired: { title: 'This link has expired', body: 'Confirmation links are valid for 7 days. Subscribe again and we will send a new one.' },
      unsubscribePrompt: { title: 'Unsubscribe from the newsletter?', body: 'If you confirm, this address will no longer receive Yoca Insights e-mails.', button: 'Unsubscribe' },
      working: 'Working…',
      prefs: { title: 'Newsletter preferences', body: 'Choose the language you receive the newsletter in, or unsubscribe.', save: 'Save language', saved: 'Saved. Future e-mails come in this language (when the article is published in it).', leave: 'Unsubscribe' },
      back: 'Back to Insights',
    },
    confirmEmail: {
      subject: 'Confirm your Yoca Insights subscription',
      preheader: 'One click completes your subscription.',
      heading: 'Confirm your subscription',
      body: 'You signed up for the Yoca Insights newsletter on yoca.net. Click the button below to start receiving new articles. The link is valid for 7 days.',
      button: 'Confirm subscription',
      ignore: 'If you did not sign up, ignore this e-mail; unconfirmed addresses receive nothing.',
    },
    issue: {
      kicker: 'Yoca Insights',
      read: 'Read the article',
      minRead: 'min read',
      why: 'You are receiving this e-mail because you subscribed to the Yoca Insights newsletter on yoca.net.',
      unsubscribe: 'Unsubscribe',
      preferences: 'Language preference',
      more: 'Also on Yoca Insights',
      reply: 'Questions or thoughts? Reply to this e-mail; it reaches our team.',
      site: 'yoca.net',
    },
  },
  az: {
    form: {
      heading: 'Yeni yazılar e-poçtunuza gəlsin',
      sub: 'Yoca Insights-da yeni yazı dərc olunanda qısa bir e-poçt göndəririk. Başqa heç nə göndərmirik.',
      emailLabel: 'E-poçt ünvanı',
      placeholder: 'ad@sirket.com',
      consent: 'Yoca Insights yazılarının e-poçtla göndərilməsinə razıyam. İstənilən e-poçtdakı keçidlə bir kliklə abunəlikdən çıxa bilərəm.',
      privacy: 'Məxfilik bildirişi',
      submit: 'Abunə ol',
      sending: 'Göndərilir…',
      success: 'Təsdiq e-poçtu göndərdik. Abunəliyi tamamlamaq üçün e-poçtdakı keçidə klikləyin.',
      errorEmail: 'Düzgün e-poçt ünvanı yazın.',
      errorConsent: 'Davam etmək üçün razılıq qutusunu işarələyin.',
      errorGeneric: 'Hazırda yadda saxlamaq mümkün olmadı. Bir az sonra yenidən cəhd edin.',
      tooMany: 'Qısa müddətdə çox cəhd edildi. Bir az sonra yenidən cəhd edin.',
      langLabel: 'Bülleten dili',
    },
    page: {
      metaTitle: 'Bülleten | Yoca',
      confirmed: { title: 'Abunəliyiniz təsdiqləndi', body: 'Yeni Yoca Insights yazısı dərc olunanda sizə e-poçt göndərəcəyik.' },
      unsubscribed: { title: 'Abunəlikdən çıxdınız', body: 'Artıq Yoca Insights e-poçtları almayacaqsınız. İstəsəniz yenidən abunə ola bilərsiniz.' },
      invalid: { title: 'Keçid etibarsızdır', body: 'Bu keçid artıq istifadə olunub və ya natamamdır. Formdan yenidən abunə ola bilərsiniz.' },
      expired: { title: 'Keçidin müddəti bitib', body: 'Təsdiq keçidləri 7 gün etibarlıdır. Yenidən abunə olsanız, yeni keçid göndərəcəyik.' },
      unsubscribePrompt: { title: 'Bülletendən çıxmaq istəyirsiniz?', body: 'Təsdiqləsəniz, bu ünvana Yoca Insights e-poçtu göndərilməyəcək.', button: 'Abunəlikdən çıx' },
      working: 'İcra olunur…',
      prefs: { title: 'Bülleten seçimləri', body: 'Bülleteni hansı dildə alacağınızı seçə və ya abunəlikdən çıxa bilərsiniz.', save: 'Dili yadda saxla', saved: 'Yadda saxlanıldı. Növbəti e-poçtlar bu dildə gələcək (yazı bu dildə dərc olunubsa).', leave: 'Abunəlikdən çıxmaq' },
      back: 'Insights-a qayıt',
    },
    confirmEmail: {
      subject: 'Yoca Insights abunəliyinizi təsdiqləyin',
      preheader: 'Abunəliyi tamamlamaq üçün bir klik kifayətdir.',
      heading: 'Abunəliyinizi təsdiqləyin',
      body: 'yoca.net saytında Yoca Insights bülletenə qeydiyyatdan keçdiniz. Yeni yazıları almaq üçün aşağıdakı düyməyə klikləyin. Keçid 7 gün etibarlıdır.',
      button: 'Abunəliyi təsdiqlə',
      ignore: 'Qeydiyyatı siz etməmisinizsə, bu e-poçtu nəzərə almayın; təsdiqlənməyən ünvanlara heç nə göndərilmir.',
    },
    issue: {
      kicker: 'Yoca Insights',
      read: 'Yazını oxu',
      minRead: 'dəq oxu',
      why: 'Bu e-poçtu yoca.net saytında Yoca Insights bülletenə abunə olduğunuz üçün alırsınız.',
      unsubscribe: 'Abunəlikdən çıx',
      preferences: 'Dil seçimi',
      more: 'Bunları da oxuyun',
      reply: 'Sualınız və ya fikriniz varsa, bu e-poçtu cavablayın; cavabınız komandamıza çatır.',
      site: 'yoca.net',
    },
  },
  ar: {
    form: {
      heading: 'استلم المقالات الجديدة عبر البريد الإلكتروني',
      sub: 'عند نشر مقال جديد في Yoca Insights نرسل رسالة قصيرة واحدة، ولا شيء غير ذلك.',
      emailLabel: 'البريد الإلكتروني',
      placeholder: 'name@company.com',
      consent: 'أوافق على استلام مقالات Yoca Insights عبر البريد الإلكتروني، ويمكنني إلغاء الاشتراك بنقرة واحدة من أي رسالة.',
      privacy: 'إشعار الخصوصية',
      submit: 'اشترك',
      sending: 'جارٍ الإرسال…',
      success: 'أرسلنا إليك رسالة تأكيد. انقر على الرابط فيها لإكمال الاشتراك.',
      errorEmail: 'يرجى إدخال بريد إلكتروني صحيح.',
      errorConsent: 'يرجى تحديد مربع الموافقة للمتابعة.',
      errorGeneric: 'تعذّر الحفظ الآن. يرجى المحاولة بعد قليل.',
      tooMany: 'محاولات كثيرة في وقت قصير. يرجى المحاولة لاحقًا.',
      langLabel: 'لغة النشرة',
    },
    page: {
      metaTitle: 'النشرة البريدية | Yoca',
      confirmed: { title: 'تم تأكيد اشتراكك', body: 'سنراسلك عند نشر مقال جديد في Yoca Insights.' },
      unsubscribed: { title: 'تم إلغاء اشتراكك', body: 'لن تصلك رسائل Yoca Insights بعد الآن، ويمكنك الاشتراك مجددًا في أي وقت.' },
      invalid: { title: 'الرابط غير صالح', body: 'ربما استُخدم الرابط من قبل أو أنه غير مكتمل. يمكنك الاشتراك مجددًا من النموذج.' },
      expired: { title: 'انتهت صلاحية الرابط', body: 'روابط التأكيد صالحة لمدة 7 أيام. اشترك مجددًا وسنرسل لك رابطًا جديدًا.' },
      unsubscribePrompt: { title: 'هل تريد إلغاء الاشتراك في النشرة؟', body: 'عند التأكيد لن تصل رسائل Yoca Insights إلى هذا العنوان.', button: 'إلغاء الاشتراك' },
      working: 'جارٍ التنفيذ…',
      prefs: { title: 'تفضيلات النشرة', body: 'اختر اللغة التي تصلك بها النشرة، أو ألغِ اشتراكك.', save: 'حفظ اللغة', saved: 'تم الحفظ. ستصلك الرسائل القادمة بهذه اللغة (إذا نُشر المقال بها).', leave: 'إلغاء الاشتراك' },
      back: 'العودة إلى Insights',
    },
    confirmEmail: {
      subject: 'أكّد اشتراكك في Yoca Insights',
      preheader: 'نقرة واحدة تكفي لإكمال الاشتراك.',
      heading: 'أكّد اشتراكك',
      body: 'سجّلت في نشرة Yoca Insights عبر yoca.net. انقر على الزر أدناه لتبدأ باستلام المقالات الجديدة. الرابط صالح لمدة 7 أيام.',
      button: 'تأكيد الاشتراك',
      ignore: 'إذا لم تقم بالتسجيل فتجاهل هذه الرسالة؛ لا نرسل شيئًا إلى العناوين غير المؤكدة.',
    },
    issue: {
      kicker: 'Yoca Insights',
      read: 'اقرأ المقال',
      minRead: 'دقائق قراءة',
      why: 'تصلك هذه الرسالة لأنك اشتركت في نشرة Yoca Insights عبر yoca.net.',
      unsubscribe: 'إلغاء الاشتراك',
      preferences: 'تفضيل اللغة',
      more: 'اقرأ أيضًا',
      reply: 'لديك سؤال أو تعليق؟ ردّ على هذه الرسالة وسيصل ردّك إلى فريقنا.',
      site: 'yoca.net',
    },
  },
};

/** Language names in their own language (newsletter language choice). */
export const LANGUAGE_NAMES: Record<Locale, string> = { tr: 'Türkçe', en: 'English', az: 'Azərbaycanca', ar: 'العربية' };

export function newsletterCopy(locale: string): NewsletterCopy {
  return NEWSLETTER_COPY[(locale in NEWSLETTER_COPY ? locale : 'en') as Locale];
}
