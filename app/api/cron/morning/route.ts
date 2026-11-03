import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cockpit/cron';
import { getCronState, getNotifySettings, istanbulDate, saveCronState } from '@/lib/cockpit/settings';
import { buildMorningSummary } from '@/lib/cockpit/summary';
import { notifyAdmins } from '@/lib/notify';

/**
 * Yoca cockpit — morning summary (Vercel Cron, 05:30 UTC = 08:30 Istanbul,
 * every day). Sent at most once per Istanbul day.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const today = istanbulDate();
  const [state, settings] = await Promise.all([getCronState(), getNotifySettings()]);
  if (!settings.ready) return NextResponse.json({ ok: false, error: 'run supabase/upgrade-v9-cockpit-phase2.sql' }, { status: 500 });
  if (state.morning_last === today) return NextResponse.json({ ok: true, skipped: 'already sent today' });
  if (!settings.morning_summary) return NextResponse.json({ ok: true, skipped: 'morning summary is off' });

  // Claim the day first so a retry or a second call cannot send twice.
  await saveCronState({ morning_last: today, morning_last_at: new Date().toISOString() });

  const summary = await buildMorningSummary();
  const sent = await notifyAdmins({ kind: 'summary', subject: summary.subject, email: summary.email, telegram: summary.telegram, keyboard: summary.keyboard });

  return NextResponse.json({ ok: true, counts: summary.counts, sent });
}
