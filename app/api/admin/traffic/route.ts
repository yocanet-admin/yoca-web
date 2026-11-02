import { NextRequest, NextResponse } from 'next/server';
import { cached, requireAdmin } from '@/lib/cockpit/auth';
import { trafficReport, vercelConfigured } from '@/lib/cockpit/vercel';

/** Yoca cockpit — Vercel Web Analytics summary (admin only). GET ?days=7|30|90 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!vercelConfigured()) {
    return NextResponse.json({ ok: false, configured: false });
  }
  const requested = Number(request.nextUrl.searchParams.get('days') ?? 7);
  const days = [7, 30, 90].includes(requested) ? requested : 7;
  const fresh = request.nextUrl.searchParams.get('refresh') === '1';
  try {
    const report = await cached(`traffic:${days}`, 5 * 60_000, fresh, () => trafficReport(days));
    return NextResponse.json({ ok: true, configured: true, report });
  } catch (error) {
    console.error('cockpit traffic failed:', (error as Error).message);
    return NextResponse.json({ ok: false, configured: true, error: (error as Error).message.slice(0, 200) }, { status: 502 });
  }
}
