import { getNotifySettings } from '@/lib/cockpit/settings';
import { getDict } from '@/lib/i18n';
import {
  SITE,
  buttons,
  emailLayout,
  esc,
  facts,
  istanbulTime,
  kicker,
  para,
  quote,
  score as scoreBlock,
  section,
  tgBar,
  tgFacts,
  tgHead,
  tgQuote,
  title,
  type TelegramButton,
} from '@/lib/notifyTemplates';

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

const NOTIFY_FROM = process.env.NOTIFY_EMAIL_FROM ?? 'Yoca <noreply@yoca.net>';
// Test environments point these at a capture server; production leaves them unset.
const RESEND_ENDPOINT = process.env.NOTIFY_RESEND_ENDPOINT || 'https://api.resend.com/emails';
// A test capture endpoint behind the Supabase gateway also needs the key as `apikey`.
const CAPTURE_MODE = Boolean(process.env.NOTIFY_RESEND_ENDPOINT);
const TELEGRAM_API = (process.env.NOTIFY_TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '');

export type ChannelResult = 'sent' | 'skipped' | 'error';
export type AlertKind = 'lead' | 'site' | 'summary' | 'test' | 'ops';

export function escapeHtml(value: string): string {
  return esc(value);
}

/** Simple message in the shared layout (kept for older callers). */
export function wrapTemplate(heading: string, bodyHtml: string): string {
  return emailLayout({ preheader: heading, label: heading, body: title(heading) + `<div style="font:400 14px/1.65 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#A1A1A1;">${bodyHtml}</div>` });
}

export async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<ChannelResult> {
  // Test capture (staging): the capture endpoint is behind the test project's
  // gateway, which takes its public anon key; production never sets the endpoint.
  const key = process.env.RESEND_API_KEY || (CAPTURE_MODE ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined);
  if (!key || !to) return 'skipped';
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(CAPTURE_MODE ? { apikey: key } : {}) },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: to.split(',').map((x) => x.trim()).filter(Boolean),
        subject,
        html,
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
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
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

/**
 * Telegram message with an exact outcome (used where a retry must not
 * duplicate a message, e.g. the Operasyon digest):
 *   sent     Telegram answered ok
 *   failed   Telegram answered with an error that means "not delivered"
 *            (4xx, incl. 429 rate limit) → safe to try again later
 *   unknown  no answer / timeout / 5xx → it may have been delivered; the
 *            Bot API has no idempotency key, so this must NOT be retried blindly
 *   skipped  no bot token or no chat
 */
export async function sendTelegramChecked(chatId: string | null | undefined, html: string, keyboard?: TelegramButton[][], timeoutMs = 15_000): Promise<{ result: 'sent' | 'failed' | 'unknown' | 'skipped'; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { result: 'skipped' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST', signal: ctrl.signal, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}) }),
    });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (response.ok && json?.ok) return { result: 'sent' };
    const msg = `Telegram ${response.status}${json?.description ? `: ${String(json.description).slice(0, 160)}` : ''}`;
    if (response.status >= 400 && response.status < 500) return { result: 'failed', error: msg };
    return { result: 'unknown', error: msg };
  } catch (error) {
    return { result: 'unknown', error: (error as Error).name === 'AbortError' ? 'Telegram zamanında yanıt vermedi.' : `Telegram bağlantı hatası: ${(error as Error).message.slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Telegram message in HTML parse mode (escape user text with escapeHtml). */
export async function sendTelegram(chatId: string | null | undefined, html: string, keyboard?: TelegramButton[][]): Promise<ChannelResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return 'skipped';
  const result = await telegramApi('sendMessage', {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
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
  /** Full e-mail document (build it with emailLayout). */
  email: string;
  telegram: string;
  /** Inline URL buttons under the Telegram message (rows of buttons). */
  keyboard?: TelegramButton[][];
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
    sendEmail(settings.email_to, alert.subject, alert.email, alert.replyTo),
    sendTelegram(settings.telegram_chat_id, alert.telegram, alert.keyboard),
  ]);
  return { email, telegram };
}

const LOCALE_NAME: Record<string, string> = { tr: 'Türkçe', en: 'İngilizce', az: 'Azerbaycanca', ar: 'Arapça' };

const leadLink = (type: 'contact' | 'checkup', id?: string | null) =>
  `${SITE}/admin/submissions${id ? `?id=${encodeURIComponent(id)}` : type === 'checkup' ? '?tab=checkup' : ''}`;

const mailto = (email: string, subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

export async function notifyContact(data: { id?: string | null; name: string; email: string; company: string; message: string; locale: string }) {
  const link = leadLink('contact', data.id);
  const when = istanbulTime();
  const replySubject = 'Yoca — talebiniz hakkında';
  const email = emailLayout({
    preheader: `${data.name}${data.company ? ` · ${data.company}` : ''}: ${data.message.slice(0, 120)}`,
    label: 'Yeni proje talebi',
    body:
      kicker('Yeni proje talebi') +
      title(data.name || 'İsimsiz') +
      para(`${data.company ? `${data.company} · ` : ''}${when}`, { muted: true }) +
      quote(data.message) +
      facts([
        { label: 'E-posta', value: data.email, href: `mailto:${data.email}` },
        { label: 'Şirket', value: data.company },
        { label: 'Dil', value: LOCALE_NAME[data.locale] ?? data.locale },
      ]) +
      buttons([
        { label: 'Kokpitte aç', href: link, primary: true },
        { label: 'E-postayla yanıtla', href: mailto(data.email, replySubject) },
      ]),
  });
  const telegram = [
    tgHead('✉️', 'Yeni proje talebi', when),
    `<b>${esc(data.name || 'İsimsiz')}</b>${data.company ? `  ·  ${esc(data.company)}` : ''}`,
    tgFacts([
      { icon: '📧', value: data.email, code: true },
      { icon: '🌐', value: LOCALE_NAME[data.locale] ?? data.locale },
    ]),
    tgQuote(data.message),
  ].join('\n\n');
  return notifyAdmins({
    kind: 'lead',
    subject: `Yeni proje talebi — ${data.name}${data.company ? ` (${data.company})` : ''}`,
    email,
    telegram,
    keyboard: [[{ text: 'Kokpitte aç →', url: link }]],
    replyTo: data.email,
  });
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
  const when = istanbulTime();
  // Show the questions and answers in Turkish for the owner, whatever language the visitor used.
  const questions = getDict('tr').checkup.questions;
  const rows = Object.entries(data.answers).map(([key, answer]) => {
    const q = questions.find((item) => item.key === key);
    return { label: q?.title ?? key, value: q?.options[answer.i] ?? answer.v };
  });
  const verdict = data.score >= 70 ? 'Güçlü' : data.score >= 40 ? 'Gelişmeye açık' : 'Zayıf';
  const email = emailLayout({
    preheader: `${data.name}${data.company ? ` · ${data.company}` : ''} — dijital sağlık skoru ${data.score}/100`,
    label: 'Yeni Digital Check-Up',
    body:
      kicker('Yeni Digital Check-Up') +
      title(data.name || 'İsimsiz') +
      para(`${data.company ? `${data.company} · ` : ''}${when}`, { muted: true }) +
      scoreBlock(data.score, 'Dijital sağlık skoru') +
      facts([
        { label: 'E-posta', value: data.email, href: `mailto:${data.email}` },
        { label: 'Telefon', value: data.phone, href: data.phone ? `tel:${data.phone.replace(/[^+\d]/g, '')}` : undefined },
        { label: 'Şirket', value: data.company },
        { label: 'Dil', value: LOCALE_NAME[data.locale] ?? data.locale },
      ]) +
      section('Yanıtlar', facts(rows), `${rows.length} soru`) +
      buttons([
        { label: 'Kokpitte aç', href: link, primary: true },
        { label: 'E-postayla yanıtla', href: mailto(data.email, 'Yoca — Digital Check-Up sonucunuz') },
      ]),
  });
  const telegram = [
    tgHead('🩺', 'Yeni Digital Check-Up', when),
    `<b>${esc(data.name || 'İsimsiz')}</b>${data.company ? `  ·  ${esc(data.company)}` : ''}`,
    `<b>${data.score}</b>/100  ${tgBar(data.score)}  ${verdict}`,
    tgFacts([
      { icon: '📧', value: data.email, code: true },
      { icon: '📞', value: data.phone, code: true },
      { icon: '🌐', value: LOCALE_NAME[data.locale] ?? data.locale },
    ]),
  ].join('\n\n');
  return notifyAdmins({
    kind: 'lead',
    subject: `Yeni Digital Check-Up — ${data.name} (${data.score}/100)`,
    email,
    telegram,
    keyboard: [[{ text: 'Kokpitte aç →', url: link }]],
    replyTo: data.email,
  });
}
