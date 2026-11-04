import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { readOpsSettings, writeOpsSettings } from '@/lib/ops/serverSettings';
import { realSendAllowed, sanitizeOps } from '@/lib/ops/settings';
import { licenseApiConfigured } from '@/lib/ops/licenseApi';

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
  const { ready, settings } = await readOpsSettings();
  return NextResponse.json({
    ok: true, ready, settings, me: admin.email ?? null,
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
