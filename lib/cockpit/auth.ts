import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabaseAsUser } from '@/lib/supabase';
import { isPanelRole, type PanelRole } from '@/lib/admin/roles';

/**
 * Yoca — admin API guard (server only).
 * The admin panel signs in with Supabase Auth in the browser; its API calls
 * send the access token as `Authorization: Bearer …`.
 *
 * Who may do what is decided by the DATABASE on every request: the
 * signed-in user's effective row in public.admin_users (v30: active, no
 * pending password change, bound to this Auth user) through is_admin() /
 * panel_role() — the same functions the RLS policies use, so the app and
 * direct database access can never disagree. A signed-in Auth user without
 * such a row has no role at all.
 *
 * ADMIN_EMAILS (v30): no longer read for access. It used to narrow admins
 * while admin_users was the only list; with panel-managed accounts it would
 * block every newly created admin. Its presence is only reported (Kullanıcılar
 * screen) so it can be removed after the transition (supabase/YAYIN-v30.md).
 */

/** True when the (no longer used) ADMIN_EMAILS variable is still set — for the transition notice only. */
export function adminEmailsStillSet(): boolean {
  return (process.env.ADMIN_EMAILS ?? '').split(',').some((email) => email.trim() !== '');
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

/** The signed-in admin, or null: valid session + database is_admin() (effective admin row). */
export async function requireAdmin(request: NextRequest): Promise<{ id: string; email?: string } | null> {
  const user = await sessionUser(request);
  if (!user) return null;
  const check = await adminCheck(bearerToken(request));
  return check.ok ? user : null;
}

/**
 * The signed-in user if their CURRENT role (read from the database on this
 * request) is one of `roles`.
 */
export async function requireRole(request: NextRequest, roles: PanelRole[]): Promise<{ id: string; email?: string; role: PanelRole } | null> {
  const user = await sessionUser(request);
  if (!user) return null;
  const role = await panelRole(bearerToken(request));
  if (role === 'check_failed' || role === null || !roles.includes(role)) return null;
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
