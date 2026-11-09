import type { SupabaseClient } from '@supabase/supabase-js';
import { checkLabel } from '@/lib/cockpit/issues';
import { checkSites, daysUntil, type SiteCheck } from '@/lib/cockpit/monitor';
import { domainDue, isInterval, nextSchedule } from '@/lib/cockpit/schedule';
import { FAILED_STATES, siteTransition } from '@/lib/cockpit/siteAlerts';
import type { SiteRunRow } from '@/lib/cockpit/siteStatus';
import { escapeHtml, notifyAdmins } from '@/lib/notify';
import { SITE, buttons, emailLayout, istanbulTime, kicker, section, statusList, tgHead, title, type Tone } from '@/lib/notifyTemplates';

/**
 * Yoca cockpit — run checks for sites a caller has already CLAIMED (cron: the
 * due ones; manual: one site), store the result + next schedule, release the
 * claim, and send the alert / recovery / signature messages (server only).
 * Shared by /api/cron/sites and the manual "Şimdi kontrol et", so both follow
 * the same alert rules (siteAlerts.ts) and schedule rules (schedule.ts).
 */

export interface RunSummary {
  checked: number;
  down: number;
  unchecked: number;
  recovered: number;
  unsigned: number;
  sent: Awaited<ReturnType<typeof notifyAdmins>> | null;
  /** Database writes / reads that failed during the run (empty = all stored). */
  dbErrors: string[];
}

function problem(check: SiteCheck): string {
  if (check.state === 'suspended') return 'hosting askıya alınmış / park sayfası görünüyor';
  const reason = check.error ?? `HTTP ${check.httpStatus ?? '—'}`;
  if (check.state === 'unknown') return `${checkLabel(check).toLocaleLowerCase('tr')} (${reason}) · izleme noktası: Vercel ${process.env.VERCEL_REGION || 'iad1'}; site başka yerden açılıyor olabilir`;
  return `${checkLabel(check).toLocaleLowerCase('tr')} (${reason})`;
}

export async function runSiteChecks(
  supabase: SupabaseClient,
  rows: SiteRunRow[],
  options: { now?: () => number; notify?: typeof notifyAdmins; startedAt?: number; manual?: boolean } = {},
): Promise<RunSummary & { results: Array<{ id: string; check: SiteCheck }> }> {
  const now = options.now ?? Date.now;
  // the schedule is planned from when the run STARTED (its cron slot), never from when a check ended
  const startedAt = options.startedAt ?? now();
  const manual = Boolean(options.manual);
  const send = options.notify ?? notifyAdmins;
  type Item = { name: string; url: string; detail: string };
  const down: Item[] = [];
  const unchecked: Item[] = [];
  const recovered: Item[] = [];
  const unsigned: Item[] = [];
  const results: Array<{ id: string; check: SiteCheck }> = [];
  /** Writes / reads that failed: the caller reports the run as failed (never as a clean success). */
  const dbErrors: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const withDomain = domainDue(row.domain_checked_at, now());
      const [check] = await checkSites([row], { domain: withDomain });
      if (!withDomain) {
        // RDAP was not due: keep the stored expiry instead of showing "unknown"
        check.domainExpires = row.domain_expires_at;
        check.domainDaysLeft = daysUntil(row.domain_expires_at);
      }
      const { patch, alert, recovered: back, unsigned: noSignature } = siteTransition(row, check);
      if (alert) (alert === 'unchecked' ? unchecked : down).push({ name: row.name, url: row.url, detail: problem(check) });
      if (back) recovered.push({ name: row.name, url: row.url, detail: `tekrar çalışıyor${check.ms !== null ? ` · ${(check.ms / 1000).toFixed(1)} sn` : ''}` });
      if (noSignature) unsigned.push({ name: row.name, url: row.url, detail: '“Built by YOCA” imzası sitede görünmüyor' });

      const finished = now();
      const schedule = nextSchedule({ interval: row.check_interval, failed: FAILED_STATES.includes(check.state), prevFailCount: row.fail_count, alerted: row.alerted, startedAt, manual });
      const answered = check.state === 'up' || check.state === 'slow';
      const state: Record<string, unknown> = {
        last_result: check,
        next_check_at: schedule.next_check_at,
        confirm_pending: schedule.confirm_pending,
        lease_until: null,
        updated_at: new Date(finished).toISOString(),
      };
      if (answered) state.last_success_at = check.checkedAt;
      if (withDomain && check.domainExpires) {
        state.domain_checked_at = check.checkedAt;
        state.domain_expires_at = check.domainExpires;
      }
      const failed = FAILED_STATES.includes(check.state);
      const siteWrite = await supabase.from('monitored_sites').update(patch).eq('id', row.id);
      const stateWrite = await supabase.from('site_check_state').update(state).eq('site_id', row.id);
      if (siteWrite.error || stateWrite.error) dbErrors.push(`${row.name}: sonuç kaydedilemedi`);
      else {
        // the frequency may have changed while this check ran (site_check_reschedule
        // answers 'checking' then): plan with the CURRENT frequency, not the claimed one
        const current = await supabase.from('monitored_sites').select('check_interval').eq('id', row.id).maybeSingle();
        const interval = (current.data as { check_interval?: unknown } | null)?.check_interval;
        if (current.error) dbErrors.push(`${row.name}: güncel sıklık okunamadı`);
        else if (isInterval(interval) && interval !== row.check_interval) {
          const replanned = nextSchedule({ interval, failed, prevFailCount: row.fail_count, alerted: row.alerted, startedAt, manual });
          const fix = await supabase.from('site_check_state').update({ ...replanned, updated_at: new Date(now()).toISOString() }).eq('site_id', row.id);
          if (fix.error) dbErrors.push(`${row.name}: yeni sıklıkla planlanamadı`);
        }
      }
      results.push({ id: row.id, check });
    }),
  );

  let sent = null;
  if (down.length || unchecked.length || recovered.length || unsigned.length) {
    const when = istanbulTime();
    const groups: Array<{ items: Item[]; tone: Tone; heading: string; icon: string }> = [
      { items: down, tone: 'red', heading: 'Site sorunu', icon: '🔴' },
      { items: unchecked, tone: 'amber', heading: 'Kontrol tamamlanamadı / engellendi', icon: '🟠' },
      { items: recovered, tone: 'green', heading: 'Düzeldi', icon: '🟢' },
      { items: unsigned, tone: 'amber', heading: 'İmza eksik', icon: '🟠' },
    ].filter((g) => g.items.length) as Array<{ items: Item[]; tone: Tone; heading: string; icon: string }>;
    const subject = down.length
      ? `Site sorunu: ${down.map((d) => d.name).join(', ')}`
      : unchecked.length
        ? `Site kontrolü tamamlanamadı: ${unchecked.map((d) => d.name).join(', ')}`
        : recovered.length
        ? `Tekrar çalışıyor: ${recovered.map((d) => d.name).join(', ')}`
        : `İmza uyarısı: ${unsigned.map((d) => d.name).join(', ')}`;
    const lead = down.length ? 'Site sorunu' : unchecked.length ? 'Site kontrolü tamamlanamadı' : recovered.length ? 'Site tekrar çalışıyor' : 'İmza uyarısı';
    const leadTone = down.length ? 'red' : unchecked.length ? 'amber' : recovered.length ? 'green' : 'amber';
    const email = emailLayout({
      preheader: subject,
      label: lead,
      body:
        kicker(lead, leadTone) +
        title(down.length ? `${down.length} sitede sorun var` : unchecked.length ? `${unchecked.length} sitenin kontrolü tamamlanamadı` : recovered.length ? `${recovered.length} site tekrar ayakta` : 'İmza bulunamadı') +
        groups
          .map((g) => section(g.heading, statusList(g.items.map((it) => ({ tone: g.tone, title: it.name, detail: `${it.detail} · ${it.url.replace(/^https?:\/\//, '')}`, href: it.url })))))
          .join('') +
        `<p style="margin:14px 0 18px 0;font:400 12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6E6E6E;">Kontrol: ${escapeHtml(when)} · ilk başarısız kontrolden 15 dk sonra tek doğrulama yapılır; iki kontrol üst üste başarısız olunca haber verilir. Düzelme bir sonraki başarılı kontrolde anlaşılır.</p>` +
        buttons([{ label: 'Siteleri aç', href: `${SITE}/admin/sites`, primary: true }]),
    });
    const telegram =
      `${tgHead(down.length ? '🔴' : unchecked.length ? '🟠' : recovered.length ? '🟢' : '🟠', lead, when)}\n\n` +
      groups
        .map((g) => g.items.map((it) => `${g.icon} <b>${escapeHtml(it.name)}</b>\n     ${escapeHtml(it.detail)}\n     <a href="${escapeHtml(it.url)}">${escapeHtml(it.url.replace(/^https?:\/\//, ''))}</a>`).join('\n\n'))
        .join('\n\n');
    sent = await send({ kind: 'site', subject, email, telegram, keyboard: [[{ text: 'Siteleri aç →', url: `${SITE}/admin/sites` }]] });
  }

  return { checked: rows.length, down: down.length, unchecked: unchecked.length, recovered: recovered.length, unsigned: unsigned.length, sent, dbErrors, results };
}
