/**
 * Yoca — panel roles (v30). One place for what each role may OPEN in the panel.
 * This only decides navigation (menu, redirects). The database (RLS:
 * is_admin() / can_finance() / can_content()) and the API routes
 * (requireAdmin / requireRole) enforce the same split on every request, so a
 * hidden page is never the only protection.
 */

export type PanelRole = 'admin' | 'finance' | 'editor';
export type AccountStatus = 'active' | 'invited' | 'disabled';

export const ROLES: PanelRole[] = ['admin', 'finance', 'editor'];

export const ROLE_LABEL: Record<PanelRole, string> = {
  admin: 'Yönetici',
  finance: 'Finans sorumlusu',
  editor: 'İçerik editörü',
};

export const ROLE_HINT: Record<PanelRole, string> = {
  admin: 'Tüm yönetim ekranları ve kullanıcı yönetimi.',
  finance: 'Yalnız Finans: genel bakış, gelirler, giderler.',
  editor: 'Yalnız site içeriği: bölümler, menüler, metinler, Work, Insights, ekip.',
};

export function isPanelRole(value: unknown): value is PanelRole {
  return value === 'admin' || value === 'finance' || value === 'editor';
}

/** Path roots a role may open (prefix match). Admin: everything under /admin. */
export const ROLE_ROOTS: Record<Exclude<PanelRole, 'admin'>, string[]> = {
  finance: ['/admin/finance', '/admin/expenses'],
  editor: ['/admin/sections', '/admin/menus', '/admin/content', '/admin/work', '/admin/insights', '/admin/team'],
};

/** Where a role lands (and where it is sent from a page it may not open). */
export const ROLE_HOME: Record<PanelRole, string> = {
  admin: '/admin',
  finance: '/admin/finance',
  editor: '/admin/insights',
};

/** Menu groups (by title) a role sees; admin sees all. */
export const ROLE_GROUPS: Record<Exclude<PanelRole, 'admin'>, string[]> = {
  finance: ['Finans'],
  editor: ['Site içeriği'],
};

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

export function canOpen(role: PanelRole, pathname: string): boolean {
  if (role === 'admin') return true;
  return ROLE_ROOTS[role].some((root) => under(pathname, root));
}

/** Menu items a role sees: admin all; others only the items inside their roots. */
export function visibleHref(role: PanelRole, href: string): boolean {
  return canOpen(role, href);
}

/** Paths that must render without a panel session (the invite page). */
export const PUBLIC_ADMIN_PATHS = ['/admin/davet'];
export const isPublicAdminPath = (pathname: string) => PUBLIC_ADMIN_PATHS.some((p) => under(pathname, p));

// ── Invites ──────────────────────────────────────────────────────────
export const INVITE_TTL_HOURS = 72;
export const PASSWORD_MIN = 10;

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function validName(value: unknown): boolean {
  const n = String(value ?? '').trim();
  return n.length >= 1 && n.length <= 120;
}

/** Password rule for the invite page (Supabase's own minimum is lower). */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;
  if (password.length > 72) return 'Şifre en çok 72 karakter olabilir.';
  if (password.toLowerCase().includes(email.split('@')[0]?.toLowerCase() || '\u0000')) return 'Şifre e-posta adınızı içermesin.';
  if (/^(.)\1+$/.test(password)) return 'Şifre tek bir karakterin tekrarı olamaz.';
  return null;
}

export type UserRow = {
  email: string;
  name: string;
  role: PanelRole;
  status: AccountStatus;
  has_account: boolean;
  invited_at: string | null;
  invited_by: string | null;
  disabled_at: string | null;
  created_at: string;
  invite_expires_at: string | null;
  invite_send_status: 'pending' | 'sent' | 'failed' | null;
  invite_sent_at: string | null;
  invite_open: boolean;
  must_change_password: boolean;
  email_verified: boolean;
  created_via: 'legacy' | 'invite' | 'direct';
};

export type InviteState = 'none' | 'sent' | 'expired' | 'failed' | 'pending';

/** What the list shows for a user's account / invite. */
export function accountState(row: Pick<UserRow, 'status' | 'invite_open' | 'invite_send_status' | 'invite_expires_at'> & { must_change_password?: boolean }, now = Date.now()): { label: string; tone: 'good' | 'warn' | 'bad' | 'info'; invite: InviteState } {
  if (row.status === 'active' && row.must_change_password) return { label: 'İlk girişte şifre değiştirmeli', tone: 'warn', invite: 'none' };
  if (row.status === 'active') return { label: 'Etkin', tone: 'good', invite: 'none' };
  if (row.status === 'disabled') return { label: 'Erişim kapalı', tone: 'bad', invite: 'none' };
  if (row.invite_send_status === 'failed') return { label: 'Davet gönderilemedi', tone: 'bad', invite: 'failed' };
  if (!row.invite_open) return { label: 'Davet geçersiz', tone: 'warn', invite: 'failed' };
  if (row.invite_expires_at && Date.parse(row.invite_expires_at) <= now) return { label: 'Davetin süresi doldu', tone: 'warn', invite: 'expired' };
  if (row.invite_send_status === 'sent') return { label: 'Davet bekliyor', tone: 'info', invite: 'sent' };
  return { label: 'Davet hazırlanıyor', tone: 'warn', invite: 'pending' };
}

/** What the panel can honestly say about e-mail ownership. */
export function emailProof(row: Pick<UserRow, 'created_via' | 'email_verified' | 'status'>): string {
  if (row.email_verified) return 'E-posta doğrulandı (davet bağlantısı)';
  if (row.created_via === 'direct') return 'E-posta doğrulanmadı (yönetici oluşturdu)';
  if (row.status === 'invited') return 'Davet kabul edilince doğrulanır';
  return 'Mevcut hesap (panel öncesi)';
}

/** A temporary password from the browser's CSPRNG (never sent anywhere but the create request). */
export function generatePassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.!';
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of Array.from(bytes)) out += alphabet[b % alphabet.length];
  // at least one digit and one symbol, so it always passes the rule
  return `${out.slice(0, length - 2)}${'23456789'[bytes[0] % 8]}${'-_.!'[bytes[1] % 4]}`;
}

/** Database error hints (raise … hint = '…') → stable codes for the API. */
export function dbErrorCode(hint: string | null | undefined, code: string | null | undefined): string {
  if (hint && /^[a-z_]+$/.test(hint)) return hint;
  if (code === '42501') return 'forbidden';
  if (code === 'P0002') return 'not_found';
  if (code === '22023') return 'invalid';
  return 'failed';
}
