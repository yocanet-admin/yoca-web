/**
 * Yoca Operasyon — the TEAM daily digest (pure; unit-tested).
 *
 * Internal only: it goes to the cockpit notification address (Ayarlar →
 * Bildirimler, today mg@yoca.net) and the team Telegram chat — never to a
 * customer. It uses the cockpit notification layout (the same as "Sabah
 * özeti") and lists ONLY operations items, so nothing of the morning summary
 * is repeated (leads, CRM follow-ups, site monitoring, traffic):
 *   - reminders due today (renewal / cancellation deadline, 30/14/7/1/0 days,
 *     "tarihi geçti"),
 *   - renewals past their end date or waiting for verification,
 *   - overdue collections and overdue provider payments of open periods,
 *   - overdue operations tasks,
 *   - Giderler: overdue expenses and expenses due within 7 days (v25; the
 *     Operasyon provider payments are already in "Ödemeler", never repeated).
 * Empty → no e-mail at all.
 */

import { buttons, emailLayout, esc, kicker, section, stats, statusList, title, type Tone } from '@/lib/notifyTemplates';

export const OPS_SITE = 'https://yoca.net';

export interface DigestLine { tone: Tone; title: string; detail?: string; href?: string }

export interface DigestInput {
  /** Istanbul day, YYYY-MM-DD */
  today: string;
  reminders: DigestLine[];
  renewals: DigestLine[];
  payments: DigestLine[];
  tasks: DigestLine[];
  /** Giderler (overdue / due within 7 days); optional */
  expenses?: DigestLine[];
}

export interface Digest {
  empty: boolean;
  subject: string;
  email: string;
  /** plain-text part of the e-mail */
  text: string;
  telegram: string;
  counts: { reminders: number; renewals: number; payments: number; tasks: number; expenses: number };
}

export function buildOpsDigest(input: DigestInput): Digest {
  const expenses = input.expenses ?? [];
  const counts = { reminders: input.reminders.length, renewals: input.renewals.length, payments: input.payments.length, tasks: input.tasks.length, expenses: expenses.length };
  const total = counts.reminders + counts.renewals + counts.payments + counts.tasks + counts.expenses;
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(`${input.today}T12:00:00Z`));
  const parts = [
    counts.reminders ? `${counts.reminders} hatırlatma` : '',
    counts.renewals ? `${counts.renewals} yenileme` : '',
    counts.payments ? `${counts.payments} ödeme` : '',
    counts.tasks ? `${counts.tasks} görev` : '',
    counts.expenses ? `${counts.expenses} gider` : '',
  ].filter(Boolean);
  const subject = `Operasyon — ${parts.join(', ') || 'takip edilecek iş yok'} (${date})`;
  const sections: Array<{ heading: string; note?: string; lines: DigestLine[]; icon: string }> = [
    { icon: '⏰', heading: 'Bugünün hatırlatmaları', lines: input.reminders },
    { icon: '🔁', heading: 'Yenileme', note: 'bitişi geçen / doğrulama bekleyen', lines: input.renewals },
    { icon: '💳', heading: 'Ödemeler', note: 'gecikenler', lines: input.payments },
    { icon: '📌', heading: 'Geciken görevler', lines: input.tasks },
    { icon: '🧾', heading: 'Giderler', note: 'geciken / 7 gün içinde vadesi gelen', lines: expenses },
  ].filter((s) => s.lines.length);

  const email = emailLayout({
    preheader: parts.length ? `Bugün: ${parts.join(', ')}.` : 'Takip edilecek iş yok.',
    label: 'Operasyon özeti',
    body:
      kicker(`Operasyon · ${date}`) +
      title('Bugün takip edilecekler') +
      stats([
        { label: 'Hatırlatma', value: counts.reminders, tone: counts.reminders ? 'lime' : 'muted' },
        { label: 'Yenileme', value: counts.renewals, tone: counts.renewals ? 'amber' : 'muted' },
        { label: 'Ödeme', value: counts.payments, tone: counts.payments ? 'red' : 'muted' },
        { label: 'Görev', value: counts.tasks, tone: counts.tasks ? 'amber' : 'muted' },
        ...(counts.expenses ? [{ label: 'Gider', value: counts.expenses, tone: 'amber' as const }] : []),
      ]) +
      sections.map((s) => section(s.heading, statusList(s.lines.slice(0, 25)), s.lines.length > 25 ? `${s.note ? `${s.note} · ` : ''}ilk 25 / ${s.lines.length}` : s.note)).join('') +
      `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>` +
      buttons([{ label: 'Operasyonu aç', href: `${OPS_SITE}/admin/ops`, primary: true }, { label: 'Ödemeler ve yenilemeler', href: `${OPS_SITE}/admin/ops/finance` }, ...(counts.expenses ? [{ label: 'Giderler', href: `${OPS_SITE}/admin/expenses` }] : [])]),
  });

  const telegram =
    `🗂 <b>OPERASYON</b>  ·  ${esc(date)}\n━━━━━━━━━━━━━━\n` +
    `⏰ <b>${counts.reminders}</b> hatırlatma   🔁 <b>${counts.renewals}</b> yenileme   💳 <b>${counts.payments}</b> ödeme   📌 <b>${counts.tasks}</b> görev${counts.expenses ? `   🧾 <b>${counts.expenses}</b> gider` : ''}\n\n` +
    sections
      .map((s) => `${s.icon} <b>${esc(s.heading)}</b>\n` + s.lines.slice(0, 8).map((l) => `   • ${esc(l.title)}${l.detail ? ` — <i>${esc(l.detail)}</i>` : ''}`).join('\n') + (s.lines.length > 8 ? `\n   <i>+${s.lines.length - 8} daha</i>` : ''))
      .join('\n\n');

  const text = [
    subject, '',
    ...sections.flatMap((s) => [s.heading.toLocaleUpperCase('tr-TR'), ...s.lines.map((l) => `- ${l.title}${l.detail ? ` — ${l.detail}` : ''}${l.href ? ` (${l.href})` : ''}`), '']),
    `Operasyon: ${OPS_SITE}/admin/ops`,
  ].join('\n');

  return { empty: total === 0, subject, email, text, telegram, counts };
}

/* ── Delivery per channel (e-mail and Telegram tracked separately) ── */

export type ChannelState = 'pending' | 'sent' | 'failed' | 'unknown' | 'skipped';
export interface ChannelInfo { state: ChannelState; error?: string | null; at?: string | null; providerId?: string | null }
export interface DigestChannels { email: ChannelInfo; telegram: ChannelInfo }
export const MAX_DIGEST_ATTEMPTS = 3;

/**
 * Channels to send in this run. A channel that already succeeded is never
 * sent again (no second copy of the same digest).
 *  - e-mail: pending, failed or unknown. An unknown e-mail is repeated ONLY
 *    with the same Idempotency-Key (yoca-ops-digest-<day>): Resend returns
 *    the first result and does not send a second copy.
 *  - Telegram: pending or failed (Telegram said "not delivered"). An unknown
 *    Telegram send is NOT repeated: the Bot API has no idempotency key, so a
 *    retry could post the digest twice. It is reported for a manual check.
 */
export function channelsToSend(c: DigestChannels): Array<'email' | 'telegram'> {
  const out: Array<'email' | 'telegram'> = [];
  if (c.email.state === 'pending' || c.email.state === 'failed' || c.email.state === 'unknown') out.push('email');
  if (c.telegram.state === 'pending' || c.telegram.state === 'failed') out.push('telegram');
  return out;
}

/** Overall state of the day's digest after a run. */
export function digestOutcome(c: DigestChannels, attempts: number): { status: 'sent' | 'failed' | 'suppressed'; retry: boolean; anySent: boolean; error: string | null } {
  const anySent = c.email.state === 'sent' || c.telegram.state === 'sent';
  const retryable = channelsToSend(c).length > 0 && attempts < MAX_DIGEST_ATTEMPTS;
  const allSkipped = c.email.state === 'skipped' && c.telegram.state === 'skipped';
  const notes = [
    c.email.state === 'failed' ? `E-posta gönderilemedi${c.email.error ? ` (${c.email.error})` : ''}${retryable ? '; sonraki çalışmada yeniden denenecek' : ''}.` : '',
    c.email.state === 'unknown' ? `E-posta sonucu belirsiz${c.email.error ? ` (${c.email.error})` : ''}${retryable ? '; aynı gönderim anahtarıyla yeniden sorulacak (ikinci kopya gitmez)' : ''}.` : '',
    c.telegram.state === 'failed' ? `Telegram gönderilemedi${c.telegram.error ? ` (${c.telegram.error})` : ''}${retryable ? '; sonraki çalışmada yeniden denenecek' : ''}.` : '',
    c.telegram.state === 'unknown' ? `Telegram sonucu belirsiz${c.telegram.error ? ` (${c.telegram.error})` : ''}; mükerrer mesaj riskine karşı otomatik tekrar yapılmadı, grupta kontrol edin.` : '',
  ].filter(Boolean);
  const status = retryable ? 'failed' : anySent ? 'sent' : allSkipped ? 'suppressed' : 'failed';
  return { status, retry: retryable, anySent, error: notes.length ? notes.join(' ') : allSkipped ? 'Bildirim kanalı kurulu değil (e-posta/Telegram).' : null };
}
