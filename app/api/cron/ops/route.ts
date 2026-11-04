import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyAdmins, sendEmail, wrapTemplate, escapeHtml } from '@/lib/notify';
import { readOpsSettings } from '@/lib/ops/serverSettings';
import { realSendAllowed } from '@/lib/ops/settings';
import { istanbulDay, KIND_LABEL, renewState, type PeriodRow, type Payment, type Service } from '@/lib/ops/model';
import { customerReminderText, offsetText, planReminders, type PlannedReminder } from '@/lib/ops/reminders';

/**
 * Yoca Operasyon — renewal reminders (Vercel Cron 06:00 and 12:00 UTC =
 * 09:00 / 15:00 Istanbul; the second run only retries).
 *
 *  - Authorized: CRON_SECRET (same guard as the other jobs).
 *  - Once: every reminder has a dedupe key and is CLAIMED by inserting it
 *    into ops_notifications (unique key) before anything is sent; a repeated
 *    or parallel call finds the key and sends nothing.
 *  - Team: ONE daily digest (key digest:YYYY-MM-DD) with today's reminders,
 *    overdue and awaiting-verification renewals.
 *  - Customers: only when the global switch AND the service's switch are on
 *    and the service has recipients — and never from a test/preview
 *    deployment (realSendAllowed).
 *  - Failures are kept (status failed, attempts, last_error) and retried by
 *    the next run up to 3 attempts.
 *  - After an outage, only the most urgent missed reminder is sent (planner).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE = 'https://yoca.net';

export async function GET(request: NextRequest) {
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: 'no service key' }, { status: 503 });
  const today = istanbulDay();
  const { settings } = await readOpsSettings();
  const allowed = realSendAllowed({ VERCEL_ENV: process.env.VERCEL_ENV, NOTIFY_RESEND_ENDPOINT: process.env.NOTIFY_RESEND_ENDPOINT, NOTIFY_TELEGRAM_API: process.env.NOTIFY_TELEGRAM_API });

  const [svcRes, perRes, payRes] = await Promise.all([
    db.from('ops_services').select('*').is('archived_at', null),
    db.from('ops_periods').select('*').eq('status', 'open'),
    db.from('ops_payments').select('*').is('voided_at', null),
  ]);
  if (svcRes.error) return NextResponse.json({ ok: false, error: 'run supabase/upgrade-v18-operations.sql' }, { status: 500 });
  const services = (svcRes.data ?? []) as Service[];
  const open = new Map(((perRes.data ?? []) as PeriodRow[]).map((p) => [p.service_id, p]));
  const payments = (payRes.data ?? []) as Payment[];

  // Existing keys of the candidates (any status) → nothing is planned twice.
  const draft = planReminders({ services, openPeriods: open, today, defaultDays: settings.reminderDays, defaultCancelDays: settings.cancelReminderDays, customerEnabled: settings.customerNotifications, existing: new Set() });
  const keys = draft.map((r) => r.dedupeKey);
  const known = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from('ops_notifications').select('dedupe_key').in('dedupe_key', keys.slice(i, i + 200));
    for (const r of (data ?? []) as Array<{ dedupe_key: string }>) known.add(r.dedupe_key);
  }
  const planned = draft.filter((r) => !known.has(r.dedupeKey));

  // Claim: insert; only rows that WE inserted are ours to send.
  const claimed: PlannedReminder[] = [];
  for (const r of planned) {
    const row = {
      dedupe_key: r.dedupeKey, service_id: r.serviceId, period_id: r.periodId, kind: r.kind, offset_days: r.offsetDays, target_date: r.targetDate,
      audience: r.audience, status: r.skip ? 'skipped' : 'pending', last_error: r.skip ? 'Daha yakın bir hatırlatma gönderildi (kaçırılan eski hatırlatma).' : null,
      recipients: r.audience === 'customer' ? services.find((s) => s.id === r.serviceId)?.customer_recipients ?? [] : [],
    };
    const { data, error } = await db.from('ops_notifications').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    if (!error && data && data.length && !r.skip) claimed.push(r);
  }

  // Retries: failed rows from earlier runs (max 3 attempts).
  // Also claims left "pending" by an earlier run that stopped (older than 10 minutes).
  const [{ data: failedRows }, { data: staleRows }] = await Promise.all([
    db.from('ops_notifications').select('*').eq('status', 'failed').lt('attempts', 3).lte('next_attempt_at', new Date().toISOString()).neq('kind', 'digest'),
    db.from('ops_notifications').select('*').eq('status', 'pending').lt('created_at', new Date(Date.now() - 600_000).toISOString()).neq('kind', 'digest'),
  ]);
  const retryRows = [...(failedRows ?? []), ...(staleRows ?? [])];
  const retry = retryRows as Array<{ id: string; dedupe_key: string; service_id: string; period_id: string | null; kind: PlannedReminder['kind']; audience: 'team' | 'customer'; offset_days: number; target_date: string }>;
  const teamItems = [
    ...claimed.filter((r) => r.audience === 'team'),
    ...retry.filter((r) => r.audience === 'team').map((r) => ({ dedupeKey: r.dedupe_key, serviceId: r.service_id, periodId: r.period_id, kind: r.kind, audience: 'team' as const, offsetDays: r.offset_days, targetDate: r.target_date, skip: false })),
  ];
  const customerItems = [
    ...claimed.filter((r) => r.audience === 'customer'),
    ...retry.filter((r) => r.audience === 'customer').map((r) => ({ dedupeKey: r.dedupe_key, serviceId: r.service_id, periodId: r.period_id, kind: r.kind, audience: 'customer' as const, offsetDays: r.offset_days, targetDate: r.target_date, skip: false })),
  ];

  const mark = async (keysToMark: string[], status: 'sent' | 'failed' | 'suppressed', error?: string) => {
    if (!keysToMark.length) return;
    const { data: rows } = await db.from('ops_notifications').select('dedupe_key, attempts').in('dedupe_key', keysToMark);
    for (const row of (rows ?? []) as Array<{ dedupe_key: string; attempts: number }>) {
      await db.from('ops_notifications').update({
        status, attempts: row.attempts + 1, last_error: error ?? null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        next_attempt_at: status === 'failed' ? new Date(Date.now() + 3 * 3_600_000).toISOString() : null,
      }).eq('dedupe_key', row.dedupe_key);
    }
  };

  // ── Team digest (one per Istanbul day) ─────────────────────────
  const name = (id: string) => services.find((s) => s.id === id);
  const attention = services
    .map((s) => ({ s, state: renewState(s, open.get(s.id) ?? null, payments, today) }))
    .filter((x) => x.state === 'overdue' || x.state === 'awaiting_verification');
  let digest: 'sent' | 'skipped' | 'failed' | 'suppressed' | 'off' | 'already' = 'skipped';
  if (!settings.digest) {
    digest = 'off';
    await mark(teamItems.map((r) => r.dedupeKey), 'suppressed', 'Günlük özet kapalı (Operasyon ayarları).');
  } else if (teamItems.length || attention.length) {
    const digestKey = `digest:${today}`;
    const { data: claimedDigest } = await db.from('ops_notifications').upsert({ dedupe_key: digestKey, kind: 'digest', audience: 'team', target_date: today, status: 'pending' }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    const { data: digestRow } = await db.from('ops_notifications').select('status, attempts').eq('dedupe_key', digestKey).maybeSingle();
    const mine = Boolean(claimedDigest?.length) || ((digestRow as { status: string; attempts: number } | null)?.status === 'failed' && (digestRow as { attempts: number }).attempts < 3);
    if (!mine) digest = 'already';
    else if (!allowed.email && !allowed.telegram) {
      digest = 'suppressed';
      await mark([digestKey, ...teamItems.map((r) => r.dedupeKey)], 'suppressed', allowed.reason);
    } else {
      const lines = teamItems.map((r) => {
        const s = name(r.serviceId);
        return `${s?.name ?? '?'} (${s ? KIND_LABEL[s.kind] : ''}) — ${r.kind === 'cancel_reminder' ? 'iptal son günü' : 'bitiş'} ${r.targetDate}, ${offsetText(r.offsetDays)}`;
      });
      const att = attention.filter((a) => !teamItems.some((t) => t.serviceId === a.s.id)).map((a) => `${a.s.name} — ${a.state === 'overdue' ? 'bitiş tarihi geçti' : 'yenileme doğrulaması bekliyor'}`);
      const subject = `Operasyon: ${teamItems.length} hatırlatma${att.length ? `, ${att.length} dikkat` : ''} (${today})`;
      const html = wrapTemplate('Operasyon günlük özeti', [
        lines.length ? `<p><strong>Bugünün hatırlatmaları</strong></p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : '',
        att.length ? `<p><strong>Dikkat</strong></p><ul>${att.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : '',
        `<p><a href="${SITE}/admin/ops">Operasyon genel bakış</a></p>`,
      ].join(''));
      const telegram = [`<b>${escapeHtml(subject)}</b>`, ...lines.map((l) => `• ${escapeHtml(l)}`), ...att.map((l) => `! ${escapeHtml(l)}`)].join('\n');
      const sent = await notifyAdmins({ kind: 'ops', force: true, subject, email: html, telegram });
      const ok = sent.email === 'sent' || sent.telegram === 'sent';
      const noChannel = sent.email === 'skipped' && sent.telegram === 'skipped';
      digest = ok ? 'sent' : noChannel ? 'suppressed' : 'failed';
      const err = ok ? undefined : noChannel ? 'Bildirim kanalı kurulu değil (e-posta/Telegram).' : `e-posta: ${sent.email}, telegram: ${sent.telegram}`;
      await mark([digestKey, ...teamItems.map((r) => r.dedupeKey)], ok ? 'sent' : noChannel ? 'suppressed' : 'failed', err);
    }
  }

  // ── Customer reminders (off by default; never outside production) ─
  let customerSent = 0;
  for (const r of customerItems) {
    const s = name(r.serviceId);
    if (!s || !settings.customerNotifications || !s.customer_notify || !s.customer_recipients.length) { await mark([r.dedupeKey], 'suppressed', 'Müşteri bildirimi kapalı.'); continue; }
    if (!allowed.email) { await mark([r.dedupeKey], 'suppressed', allowed.reason); continue; }
    const msg = customerReminderText(s, r.targetDate, r.offsetDays, null);
    const html = wrapTemplate(msg.subject, msg.text.split('\n\n').map((p) => `<p>${escapeHtml(p)}</p>`).join(''));
    const results = await Promise.all(s.customer_recipients.map((to) => sendEmail(to, msg.subject, html, settings.customerFrom ?? undefined)));
    const ok = results.every((x) => x === 'sent');
    if (ok) customerSent += 1;
    await mark([r.dedupeKey], ok ? 'sent' : 'failed', ok ? undefined : `e-posta: ${results.join(', ')}`);
  }

  return NextResponse.json({ ok: true, today, planned: planned.length, claimed: claimed.length, retried: retry.length, digest, customerSent, environment: allowed.reason });
}
