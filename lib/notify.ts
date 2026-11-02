import { getNotifySettings } from '@/lib/cockpit/settings';

/**
 * Yoca — admin notifications (server only): e-mail (Resend) + Telegram.
 *
 * Each channel works on its own and is skipped silently when it is not set
 * up, so a form submission never fails because of a notification.
 *
 * Env (secrets, Vercel):
 *   RESEND_API_KEY      Resend API key (https://resend.com), domain yoca.net verified
 *   NOTIFY_EMAIL_FROM   Sender (default: Yoca <noreply@yoca.net>)
 *   TELEGRAM_BOT_TOKEN  Bot token from @BotFather
 * Settings (admin → Ayarlar, table cockpit_settings):
 *   recipient e-mail, Telegram chat, and on/off switches per alert kind.
 */

const SITE = 'https://yoca.net';
const NOTIFY_FROM = process.env.NOTIFY_EMAIL_FROM ?? 'Yoca <noreply@yoca.net>';

export type ChannelResult = 'sent' | 'skipped' | 'error';
export type AlertKind = 'lead' | 'site' | 'summary' | 'test';

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function wrapTemplate(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#050505;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="padding:0 8px 24px 8px;">
    <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:1px;">YOCA</span><span style="font-size:22px;font-weight:bold;color:#A2FF00;">.</span>
  </td></tr>
  <tr><td style="background:#0C0C0C;border:1px solid #292929;border-radius:8px;padding:32px 28px;">
    <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.4;color:#ffffff;">${escapeHtml(heading)}</h1>
    <div style="font-size:14px;line-height:1.7;color:#A1A1A1;">${bodyHtml}</div>
  </td></tr>
  <tr><td style="padding:20px 8px;font-size:12px;color:#737373;">
    Yoca kokpit · <a href="${SITE}/admin" style="color:#A2FF00;">yoca.net/admin</a> · Bildirim ayarları: Ayarlar sayfası
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function sendEmail(to: string, subject: string, heading: string, bodyHtml: string, replyTo?: string): Promise<ChannelResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return 'skipped';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: to.split(',').map((x) => x.trim()).filter(Boolean),
        subject,
        html: wrapTemplate(heading, bodyHtml),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!response.ok) {
      console.error('notify: Resend responded', response.status, (await response.text()).slice(0, 300));
      return 'error';
    }
    return 'sent';
  } catch (error) {
    console.error('notify: e-mail failed', error);
    return 'error';
  }
}

/** Telegram Bot API call (server only). Returns the parsed JSON or null. */
export async function telegramApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return (await response.json()) as { ok: boolean; result?: T; description?: string };
  } catch (error) {
    console.error('notify: telegram request failed', error);
    return null;
  }
}

/** Telegram message in HTML parse mode (escape user text with escapeHtml). */
export async function sendTelegram(chatId: string | null | undefined, html: string): Promise<ChannelResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return 'skipped';
  const result = await telegramApi('sendMessage', {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
  if (!result?.ok) {
    console.error('notify: telegram responded', result?.description);
    return 'error';
  }
  return 'sent';
}

/**
 * Send one alert to every configured channel, honouring the on/off switch
 * for its kind. `force` ignores the switch (test messages).
 */
export async function notifyAdmins(alert: {
  kind: AlertKind;
  subject: string;
  heading: string;
  html: string;
  telegram: string;
  replyTo?: string;
  force?: boolean;
}): Promise<{ email: ChannelResult; telegram: ChannelResult }> {
  const settings = await getNotifySettings();
  const enabled =
    alert.force ||
    (alert.kind === 'lead' && settings.lead_alerts) ||
    (alert.kind === 'site' && settings.site_alerts) ||
    (alert.kind === 'summary' && settings.morning_summary);
  if (!enabled) return { email: 'skipped', telegram: 'skipped' };
  const [email, telegram] = await Promise.all([
    sendEmail(settings.email_to, alert.subject, alert.heading, alert.html, alert.replyTo),
    sendTelegram(settings.telegram_chat_id, alert.telegram),
  ]);
  return { email, telegram };
}

function row(label: string, value: string): string {
  if (!value) return '';
  return `<p style="margin:0 0 6px 0;"><strong style="color:#ffffff;">${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0 0 0;"><a href="${href}" style="display:inline-block;background:#A2FF00;color:#000000;font-weight:bold;text-decoration:none;padding:10px 16px;border-radius:4px;">${escapeHtml(label)}</a></p>`;
}

const leadLink = (type: 'contact' | 'checkup', id?: string | null) =>
  `${SITE}/admin/submissions${id ? `?id=${encodeURIComponent(id)}` : type === 'checkup' ? '?tab=checkup' : ''}`;

export async function notifyContact(data: { id?: string | null; name: string; email: string; company: string; message: string; locale: string }) {
  const link = leadLink('contact', data.id);
  const body =
    row('İsim', data.name) +
    row('E-posta', data.email) +
    row('Şirket', data.company) +
    row('Dil', data.locale) +
    `<p style="margin:12px 0 0 0;white-space:pre-line;">${escapeHtml(data.message)}</p>` +
    button(link, 'Kokpitte aç');
  const snippet = data.message.length > 400 ? `${data.message.slice(0, 400)}…` : data.message;
  const telegram =
    `✉️ <b>Yeni proje talebi</b>\n<b>${escapeHtml(data.name)}</b>${data.company ? ` · ${escapeHtml(data.company)}` : ''}\n${escapeHtml(data.email)}\n\n` +
    `${escapeHtml(snippet)}\n\n<a href="${link}">Kokpitte aç</a>`;
  return notifyAdmins({ kind: 'lead', subject: `Yeni proje talebi — ${data.name}`, heading: 'Yeni proje talebi', html: body, telegram, replyTo: data.email });
}

export async function notifyCheckup(data: {
  id?: string | null;
  name: string;
  email: string;
  company: string;
  phone: string;
  locale: string;
  score: number;
  answers: Record<string, { i: number; v: string }>;
}) {
  const link = leadLink('checkup', data.id);
  let body =
    row('İsim', data.name) +
    row('E-posta', data.email) +
    row('Şirket', data.company) +
    row('Telefon', data.phone) +
    row('Dil', data.locale) +
    `<p style="margin:12px 0 8px 0;"><strong style="color:#A2FF00;">Dijital sağlık skoru: ${data.score}/100</strong></p>`;
  for (const [key, answer] of Object.entries(data.answers)) {
    body += `<p style="margin:0 0 4px 0;"><strong style="color:#F4F4F1;">${escapeHtml(key)}</strong>: ${escapeHtml(answer.v)}</p>`;
  }
  body += button(link, 'Kokpitte aç');
  const telegram =
    `🩺 <b>Yeni Digital Check-Up</b> — skor <b>${data.score}/100</b>\n<b>${escapeHtml(data.name)}</b>${data.company ? ` · ${escapeHtml(data.company)}` : ''}\n` +
    `${escapeHtml(data.email)}${data.phone ? ` · ${escapeHtml(data.phone)}` : ''}\n\n<a href="${link}">Kokpitte aç</a>`;
  return notifyAdmins({
    kind: 'lead',
    subject: `Yeni Digital Check-Up — ${data.name} (${data.score}/100)`,
    heading: 'Yeni Digital Check-Up başvurusu',
    html: body,
    telegram,
    replyTo: data.email,
  });
}
