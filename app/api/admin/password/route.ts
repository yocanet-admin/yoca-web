import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { bearerToken, sessionUser } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { normalizeEmail, passwordProblem } from '@/lib/admin/roles';

/**
 * Yoca — first sign-in of an account created with a TEMPORARY password.
 * POST { current, next } with the session token.
 * Until this succeeds the account has no role (panel_role() ignores rows with
 * must_change_password), so every screen, API route and RLS policy refuses it.
 * Steps: the session must belong to such an account → the temporary password
 * is checked against Supabase Auth → the new one is set in Auth → only then
 * the flag is cleared (users_password_set, service role only — a user can
 * never clear it without changing the password). Passwords are never stored,
 * logged or returned. If the flag cannot be cleared the user simply retries
 * (the "current" password is then the new one).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (status: number, code: string, error: string) => NextResponse.json({ ok: false, code, error }, { status });

export async function POST(request: NextRequest) {
  const user = await sessionUser(request);
  if (!user?.email) return fail(401, 'unauthorized', 'Oturum yok.');
  const asUser = getSupabaseAsUser(bearerToken(request));
  const service = getSupabaseServiceRole();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!asUser || !service || !url || !anon) return fail(503, 'not_configured', 'Sunucu yapılandırması eksik.');

  // 10 attempts / 15 min per account (shared counter, v13)
  const { data: allowed } = await service.rpc('hit_rate_limit', { p_key: createHash('sha256').update(`pwchange:${user.id}`).digest('hex'), p_window_seconds: 900, p_max: 10 });
  if (allowed === false) return fail(429, 'rate_limited', 'Çok fazla deneme. Biraz sonra tekrar deneyin.');

  const { data: state } = await asUser.rpc('account_state');
  const own = ((state ?? []) as Array<{ status: string; must_change_password: boolean }>)[0];
  if (!own || own.status !== 'active' || !own.must_change_password) return fail(409, 'not_required', 'Bu hesap için şifre değişikliği beklenmiyor.');

  const body = (await request.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  const email = normalizeEmail(user.email);
  const problem = passwordProblem(next, email);
  if (problem) return fail(400, 'weak_password', problem);
  if (next === current) return fail(400, 'same_password', 'Yeni şifre geçici şifreyle aynı olamaz.');

  // the temporary password must be right (a stolen session alone cannot set a new password)
  const probe = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error: signError } = await probe.auth.signInWithPassword({ email, password: current });
  if (signError || signed.user?.id !== user.id) return fail(400, 'wrong_current', 'Geçici şifre yanlış.');

  const { error: setError } = await service.auth.admin.updateUserById(user.id, { password: next });
  if (setError) return fail(400, 'auth_failed', `Yeni şifre kaydedilemedi: ${setError.message}`);
  const { error: flagError } = await service.rpc('users_password_set', { p_email: email, p_user_id: user.id });
  if (flagError) return fail(500, 'flag_failed', 'Şifre değişti ama hesap açılamadı. Yeni şifrenizi “geçici şifre” alanına yazarak tekrar deneyin.');
  return NextResponse.json({ ok: true });
}
