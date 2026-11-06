/**
 * Yoca Operasyon — which reminders are due today (pure; unit-tested).
 *
 * A reminder belongs to one target date (end of the open period, or the
 * cancellation deadline) and one offset (30/14/7/1 days before, or the day
 * itself = 0). Its dedupe key contains the target date, so moving a date
 * creates new reminders and the same reminder is never planned twice.
 *
 * Catch-up after an outage: when several offsets have passed without being
 * sent (e.g. the cron did not run for two weeks), ONLY the most urgent one is
 * sent; the older ones are recorded as "skipped" — no burst of stale
 * messages. Nothing is planned after the target date except one "geçti"
 * (offset −1) notice per date.
 */

import { daysUntil, DEFAULT_REMINDER_DAYS, type PeriodRow, type Service } from '@/lib/ops/model';

export interface PlannedReminder {
  dedupeKey: string;
  serviceId: string;
  periodId: string | null;
  kind: 'reminder' | 'cancel_reminder' | 'customer_reminder';
  audience: 'team' | 'customer';
  offsetDays: number;      // 30, 14, 7, 1, 0 (= today), −1 (= passed)
  targetDate: string;
  /** Recorded as skipped (superseded by a more urgent one), not sent. */
  skip: boolean;
}

export interface PlanInput {
  services: Service[];
  openPeriods: Map<string, PeriodRow>;
  today: string;
  defaultDays?: number[];
  /** Cancellation-deadline reminders when the service has none of its own (Operasyon ayarları). */
  defaultCancelDays?: number[];
  /** @deprecated ignored: reminders are planned for the team only (automatic customer e-mails are off). */
  customerEnabled?: boolean;
  /** Keys already in ops_notifications (any status). */
  existing: Set<string>;
}

export const reminderKey = (kind: string, serviceId: string, periodId: string | null, target: string, offset: number, audience: string) =>
  `${kind}:${serviceId}:${periodId ?? '-'}:${target}:${offset}:${audience}`;

function planFor(target: string, days: number[], today: string, make: (offset: number) => PlannedReminder, existing: Set<string>): PlannedReminder[] {
  const left = daysUntil(target, today);
  const offsets = Array.from(new Set([...days.filter((d) => Number.isInteger(d) && d > 0 && d <= 365), 0])).sort((a, b) => b - a);
  if (left < 0) {
    // Passed: a single "geçti" notice, and only within a week (no reminders months later).
    if (left < -7) return [];
    const r = make(-1);
    return existing.has(r.dedupeKey) ? [] : [r];
  }
  const passed = offsets.filter((o) => left <= o); // thresholds reached
  if (!passed.length) return [];
  const current = Math.min(...passed);
  const out: PlannedReminder[] = [];
  for (const o of passed) {
    const r = make(o);
    if (existing.has(r.dedupeKey)) continue;
    out.push({ ...r, skip: o !== current });
  }
  return out;
}

export function planReminders(input: PlanInput): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const defaults = input.defaultDays?.length ? input.defaultDays : DEFAULT_REMINDER_DAYS;
  for (const s of input.services) {
    if (s.archived_at || s.status === 'cancelled' || s.is_perpetual || s.period === 'once') continue;
    const open = input.openPeriods.get(s.id) ?? null;
    if (open?.renewed_at) continue; // verified: nothing to remind
    const end = open?.ends_on ?? s.end_on;
    const days = s.reminder_days?.length ? s.reminder_days : defaults;
    if (end) {
      out.push(...planFor(end, days, input.today, (o) => ({ dedupeKey: reminderKey('reminder', s.id, open?.id ?? null, end, o, 'team'), serviceId: s.id, periodId: open?.id ?? null, kind: 'reminder', audience: 'team', offsetDays: o, targetDate: end, skip: false }), input.existing));
    }
    const cancelDays = s.cancel_reminder_days?.length ? s.cancel_reminder_days : input.defaultCancelDays ?? [];
    if (s.cancel_by && cancelDays.length) {
      const cb = s.cancel_by;
      out.push(...planFor(cb, cancelDays, input.today, (o) => ({ dedupeKey: reminderKey('cancel_reminder', s.id, open?.id ?? null, cb, o, 'team'), serviceId: s.id, periodId: open?.id ?? null, kind: 'cancel_reminder', audience: 'team', offsetDays: o, targetDate: cb, skip: false }), input.existing).filter((r) => r.offsetDays >= 0));
    }
  }
  return out;
}

/** "30 gün sonra", "yarın", "bugün", "geçti". */
export function offsetText(offset: number): string {
  if (offset < 0) return 'tarihi geçti';
  if (offset === 0) return 'bugün';
  if (offset === 1) return 'yarın';
  return `${offset} gün sonra`;
}

/**
 * Default text for a MANUAL forward ("E-postayla ilet"): only the service name,
 * its end date and the customer's name — never costs, profit, provider,
 * internal notes or access details. Shown and editable before sending.
 */
export function customerReminderText(s: Pick<Service, 'name' | 'kind'>, target: string, offset: number, clientName: string | null): { subject: string; text: string } {
  const date = new Date(`${target}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
  const hello = `Merhaba${clientName ? ` ${clientName}` : ''},`;
  if (offset < 0) {
    return {
      subject: `Hatırlatma: ${s.name} dönemi sona erdi (${date})`,
      text: `${hello}\n\n${s.name} hizmetinizin dönemi ${date} tarihinde sona erdi. Yenileme ile ilgili bir sorunuz varsa bu e-postaya yanıt verebilirsiniz.\n\nYoca`,
    };
  }
  const when = offset === 0 ? 'bugün' : offset === 1 ? 'yarın' : `${offset} gün sonra`;
  return {
    subject: `Hatırlatma: ${s.name} ${when} yenilenecek (${date})`,
    text: `${hello}\n\n${s.name} hizmetinizin dönemi ${date} tarihinde (${when}) sona eriyor. Yenileme ile ilgili bir sorunuz varsa bu e-postaya yanıt verebilirsiniz.\n\nYoca`,
  };
}
