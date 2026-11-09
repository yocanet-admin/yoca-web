/**
 * Yoca cockpit — per-site check frequency (pure; shared by the cron, the manual
 * check, the panel and the morning summary).
 *
 * One cron (every 15 minutes, at :00 / :15 / :30 / :45 UTC) runs only the sites
 * whose planned SLOT has come. Every planned time is a slot boundary — the
 * cron run that will do the check — so the panel shows exactly that run.
 *
 * - A check done by a cron run is planned from that run's slot, not from when it
 *   finished: a run of the 21:00 slot (started a few seconds late, or taking
 *   over three minutes) plans a 15-minute site for 21:15, a daily one for
 *   21:00 tomorrow. A run that started so late that the next slot is less than
 *   half an interval away skips to the slot after it, so a late or missed cron
 *   never produces back-to-back catch-up checks (one check, then the next slot).
 * - A manual check ("Şimdi kontrol et") is not on the grid: the next check is
 *   the first slot at least a full interval later, so daily / weekly sites are
 *   never checked early.
 * - An outage is seen at the site's next planned check (for a weekly site up
 *   to a week after it began). After that FIRST failed check (fail_count 0 → 1,
 *   site not alerted) ONE confirmation runs at the next suitable slot (at least
 *   7.5 minutes later: normally the next cron run); a second failure raises the
 *   alert (siteAlerts.ts: two failures in a row) — about 15 minutes after the
 *   first failed CHECK, not after the outage began. Afterwards the site returns
 *   to its own interval: an alerted site never schedules more confirmations (no
 *   retry loop), and a recovery is seen at the next successful check.
 * - "manual" never schedules anything, not even a confirmation: two failed
 *   manual checks in a row raise the alert.
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

/** The shared cron's slot: it runs at every multiple of this (UTC). */
export const SLOT_MS = 15 * MIN;
/** The confirmation after a first failure runs in the first slot at least this far away. */
export const CONFIRM_MIN_GAP_MS = SLOT_MS / 2;

export const slotFloor = (ms: number) => Math.floor(ms / SLOT_MS) * SLOT_MS;
export const slotCeil = (ms: number) => Math.ceil(ms / SLOT_MS) * SLOT_MS;
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
 * The slot of the next regular check after a check that STARTED at `startedAt`.
 * cron run: its slot + interval; if the run started so late that this slot is
 * less than half an interval away, the slot after it (no catch-up bursts).
 * manual check: the first slot at least a full interval later.
 */
export function plannedNext(interval: Exclude<CheckInterval, 'manual'>, startedAt: number, manual: boolean): number {
  const step = INTERVAL_MS[interval];
  if (manual) return slotCeil(startedAt + step);
  let slot = slotFloor(startedAt) + step;
  while (slot - startedAt < step / 2) slot += SLOT_MS;
  return slot;
}

/** The slot of the single confirmation after a first failure: the next slot at least 7.5 minutes away. */
export function confirmationSlot(startedAt: number): number {
  let slot = slotCeil(startedAt);
  while (slot - startedAt < CONFIRM_MIN_GAP_MS) slot += SLOT_MS;
  return slot;
}

/**
 * Next schedule after a real check that started at `startedAt` (a cron run's
 * start, or the moment of a manual check — `manual: true`).
 * firstFailure: this check failed, the previous one had not (fail_count was 0)
 * and the site is not alerted → ONE confirmation at the next suitable slot.
 * For a 15-minute site the next regular slot is that confirmation.
 */
export function nextSchedule(input: { interval: CheckInterval; failed: boolean; prevFailCount: number; alerted: boolean; startedAt: number; manual?: boolean }): { next_check_at: string | null; confirm_pending: boolean } {
  const { interval, failed, prevFailCount, alerted, startedAt } = input;
  if (interval === 'manual') return { next_check_at: null, confirm_pending: false };
  const firstFailure = failed && (prevFailCount ?? 0) === 0 && !alerted;
  if (firstFailure && interval !== '15m') return { next_check_at: iso(confirmationSlot(startedAt)), confirm_pending: true };
  return { next_check_at: iso(plannedNext(interval, startedAt, Boolean(input.manual))), confirm_pending: false };
}

/**
 * The cron slot that will actually check the site (what the panel shows): the
 * planned slot, or — when it has already passed (never checked, a missed run) —
 * the next cron run. null = no automatic check ("manual").
 * A stored time that is not on a slot (written before v29) is checked by the
 * first cron run AT OR AFTER it (the claim compares next_check_at <= now()),
 * so it is shown rounded UP — never earlier than it will really run.
 */
export function plannedSlot(input: { interval: CheckInterval; nextCheckAt: string | null; now: number }): string | null {
  if (input.interval === 'manual') return null;
  const next = input.nextCheckAt ? Date.parse(input.nextCheckAt) : NaN;
  const slot = Number.isNaN(next) ? NaN : slotCeil(next);
  return iso(!Number.isNaN(slot) && slot > input.now ? slot : slotCeil(input.now));
}

// A frequency change is planned in the database (site_check_reschedule, v29:
// same slot rules, using the stored slot / real start of the last check) under
// the row lock, so it cannot cross a running check; the run itself re-reads the
// frequency when it stores its result (siteRunner.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The claim RPC's answer → site ids. Only a real array of { claimed_id: uuid }
 * is accepted; an empty array means "nothing due" (a success). Anything else
 * (null, an object, a malformed row) is an error, never "nothing due".
 */
export function parseClaimedIds(data: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(data)) return { ok: false, error: 'beklenmeyen veritabanı yanıtı (site_checks_claim_due liste döndürmedi)' };
  const ids: string[] = [];
  for (const item of data) {
    const id = item && typeof item === 'object' ? (item as { claimed_id?: unknown }).claimed_id : undefined;
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'beklenmeyen veritabanı yanıtı (site_checks_claim_due satırı geçersiz)' };
    ids.push(id);
  }
  return { ok: true, ids };
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
