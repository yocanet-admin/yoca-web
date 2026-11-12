import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { normalizeEmail, passwordProblem, ROLE_LABEL, isPanelRole } from '@/lib/admin/roles';
import { findAuthUserId, hashInviteToken, validTokenShape } from '@/lib/admin/users';
import { createHash } from 'node:crypto';
import { clientIp } from '@/lib/formGuard';

/**
 * Yoca — invite acceptance (public; the one-time token is the credential).
 * POST { token }            → { state: valid | expired | used | revoked | invalid, email, name, role }
 * POST { token, password }  → sets the invitee's OWN password in Supabase Auth
 *                             and activates the account (invite_accept).
 * The token comes from the link fragment (#t=…), never from the URL path or
 * query, so it is not written to logs; only its hash is looked up. The password
 * goes straight to Supabase Auth and is never stored or logged here.
 * Order: Auth password first, then the database activation. If the invite was
 * revoked in between, the Auth user simply has no panel access.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_TEXT: Record<string, string> = {
  invalid: 'Davet bağlantısı geçersiz. E-postadaki bağlantıyı eksiksiz açtığınızdan emin olun.',
  expired: 'Davet bağlantısının süresi doldu. Yöneticiden yeni davet isteyin.',
  used: 'Bu davet bağlantısı daha önce kullanıldı. Şifrenizle giriş yapın.',
  revoked: 'Bu davet iptal edildi veya yerine yenisi gönderildi. Son gelen e-postadaki bağlantıyı kullanın.',
};

type Lookup = { email: string; name: string; role: string; state: string; expires_at: string; user_id: string | null };

export async function POST(request: NextRequest) {
  const service = getSupabaseServiceRole();
  if (!service) return NextResponse.json({ ok: false, error: 'Sunucu yapılandırması eksik.' }, { status: 503 });
  // Shared counter (v13 hit_rate_limit): 30 attempts / 15 min per IP. The token itself is 256 bits.
  const { data: allowed } = await service.rpc('hit_rate_limit', { p_key: createHash('sha256').update(`invite:${clientIp(request.headers)}`).digest('hex'), p_window_seconds: 900, p_max: 30 });
  if (allowed === false) return NextResponse.json({ ok: false, error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  if (!validTokenShape(body.token)) return NextResponse.json({ ok: true, state: 'invalid', message: STATE_TEXT.invalid });
  const hash = hashInviteToken(body.token);
  const { data, error } = await service.rpc('invite_lookup', { p_token_hash: hash });
  if (error) return NextResponse.json({ ok: false, error: 'Davet kontrol edilemedi.' }, { status: 500 });
  const row = ((data ?? []) as Lookup[])[0];
  if (!row) return NextResponse.json({ ok: true, state: 'invalid', message: STATE_TEXT.invalid });
  const info = { email: row.email, name: row.name, role: isPanelRole(row.role) ? ROLE_LABEL[row.role] : row.role, expiresAt: row.expires_at };
  if (row.state !== 'valid') return NextResponse.json({ ok: true, state: row.state, message: STATE_TEXT[row.state] ?? STATE_TEXT.invalid });
  if (body.password === undefined) return NextResponse.json({ ok: true, state: 'valid', ...info });

  const password = String(body.password ?? '');
  const problem = passwordProblem(password, row.email);
  if (problem) return NextResponse.json({ ok: false, code: 'weak_password', error: problem }, { status: 400 });

  const email = normalizeEmail(row.email);
  let userId = row.user_id;
  try {
    if (!userId) userId = await findAuthUserId(service, email);
    if (userId) {
      // An Auth user with this e-mail already exists (e.g. an earlier account): the link proves the inbox; set the new password and allow sign-in.
      // email_confirm: the link proved the inbox (Supabase "Confirm email" is ON; an unconfirmed user could not sign in).
      const { error: upd } = await service.auth.admin.updateUserById(userId, { password, ban_duration: 'none', email_confirm: true });
      if (upd) return NextResponse.json({ ok: false, code: 'auth_failed', error: `Şifre kaydedilemedi: ${upd.message}` }, { status: 400 });
    } else {
      const { data: created, error: create } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: row.name } });
      if (create || !created.user) return NextResponse.json({ ok: false, code: 'auth_failed', error: `Hesap oluşturulamadı: ${create?.message ?? 'bilinmeyen hata'}` }, { status: 400 });
      userId = created.user.id;
    }
  } catch (e) {
    return NextResponse.json({ ok: false, code: 'auth_failed', error: `Hesap işlemi tamamlanamadı: ${(e as Error).message}` }, { status: 500 });
  }
  const { error: acceptError } = await service.rpc('invite_accept', { p_token_hash: hash, p_user_id: userId });
  if (acceptError) {
    const state = acceptError.hint && STATE_TEXT[acceptError.hint] ? acceptError.hint : 'invalid';
    return NextResponse.json({ ok: false, code: state, error: STATE_TEXT[state] }, { status: 409 });
  }
  return NextResponse.json({ ok: true, state: 'accepted', email });
}
