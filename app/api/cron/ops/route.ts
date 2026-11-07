import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegramChecked } from '@/lib/notify';
import { getNotifySettings } from '@/lib/cockpit/settings';
import { sendMail } from '@/lib/documents/emailSend';
import { readOpsSettings } from '@/lib/ops/serverSettings';
import { realSendAllowed } from '@/lib/ops/settings';
import { addDays, istanbulDay, KIND_LABEL, payState, renewState, type PeriodRow, type Payment, type Service } from '@/lib/ops/model';
import { buildItems as buildFinItems, digestExpenseItems, digestUntil, type Expense, type FinPayment, type FinPeriod } from '@/lib/fin/model';
import { formatMinor } from '@/lib/ops/money';
import { offsetText, planReminders, type PlannedReminder } from '@/lib/ops/reminders';
import { buildOpsDigest, channelsToSend, cronRunResult, digestOutcome, digestRunAction, OPS_SITE, type DigestChannels, type DigestLine } from '@/lib/ops/digest';

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
 *  - E-mail and Telegram are tracked separately on the digest row
 *    (payload.channels). The digest content is stored with the row at the
 *    first attempt; the 15:00 run sends that SAME content again only to a
 *    channel that failed — never to a channel that succeeded. An unclear
 *    e-mail is asked again with the same Idempotency-Key (no second copy);
 *    an unclear Telegram send is not repeated (it could be a duplicate) and
 *    is reported for a manual check. At most 3 attempts.
 *  - After an outage only the most urgent missed reminder is sent (planner).
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
  const expenseRun = await expenseDigestLines(db, today);
  if (expenseRun.error) console.error(`[cron/ops] Giderler: ${expenseRun.error}`);
  const digestContent = buildOpsDigest({ today, reminders, renewals, payments: paymentLines, tasks, expenses: expenseRun.lines });

  // ── One digest per Istanbul day, each channel tracked on its own ──
  type StoredDigest = { subject: string; email: string; text: string; telegram: string; items: string[]; emailTo: string; chatId: string | null; channels: DigestChannels };
  let digest: 'sent' | 'skipped' | 'failed' | 'suppressed' | 'off' | 'already' = 'skipped';
  let channelsOut: DigestChannels | null = null;
  const digestKey = `digest:${today}`;
  const { data: existingRow } = await db.from('ops_notifications').select('id, status, attempts, next_attempt_at, payload').eq('dedupe_key', digestKey).maybeSingle();
  type DigestRow = { id: string; status: string; attempts: number; next_attempt_at: string | null; payload: StoredDigest | Record<string, never> };
  let row = existingRow as DigestRow | null;
  const action = digestRunAction({ enabled: settings.digest, row: row ? { status: row.status, attempts: row.attempts, next_attempt_at: row.next_attempt_at, hasChannels: 'channels' in row.payload } : null, empty: digestContent.empty, now: Date.now() });

  if (action === 'off') {
    digest = 'off';
    await mark(teamItems.map((r) => r.dedupeKey), 'suppressed', 'Günlük özet kapalı (Operasyon ayarları).');
  } else if (action === 'first') {
    // First attempt today: store the content and the channels, then claim the row.
    const notify = await getNotifySettings();
    const channels: DigestChannels = {
      email: { state: !notify.email_to ? 'skipped' : !allowed.email ? 'skipped' : 'pending', error: !allowed.email ? allowed.reason : null },
      telegram: { state: !notify.telegram_chat_id || !process.env.TELEGRAM_BOT_TOKEN ? 'skipped' : !allowed.telegram ? 'skipped' : 'pending', error: !allowed.telegram ? allowed.reason : null },
    };
    const payload: StoredDigest = { subject: digestContent.subject, email: digestContent.email, text: digestContent.text, telegram: digestContent.telegram, items: teamItems.map((r) => r.dedupeKey), emailTo: notify.email_to, chatId: notify.telegram_chat_id ?? null, channels };
    const ins = await db.from('ops_notifications').upsert({ dedupe_key: digestKey, kind: 'digest', audience: 'team', target_date: today, status: 'pending', payload }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id, status, attempts, next_attempt_at, payload');
    row = ins.data?.length ? (ins.data[0] as DigestRow) : null;
    if (!row) digest = 'already';
  } else if (action === 'already') {
    // Same day again: only a digest still waiting for a failed channel ('retry') is ours to send.
    digest = 'already'; row = null;
  }

  if (row && settings.digest && 'channels' in row.payload) {
    const p = row.payload as StoredDigest;
    const channels: DigestChannels = { email: { ...p.channels.email }, telegram: { ...p.channels.telegram } };
    const now = new Date().toISOString();
    for (const ch of channelsToSend(channels)) {
      if (ch === 'email') {
        const r = await sendMail({ to: p.emailTo.split(',').map((x) => x.trim()).filter(Boolean), cc: [], subject: p.subject, html: p.email, text: p.text, attachments: [] }, `yoca-ops-digest-${today}`);
        channels.email = r.status === 'accepted' ? { state: 'sent', at: now, providerId: r.providerId, error: null } : { state: r.status, at: now, error: r.error };
      } else {
        const r = await sendTelegramChecked(p.chatId, p.telegram, [[{ text: 'Operasyonu aç →', url: `${OPS_SITE}/admin/ops` }]]);
        channels.telegram = { state: r.result, at: now, error: r.error ?? null };
      }
    }
    const attempts = row.attempts + 1;
    const out = digestOutcome(channels, attempts);
    await db.from('ops_notifications').update({
      status: out.status, attempts, last_error: out.error, payload: { ...p, channels },
      sent_at: out.anySent ? (row.status === 'sent' ? undefined : now) : null,
      next_attempt_at: out.retry ? new Date(Date.now() + 3 * 3_600_000).toISOString() : null,
    }).eq('id', row.id);
    // The reminders in this digest: delivered as soon as one channel reached the team; otherwise
    // they wait for the digest's retry, and after the last attempt they go into a later digest.
    const items = p.items ?? [];
    if (out.anySent) await mark(items, 'sent');
    else if (out.retry) {
      for (const k of items) await db.from('ops_notifications').update({ status: 'failed', last_error: out.error, next_attempt_at: null }).eq('dedupe_key', k);
    } else await mark(items, out.status === 'suppressed' ? 'suppressed' : 'failed', out.error ?? undefined);
    digest = out.status === 'sent' ? 'sent' : out.status === 'suppressed' ? 'suppressed' : 'failed';
    channelsOut = channels;
  }

  // A run whose Giderler part failed is NOT reported as a clean success (HTTP 500, ok: false,
  // partial: true), even though the rest of the digest was built and sent as usual above.
  const run = cronRunResult(expenseRun.error);
  return NextResponse.json({ ok: run.ok, partial: run.partial, today, planned: planned.length, claimed: claimed.length, retried: retry.length, digest, channels: channelsOut ? { email: channelsOut.email.state, telegram: channelsOut.telegram.state } : null, counts: digestContent.counts, expenses: { rolled: expenseRun.rolled, lines: expenseRun.lines.length, error: expenseRun.error }, environment: allowed.reason }, { status: run.status });
}

/**
 * Giderler (v25) for the same team digest: overdue periods and periods due
 * within 7 days that are not fully paid. Creates the missing recurring periods
 * first (idempotent; a new period is never "paid" by itself). Operasyon
 * provider payments are NOT listed here (they are in "Ödemeler" already).
 * This runs on every cron run (09:00 / 15:00 Istanbul), whether or not anyone
 * opens the Giderler screen. A failure is no longer silent: it is logged,
 * returned as expenses.error and the run answers ok: false / partial: true
 * (HTTP 500); the rest of the digest is still built and sent.
 * Before v25 (no tables) this returns nothing.
 */
type ExpenseRun = { lines: DigestLine[]; rolled: number | null; error: string | null };
async function expenseDigestLines(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>, today: string): Promise<ExpenseRun> {
  try {
    const roll = await db.rpc('fin_roll_periods', { p_until: addDays(today, 45) });
    if (roll.error && /does not exist|schema cache/i.test(roll.error.message)) return { lines: [], rolled: null, error: null }; // before v25
    const rolled = typeof roll.data === 'number' ? roll.data : null;
    const rollError = roll.error ? `dönemler oluşturulamadı: ${roll.error.message}` : null;
    const [exp, per, pay] = await Promise.all([
      db.from('fin_expenses').select('*').is('archived_at', null),
      db.from('fin_periods').select('*').eq('status', 'open').lte('due_on', digestUntil(today)),
      db.from('fin_payments').select('*').is('voided_at', null),
    ]);
    const readError = exp.error ?? per.error ?? pay.error;
    if (readError) return { lines: [], rolled, error: [rollError, `okunamadı: ${readError.message}`].filter(Boolean).join(' · ') };
    const items = buildFinItems({ expenses: (exp.data ?? []) as Expense[], periods: (per.data ?? []) as FinPeriod[], payments: (pay.data ?? []) as FinPayment[], opsPeriods: [], opsPayments: [], parties: [], today });
    const lines = digestExpenseItems(items, today)
      .map((it) => {
        const late = it.summary.state === 'overdue';
        const left = it.summary.remaining !== null && it.currency ? formatMinor(it.summary.remaining, it.currency) : 'tutar bilinmiyor';
        return {
          tone: late ? 'red' : 'amber',
          title: it.title,
          detail: `${late ? 'gecikti' : 'vade'} ${it.dueOn}${it.periodText ? ` · ${it.periodText}` : ''} · kalan ${left}`,
          href: `${OPS_SITE}/admin/expenses/${it.expenseId}?period=${it.periodId}`,
        } as DigestLine;
      });
    return { lines, rolled, error: rollError };
  } catch (error) {
    return { lines: [], rolled: null, error: (error as Error).message };
  }
}
