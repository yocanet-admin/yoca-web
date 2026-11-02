import type { SiteCheck } from '@/lib/cockpit/monitor';

/** Yoca cockpit — what a site check means, in Turkish (shared by the admin UI, alerts and the morning summary). */

export type Severity = 'good' | 'warning' | 'critical' | 'neutral';

/** Problems a site check raises, most severe first. */
export function siteIssues(check: SiteCheck): Array<{ severity: Severity; text: string }> {
  const issues: Array<{ severity: Severity; text: string }> = [];
  if (check.state === 'suspended') issues.push({ severity: 'critical', text: 'Hosting askıya alınmış / park sayfası' });
  if (check.state === 'down') issues.push({ severity: 'critical', text: check.error ? `Erişilemiyor — ${check.error}` : `Hata kodu ${check.httpStatus}` });
  if (check.state === 'slow') issues.push({ severity: 'warning', text: `Yavaş (${((check.ms ?? 0) / 1000).toFixed(1)} sn)` });
  if (check.sslDaysLeft !== null && check.sslDaysLeft <= 14) issues.push({ severity: check.sslDaysLeft <= 3 ? 'critical' : 'warning', text: `SSL ${check.sslDaysLeft} gün içinde bitiyor` });
  if (check.domainDaysLeft !== null && check.domainDaysLeft <= 30) issues.push({ severity: check.domainDaysLeft <= 7 ? 'critical' : 'warning', text: `Alan adı ${check.domainDaysLeft} gün içinde bitiyor` });
  if (check.hostingRenewsOn) {
    const days = Math.floor((Date.parse(check.hostingRenewsOn) - Date.now()) / 86_400_000);
    if (days <= 30) issues.push({ severity: days <= 7 ? 'critical' : 'warning', text: `Hosting ${days < 0 ? 'süresi geçti' : `${days} gün içinde yenilenmeli`}` });
  }
  if (check.expectsSignature && check.signature === false && check.state !== 'suspended' && check.state !== 'down') issues.push({ severity: 'warning', text: '“Built by YOCA” imzası yok' });
  return issues;
}
