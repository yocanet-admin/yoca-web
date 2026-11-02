import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca — admin API guard (server only).
 * The admin panel signs in with Supabase Auth in the browser; its API calls
 * send the access token as `Authorization: Bearer …`.
 *
 * Optional allowlist: ADMIN_EMAILS (comma-separated, case-insensitive). When it
 * is set, only those signed-in users count as admins. When it is unset, any
 * signed-in Supabase user is an admin (same rule as the RLS policies).
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

/** The signed-in admin (allowlist applied), or null. */
export async function requireAdmin(request: NextRequest): Promise<{ id: string; email?: string } | null> {
  const user = await sessionUser(request);
  if (!user || !isAllowedAdminEmail(user.email)) return null;
  return user;
}

/** Tiny in-memory cache per serverless instance (keeps API quotas calm). */
const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fresh: boolean, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  return value;
}
