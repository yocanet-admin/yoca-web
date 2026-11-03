/**
 * Yoca — notification design kit (server only).
 *
 * E-mail: table layout + inline styles only (Gmail, Outlook, Apple Mail),
 * dark card on near-black, lime accents, PNG logo (SVG is blocked by Gmail).
 * Telegram: HTML parse mode (b, i, a, code, blockquote) + inline URL buttons.
 */

export const SITE = 'https://yoca.net';

const C = {
  page: '#050505',
  card: '#0E0E0E',
  raise: '#151515',
  line: '#242424',
  text: '#F4F4F1',
  muted: '#A1A1A1',
  subtle: '#6E6E6E',
  lime: '#A2FF00',
  green: '#40C401',
  amber: '#FFB020',
  red: '#FF5A4F',
};

export type Tone = 'lime' | 'green' | 'amber' | 'red' | 'muted';
const TONE: Record<Tone, string> = { lime: C.lime, green: C.green, amber: C.amber, red: C.red, muted: C.subtle };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── E-mail blocks ───────────────────────────────────────────────

/** Small uppercase label with the brand's slanted square. */
export function kicker(text: string, tone: Tone = 'lime'): string {
  return `<p style="margin:0 0 12px 0;font:700 11px/1.4 ${FONT};letter-spacing:1.6px;text-transform:uppercase;color:${TONE[tone]};"><span style="display:inline-block;width:9px;height:9px;background:${TONE[tone]};margin-right:8px;transform:skewX(-12deg);vertical-align:0;"></span>${esc(text)}</p>`;
}

export function title(text: string): string {
  return `<h1 style="margin:0 0 8px 0;font:800 26px/1.2 ${FONT};letter-spacing:-0.4px;color:${C.text};">${esc(text)}</h1>`;
}

export function para(text: string, opts: { muted?: boolean; html?: boolean } = {}): string {
  return `<p style="margin:0 0 16px 0;font:400 14px/1.65 ${FONT};color:${opts.muted ? C.muted : C.text};">${opts.html ? text : esc(text)}</p>`;
}

/** Label → value rows (empty values are skipped). */
export function facts(rows: Array<{ label: string; value: string; href?: string }>): string {
  const body = rows
    .filter((r) => r.value)
    .map(
      (r, i) =>
        `<tr><td style="padding:11px 0;${i ? `border-top:1px solid ${C.line};` : ''}font:600 12px/1.4 ${FONT};color:${C.subtle};width:120px;vertical-align:top;">${esc(r.label)}</td>` +
        `<td style="padding:11px 0;${i ? `border-top:1px solid ${C.line};` : ''}font:600 14px/1.45 ${FONT};color:${C.text};vertical-align:top;">${
          r.href ? `<a href="${esc(r.href)}" style="color:${C.text};text-decoration:none;border-bottom:1px solid ${C.line};">${esc(r.value)}</a>` : esc(r.value)
        }</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px 0;">${body}</table>`;
}

/** The visitor's own words, with a lime rule. */
export function quote(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;"><tr><td style="width:3px;background:${C.lime};"></td><td style="padding:14px 18px;background:${C.raise};font:400 14px/1.7 ${FONT};color:${C.text};white-space:pre-line;">${esc(text)}</td></tr></table>`;
}

export function buttons(items: Array<{ label: string; href: string; primary?: boolean }>): string {
  const cells = items
    .map((b) =>
      b.primary
        ? `<td style="padding:0 10px 10px 0;"><a href="${esc(b.href)}" style="display:inline-block;background:${C.lime};color:#000000;font:800 13px/1 ${FONT};text-decoration:none;padding:13px 20px;border-radius:4px;">${esc(b.label)} &rarr;</a></td>`
        : `<td style="padding:0 10px 10px 0;"><a href="${esc(b.href)}" style="display:inline-block;border:1px solid ${C.line};color:${C.text};font:700 13px/1 ${FONT};text-decoration:none;padding:12px 18px;border-radius:4px;">${esc(b.label)}</a></td>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 0 0;"><tr>${cells}</tr></table>`;
}

/** A row of number tiles (morning summary). */
export function stats(items: Array<{ label: string; value: string | number; tone?: Tone }>): string {
  const width = Math.floor(100 / Math.max(1, items.length));
  const cells = items
    .map(
      (s, i) =>
        `<td width="${width}%" style="padding:${i ? '0 0 0 8px' : '0'};vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${C.raise};border:1px solid ${C.line};border-radius:6px;padding:14px 12px;">` +
        `<p style="margin:0;font:800 26px/1 ${FONT};color:${s.tone && s.tone !== 'muted' ? TONE[s.tone] : C.text};">${esc(String(s.value))}</p>` +
        `<p style="margin:8px 0 0 0;font:700 10px/1.3 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${C.subtle};">${esc(s.label)}</p>` +
        `</td></tr></table></td>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px 0;"><tr>${cells}</tr></table>`;
}

/** 0–100 score with a bar. */
export function score(value: number, label: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const tone: Tone = pct >= 70 ? 'lime' : pct >= 40 ? 'amber' : 'red';
  const verdict = pct >= 70 ? 'Güçlü' : pct >= 40 ? 'Gelişmeye açık' : 'Zayıf';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px 0;background:${C.raise};border:1px solid ${C.line};border-radius:6px;"><tr><td style="padding:18px 18px 16px 18px;">` +
    `<p style="margin:0 0 4px 0;font:700 10px/1.3 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${C.subtle};">${esc(label)}</p>` +
    `<p style="margin:0 0 12px 0;font:800 34px/1 ${FONT};color:${TONE[tone]};">${pct}<span style="font-size:15px;color:${C.subtle};font-weight:700;"> / 100</span><span style="font:700 12px/1 ${FONT};color:${C.muted};margin-left:12px;">${verdict}</span></p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    (pct > 0 ? `<td width="${pct}%" style="height:6px;background:${TONE[tone]};font-size:0;line-height:0;">&nbsp;</td>` : '') +
    (pct < 100 ? `<td style="height:6px;background:${C.line};font-size:0;line-height:0;">&nbsp;</td>` : '') +
    `</tr></table></td></tr></table>`
  );
}

/** Status lines with a coloured dot (site alerts, summary sections). */
export function statusList(items: Array<{ tone: Tone; title: string; detail?: string; href?: string }>): string {
  const rows = items
    .map(
      (it, i) =>
        `<tr><td style="padding:12px 12px 12px 0;${i ? `border-top:1px solid ${C.line};` : ''}width:10px;vertical-align:top;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${TONE[it.tone]};margin-top:5px;"></span></td>` +
        `<td style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}vertical-align:top;">` +
        `<p style="margin:0;font:700 14px/1.45 ${FONT};color:${C.text};">${it.href ? `<a href="${esc(it.href)}" style="color:${C.text};text-decoration:none;">${esc(it.title)}</a>` : esc(it.title)}</p>` +
        (it.detail ? `<p style="margin:2px 0 0 0;font:400 13px/1.5 ${FONT};color:${C.muted};">${esc(it.detail)}</p>` : '') +
        `</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">${rows}</table>`;
}

/** Section heading inside the card. */
export function section(heading: string, inner: string, note?: string): string {
  return (
    `<p style="margin:22px 0 4px 0;font:800 12px/1.4 ${FONT};letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};">${esc(heading)}${
      note ? `<span style="font-weight:600;letter-spacing:0;text-transform:none;color:${C.subtle};"> · ${esc(note)}</span>` : ''
    }</p>` + inner
  );
}

export function emptyLine(text: string): string {
  return `<p style="margin:8px 0 6px 0;font:400 13px/1.5 ${FONT};color:${C.subtle};">${esc(text)}</p>`;
}

/** The full e-mail: preheader, header bar, card, footer. */
export function emailLayout(opts: { preheader: string; label: string; body: string }): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(opts.label)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:28px 14px 36px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
  <tr><td style="padding:0 4px 18px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><a href="${SITE}/admin" style="text-decoration:none;"><img src="${SITE}/brand/email/yoca-logo.png" width="96" height="27" alt="YOCA." style="display:block;border:0;width:96px;height:auto;"></a></td>
      <td align="right" style="font:700 10px/1.4 ${FONT};letter-spacing:1.6px;text-transform:uppercase;color:${C.subtle};">Kokpit</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${C.card};border:1px solid ${C.line};border-top:3px solid ${C.lime};border-radius:8px;padding:30px 28px 26px 28px;">
    ${opts.body}
  </td></tr>
  <tr><td style="padding:18px 4px 0 4px;font:400 12px/1.6 ${FONT};color:${C.subtle};">
    Bu bildirim <a href="${SITE}/admin" style="color:${C.muted};text-decoration:underline;">Yoca kokpitinden</a> gönderildi. Hangi bildirimlerin geleceğini <a href="${SITE}/admin/settings" style="color:${C.muted};text-decoration:underline;">Ayarlar</a> sayfasından seçebilirsin.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Telegram ────────────────────────────────────────────────────

export interface TelegramButton {
  text: string;
  url: string;
}

const RULE = '━━━━━━━━━━━━━━';

/** First lines of a Telegram message: icon + label, then a rule. */
export function tgHead(icon: string, label: string, sub?: string): string {
  return `${icon} <b>${esc(label.toLocaleUpperCase('tr-TR'))}</b>${sub ? `  ·  ${esc(sub)}` : ''}\n${RULE}`;
}

/** "Label  value" lines (empty values skipped). */
export function tgFacts(rows: Array<{ icon: string; value: string; code?: boolean }>): string {
  return rows
    .filter((r) => r.value)
    .map((r) => `${r.icon}  ${r.code ? `<code>${esc(r.value)}</code>` : esc(r.value)}`)
    .join('\n');
}

export function tgQuote(text: string, max = 600): string {
  const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
  return `<blockquote>${esc(clipped)}</blockquote>`;
}

/** 10-step bar: ▰▰▰▰▰▰▱▱▱▱ */
export function tgBar(value: number): string {
  const n = Math.max(0, Math.min(10, Math.round(value / 10)));
  return '▰'.repeat(n) + '▱'.repeat(10 - n);
}

export function istanbulTime(date = new Date()): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(date);
}
