/**
 * Yoca admin — Turkish date picker logic (pure, client-safe; unit-tested).
 * Dates are ISO strings (YYYY-MM-DD) handled as UTC calendar days; shown as
 * dd.MM.yyyy with Turkish month / day names; weeks start on Monday.
 */

export const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const TR_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const TR_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const isIso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(t(v)) && iso(t(v)) === v;
export const addDaysIso = (d: string, n: number) => iso(t(d) + n * DAY);
/** 0 = Monday … 6 = Sunday */
export const weekday = (d: string) => (new Date(t(d)).getUTCDay() + 6) % 7;

/** "2026-11-05" → "05.11.2026" */
export function formatTr(d: string): string {
  return isIso(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '';
}
/** "5 Kasım 2026 Perşembe" (accessible name of a day) */
export function longTr(d: string): string {
  return `${Number(d.slice(8, 10))} ${TR_MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)} ${TR_DAYS[weekday(d)]}`;
}

/** Typed input: dd.MM.yyyy (also d.M.yyyy, / or - as separator). Invalid dates (31.02.) → null. */
export function parseTr(text: string): string | null {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIso(d) ? d : null;
}

export type Bounds = { min?: string | null; max?: string | null };
export const clampIso = (d: string, b: Bounds) => (b.min && d < b.min ? b.min : b.max && d > b.max ? b.max : d);
export const inBounds = (d: string, b: Bounds) => !(b.min && d < b.min) && !(b.max && d > b.max);

/** Typed value check with a Turkish message. */
export function validateTyped(text: string, b: Bounds): { ok: true; value: string } | { ok: false; error: string } {
  const v = parseTr(text);
  if (!v) return { ok: false, error: 'Tarihi gg.aa.yyyy biçiminde yazın (ör. 05.11.2026).' };
  if (b.max && v > b.max) return { ok: false, error: `En geç ${formatTr(b.max)} seçilebilir.` };
  if (b.min && v < b.min) return { ok: false, error: `En erken ${formatTr(b.min)} seçilebilir.` };
  return { ok: true, value: v };
}

function addMonths(d: string, n: number): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)) - 1 + n;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const day = Math.min(Number(d.slice(8, 10)), last);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Keyboard move inside the grid (arrows ±1 / ±7 days, PageUp/PageDown ±1 month, Home/End week start/end), kept inside the bounds. */
export function moveFocus(d: string, key: string, b: Bounds = {}): string | null {
  let next: string | null = null;
  switch (key) {
    case 'ArrowLeft': next = addDaysIso(d, -1); break;
    case 'ArrowRight': next = addDaysIso(d, 1); break;
    case 'ArrowUp': next = addDaysIso(d, -7); break;
    case 'ArrowDown': next = addDaysIso(d, 7); break;
    case 'PageUp': next = addMonths(d, -1); break;
    case 'PageDown': next = addMonths(d, 1); break;
    case 'Home': next = addDaysIso(d, -weekday(d)); break;
    case 'End': next = addDaysIso(d, 6 - weekday(d)); break;
    default: return null;
  }
  return clampIso(next, b);
}

/** 6 weeks × 7 days (Monday first) covering the month of `d`; days of other months are flagged. */
export function monthGrid(d: string): Array<Array<{ date: string; inMonth: boolean }>> {
  const first = `${d.slice(0, 7)}-01`;
  const start = addDaysIso(first, -weekday(first));
  const month = d.slice(0, 7);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(start, w * 7 + i);
    return { date, inMonth: date.slice(0, 7) === month };
  }));
}
export const monthTitle = (d: string) => `${TR_MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export { addMonths as addMonthsIso };
