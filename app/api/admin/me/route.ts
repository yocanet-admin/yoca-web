import { NextRequest, NextResponse } from 'next/server';
import { isAllowedAdminEmail, sessionUser } from '@/lib/cockpit/auth';

/**
 * Yoca cockpit — "may this signed-in user use the panel?" (admin shell check).
 * Returns only { ok, allowed }; the ADMIN_EMAILS list itself is never exposed.
 * Without ADMIN_EMAILS every signed-in user is allowed (unchanged behaviour).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await sessionUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, allowed: isAllowedAdminEmail(user.email) });
}
