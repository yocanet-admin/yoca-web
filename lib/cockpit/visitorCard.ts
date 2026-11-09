import type { TrafficReport } from '@/lib/cockpit/vercel';

/**
 * Yoca cockpit — the "Ziyaretçi" tile: main value = today, below it the last
 * 7 days. Metric: Vercel Web Analytics "visitors" (unique visitors as Vercel
 * counts them), not visits or page views.
 *
 * Limits of the source, shown instead of hidden:
 *  - Vercel counts in UTC days (a day-level query snaps to UTC midnight; unique
 *    visitors cannot be re-cut to Istanbul midnight without summing hourly
 *    uniques, which would double count). So "today" = the current UTC day,
 *    i.e. from 03:00 Istanbul time, and is labelled that way.
 *  - The 7-day figure is Vercel's own total for the period (never a sum of days)
 *    and includes today (partial).
 *  - Vercel returns zero rows for hours/days it has not processed yet, so a 0
 *    today cannot be told apart from delayed data; it is shown as "no visit yet".
 */

type Response = { ok: boolean; configured?: boolean; report?: TrafficReport; error?: string } | null;

export type VisitorCardState = 'loading' | 'not_configured' | 'error' | 'no_data' | 'zero' | 'ok';

export interface VisitorCard {
  state: VisitorCardState;
  /** Main value (today); null while loading, "–" when there is nothing to show. */
  value: string | null;
  /** Line under the main value: what "today" covers, or why there is no value. */
  todayNote: string;
  /** "Son 7 gün" figure, or null when unknown. */
  week: string | null;
  /** What the 7-day figure covers. */
  weekNote: string;
}

const dayLabel = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
};
const fmt = (n: number) => new Intl.NumberFormat('tr-TR').format(n);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Tile labels: the day boundary is part of the title, not a footnote. */
export const VISITOR_TODAY_LABEL = 'Ziyaretçi · Bugün · UTC';
export const VISITOR_WEEK_LABEL = 'Son 7 gün · bugün dahil';

export function visitorCard(response: Response): VisitorCard {
  const weekNote = 'UTC günleri';
  if (!response) return { state: 'loading', value: null, todayNote: '', week: null, weekNote };
  if (response.configured === false) return { state: 'not_configured', value: '–', todayNote: 'Vercel anahtarı eklenmedi', week: null, weekNote };
  const report = response.report;
  if (!response.ok || !report) return { state: 'error', value: '–', todayNote: 'Vercel verisi alınamadı', week: null, weekNote };

  const lastDay = addDays(report.range.until, -1);
  const span = `${dayLabel(report.range.since)}–${dayLabel(lastDay)}`;
  const week = fmt(report.totals.visitors);
  const fullWeekNote = `UTC günleri · ${span} · Vercel dönem toplamı`;
  const today = report.today;
  if (!today) return { state: 'no_data', value: '–', todayNote: `${dayLabel(lastDay)} için Vercel satır döndürmedi`, week, weekNote: fullWeekNote };
  const since = `${dayLabel(today.date)} · Türkiye saatiyle 03:00'te sıfırlanır · gün sürüyor`;
  if (today.visitors === 0) return { state: 'zero', value: '0', todayNote: `henüz ziyaret yok, veri gecikebilir · ${since}`, week, weekNote: fullWeekNote };
  return { state: 'ok', value: fmt(today.visitors), todayNote: since, week, weekNote: fullWeekNote };
}
