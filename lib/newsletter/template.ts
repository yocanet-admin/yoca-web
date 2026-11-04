import { esc, SITE } from '@/lib/notifyTemplates';
import { COMPANY } from '@/lib/company';
import { newsletterCopy } from '@/lib/newsletter/copy';
import type { NewsletterLocale, PublishedVersion } from '@/lib/newsletter/core';

/**
 * Yoca — newsletter e-mails (server only).
 *
 * Table layout + inline styles (Gmail, Outlook, Apple Mail). A black brand
 * bar with the PNG logo, a light reading card (white, near-black text), a
 * lime button with black text, and a quiet footer with the reason for the
 * e-mail, the one-click unsubscribe link and the postal address.
 * Arabic renders right-to-left. Every e-mail also has a plain-text part.
 */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const C = { page: '#F2F2EE', bar: '#050505', card: '#FFFFFF', ink: '#111111', muted: '#55554F', subtle: '#8A8A84', line: '#E4E4DE', lime: '#A2FF00' };

function shell(opts: { locale: NewsletterLocale; title: string; preheader: string; body: string; footer: string }): string {
  const rtl = opts.locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  return `<!doctype html>
<html lang="${opts.locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px 36px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" dir="${dir}" style="width:100%;max-width:600px;">
  <tr><td style="background:${C.bar};border-radius:10px 10px 0 0;padding:18px 26px;border-bottom:3px solid ${C.lime};" align="${align}">
    <a href="${SITE}/${opts.locale}" style="text-decoration:none;"><img src="${SITE}/brand/email/yoca-logo.png" width="92" height="26" alt="YOCA." style="display:inline-block;border:0;width:92px;height:auto;"></a>
  </td></tr>
  <tr><td style="background:${C.card};border-radius:0 0 10px 10px;padding:0;" align="${align}" dir="${dir}">
    ${opts.body}
  </td></tr>
  <tr><td style="padding:20px 8px 0 8px;font:400 12px/1.65 ${FONT};color:${C.subtle};" align="${align}" dir="${dir}">
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

function footer(locale: NewsletterLocale, unsubscribe?: string): string {
  const t = newsletterCopy(locale).issue;
  const unsub = unsubscribe ? ` <a href="${esc(unsubscribe)}" style="color:${C.muted};text-decoration:underline;">${esc(t.unsubscribe)}</a>` : '';
  return `${esc(t.why)}${unsub}<br><span dir="ltr">${esc(COMPANY.legalName)} · ${esc(COMPANY.address.line)} · <a href="${SITE}/${locale}" style="color:${C.muted};text-decoration:none;">${esc(t.site)}</a></span>`;
}

export function confirmEmail(locale: NewsletterLocale, url: string): { subject: string; html: string; text: string } {
  const t = newsletterCopy(locale).confirmEmail;
  const rtl = locale === 'ar';
  const body = `<div style="padding:30px 28px 30px 28px;">
<h1 style="margin:0 0 12px 0;font:800 24px/1.25 ${FONT};letter-spacing:-0.3px;color:${C.ink};">${esc(t.heading)}</h1>
<p style="margin:0 0 20px 0;font:400 15px/1.65 ${FONT};color:${C.muted};">${esc(t.body)}</p>
${button(t.button, url, rtl)}
<p style="margin:22px 0 0 0;font:400 13px/1.6 ${FONT};color:${C.subtle};">${esc(t.ignore)}</p>
</div>`;
  const html = shell({ locale, title: t.subject, preheader: t.preheader, body, footer: `<span dir="ltr">${esc(COMPANY.legalName)} · ${esc(COMPANY.address.line)}</span>` });
  const text = `${t.heading}\n\n${t.body}\n\n${t.button}: ${url}\n\n${t.ignore}\n\n${COMPANY.legalName} · ${COMPANY.address.line}`;
  return { subject: t.subject, html, text };
}

export function issueEmail(opts: { locale: NewsletterLocale; version: PublishedVersion; url: string; unsubscribeUrl: string; test?: boolean }): { subject: string; html: string; text: string } {
  const { version: v } = opts;
  // The text follows the article's language (it may be a fallback language);
  // the footer follows the subscriber's language.
  const t = newsletterCopy(v.locale).issue;
  const rtl = v.locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const cover = v.cover_url && /^https:\/\//.test(v.cover_url)
    ? `<a href="${esc(opts.url)}" style="text-decoration:none;"><img src="${esc(v.cover_url)}" width="600" alt="${esc(v.cover_alt || v.title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>`
    : '';
  const meta = v.reading_minutes ? `<p style="margin:0 0 18px 0;font:700 12px/1.4 ${FONT};letter-spacing:0.4px;color:${C.subtle};">${v.reading_minutes} ${esc(t.minRead)}</p>` : '';
  const body = `${cover}<div style="padding:28px 28px 32px 28px;" dir="${dir}">
<p style="margin:0 0 12px 0;font:700 11px/1.4 ${FONT};letter-spacing:0.6px;color:${C.ink};"><span style="display:inline-block;width:9px;height:9px;background:${C.lime};margin:0 8px;vertical-align:0;"></span>${esc(t.kicker)}</p>
<h1 style="margin:0 0 12px 0;font:800 26px/1.22 ${FONT};letter-spacing:-0.4px;color:${C.ink};">${esc(v.title)}</h1>
<p style="margin:0 0 16px 0;font:400 16px/1.65 ${FONT};color:${C.muted};">${esc(v.excerpt)}</p>
${meta}${button(t.read, opts.url, rtl)}
</div>`;
  const subject = `${opts.test ? '[Deneme] ' : ''}${v.title}`;
  const html = shell({ locale: v.locale, title: v.title, preheader: v.excerpt.slice(0, 140), body, footer: footer(v.locale, opts.unsubscribeUrl) });
  const text = `${t.kicker}\n\n${v.title}\n\n${v.excerpt}\n\n${t.read}: ${opts.url}\n\n—\n${t.why}\n${t.unsubscribe}: ${opts.unsubscribeUrl}\n${COMPANY.legalName} · ${COMPANY.address.line}`;
  return { subject, html, text };
}
