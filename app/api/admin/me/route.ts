import { NextRequest, NextResponse } from 'next/server';
import { adminCheck, bearerToken, isAllowedAdminEmail, panelRole, sessionUser } from '@/lib/cockpit/auth';
import { getWorkSourceStatus } from '@/lib/work';

/**
 * Yoca cockpit — "may this signed-in user use the panel?" (admin shell check).
 * Same rule as every admin API route: valid session + optional ADMIN_EMAILS +
 * database is_admin(). Returns { ok, allowed, role, reason }; lists are never
 * exposed. role: 'admin', 'finance' (v25: Finans screens only) or 'editor'
 * (v30: content screens only). Only ACTIVE accounts get a role (v30).
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
  const token = bearerToken(request);
  const role = await panelRole(token);
  if (role === 'check_failed') return NextResponse.json({ ok: true, allowed: false, reason: 'check_failed' });
  // Finance user: only the Giderler screens (data access is enforced by RLS / can_finance()).
  // ADMIN_EMAILS narrows the ADMINS only; it is not a finance list.
  if (role === 'finance') return NextResponse.json({ ok: true, allowed: true, role: 'finance', warnings: [] });
  // Content editor (v30): content screens only (RLS can_content(), requireContent routes).
  if (role === 'editor') return NextResponse.json({ ok: true, allowed: true, role: 'editor', warnings: [] });
  if (role !== 'admin' || !isAllowedAdminEmail(user.email)) return NextResponse.json({ ok: true, allowed: false, reason: 'not_admin' });
  const check = await adminCheck(token);
  if (!check.ok) return NextResponse.json({ ok: true, allowed: false, reason: check.reason });
  const work = await getWorkSourceStatus();
  const warnings = WORK_WARNINGS[work] ? [WORK_WARNINGS[work]] : [];
  return NextResponse.json({ ok: true, allowed: true, role: 'admin', warnings });
}
