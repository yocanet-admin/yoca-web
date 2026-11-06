import type { DocKind, DocLocale, Issuer, Recipient } from '@/lib/documents/model';
import { KIND_LABEL } from '@/lib/documents/model';
import { emailLayout, facts, kicker, NOTIFY_COLORS, para, section, title as notifyTitle } from '@/lib/notifyTemplates';

/**
 * Yoca — e-mail texts and the branded HTML layout of the corporate set
 * (Bolt projectUpdateEmail): white 600 px card on mist, original logo as an
 * HTTPS PNG, lime rule, headline with the leaf dot, message, optional lime
 * button, company details in the footer. Table layout and inline styles for
 * Gmail / Outlook / mobile; system fonts after Manrope, so it reads the same
 * when the web font does not load. Pure (no server imports): used by the
 * document e-mail, the e-mail signature and the project update e-mail.
 *
 * Company facts come from the company profile passed in; empty facts print
 * nothing. Nothing is sent from here.
 */

export const SITE = 'https://yoca.net';
/** Original light-background logo as PNG (public/brand/email/yoca-logo-light.png, 500 × 138). */
export const EMAIL_LOGO = `${SITE}/brand/email/yoca-logo-light.png`;
/** Original logo with the white wordmark, for the dark theme (public/brand/email/yoca-logo.png, 500 × 140). */
export const EMAIL_LOGO_DARK = `${SITE}/brand/email/yoca-logo.png`;

/** E-mail body theme. Only the e-mail body changes; the attached PDF never does. */
export type EmailTheme = 'light' | 'dark';
export const EMAIL_THEMES: readonly EmailTheme[] = ['light', 'dark'];
export const EMAIL_THEME_LABEL: Record<EmailTheme, string> = { light: 'Açık', dark: 'Koyu' };
export const emailThemeOf = (value: unknown): EmailTheme => (value === 'dark' ? 'dark' : 'light');

const C = { ink: '#0D0E12', lime: '#A2FF00', leaf: '#40C401', mist: '#F3F5EF', line: '#DCE0D8', muted: '#666A65', body: '#2B2E29' };

const FONT = "Manrope, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const clean = (s?: string | null) => (s ?? '').trim();
export const websiteOf = (issuer: Pick<Issuer, 'website'>) => clean(issuer.website).replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Footer lines: legal name · website, then address · phone · e-mail · tax facts (only the filled ones). */
export function companyFooter(issuer: Issuer, locale: DocLocale = 'tr'): { top: string; details: string } {
  const tr = locale === 'tr';
  const top = [clean(issuer.legalName), websiteOf(issuer)].filter(Boolean).join(' · ');
  const details = [
    clean(issuer.address).replace(/\s*\n\s*/g, ', '), clean(issuer.phone), clean(issuer.email),
    clean(issuer.taxOffice) ? `${tr ? 'Vergi dairesi' : 'Tax office'}: ${clean(issuer.taxOffice)}` : '',
    clean(issuer.taxNumber) ? `${tr ? 'VKN' : 'Tax ID'}: ${clean(issuer.taxNumber)}` : '',
  ].filter(Boolean).join(' · ');
  return { top, details };
}

/** Plain text → paragraphs (blank line) and line breaks, escaped. With a link style, web and e-mail addresses become styled links. */
export function textToHtml(text: string, style: string, linkStyle?: string): string {
  return text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 16px 0;${style}">${linkStyle ? p.trim().split('\n').map((line) => linkify(line, linkStyle)).join('<br>') : esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

const LINK_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[^\s@<>(),;:"'[\]]+@[^\s@<>(),;:"'[\]]+\.[A-Za-z]{2,})/g;

/**
 * One line of plain text, escaped, with web / e-mail addresses as links in the
 * given style. Mail apps link bare addresses themselves (often in blue, hard to
 * read on a dark ground); explicit links keep the theme's colour.
 */
export function linkify(line: string, linkStyle: string): string {
  let out = '';
  let last = 0;
  const re = new RegExp(LINK_RE.source, 'g');
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const start = m.index;
    const raw = m[0];
    const core = raw.replace(/[.,;:!?)\]]+$/, '');
    const tail = raw.slice(core.length);
    const isMail = !/^(https?:\/\/|www\.)/i.test(core);
    const href = isMail ? `mailto:${core}` : safeLink(/^www\./i.test(core) ? `https://${core}` : core);
    out += esc(line.slice(last, start)) + (href ? `<a href="${esc(href)}" style="${linkStyle}">${esc(core)}</a>` : esc(core)) + esc(tail);
    last = start + raw.length;
  }
  return out + esc(line.slice(last));
}

/** Only http(s) links are put in a button. */
export function safeLink(href: string): string | null {
  try {
    const u = new URL(href.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface BrandedEmail {
  issuer: Issuer;
  locale: DocLocale;
  preheader: string;
  headline?: string;
  greeting?: string;
  body: string;
  cta?: { label: string; href: string } | null;
  /** small grey note under the message (e.g. the attachment name) */
  note?: string;
  logoUrl?: string;
}

export function brandedEmailHtml(m: BrandedEmail): string {
  const foot = companyFooter(m.issuer, m.locale);
  const href = m.cta ? safeLink(m.cta.href) : null;
  const cta = href && m.cta?.label.trim()
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0;"><tr><td bgcolor="${C.lime}" style="background:${C.lime};"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:800;line-height:1;color:${C.ink};text-decoration:none;">${esc(m.cta.label.trim())}</a></td></tr></table>`
    : '';
  const headline = clean(m.headline);
  return `<!doctype html>
<html lang="${m.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(headline || m.preheader)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .pad-x { padding-left: 24px !important; padding-right: 24px !important; }
    .headline { font-size: 30px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.mist};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.mist};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;">
        <tr><td class="pad-x" style="padding:40px 48px 0 48px;"><img src="${esc(m.logoUrl ?? EMAIL_LOGO)}" alt="Yoca" width="132" style="display:block;width:132px;height:auto;border:0;outline:none;text-decoration:none;"></td></tr>
        <tr><td class="pad-x" style="padding:28px 48px 0 48px;"><div style="width:40px;height:3px;background:${C.lime};font-size:0;line-height:0;">&nbsp;</div></td></tr>
        ${headline ? `<tr><td class="pad-x" style="padding:28px 48px 0 48px;"><h1 class="headline" style="margin:0;font-family:${FONT};font-size:36px;line-height:1.15;font-weight:800;color:${C.ink};">${esc(headline)}<span style="display:inline-block;width:11px;height:11px;margin-left:8px;background:${C.leaf};"></span></h1></td></tr>` : ''}
        ${clean(m.greeting) ? `<tr><td class="pad-x" style="padding:28px 48px 0 48px;font-family:${FONT};font-size:16px;line-height:1.5;font-weight:800;color:${C.ink};">${esc(clean(m.greeting))}</td></tr>` : ''}
        <tr><td class="pad-x" style="padding:${clean(m.greeting) ? 12 : 28}px 48px 0 48px;">${textToHtml(m.body, `font-family:${FONT};font-size:16px;line-height:1.5;color:${C.body};`)}${cta}</td></tr>
        ${clean(m.note) ? `<tr><td class="pad-x" style="padding:8px 48px 0 48px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">${esc(clean(m.note))}</td></tr>` : ''}
        <tr><td style="padding:32px 0 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        ${foot.top || foot.details ? `<tr><td class="pad-x" style="padding:24px 48px 32px 48px;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">${foot.top ? `<b style="color:${C.ink};">${esc(foot.top)}</b>` : ''}${foot.top && foot.details ? '<br>' : ''}${esc(foot.details)}</td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative of the same e-mail. */
export function brandedEmailText(m: BrandedEmail): string {
  const foot = companyFooter(m.issuer, m.locale);
  const href = m.cta ? safeLink(m.cta.href) : null;
  return [clean(m.headline), clean(m.greeting), m.body.trim(), href ? `${clean(m.cta?.label)}: ${href}` : '', clean(m.note), '—', foot.top, foot.details]
    .filter(Boolean).join('\n\n');
}

/* ── Document e-mail ───────────────────────────────────────────── */

/** Default subject and message for "E-postayla gönder" (all editable before sending). */
export function documentEmailDefaults(input: { kind: DocKind; locale: DocLocale; number: string; title: string; recipient: Recipient; signatory: { name: string; title: string }; issuer: Issuer }) {
  const tr = input.locale === 'tr';
  const label = KIND_LABEL[input.kind][input.locale];
  const who = clean(input.recipient.name);
  const greeting = tr ? (who ? `Sayın ${who},` : 'Sayın Yetkili,') : (who ? `Dear ${who},` : 'Dear Sir or Madam,');
  const sign = [clean(input.signatory.name), clean(input.signatory.title), clean(input.issuer.legalName) || clean(input.issuer.brand)].filter(Boolean).join('\n');
  const subject = `${input.number} — ${clean(input.title) || label}`;
  const body = tr
    ? `${greeting}\n\n${input.number} numaralı ${label.toLocaleLowerCase('tr-TR')} ekte PDF olarak bilginize sunulmuştur.\n\nSorularınız için bu e-postayı yanıtlayabilirsiniz.\n\nSaygılarımızla,\n${sign}`
    : `${greeting}\n\nPlease find attached our ${label.toLowerCase()} ${input.number} as a PDF.\n\nIf you have any questions, simply reply to this e-mail.\n\nKind regards,\n${sign}`;
  return { subject, body, to: clean(input.recipient.email) };
}

export interface DocumentEmail {
  issuer: Issuer;
  locale: DocLocale;
  kind: DocKind;
  number: string;
  /** title of the sent version (the document's name) */
  docTitle?: string;
  subject: string;
  /** the message written in the send dialog */
  body: string;
  pdfName: string;
  theme: EmailTheme;
  /** preview only: logo from this site */
  logoUrl?: string;
}

/**
 * The e-mail body of "E-postayla gönder".
 *  - light (default): the corporate set (brandedEmailHtml), unchanged.
 *  - dark: the layout of the cockpit's "Sabah özeti" e-mail (lib/notifyTemplates):
 *    near-black page, dark card with the lime top rule, white logo with a small
 *    uppercase label, kicker with the slanted square, title, text, a section with
 *    label/value rows, footer under the card. Content is the document send only:
 *    document type and number, subject, the message, the document and its PDF
 *    attachment, company details. No figures or report blocks.
 * The attached PDF is the same file in both themes.
 */
export function documentEmailHtml(m: DocumentEmail): string {
  const note = `${m.locale === 'tr' ? 'Ek' : 'Attachment'}: ${m.pdfName}`;
  if (m.theme !== 'dark') return brandedEmailHtml({ issuer: m.issuer, locale: m.locale, preheader: m.subject, body: m.body, note, ...(m.logoUrl ? { logoUrl: m.logoUrl } : {}) });
  const tr = m.locale === 'tr';
  const N = NOTIFY_COLORS;
  const kindLabel = KIND_LABEL[m.kind][m.locale];
  const link = `color:${N.text};text-decoration:none;border-bottom:1px solid ${N.line};`;
  const footLink = `color:${N.muted};text-decoration:underline;`;
  const paras = m.body.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter((p) => p.trim())
    .map((p) => para(p.trim().split('\n').map((line) => linkify(line, link)).join('<br>'), { html: true })).join('');
  const docLine = [m.number, clean(m.docTitle)].filter(Boolean).join(' · ');
  const foot = companyFooter(m.issuer, m.locale);
  const web = websiteOf(m.issuer);
  const footTop = [esc(clean(m.issuer.legalName)), web ? `<a href="${esc(`https://${web}`)}" style="${footLink}">${esc(web)}</a>` : ''].filter(Boolean).join(' · ');
  const footerHtml = [footTop, foot.details ? linkify(foot.details, footLink) : ''].filter(Boolean).join('<br>');
  return emailLayout({
    lang: m.locale,
    preheader: m.subject,
    label: m.subject,
    headerLabel: tr ? 'Belge' : 'Document',
    logoHref: SITE,
    ...(m.logoUrl ? { logoUrl: m.logoUrl } : {}),
    footerHtml,
    body:
      kicker(`${kindLabel} · ${m.number}`) +
      `${notifyTitle(m.subject)}<div style="height:6px;line-height:6px;font-size:0;">&nbsp;</div>` +
      paras +
      section(tr ? 'Ek' : 'Attachment', facts([
        { label: tr ? 'Belge' : 'Document', value: docLine },
        { label: 'PDF', value: m.pdfName },
      ])) +
      para(tr ? 'PDF dosyası bu e-postaya eklidir.' : 'The PDF file is attached to this e-mail.', { muted: true }),
  });
}

const EMAIL = /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[A-Za-z]{2,}$/;

/** "a@x.com, b@y.com; c@z.com" → valid unique addresses + the invalid parts. */
export function parseAddresses(input: string, max = 10): { list: string[]; invalid: string[]; tooMany: boolean } {
  const parts = input.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const list: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!EMAIL.test(p) || p.length > 254) invalid.push(p);
    else if (!list.some((x) => x.toLowerCase() === p.toLowerCase())) list.push(p);
  }
  return { list: list.slice(0, max), invalid, tooMany: list.length > max };
}

/** Resend "last_event" → the status kept in doc_emails. */
export function statusFromEvent(event: string | null | undefined): 'accepted' | 'delivered' | 'delayed' | 'bounced' | 'complained' {
  switch (event) {
    case 'delivered': case 'opened': case 'clicked': return 'delivered';
    case 'bounced': return 'bounced';
    case 'complained': return 'complained';
    case 'delivery_delayed': return 'delayed';
    default: return 'accepted';
  }
}

export const EMAIL_STATUS_LABEL: Record<string, string> = {
  sending: 'Gönderiliyor', accepted: 'Servis kabul etti (teslim henüz bilinmiyor)', failed: 'Gönderilemedi', unknown: 'Sonuç belirsiz',
  delivered: 'Alıcı sunucusuna teslim edildi', delayed: 'Teslimat gecikiyor', bounced: 'Geri döndü (teslim edilemedi)', complained: 'Alıcı istenmeyen olarak işaretledi',
};

/**
 * Non-production guard: preview / development deployments may send only to
 * addresses or domains listed in DOCUMENTS_EMAIL_TEST_ALLOW (or into a test
 * capture endpoint), so a check on a preview never reaches a real customer.
 */
export function testRecipientProblem(env: { vercelEnv?: string; nodeEnv?: string; capture: boolean; allow?: string }, addresses: string[]): string | null {
  const production = env.vercelEnv ? env.vercelEnv === 'production' : env.nodeEnv === 'production';
  if (production || env.capture) return null;
  const allow = (env.allow ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const blocked = addresses.filter((a) => {
    const l = a.toLowerCase();
    return !allow.some((x) => (x.startsWith('@') ? l.endsWith(x) : l === x));
  });
  return blocked.length ? `Bu ortam canlı değil: yalnızca test adreslerine gönderilir (DOCUMENTS_EMAIL_TEST_ALLOW). İzin verilmeyen: ${blocked.join(', ')}` : null;
}

/* ── E-posta imzası ────────────────────────────────────────────── */

export interface SignatureInput { name: string; title: string; phone: string; email: string; website: string; legalName: string; logoUrl?: string }

/** E-mail signature: table layout, inline styles, links for phone / e-mail / website; empty lines are left out. */
export function signatureHtml(s: SignatureInput): string {
  const web = clean(s.website).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const tel = clean(s.phone);
  const mail = clean(s.email);
  const td = (style: string, html: string) => `<tr><td style="${style}">${html}</td></tr>`;
  const link = (href: string, text: string, extra = '') => `<a href="${esc(href)}" style="color:${C.ink};text-decoration:none;${extra}">${esc(text)}</a>`;
  const contact = [tel ? link(`tel:${tel.replace(/[^\d+]/g, '')}`, tel) : '', mail ? link(`mailto:${mail}`, mail) : ''].filter(Boolean).join(`<span style="color:${C.muted};"> &middot; </span>`);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT};">
${td('padding:0 0 12px 0;', `<img src="${esc(s.logoUrl ?? EMAIL_LOGO)}" alt="Yoca" width="96" style="display:block;width:96px;height:auto;border:0;">`)}
${clean(s.name) ? td(`padding:0;font-size:15px;line-height:1.3;font-weight:800;color:${C.ink};`, `${esc(clean(s.name))}<span style="display:inline-block;width:7px;height:7px;margin-left:5px;background:${C.leaf};"></span>`) : ''}
${clean(s.title) ? td(`padding:2px 0 0 0;font-size:12px;line-height:1.4;color:${C.muted};`, esc(clean(s.title))) : ''}
${contact ? td(`padding:8px 0 0 0;font-size:12px;line-height:1.5;color:${C.ink};`, contact) : ''}
${web ? td(`padding:2px 0 0 0;font-size:12px;line-height:1.5;font-weight:700;`, link(`https://${web}`, web, 'font-weight:700;')) : ''}
${clean(s.legalName) ? td(`padding:10px 0 0 0;`, `<div style="width:32px;height:2px;background:${C.lime};font-size:0;line-height:0;">&nbsp;</div><div style="padding-top:6px;font-size:11px;line-height:1.4;color:${C.muted};">${esc(clean(s.legalName))}</div>`) : ''}
</table>`.replace(/\n+/g, '\n');
}

export function signatureText(s: SignatureInput): string {
  const web = clean(s.website).replace(/^https?:\/\//, '').replace(/\/$/, '');
  return [clean(s.name), clean(s.title), [clean(s.phone), clean(s.email)].filter(Boolean).join(' · '), web, clean(s.legalName)].filter(Boolean).join('\n');
}

/** A complete HTML file around a fragment (for "HTML indir"). */
export function htmlFile(title: string, fragment: string, lang: DocLocale = 'tr'): string {
  return /^<!doctype/i.test(fragment.trim()) ? fragment : `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<title>${esc(title)}</title>\n</head>\n<body style="margin:16px;background:#FFFFFF;">\n${fragment}\n</body>\n</html>\n`;
}
