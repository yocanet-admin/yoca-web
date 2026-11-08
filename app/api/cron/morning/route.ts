import { NextRequest, NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cockpit/cron';
import { getCronState, getNotifySettings, istanbulDate, saveCronState } from '@/lib/cockpit/settings';
import { buildMorningSummary } from '@/lib/cockpit/summary';
import { notifyAdmins } from '@/lib/notify';
import { morningOutcome, withHeartbeat } from '@/lib/cockpit/heartbeat';

/**
 * Yoca cockpit — morning summary (Vercel Cron, 05:30 UTC = 08:30 Istanbul,
 * every day). Sent at most once per Istanbul day.
 * Reports start/success/fail to Healthchecks (lib/cockpit/heartbeat.ts).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = cronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  return withHeartbeat('morning', async () => {
    const today = istanbulDate();
    const [state, settings] = await Promise.all([getCronState(), getNotifySettings()]);
    if (!settings.ready) return { response: NextResponse.json({ ok: false, error: 'run supabase/upgrade-v9-cockpit-phase2.sql' }, { status: 500 }), outcome: morningOutcome({ ready: false }) };
    if (state.morning_last === today) return { response: NextResponse.json({ ok: true, skipped: 'already sent today' }), outcome: morningOutcome({ ready: true, skipped: 'already' }) };
    if (!settings.morning_summary) return { response: NextResponse.json({ ok: true, skipped: 'morning summary is off' }), outcome: morningOutcome({ ready: true, skipped: 'off' }) };

    // Claim the day first so a retry or a second call cannot send twice.
    await saveCronState({ morning_last: today, morning_last_at: new Date().toISOString() });

    const summary = await buildMorningSummary();
    const sent = await notifyAdmins({ kind: 'summary', subject: summary.subject, email: summary.email, telegram: summary.telegram, keyboard: summary.keyboard });

    return { response: NextResponse.json({ ok: true, counts: summary.counts, sent }), outcome: morningOutcome({ ready: true, sent }) };
  });
}
