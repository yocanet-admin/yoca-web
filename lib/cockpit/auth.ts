import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Yoca — admin API guard (server only).
 * The admin panel signs in with Supabase Auth in the browser; its API calls
 * send the access token as `Authorization: Bearer …`. Any signed-in Supabase
 * user is an admin (same rule as the RLS policies and /api/ai).
 */
export async function requireAdmin(request: NextRequest): Promise<{ id: string; email?: string } | null> {
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

/** Tiny in-memory cache per serverless instance (keeps API quotas calm). */
const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fresh: boolean, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  return value;
}
