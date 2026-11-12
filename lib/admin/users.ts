import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailLayout, esc, kicker, para, SITE, title, buttons } from '@/lib/notifyTemplates';
import { INVITE_TTL_HOURS, ROLE_HINT, ROLE_LABEL, type PanelRole } from '@/lib/admin/roles';

/**
 * Yoca — user management helpers (server only).
 * Invite links: 32 random bytes (base64url) in the URL FRAGMENT (#t=…) so the
 * token never reaches server logs or a Referer header; only its SHA-256 hash
 * is stored. The invitee sets their own password on /admin/davet; nobody else
 * sees or shares it.
 */

export function newInviteToken(): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString() };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function validTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function inviteLink(token: string): string {
  return `${SITE}/admin/davet#t=${token}`;
}

export function inviteEmail(opts: { name: string; role: PanelRole; link: string; expiresAt: string; invitedBy?: string | null }): { subject: string; html: string } {
  const until = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(opts.expiresAt));
  const body =
    kicker('Yönetim paneli daveti') +
    title(`Merhaba ${opts.name}`) +
    para(`Yoca yönetim paneline <b style="color:#ffffff;">${esc(ROLE_LABEL[opts.role])}</b> olarak davet edildin. ${esc(ROLE_HINT[opts.role])}`, { html: true }) +
    para('Aşağıdaki bağlantıyla kendi şifreni belirle. Şifreni kimseyle paylaşma; Yoca ekibi de şifreni görmez ve istemez.') +
    buttons([{ label: 'Şifremi belirle', href: opts.link, primary: true }]) +
    para(`Bağlantı tek kullanımlıktır ve ${esc(until)} (İstanbul) tarihine kadar geçerlidir. Süre dolarsa yöneticiden yeni davet iste.`, { muted: true, html: true }) +
    para('Bu daveti beklemiyorsan e-postayı yok sayabilirsin; bağlantı kullanılmazsa hesap açılmaz.', { muted: true });
  return {
    subject: 'Yoca yönetim paneli daveti',
    html: emailLayout({
      preheader: 'Yoca yönetim paneline davet edildin — şifreni belirle.',
      label: 'Yönetim paneli daveti',
      headerLabel: 'Yönetim',
      body,
      footerHtml: `Bu e-posta <a href="${SITE}" style="color:#8a8f98;text-decoration:underline;">yoca.net</a> yönetim panelinden, bir yöneticinin daveti üzerine gönderildi.`,
    }),
  };
}

/** Supabase Auth user id for an e-mail (admin API; small user counts → paged scan). */
export async function findAuthUserId(service: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Sign-in on/off at the Auth level (ban). The database status already decides
 * access on every request; the ban additionally ends sign-in and token refresh.
 */
export async function setAuthBan(service: SupabaseClient, userId: string, banned: boolean): Promise<string | null> {
  const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' });
  return error ? error.message : null;
}
