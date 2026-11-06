import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyAdmins } from '@/lib/notify';
import { readOpsSettings } from '@/lib/ops/serverSettings';
import { realSendAllowed } from '@/lib/ops/settings';
import { istanbulDay, KIND_LABEL, payState, renewState, type PeriodRow, type Payment, type Service } from '@/lib/ops/model';
import { offsetText, planReminders, type PlannedReminder } from '@/lib/ops/reminders';
import { buildOpsDigest, OPS_SITE, type DigestLine } from '@/lib/ops/digest';

/**
 * Yoca Operasyon — TEAM reminders (Vercel Cron 06:00 and 12:00 UTC =
 * 09:00 / 15:00 Istanbul; the second run only retries a failed digest).
 *
 * Internal only. Nothing here ever e-mails a customer: there is no customer
 * path (automatic customer e-mails are permanently off, 6 Kas 2026). An e-mail
 * address on a client record is not a permission to send. Forwarding a
 * reminder to a customer is a separate manual action ("E-postayla ilet",
 * /api/admin/ops/forward) and those rows are never touched here.
 *
 *  - Authorized: CRON_SECRET (same guard as the other jobs).
 *  - Once: every reminder has a dedupe key and is CLAIMED by inserting it into
 *    ops_notifications (unique key) before anything is sent; a repeated or
 *    parallel call finds the key and sends nothing.
 *  - ONE digest per Istanbul day (key digest:YYYY-MM-DD) to the cockpit
 *    notification address + team Telegram, only when there is something to
 *    follow; it does not repeat the morning summary (see lib/ops/digest.ts).
 *  - Failures are kept (status failed, attempts, last_error) and retried by the
 *    next run up to 3 attempts. After an outage only the most urgent missed
 *    reminder is sent (planner).
 *  - Outside production nothing reaches a real inbox (realSendAllowed).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FORWARD = 'forward:%';

export async function GET(request: NextRequest) {
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: 'no service key' }, { status: 503 });
  const today = istanbulDay();
  const { settings } = await readOpsSettings();
  const allowed = realSendAllowed({ VERCEL_ENV: process.env.VERCEL_ENV, NOTIFY_RESEND_ENDPOINT: process.env.NOTIFY_RESEND_ENDPOINT, NOTIFY_TELEGRAM_API: process.env.NOTIFY_TELEGRAM_API });

  const [svcRes, perRes, payRes, taskRes] = await Promise.all([
    db.from('ops_services').select('*').is('archived_at', null),
    db.from('ops_periods').select('*').eq('status', 'open'),
    db.from('ops_payments').select('*').is('voided_at', null),
    db.from('ops_tasks').select('id, title, due_on, status, service_id, project_id').in('status', ['todo', 'doing']).lt('due_on', today).order('due_on'),
  ]);
  if (svcRes.error) return NextResponse.json({ ok: false, error: 'run supabase/upgrade-v18-operations.sql' }, { status: 500 });
  const services = (svcRes.data ?? []) as Service[];
  const open = new Map(((perRes.data ?? []) as PeriodRow[]).map((p) => [p.service_id, p]));
  const payments = (payRes.data ?? []) as Payment[];
  const byId = new Map(services.map((s) => [s.id, s]));

  // Team reminders only. Existing keys (any status) → nothing is planned twice.
  const draft = planReminders({ services, openPeriods: open, today, defaultDays: settings.reminderDays, defaultCancelDays: settings.cancelReminderDays, existing: new Set() })
    .filter((r) => r.audience === 'team');
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
      audience: 'team', status: r.skip ? 'skipped' : 'pending', last_error: r.skip ? 'Daha yakın bir hatırlatma gönderildi (kaçırılan eski hatırlatma).' : null, recipients: [],
    };
    const { data, error } = await db.from('ops_notifications').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    if (!error && data && data.length && !r.skip) claimed.push(r);
  }

  // Retries: TEAM rows only (never a manual forward), failed (max 3 attempts)
  // or left "pending" by an earlier run that stopped (older than 10 minutes).
  const [{ data: failedRows }, { data: staleRows }] = await Promise.all([
    db.from('ops_notifications').select('*').eq('audience', 'team').eq('status', 'failed').lt('attempts', 3).lte('next_attempt_at', new Date().toISOString()).neq('kind', 'digest').not('dedupe_key', 'like', FORWARD),
    db.from('ops_notifications').select('*').eq('audience', 'team').eq('status', 'pending').lt('created_at', new Date(Date.now() - 600_000).toISOString()).neq('kind', 'digest').not('dedupe_key', 'like', FORWARD),
  ]);
  const retry = [...(failedRows ?? []), ...(staleRows ?? [])] as Array<{ dedupe_key: string; service_id: string; period_id: string | null; kind: PlannedReminder['kind']; offset_days: number; target_date: string }>;
  const teamItems: PlannedReminder[] = [
    ...claimed,
    ...retry.map((r) => ({ dedupeKey: r.dedupe_key, serviceId: r.service_id, periodId: r.period_id, kind: r.kind, audience: 'team' as const, offsetDays: r.offset_days, targetDate: r.target_date, skip: false })),
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

  // ── Digest content (operations only) ────────────────────────────
  const link = (id: string) => `${OPS_SITE}/admin/ops/services/${id}`;
  const label = (s: Service | undefined) => (s ? `${s.name} (${KIND_LABEL[s.kind]})` : 'Silinmiş hizmet');
  const reminders: DigestLine[] = teamItems.map((r) => ({
    tone: r.offsetDays < 0 ? 'red' : r.offsetDays <= 7 ? 'amber' : 'lime',
    title: label(byId.get(r.serviceId)),
    detail: `${r.kind === 'cancel_reminder' ? 'iptal son günü' : 'bitiş'} ${r.targetDate} · ${offsetText(r.offsetDays)}`,
    href: link(r.serviceId),
  }));
  const inReminders = new Set(teamItems.map((r) => r.serviceId));
  const renewals: DigestLine[] = services
    .filter((s) => !inReminders.has(s.id))
    .map((s) => ({ s, state: renewState(s, open.get(s.id) ?? null, payments, today) }))
    .filter((x) => x.state === 'overdue' || x.state === 'awaiting_verification')
    .map((x) => ({ tone: x.state === 'overdue' ? 'red' : 'amber', title: label(x.s), detail: x.state === 'overdue' ? `bitiş tarihi geçti (${open.get(x.s.id)?.ends_on ?? x.s.end_on})` : 'yenileme doğrulaması bekliyor', href: link(x.s.id) }));
  const paymentLines: DigestLine[] = [];
  for (const s of services) {
    const period = open.get(s.id);
    if (!period || s.status === 'cancelled') continue;
    if (payState(period, payments, 'in', today).state === 'overdue') paymentLines.push({ tone: 'red', title: label(s), detail: `tahsilat gecikti (son gün ${period.customer_due_on ?? period.due_on})`, href: link(s.id) });
    if (payState(period, payments, 'out', today).state === 'overdue') paymentLines.push({ tone: 'red', title: label(s), detail: `sağlayıcı ödemesi gecikti (son gün ${period.due_on})`, href: link(s.id) });
  }
  const tasks: DigestLine[] = ((taskRes.data ?? []) as Array<{ id: string; title: string; due_on: string; service_id: string | null; project_id: string | null }>).map((t) => ({
    tone: 'amber', title: t.title, detail: `son gün ${t.due_on}${t.service_id && byId.get(t.service_id) ? ` · ${byId.get(t.service_id)!.name}` : ''}`,
    href: t.service_id ? link(t.service_id) : t.project_id ? `${OPS_SITE}/admin/ops/projects/${t.project_id}` : `${OPS_SITE}/admin/ops`,
  }));
  const digestContent = buildOpsDigest({ today, reminders, renewals, payments: paymentLines, tasks });

  // ── One digest per Istanbul day ─────────────────────────────────
  let digest: 'sent' | 'skipped' | 'failed' | 'suppressed' | 'off' | 'already' = 'skipped';
  if (!settings.digest) {
    digest = 'off';
    await mark(teamItems.map((r) => r.dedupeKey), 'suppressed', 'Günlük özet kapalı (Operasyon ayarları).');
  } else if (!digestContent.empty) {
    const digestKey = `digest:${today}`;
    const { data: claimedDigest } = await db.from('ops_notifications').upsert({ dedupe_key: digestKey, kind: 'digest', audience: 'team', target_date: today, status: 'pending' }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    const { data: digestRow } = await db.from('ops_notifications').select('status, attempts').eq('dedupe_key', digestKey).maybeSingle();
    const row = digestRow as { status: string; attempts: number } | null;
    const mine = Boolean(claimedDigest?.length) || (row?.status === 'failed' && row.attempts < 3);
    if (!mine) digest = 'already';
    else if (!allowed.email && !allowed.telegram) {
      digest = 'suppressed';
      await mark([digestKey, ...teamItems.map((r) => r.dedupeKey)], 'suppressed', allowed.reason);
    } else {
      const sent = await notifyAdmins({ kind: 'ops', force: true, subject: digestContent.subject, email: digestContent.email, telegram: digestContent.telegram, keyboard: [[{ text: 'Operasyonu aç →', url: `${OPS_SITE}/admin/ops` }]] });
      const ok = sent.email === 'sent' || sent.telegram === 'sent';
      const noChannel = sent.email === 'skipped' && sent.telegram === 'skipped';
      digest = ok ? 'sent' : noChannel ? 'suppressed' : 'failed';
      const err = ok ? undefined : noChannel ? 'Bildirim kanalı kurulu değil (e-posta/Telegram).' : `e-posta: ${sent.email}, telegram: ${sent.telegram}`;
      await mark([digestKey, ...teamItems.map((r) => r.dedupeKey)], ok ? 'sent' : noChannel ? 'suppressed' : 'failed', err);
    }
  }

  return NextResponse.json({ ok: true, today, planned: planned.length, claimed: claimed.length, retried: retry.length, digest, counts: digestContent.counts, environment: allowed.reason });
}
