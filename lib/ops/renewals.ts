import { daysUntil, missingInfo, renewState, type Payment, type PeriodRow, type Service } from '@/lib/ops/model';

/**
 * Yoca Operasyon — renewal figures of the live services (moved unchanged from
 * the Genel bakış page so the Kokpit card shows the same numbers).
 * `upcoming` lists the services that the 90-day figure counts, nearest first
 * (the same rows; nothing else is computed).
 */

export interface RenewalStats {
  live: Service[];
  within: Record<7 | 30 | 90, number>;
  overdue: number;
  awaiting: number;
  missing: number;
  autoUnverified: number;
  upcoming: Array<{ id: string; name: string; kind: Service['kind']; end: string; days: number }>;
}

export function renewalStats(data: { services: Service[]; periods: PeriodRow[]; payments: Payment[] }, today: string): RenewalStats {
  const live = data.services.filter((s) => !s.archived_at && s.status !== 'cancelled');
  const openOf = new Map<string, PeriodRow>();
  data.periods.forEach((p) => { if (p.status === 'open') openOf.set(p.service_id, p); });

  const within: Record<7 | 30 | 90, number> = { 7: 0, 30: 0, 90: 0 };
  let overdue = 0, awaiting = 0, missing = 0, autoUnverified = 0;
  const upcoming: RenewalStats['upcoming'] = [];
  for (const s of live) {
    const open = openOf.get(s.id) ?? null;
    const state = renewState(s, open, data.payments, today);
    const end = open?.ends_on ?? s.end_on;
    if (end && state !== 'verified' && state !== 'perpetual' && state !== 'once') {
      const d = daysUntil(end, today);
      if (d >= 0 && d <= 7) within[7] += 1;
      if (d >= 0 && d <= 30) within[30] += 1;
      if (d >= 0 && d <= 90) { within[90] += 1; upcoming.push({ id: s.id, name: s.name, kind: s.kind, end, days: d }); }
    }
    if (state === 'overdue') overdue += 1;
    if (state === 'awaiting_verification') awaiting += 1;
    if (state === 'awaiting_verification' && s.auto_renew === 'on') autoUnverified += 1;
    const miss = missingInfo(s);
    if (miss.includes('Bitiş tarihi') || miss.includes('Ekip sorumlusu')) missing += 1;
  }
  upcoming.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'tr'));
  return { live, within, overdue, awaiting, missing, autoUnverified, upcoming };
}
