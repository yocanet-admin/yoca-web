import { esc, SITE } from '@/lib/notifyTemplates';
import { absoluteMedia } from '@/lib/insightMedia';
import { COMPANY } from '@/lib/company';
import { newsletterCopy } from '@/lib/newsletter/copy';
import { teaserParagraphs, type EmailCopy, type NewsletterLocale, type PublishedVersion } from '@/lib/newsletter/core';

/**
 * Yoca — newsletter e-mails (server only).
 *
 * Table layout + inline styles (Gmail, Outlook, Apple Mail). A black brand
 * bar with the PNG logo, a light reading card (white, near-black text), a
 * lime button with black text, and a quiet footer with the reason for the
 * e-mail, preferences / unsubscribe links and the sender's name + address
 * (from Şirket bilgileri). Issue e-mails can also carry: the category, a
 * quote copied word for word from the article, a one-line invitation tied
 * to the article's CTA, two more articles in the same language and a
 * "reply to this e-mail" note. Clients with a dark mode get dark colours
 * through a small <style> block (inline colours are the light fallback).
 * Arabic renders right-to-left. Every e-mail also has a plain-text part.
 */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const C = { page: '#F2F2EE', bar: '#050505', card: '#FFFFFF', ink: '#111111', muted: '#55554F', subtle: '#8A8A84', line: '#E4E4DE', lime: '#A2FF00', quote: '#F6F6F1' };

export interface Sender {
  name: string;
  address: string;
}
const DEFAULT_SENDER: Sender = { name: COMPANY.legalName, address: COMPANY.address.line };

const DARK = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme: dark){
  .nl-page{background:#0B0B0B !important;}
  .nl-card{background:#151515 !important;}
  .nl-ink{color:#F4F4F1 !important;}
  .nl-muted{color:#BDBDB6 !important;}
  .nl-subtle{color:#8F8F88 !important;}
  .nl-quote{background:#1E1E1E !important;}
  .nl-line{border-color:#2B2B2B !important;}
  .nl-link{color:#F4F4F1 !important;}
}
[data-ogsc] .nl-page{background:#0B0B0B !important;}
[data-ogsc] .nl-card{background:#151515 !important;}
[data-ogsc] .nl-ink{color:#F4F4F1 !important;}
[data-ogsc] .nl-muted{color:#BDBDB6 !important;}
[data-ogsc] .nl-quote{background:#1E1E1E !important;}
</style>`;

function shell(opts: { locale: NewsletterLocale; title: string; preheader: string; body: string; footer: string }): string {
  const rtl = opts.locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  return `<!doctype html>
<html lang="${opts.locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.title)}</title>
${DARK}
</head>
<body class="nl-page" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" class="nl-page" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px 36px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" dir="${dir}" style="width:100%;max-width:600px;">
  <tr><td style="background:${C.bar};border-radius:10px 10px 0 0;padding:18px 26px;border-bottom:3px solid ${C.lime};" align="${align}">
    <a href="${SITE}/${opts.locale}" style="text-decoration:none;"><img src="${SITE}/brand/email/yoca-logo.png" width="92" height="26" alt="YOCA." style="display:inline-block;border:0;width:92px;height:auto;"></a>
  </td></tr>
  <tr><td class="nl-card" style="background:${C.card};border-radius:0 0 10px 10px;padding:0;" align="${align}" dir="${dir}">
    ${opts.body}
  </td></tr>
  <tr><td class="nl-subtle" style="padding:20px 8px 0 8px;font:400 12px/1.65 ${FONT};color:${C.subtle};" align="${align}" dir="${dir}">
    ${opts.footer}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(label: string, href: string, rtl: boolean): string {
  const arrow = rtl ? '&larr;' : '&rarr;';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0 0;"><tr><td style="background:${C.lime};border-radius:4px;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 22px;font:800 14px/1 ${FONT};color:#000000;text-decoration:none;">${esc(label)} ${arrow}</a>
</td></tr></table>`;
}

function senderHtml(locale: NewsletterLocale, sender: Sender, withSite: boolean): string {
  const t = newsletterCopy(locale).issue;
  const site = withSite ? ` · <a class="nl-link" href="${SITE}/${locale}" style="color:${C.muted};text-decoration:none;">${esc(t.site)}</a>` : '';
  return `<span dir="ltr">${esc(sender.name)} · ${esc(sender.address)}${site}</span>`;
}

function footer(locale: NewsletterLocale, sender: Sender, unsubscribe?: string): string {
  const t = newsletterCopy(locale).issue;
  // Both links open the preferences page (language choice + leave); one-click leave is the List-Unsubscribe header.
  const unsub = unsubscribe ? ` <a class="nl-link" href="${esc(unsubscribe)}" style="color:${C.muted};text-decoration:underline;">${esc(t.preferences)}</a> · <a class="nl-link" href="${esc(unsubscribe)}" style="color:${C.muted};text-decoration:underline;">${esc(t.unsubscribe)}</a>` : '';
  return `${esc(t.why)}${unsub}<br>${senderHtml(locale, sender, true)}`;
}

export function confirmEmail(locale: NewsletterLocale, url: string, sender: Sender = DEFAULT_SENDER): { subject: string; html: string; text: string } {
  const t = newsletterCopy(locale).confirmEmail;
  const rtl = locale === 'ar';
  const body = `<div style="padding:30px 28px 30px 28px;">
<h1 class="nl-ink" style="margin:0 0 12px 0;font:800 24px/1.25 ${FONT};letter-spacing:-0.3px;color:${C.ink};">${esc(t.heading)}</h1>
<p class="nl-muted" style="margin:0 0 20px 0;font:400 15px/1.65 ${FONT};color:${C.muted};">${esc(t.body)}</p>
${button(t.button, url, rtl)}
<p class="nl-subtle" style="margin:22px 0 0 0;font:400 13px/1.6 ${FONT};color:${C.subtle};">${esc(t.ignore)}</p>
</div>`;
  const html = shell({ locale, title: t.subject, preheader: t.preheader, body, footer: senderHtml(locale, sender, false) });
  const text = `${t.heading}\n\n${t.body}\n\n${t.button}: ${url}\n\n${t.ignore}\n\n${sender.name} · ${sender.address}`;
  return { subject: t.subject, html, text };
}

export interface IssueExtras {
  /** Category name in the article's language. */
  category?: string | null;
  /** One line under the button, from the article's CTA (contact, Check-Up, service, product). */
  cta?: { label: string; url: string } | null;
  /** Up to two more published articles in the same language. */
  more?: Array<{ title: string; url: string }>;
  sender?: Sender;
}

export function issueEmail(opts: { locale: NewsletterLocale; version: PublishedVersion; url: string; unsubscribeUrl: string; copy?: EmailCopy | null; test?: boolean } & IssueExtras): { subject: string; html: string; text: string } {
  const { version: v } = opts;
  const sender = opts.sender ?? DEFAULT_SENDER;
  // E-mail text written for the newsletter (OpenAI suggestion, edited by the admin); else title/excerpt.
  const paragraphs = opts.copy?.teaser ? teaserParagraphs(opts.copy.teaser) : [v.excerpt];
  const preheader = (opts.copy?.preheader || v.excerpt).slice(0, 160);
  const quote = opts.copy?.quote?.trim() || '';
  // The text follows the article's language (it may be a fallback language).
  const t = newsletterCopy(v.locale).issue;
  const rtl = v.locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const side = rtl ? 'right' : 'left';
  const arrow = rtl ? '&larr;' : '&rarr;';
  const p = (text: string) => `<p class="nl-muted" style="margin:0 0 14px 0;font:400 16px/1.65 ${FONT};color:${C.muted};">${esc(text)}</p>`;

  const coverUrl = absoluteMedia(v.cover_url, SITE);
  const cover = coverUrl && /^https:\/\//.test(coverUrl)
    ? `<a href="${esc(opts.url)}" style="text-decoration:none;"><img src="${esc(coverUrl)}" width="600" alt="${esc(v.cover_alt || v.title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>`
    : '';
  const kicker = `${esc(t.kicker)}${opts.category ? ` <span class="nl-subtle" style="color:${C.subtle};font-weight:600;">· ${esc(opts.category)}</span>` : ''}`;
  const quoteBlock = quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;"><tr><td class="nl-quote nl-ink" dir="${dir}" style="border-${side}:3px solid ${C.lime};background:${C.quote};padding:14px 18px;font:600 17px/1.5 ${FONT};color:${C.ink};">“${esc(quote.replace(/^["“”]+|["“”]+$/g, ''))}”</td></tr></table>`
    : '';
  const meta = v.reading_minutes ? `<p class="nl-subtle" style="margin:0 0 18px 0;font:700 12px/1.4 ${FONT};letter-spacing:0.4px;color:${C.subtle};">${v.reading_minutes} ${esc(t.minRead)}</p>` : '';
  const cta = opts.cta ? `<p style="margin:18px 0 0 0;font:600 14px/1.5 ${FONT};"><a class="nl-link" href="${esc(opts.cta.url)}" style="color:${C.ink};text-decoration:none;border-bottom:1px solid ${C.lime};">${esc(opts.cta.label)} ${arrow}</a></p>` : '';
  const more = (opts.more ?? []).slice(0, 2);
  const moreBlock = more.length
    ? `<div class="nl-line" style="border-top:1px solid ${C.line};padding:22px 28px 6px 28px;" dir="${dir}">
<p class="nl-subtle" style="margin:0 0 10px 0;font:700 12px/1.4 ${FONT};letter-spacing:0.4px;color:${C.subtle};">${esc(t.more)}</p>
${more.map((m) => `<p style="margin:0 0 14px 0;font:700 16px/1.4 ${FONT};"><a class="nl-ink" href="${esc(m.url)}" style="color:${C.ink};text-decoration:none;">${esc(m.title)} <span style="color:${C.subtle};">${arrow}</span></a></p>`).join('')}
</div>`
    : '';
  const reply = `<div class="nl-line" style="border-top:1px solid ${C.line};padding:16px 28px 22px 28px;" dir="${dir}"><p class="nl-subtle" style="margin:0;font:400 13px/1.6 ${FONT};color:${C.subtle};">${esc(t.reply)}</p></div>`;

  const body = `${cover}<div style="padding:28px 28px 30px 28px;" dir="${dir}">
<p class="nl-ink" style="margin:0 0 12px 0;font:700 11px/1.4 ${FONT};letter-spacing:0.6px;color:${C.ink};"><span style="display:inline-block;width:9px;height:9px;background:${C.lime};margin:0 8px;vertical-align:0;"></span>${kicker}</p>
<h1 class="nl-ink" style="margin:0 0 12px 0;font:800 26px/1.22 ${FONT};letter-spacing:-0.4px;color:${C.ink};">${esc(v.title)}</h1>
${p(paragraphs[0] ?? '')}${quoteBlock}${paragraphs.slice(1).map(p).join('')}
${meta}${button(t.read, opts.url, rtl)}${cta}
</div>${moreBlock}${reply}`;
  const subject = `${opts.test ? '[Deneme] ' : ''}${opts.copy?.subject || v.title}`;
  const html = shell({ locale: v.locale, title: v.title, preheader, body, footer: footer(v.locale, sender, opts.unsubscribeUrl) });
  const text = [
    `${t.kicker}${opts.category ? ` · ${opts.category}` : ''}`,
    v.title,
    paragraphs[0] ?? '',
    quote ? `“${quote.replace(/^["“”]+|["“”]+$/g, '')}”` : '',
    ...paragraphs.slice(1),
    `${t.read}: ${opts.url}`,
    opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : '',
    more.length ? `${t.more}:\n${more.map((m) => `- ${m.title}: ${m.url}`).join('\n')}` : '',
    t.reply,
    `—\n${t.why}\n${t.unsubscribe}: ${opts.unsubscribeUrl}\n${sender.name} · ${sender.address}`,
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
}
