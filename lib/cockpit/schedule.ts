/**
 * Yoca cockpit — per-site check frequency (pure; shared by the cron, the manual
 * check, the panel and the morning summary).
 *
 * One cron (every 15 minutes) runs only the sites whose next_check_at has come.
 * After a FIRST failed check (fail_count 0 → 1, site not alerted) a single
 * confirmation check is scheduled 15 minutes later, whatever the frequency; a
 * second failure then raises the alert (siteAlerts.ts: two failures in a row).
 * Afterwards the site returns to its own interval — an alerted site never
 * schedules more confirmations, so there is no retry loop.
 */

export const CHECK_INTERVALS = ['15m', '1h', '6h', '24h', '7d', 'manual'] as const;
export type CheckInterval = (typeof CHECK_INTERVALS)[number];

export const INTERVAL_LABEL: Record<CheckInterval, string> = {
  '15m': '15 dakikada bir',
  '1h': 'Saatlik',
  '6h': '6 saatte bir',
  '24h': '24 saatte bir',
  '7d': 'Haftada bir',
  manual: 'Otomatik kontrol kapalı — yalnız elle',
};

const MIN = 60_000;
export const INTERVAL_MS: Record<Exclude<CheckInterval, 'manual'>, number> = {
  '15m': 15 * MIN,
  '1h': 60 * MIN,
  '6h': 6 * 60 * MIN,
  '24h': 24 * 60 * MIN,
  '7d': 7 * 24 * 60 * MIN,
};

/** The single confirmation after a first failure (one cron tick later). */
export const CONFIRM_DELAY_MS = 15 * MIN;
/** "Sonuç güncel değil" only when the planned check is this late (a missed cron, not a long interval). */
export const OVERDUE_GRACE_MS = 30 * MIN;
/** Manual "Şimdi kontrol et": at most once per site in this window (enforced in the database). */
export const MANUAL_GAP_S = 120;
/** RDAP (domain expiry) at most this often, and only together with a real check. */
export const DOMAIN_REFRESH_MS = 24 * 60 * MIN;
/** How long one run holds a site (longer than a whole check: page 10 s + TLS 8 s + RDAP). */
export const LEASE_S = 120;

/** Intervals at which a short outage between two checks can go unseen. */
export const LONG_INTERVALS: CheckInterval[] = ['24h', '7d', 'manual'];

export function isInterval(value: unknown): value is CheckInterval {
  return typeof value === 'string' && (CHECK_INTERVALS as readonly string[]).includes(value);
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Next schedule after a real check (cron or manual) that finished at `now`.
 * firstFailure: this check failed and the previous one had not (fail_count was 0)
 * and the site is not alerted → one confirmation in 15 minutes.
 */
export function nextSchedule(input: { interval: CheckInterval; failed: boolean; prevFailCount: number; alerted: boolean; now: number }): { next_check_at: string | null; confirm_pending: boolean } {
  const { interval, failed, prevFailCount, alerted, now } = input;
  if (interval === 'manual') return { next_check_at: null, confirm_pending: false };
  const firstFailure = failed && (prevFailCount ?? 0) === 0 && !alerted;
  if (firstFailure && INTERVAL_MS[interval] > CONFIRM_DELAY_MS) return { next_check_at: iso(now + CONFIRM_DELAY_MS), confirm_pending: true };
  return { next_check_at: iso(now + INTERVAL_MS[interval]), confirm_pending: false };
}

/**
 * Next check after the admin changes the frequency. Only the schedule moves:
 * fail count, alert state and the last result stay as they are (no message).
 * A pending confirmation is kept (the failure it confirms already happened).
 */
export function nextAfterIntervalChange(input: { interval: CheckInterval; lastCheckedAt: string | null; confirmPending: boolean; currentNext: string | null; now: number }): { next_check_at: string | null; confirm_pending: boolean } {
  const { interval, lastCheckedAt, confirmPending, currentNext, now } = input;
  if (interval === 'manual') return { next_check_at: null, confirm_pending: false };
  if (confirmPending && currentNext) return { next_check_at: currentNext, confirm_pending: true };
  const last = lastCheckedAt ? Date.parse(lastCheckedAt) : NaN;
  if (Number.isNaN(last)) return { next_check_at: null, confirm_pending: false }; // never checked: due at the next cron
  return { next_check_at: iso(Math.max(now, last + INTERVAL_MS[interval])), confirm_pending: false };
}

export type Freshness = 'never' | 'manual' | 'fresh' | 'overdue';

/**
 * Is the shown result still what the schedule promises? "overdue" only when the
 * planned check is more than 30 minutes late — a weekly site checked yesterday is fresh.
 */
export function resultFreshness(input: { interval: CheckInterval; lastAttemptAt: string | null; nextCheckAt: string | null; now: number }): Freshness {
  const { interval, lastAttemptAt, nextCheckAt, now } = input;
  if (!lastAttemptAt || Number.isNaN(Date.parse(lastAttemptAt))) return 'never';
  if (interval === 'manual') return 'manual';
  const due = nextCheckAt ? Date.parse(nextCheckAt) : Date.parse(lastAttemptAt) + INTERVAL_MS[interval];
  if (Number.isNaN(due)) return 'fresh';
  return now > due + OVERDUE_GRACE_MS ? 'overdue' : 'fresh';
}

/** RDAP with this check? Only when the stored expiry is older than a day (or missing). */
export function domainDue(domainCheckedAt: string | null, now: number): boolean {
  const t = domainCheckedAt ? Date.parse(domainCheckedAt) : NaN;
  return Number.isNaN(t) || now - t >= DOMAIN_REFRESH_MS;
}
