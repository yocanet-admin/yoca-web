import { getSupabaseAdmin, getSupabaseAsUser } from '@/lib/supabase';
import { sanitizeOps, type OpsSettings } from '@/lib/ops/settings';

/** Server-only read/write of cockpit_settings "ops" (admin writes with their own session → audit). */
export async function readOpsSettings(): Promise<{ ready: boolean; settings: OpsSettings }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, settings: sanitizeOps(null) };
  const { data, error } = await supabase.from('cockpit_settings').select('value').eq('key', 'ops').maybeSingle();
  if (error) return { ready: false, settings: sanitizeOps(null) };
  return { ready: true, settings: sanitizeOps(data?.value ?? null) };
}

export async function writeOpsSettings(value: OpsSettings, asUserToken: string): Promise<string | null> {
  const supabase = getSupabaseAsUser(asUserToken);
  if (!supabase) return 'Sunucu anahtarı yok.';
  const { error } = await supabase.from('cockpit_settings').upsert({ key: 'ops', value, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}
