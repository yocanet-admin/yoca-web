import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabaseAsUser } from '@/lib/supabase';
import { isPanelRole, type PanelRole } from '@/lib/admin/roles';

/**
 * Yoca — admin API guard (server only).
 * The admin panel signs in with Supabase Auth in the browser; its API calls
 * send the access token as `Authorization: Bearer …`.
 *
 * Admins are the e-mails in public.admin_users (checked through is_admin()).
 * ADMIN_EMAILS (optional, comma-separated) narrows this further; it can never
 * add someone who is not in admin_users.
 */

/** The ADMIN_EMAILS allowlist, lower-cased; null when the env var is unset or empty. */
export function adminAllowlist(): string[] | null {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
}

/** True when the e-mail may use the admin panel (always true without ADMIN_EMAILS). */
export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  const list = adminAllowlist();
  if (!list) return true;
  return Boolean(email) && list.includes(String(email).trim().toLowerCase());
}

/** The signed-in user behind the Bearer token (allowlist NOT applied), or null. */
export async function sessionUser(request: NextRequest): Promise<{ id: string; email?: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? undefined };
  } catch {
    return null;
  }
}

export type AdminCheck = { ok: true } | { ok: false; reason: 'not_admin' | 'check_failed' };

/**
 * Is this session an admin? The database decides: public.is_admin() (v10) reads
 * public.admin_users with the caller's own JWT — the same rule the RLS policies use
 * (v12), so the app and direct API access can never disagree. If the function is
 * missing or the call fails, the answer is "no" (fail closed) with reason check_failed.
 */
export async function adminCheck(token: string): Promise<AdminCheck> {
  const client = getSupabaseAsUser(token);
  if (!client) return { ok: false, reason: 'check_failed' };
  try {
    const { data, error } = await client.rpc('is_admin');
    if (error) {
      console.error('adminCheck: is_admin() failed:', error.message);
      return { ok: false, reason: 'check_failed' };
    }
    return data === true ? { ok: true } : { ok: false, reason: 'not_admin' };
  } catch (error) {
    console.error('adminCheck: is_admin() failed:', (error as Error).message);
    return { ok: false, reason: 'check_failed' };
  }
}

/**
 * The panel role of this session: 'admin' | 'finance' | 'editor' | null, or
 * 'check_failed'. The database decides (panel_role(), v25/v30): only ACTIVE
 * accounts have a role, so a disabled or still-invited account gets null. A
 * finance user only gets Finans, an editor only the content screens:
 * is_admin() is false for both, so every requireAdmin route and is_admin()
 * policy still refuses them. Before v25 (no panel_role()) this falls back to
 * is_admin().
 */
export async function panelRole(token: string): Promise<PanelRole | null | 'check_failed'> {
  const client = getSupabaseAsUser(token);
  if (!client) return 'check_failed';
  try {
    const { data, error } = await client.rpc('panel_role');
    if (error) {
      if (/function|does not exist|schema cache/i.test(error.message)) {
        const check = await adminCheck(token);
        return check.ok ? 'admin' : check.reason === 'not_admin' ? null : 'check_failed';
      }
      console.error('panelRole: panel_role() failed:', error.message);
      return 'check_failed';
    }
    return isPanelRole(data) ? data : null;
  } catch (error) {
    console.error('panelRole: panel_role() failed:', (error as Error).message);
    return 'check_failed';
  }
}

export function bearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/** The signed-in admin, or null: valid session + optional ADMIN_EMAILS + database is_admin(). */
export async function requireAdmin(request: NextRequest): Promise<{ id: string; email?: string } | null> {
  const user = await sessionUser(request);
  if (!user || !isAllowedAdminEmail(user.email)) return null;
  const check = await adminCheck(bearerToken(request));
  return check.ok ? user : null;
}

/**
 * The signed-in user if their CURRENT role (read from the database on this
 * request) is one of `roles`. ADMIN_EMAILS still narrows admins (as in
 * requireAdmin); it never applies to finance or editor accounts.
 */
export async function requireRole(request: NextRequest, roles: PanelRole[]): Promise<{ id: string; email?: string; role: PanelRole } | null> {
  const user = await sessionUser(request);
  if (!user) return null;
  const role = await panelRole(bearerToken(request));
  if (role === 'check_failed' || role === null || !roles.includes(role)) return null;
  if (role === 'admin' && !isAllowedAdminEmail(user.email)) return null;
  return { ...user, role };
}

/** Content screens (Bölümler, Menüler, Metinler, Work, Insights, Ekip): admin or editor. */
export const requireContent = (request: NextRequest) => requireRole(request, ['admin', 'editor']);

/** Tiny in-memory cache per serverless instance (keeps API quotas calm). */
const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fresh: boolean, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  return value;
}
