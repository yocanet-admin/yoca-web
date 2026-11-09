import type { SiteCheck, SiteState } from '@/lib/cockpit/monitor';

/**
 * Yoca cockpit — what one cron check changes for one monitored site (pure; the
 * cron route writes the patch and sends the messages).
 *
 * One alert per incident: a site must fail two checks in a row before an alert
 * goes out (`alerted` then stays true, so later failures — whatever their reason
 * or label — never alert again). "unknown" (the check did not finish or was
 * refused) is a failed check too: it is never "up" and never a recovery. Only a
 * check where the site really answered (up / slow) ends the incident.
 */

export const FAILED_STATES: SiteState[] = ['down', 'suspended', 'unknown'];

export interface AlertRow {
  fail_count: number | null;
  alerted: boolean;
  signature_alerted: boolean;
  expects_signature: boolean;
}

export interface SiteTransition {
  patch: { last_state: string; last_checked_at: string; fail_count: number; alerted?: boolean; signature_alerted?: boolean };
  /** At most one message per kind for this site in this run. */
  alert: 'down' | 'unchecked' | null;
  recovered: boolean;
  unsigned: boolean;
}

export function siteTransition(row: AlertRow, check: Pick<SiteCheck, 'state' | 'checkedAt' | 'signature'>): SiteTransition {
  const failed = FAILED_STATES.includes(check.state);
  const patch: SiteTransition['patch'] = {
    last_state: check.state,
    last_checked_at: check.checkedAt,
    fail_count: failed ? (row.fail_count ?? 0) + 1 : 0,
  };
  let alert: SiteTransition['alert'] = null;
  let recovered = false;
  let unsigned = false;
  if (failed && patch.fail_count >= 2 && !row.alerted) {
    patch.alerted = true;
    alert = check.state === 'unknown' ? 'unchecked' : 'down';
  }
  if (!failed && row.alerted) {
    patch.alerted = false;
    recovered = true;
  }
  if (row.expects_signature && check.signature === false && !failed && !row.signature_alerted) {
    patch.signature_alerted = true;
    unsigned = true;
  }
  if (check.signature === true && row.signature_alerted) patch.signature_alerted = false;
  return { patch, alert, recovered, unsigned };
}
