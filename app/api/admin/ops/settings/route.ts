import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { readOpsSettings, writeOpsSettings } from '@/lib/ops/serverSettings';
import { realSendAllowed, sanitizeOps } from '@/lib/ops/settings';
import { licenseApiConfigured } from '@/lib/ops/licenseApi';
import { getNotifySettings } from '@/lib/cockpit/settings';
import { getSupabaseAsUser } from '@/lib/supabase';

/**
 * Yoca Operasyon — settings (admin only).
 * GET  → settings + environment facts (is this deployment allowed to send to
 *        real people, is the license API configured — names only, no values)
 * POST { settings } → sanitized and stored with the admin's own session.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const client = getSupabaseAsUser(bearerToken(request));
  const [{ ready, settings }, notify, last] = await Promise.all([
    readOpsSettings(), getNotifySettings(),
    client ? client.from('ops_notifications').select('target_date, status, attempts, last_error, sent_at, payload').eq('kind', 'digest').order('target_date', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Last team digest: overall state and each channel separately (no content).
  const ld = last.data as { target_date: string; status: string; attempts: number; last_error: string | null; sent_at: string | null; payload: { channels?: { email?: { state?: string }; telegram?: { state?: string } } } } | null;
  const lastDigest = ld ? { day: ld.target_date, status: ld.status, attempts: ld.attempts, note: ld.last_error, sentAt: ld.sent_at, email: ld.payload?.channels?.email?.state ?? null, telegram: ld.payload?.channels?.telegram?.state ?? null } : null;
  return NextResponse.json({
    ok: true, ready, settings, me: admin.email ?? null,
    // Where the team digest goes (Ayarlar → Bildirimler); read only here.
    team: { email: notify.email_to, telegram: Boolean(notify.telegram_chat_id), telegramName: (notify as { telegram_chat_name?: string }).telegram_chat_name ?? null, lastDigest },
    environment: { send: realSendAllowed({ VERCEL_ENV: process.env.VERCEL_ENV, NOTIFY_RESEND_ENDPOINT: process.env.NOTIFY_RESEND_ENDPOINT, NOTIFY_TELEGRAM_API: process.env.NOTIFY_TELEGRAM_API }), licenseApi: licenseApiConfigured(), cronSecret: (process.env.CRON_SECRET ?? '').trim().length >= 32 },
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { settings?: unknown };
  const clean = sanitizeOps(body.settings);
  const err = await writeOpsSettings(clean, bearerToken(request));
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });
  return NextResponse.json({ ok: true, settings: clean });
}
