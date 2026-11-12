import { NextRequest, NextResponse } from 'next/server';
import { adminCheck, bearerToken, panelRole, sessionUser } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { getWorkSourceStatus } from '@/lib/work';

/**
 * Yoca cockpit — "may this signed-in user use the panel?" (admin shell check).
 * Same rule as every admin API route: valid session + the database role
 * (effective admin_users row; ADMIN_EMAILS is no longer read, v30). Returns { ok, allowed, role, reason }; lists are never
 * exposed. role: 'admin', 'finance' (v25: Finans screens only) or 'editor'
 * (v30: content screens only). Only ACTIVE accounts get a role (v30).
 *   reason "not_admin"        → no effective row in public.admin_users
 *   reason "password_change"  → account created with a temporary password: the
 *                               only thing it may do is set its own password
 *                               (/api/admin/password); no screen, API or data
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
  // Finance user: only the Finans screens (data access is enforced by RLS / can_finance()).
  if (role === 'finance') return NextResponse.json({ ok: true, allowed: true, role: 'finance', warnings: [] });
  // Content editor (v30): content screens only (RLS can_content(), requireContent routes).
  if (role === 'editor') return NextResponse.json({ ok: true, allowed: true, role: 'editor', warnings: [] });
  if (role !== 'admin') {
    // No role: is it an account that still has to replace its temporary password?
    const client = getSupabaseAsUser(token);
    const { data } = client ? await client.rpc('account_state') : { data: null };
    const own = ((data ?? []) as Array<{ status: string; must_change_password: boolean; name: string }>)[0];
    if (own?.status === 'active' && own.must_change_password) return NextResponse.json({ ok: true, allowed: false, reason: 'password_change', name: own.name });
    return NextResponse.json({ ok: true, allowed: false, reason: 'not_admin' });
  }
  const check = await adminCheck(token);
  if (!check.ok) return NextResponse.json({ ok: true, allowed: false, reason: check.reason });
  const work = await getWorkSourceStatus();
  const warnings = WORK_WARNINGS[work] ? [WORK_WARNINGS[work]] : [];
  return NextResponse.json({ ok: true, allowed: true, role: 'admin', warnings });
}
