import { NextRequest, NextResponse } from 'next/server';
import { adminEmailsStillSet, bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';
import { sendEmail } from '@/lib/notify';
import { dbErrorCode, isPanelRole, normalizeEmail, passwordProblem, validEmail, validName, type PanelRole, type UserRow } from '@/lib/admin/roles';
import { findAuthUserId, inviteEmail, inviteLink, newInviteToken, setAuthBan } from '@/lib/admin/users';

/**
 * Yoca — Sistem → Kullanıcılar (admin only: requireAdmin here AND is_admin()
 * inside every database function, so a non-admin can never manage users even
 * with a direct API or database call).
 *
 * GET  → { users, inviteReady, adminEmailsSet }
 * POST { action, email, … }
 *   invite { email, name, role }  → account row "invited" + one-time link by e-mail
 *   create { email, name, role, password }
 *                                 → Auth user with a TEMPORARY password (no e-mail is
 *                                   sent); the panel row is bound to it and must
 *                                   change the password before any access. The
 *                                   password goes only to Supabase Auth: never stored,
 *                                   logged, audited or returned. Partial failure →
 *                                   the new Auth user is deleted (or, failing that,
 *                                   blocked) and the request fails.
 *   resend { email }              → new link (the previous one stops working)
 *   revoke { email }              → pending invite cancelled (e-mail free again)
 *   role   { email, role }        → takes effect on the user's next request
 *   access { email, enabled }     → disable / re-enable; the row and all history stay
 * Every action is written to audit_log by the database with the admin as actor.
 * An invite is only reported as sent when the e-mail service accepted it; a
 * failed send revokes that link and the list shows "Davet gönderilemedi".
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
const fail = (status: number, code: string, error: string) => NextResponse.json({ ok: false, code, error }, { status });

type DbError = { message: string; hint?: string | null; code?: string | null };
const dbFail = (e: DbError) => {
  const code = dbErrorCode(e.hint, e.code);
  const status = code === 'forbidden' ? 403 : code === 'not_found' ? 404 : code === 'invalid' ? 400 : code === 'failed' ? 500 : 409;
  return fail(status, code, e.message);
};

async function sendInvite(asUser: NonNullable<ReturnType<typeof getSupabaseAsUser>>, inviteId: string, opts: { email: string; name: string; role: PanelRole; token: string; expiresAt: string; invitedBy?: string }) {
  const mail = inviteEmail({ name: opts.name, role: opts.role, link: inviteLink(opts.token), expiresAt: opts.expiresAt, invitedBy: opts.invitedBy });
  const result = await sendEmail(opts.email, mail.subject, mail.html);
  const ok = result === 'sent';
  const error = ok ? null : result === 'skipped' ? 'E-posta gönderimi yapılandırılmamış (RESEND_API_KEY yok).' : 'E-posta servisi daveti kabul etmedi.';
  const { error: markError } = await asUser.rpc('users_invite_sent', { p_invite: inviteId, p_ok: ok, p_error: error });
  if (markError) console.error('[users] invite result not recorded:', markError.message);
  return { ok, error };
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return unauthorized();
  const asUser = getSupabaseAsUser(bearerToken(request));
  if (!asUser) return fail(503, 'not_configured', 'Supabase yapılandırılmamış.');
  const { data, error } = await asUser.rpc('users_list');
  if (error) return dbFail(error);
  return NextResponse.json({ ok: true, users: (data ?? []) as UserRow[], inviteReady: Boolean(process.env.RESEND_API_KEY || process.env.NOTIFY_RESEND_ENDPOINT), adminEmailsSet: adminEmailsStillSet() });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  const asUser = getSupabaseAsUser(bearerToken(request));
  if (!asUser) return fail(503, 'not_configured', 'Supabase yapılandırılmamış.');
  const body = (await request.json().catch(() => ({}))) as { action?: string; email?: string; name?: string; role?: string; enabled?: boolean; password?: string };
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return fail(400, 'invalid', 'Geçerli bir e-posta adresi girin.');

  switch (body.action) {
    case 'invite': {
      if (!validName(body.name)) return fail(400, 'invalid', 'Ad 1–120 karakter olmalı.');
      if (!isPanelRole(body.role)) return fail(400, 'invalid', 'Rol seçin.');
      const name = String(body.name).trim();
      const t = newInviteToken();
      const { data: inviteId, error } = await asUser.rpc('users_invite', { p_email: email, p_name: name, p_role: body.role, p_token_hash: t.hash, p_expires_at: t.expiresAt });
      if (error) return dbFail(error);
      const sent = await sendInvite(asUser, String(inviteId), { email, name, role: body.role, token: t.token, expiresAt: t.expiresAt, invitedBy: admin.email });
      if (!sent.ok) return fail(502, 'send_failed', `Davet e-postası gönderilemedi: ${sent.error} Kullanıcı listede “Davet gönderilemedi” olarak duruyor; yeniden gönderebilir veya iptal edebilirsiniz.`);
      return NextResponse.json({ ok: true, sent: true, expiresAt: t.expiresAt });
    }
    case 'create': {
      if (!validName(body.name)) return fail(400, 'invalid', 'Ad 1–120 karakter olmalı.');
      if (!isPanelRole(body.role)) return fail(400, 'invalid', 'Rol seçin.');
      const password = typeof body.password === 'string' ? body.password : '';
      const problem = passwordProblem(password, email);
      if (problem) return fail(400, 'weak_password', `Geçici şifre: ${problem}`);
      const name = String(body.name).trim();
      // 1) clean refusal before anything is created (existing account / pending invite)
      const pre = await asUser.rpc('users_can_create', { p_email: email });
      if (pre.error) return dbFail(pre.error);
      const service = getSupabaseServiceRole();
      if (!service) return fail(503, 'not_configured', 'Sunucu anahtarı yok; hesap oluşturulamaz.');
      // 2) Auth user. email_confirm: Supabase "Confirm email" is ON, so an unconfirmed user could not
      //    sign in at all; ownership is NOT proven — the panel keeps email_verified_at empty and says so.
      const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      if (createError || !created?.user) {
        const exists = /already|exists|registered/i.test(createError?.message ?? '');
        return exists
          ? fail(409, 'auth_exists', 'Bu e-postayla bir giriş hesabı zaten var (panel kullanıcısı değil). İkinci hesap açılmaz; bu kişiyi davetle ekleyin — bağlantı e-posta sahipliğini doğrular.')
          : fail(502, 'auth_failed', 'Giriş hesabı oluşturulamadı.');
      }
      // 3) bind + role in one database transaction; on failure undo the Auth user
      const bind = await asUser.rpc('users_create', { p_email: email, p_name: name, p_role: body.role, p_user_id: created.user.id });
      if (bind.error) {
        const del = await service.auth.admin.deleteUser(created.user.id);
        if (del.error) {
          const banned = await setAuthBan(service, created.user.id, true);
          console.error('[users] create rollback: Auth user could not be deleted', banned ? 'nor blocked' : '(blocked)');
          return fail(500, 'partial', banned
            ? 'Hesap oluşturulamadı ve yarım kalan giriş hesabı silinemedi veya engellenemedi. Supabase → Authentication → Users ekranından bu e-postayı silin.'
            : 'Hesap oluşturulamadı; yarım kalan giriş hesabı silinemedi ama oturum açması engellendi. Supabase → Authentication → Users ekranından silebilirsiniz.');
        }
        const r = dbFail(bind.error);
        return r;
      }
      return NextResponse.json({ ok: true, created: true });
    }
    case 'resend': {
      const { data: rows, error: listError } = await asUser.rpc('users_list');
      if (listError) return dbFail(listError);
      const row = ((rows ?? []) as UserRow[]).find((u) => u.email === email);
      if (!row) return fail(404, 'not_found', 'Kullanıcı bulunamadı.');
      const t = newInviteToken();
      const { data: inviteId, error } = await asUser.rpc('users_invite_resend', { p_email: email, p_token_hash: t.hash, p_expires_at: t.expiresAt });
      if (error) return dbFail(error);
      const sent = await sendInvite(asUser, String(inviteId), { email, name: row.name || email, role: row.role, token: t.token, expiresAt: t.expiresAt, invitedBy: admin.email });
      if (!sent.ok) return fail(502, 'send_failed', `Davet e-postası gönderilemedi: ${sent.error} Önceki bağlantı da artık geçersiz.`);
      return NextResponse.json({ ok: true, sent: true, expiresAt: t.expiresAt });
    }
    case 'revoke': {
      const { error } = await asUser.rpc('users_invite_revoke', { p_email: email });
      if (error) return dbFail(error);
      return NextResponse.json({ ok: true });
    }
    case 'role': {
      if (!isPanelRole(body.role)) return fail(400, 'invalid', 'Rol seçin.');
      const { error } = await asUser.rpc('users_set_role', { p_email: email, p_role: body.role });
      if (error) return dbFail(error);
      return NextResponse.json({ ok: true });
    }
    case 'access': {
      if (typeof body.enabled !== 'boolean') return fail(400, 'invalid', 'enabled gerekli.');
      const { error } = await asUser.rpc('users_set_access', { p_email: email, p_enabled: body.enabled });
      if (error) return dbFail(error);
      // Database status already blocks every request; the Auth ban also ends sign-in and token refresh.
      let warning: string | null = null;
      const service = getSupabaseServiceRole();
      if (!service) warning = 'Sunucu anahtarı yok: erişim veritabanında kapandı, ancak oturum açma engeli uygulanamadı.';
      else {
        try {
          const id = await findAuthUserId(service, email);
          const problem = id ? await setAuthBan(service, id, !body.enabled) : null;
          if (problem) warning = `Erişim veritabanında ${body.enabled ? 'açıldı' : 'kapandı'}; oturum açma ayarı güncellenemedi: ${problem}`;
        } catch (e) {
          warning = `Erişim veritabanında ${body.enabled ? 'açıldı' : 'kapandı'}; oturum açma ayarı güncellenemedi: ${(e as Error).message}`;
        }
      }
      return NextResponse.json({ ok: true, warning });
    }
    default:
      return fail(400, 'invalid', 'Bilinmeyen işlem.');
  }
}
