import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { MenuRow, SectionRow, TeamMemberRow } from '@/types';

/**
 * Yoca — Supabase access layer.
 *
 * Every read helper degrades gracefully: when the environment variables are
 * missing (local dev without a project) or a query fails, sensible defaults
 * are returned so the site always renders.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

let browserClient: SupabaseClient | null = null;

/** Anon-key client (safe for RSC reads and the browser). */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

/** Next.js must never serve these reads from its data cache (cron state, alerts, leads). */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

/** Service-role client — server only (API routes). Falls back to anon. Always fresh (no fetch cache). */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_URL) return null;
  const key = SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false }, global: { fetch: noStoreFetch } });
}

/** Strict service-role client: null when SUPABASE_SERVICE_ROLE_KEY is missing (never falls back to anon). */
export function getSupabaseServiceRole(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: noStoreFetch } });
}

/**
 * Client that acts as the signed-in admin (their verified access token), so
 * row-level security applies and the audit trigger records THEIR e-mail as
 * the actor. Use for writes an admin triggers through an API route; keep
 * getSupabaseAdmin() for genuine background jobs (cron), which log as "sistem".
 */
export function getSupabaseAsUser(accessToken: string): SupabaseClient | null {
  if (!isSupabaseConfigured() || !accessToken) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch, headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// ── Sections ───────────────────────────────────────────────────────
const DEFAULT_SECTION_KEYS = [
  'hero',
  'bento',
  'services',
  'clients',
  'partners',
  'team',
  'clocks',
  'checkup_banner',
  'cta',
];

export async function fetchSections(): Promise<Record<string, boolean>> {
  const fallback: Record<string, boolean> = {};
  for (const key of DEFAULT_SECTION_KEYS) fallback[key] = true;

  const supabase = getSupabase();
  if (!supabase) return fallback;

  try {
    const { data, error } = await supabase
      .from('sections')
      .select('key,is_active')
      .returns<Pick<SectionRow, 'key' | 'is_active'>[]>();
    if (error || !data) return fallback;
    const map = { ...fallback };
    for (const row of data) map[row.key] = row.is_active;
    return map;
  } catch {
    return fallback;
  }
}

// ── Menus ──────────────────────────────────────────────────────────
export async function fetchMenu(location: 'header' | 'footer'): Promise<MenuRow[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('menus')
      .select('*')
      .eq('location', location)
      .eq('is_active', true)
      .order('order_index', { ascending: true })
      .returns<MenuRow[]>();
    if (error || !data || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Team (verified cards only; no fake people, no AI portraits) ───────
export async function fetchTeam(): Promise<TeamMemberRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('is_active', true)
      // Only members whose name, role and photo were confirmed (v14). Before v14
      // the column does not exist, the query fails and no card is shown.
      .eq('verified', true)
      .order('order_index', { ascending: true })
      .returns<TeamMemberRow[]>();
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
