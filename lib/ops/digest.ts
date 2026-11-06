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
 *   - overdue operations tasks.
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
}

export interface Digest {
  empty: boolean;
  subject: string;
  email: string;
  telegram: string;
  counts: { reminders: number; renewals: number; payments: number; tasks: number };
}

export function buildOpsDigest(input: DigestInput): Digest {
  const counts = { reminders: input.reminders.length, renewals: input.renewals.length, payments: input.payments.length, tasks: input.tasks.length };
  const total = counts.reminders + counts.renewals + counts.payments + counts.tasks;
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(`${input.today}T12:00:00Z`));
  const parts = [
    counts.reminders ? `${counts.reminders} hatırlatma` : '',
    counts.renewals ? `${counts.renewals} yenileme` : '',
    counts.payments ? `${counts.payments} ödeme` : '',
    counts.tasks ? `${counts.tasks} görev` : '',
  ].filter(Boolean);
  const subject = `Operasyon — ${parts.join(', ') || 'takip edilecek iş yok'} (${date})`;
  const sections: Array<{ heading: string; note?: string; lines: DigestLine[]; icon: string }> = [
    { icon: '⏰', heading: 'Bugünün hatırlatmaları', lines: input.reminders },
    { icon: '🔁', heading: 'Yenileme', note: 'bitişi geçen / doğrulama bekleyen', lines: input.renewals },
    { icon: '💳', heading: 'Ödemeler', note: 'gecikenler', lines: input.payments },
    { icon: '📌', heading: 'Geciken görevler', lines: input.tasks },
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
      ]) +
      sections.map((s) => section(s.heading, statusList(s.lines.slice(0, 25)), s.lines.length > 25 ? `${s.note ? `${s.note} · ` : ''}ilk 25 / ${s.lines.length}` : s.note)).join('') +
      `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>` +
      buttons([{ label: 'Operasyonu aç', href: `${OPS_SITE}/admin/ops`, primary: true }, { label: 'Ödemeler ve yenilemeler', href: `${OPS_SITE}/admin/ops/finance` }]),
  });

  const telegram =
    `🗂 <b>OPERASYON</b>  ·  ${esc(date)}\n━━━━━━━━━━━━━━\n` +
    `⏰ <b>${counts.reminders}</b> hatırlatma   🔁 <b>${counts.renewals}</b> yenileme   💳 <b>${counts.payments}</b> ödeme   📌 <b>${counts.tasks}</b> görev\n\n` +
    sections
      .map((s) => `${s.icon} <b>${esc(s.heading)}</b>\n` + s.lines.slice(0, 8).map((l) => `   • ${esc(l.title)}${l.detail ? ` — <i>${esc(l.detail)}</i>` : ''}`).join('\n') + (s.lines.length > 8 ? `\n   <i>+${s.lines.length - 8} daha</i>` : ''))
      .join('\n\n');

  return { empty: total === 0, subject, email, telegram, counts };
}
