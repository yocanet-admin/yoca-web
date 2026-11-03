import { NextRequest, NextResponse } from 'next/server';
import { adminCheck, bearerToken, isAllowedAdminEmail, sessionUser } from '@/lib/cockpit/auth';
import { getWorkSourceStatus } from '@/lib/work';

/**
 * Yoca cockpit — "may this signed-in user use the panel?" (admin shell check).
 * Same rule as every admin API route: valid session + optional ADMIN_EMAILS +
 * database is_admin(). Returns { ok, allowed, reason }; lists are never exposed.
 *   reason "not_admin"    → not in public.admin_users (or not in ADMIN_EMAILS)
 *   reason "check_failed" → is_admin() missing/unreachable (fails closed)
 * For an allowed admin it also returns `warnings`: configuration problems the
 * panel must show on every page (e.g. code projects withheld from the site).
 */

const WORK_WARNINGS: Record<string, string> = {
  missing_service_role:
    'SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Gizlenen projeler kontrol edilemediği için koddaki varsayılan projeler sitede GÖSTERİLMİYOR (güvenli taraf). Vercel ortam değişkenlerine anahtarı ekleyip yeniden dağıtın.',
  read_failed:
    'Çalışmalar tablosu okunamadı. Koddaki varsayılan projeler güvenlik için sitede GÖSTERİLMİYOR. Supabase bağlantısını ve sunucu kayıtlarını kontrol edin.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await sessionUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!isAllowedAdminEmail(user.email)) return NextResponse.json({ ok: true, allowed: false, reason: 'not_admin' });
  const check = await adminCheck(bearerToken(request));
  if (!check.ok) return NextResponse.json({ ok: true, allowed: false, reason: check.reason });
  const work = await getWorkSourceStatus();
  const warnings = WORK_WARNINGS[work] ? [WORK_WARNINGS[work]] : [];
  return NextResponse.json({ ok: true, allowed: true, warnings });
}
