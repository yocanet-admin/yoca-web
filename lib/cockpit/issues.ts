import type { SiteCheck } from '@/lib/cockpit/monitor';

/** Yoca cockpit — what a site check means, in Turkish (shared by the admin UI, alerts and the morning summary). */

export type Severity = 'good' | 'warning' | 'critical' | 'neutral';

/** What exactly failed in a site check (set by lib/cockpit/monitor.ts). */
export type SiteProblem =
  | 'check_incomplete' // timeout, connection reset/refused, DNS resolver error — the check did not finish
  | 'restricted' //       401 / 403 / 429 — the server refused this check; not proof the site is down
  | 'not_found' //        404 — the monitored address does not exist
  | 'server_error' //     5xx
  | 'http_error' //       other 4xx
  | 'tls' //              certificate could not be verified
  | 'dns_nxdomain' //     resolver answered: the domain does not exist
  | 'dns_no_address' //   the domain exists but has no A/AAAA record
  | 'suspended'; //       hosting suspension / parking page

export const PROBLEM_LABEL: Record<SiteProblem, string> = {
  check_incomplete: 'Kontrol tamamlanamadı',
  restricted: 'Erişim kısıtlı / kontrol engellendi',
  not_found: 'İzlenen adres bulunamadı',
  server_error: 'Sunucu hatası',
  http_error: 'HTTP hatası',
  tls: 'Güvenli bağlantı sorunu',
  dns_nxdomain: 'Alan adı bulunamadı',
  dns_no_address: 'Alan adının adres kaydı yok',
  suspended: 'Hosting askıya alınmış / park sayfası',
};

/** Badge text for a check: the specific problem when there is one, else the plain state. */
export function checkLabel(check: Pick<SiteCheck, 'state' | 'problem'>): string {
  if (check.problem) return PROBLEM_LABEL[check.problem];
  return { up: 'Çalışıyor', slow: 'Yavaş', down: 'Site erişilemiyor', suspended: 'Askıda', unknown: 'Kontrol tamamlanamadı' }[check.state];
}

/** Problems a site check raises, most severe first. */
export function siteIssues(check: SiteCheck): Array<{ severity: Severity; text: string }> {
  const issues: Array<{ severity: Severity; text: string }> = [];
  if (check.state === 'suspended') issues.push({ severity: 'critical', text: PROBLEM_LABEL.suspended });
  const reason = check.error ?? (check.httpStatus !== null ? `HTTP ${check.httpStatus}` : 'neden bilinmiyor');
  if (check.state === 'down') issues.push({ severity: 'critical', text: `${checkLabel(check)} — ${reason}` });
  // the check did not finish or was refused: not proof the site is down, never counted as up
  if (check.state === 'unknown') issues.push({ severity: 'warning', text: `${checkLabel(check)} — ${reason}` });
  if (check.state === 'slow') issues.push({ severity: 'warning', text: `Yavaş (${((check.ms ?? 0) / 1000).toFixed(1)} sn)` });
  if (check.sslDaysLeft !== null && check.sslDaysLeft <= 14) issues.push({ severity: check.sslDaysLeft <= 3 ? 'critical' : 'warning', text: check.sslDaysLeft < 0 ? 'SSL sertifikasının süresi geçti' : `SSL ${check.sslDaysLeft} gün içinde bitiyor` });
  if (check.domainDaysLeft !== null && check.domainDaysLeft <= 30) issues.push({ severity: check.domainDaysLeft <= 7 ? 'critical' : 'warning', text: check.domainDaysLeft < 0 ? 'Alan adının süresi geçti' : `Alan adı ${check.domainDaysLeft} gün içinde bitiyor` });
  if (check.hostingRenewsOn) {
    const days = Math.floor((Date.parse(check.hostingRenewsOn) - Date.now()) / 86_400_000);
    if (days <= 30) issues.push({ severity: days <= 7 ? 'critical' : 'warning', text: `Hosting ${days < 0 ? 'süresi geçti' : `${days} gün içinde yenilenmeli`}` });
  }
  if (check.expectsSignature && check.signature === false && check.state !== 'suspended' && check.state !== 'down' && check.state !== 'unknown') issues.push({ severity: 'warning', text: '“Built by YOCA” imzası yok' });
  return issues;
}

