import { getSupabaseAdmin, getSupabaseAsUser } from '@/lib/supabase';

/**
 * Yoca cockpit — notification settings + small cron state (server only).
 * Stored in `cockpit_settings` (upgrade-v9). Secrets never live here: the
 * Telegram bot token, Resend and OpenAI keys stay in Vercel env vars.
 */

export interface NotifySettings {
  email_to: string;
  telegram_chat_id: string | null;
  telegram_chat_name?: string | null;
  lead_alerts: boolean;
  site_alerts: boolean;
  morning_summary: boolean;
}

export const DEFAULT_NOTIFY: NotifySettings = {
  email_to: process.env.NOTIFY_EMAIL_TO || 'connect@yoca.net',
  telegram_chat_id: process.env.TELEGRAM_CHAT_ID || null,
  telegram_chat_name: null,
  lead_alerts: true,
  site_alerts: true,
  morning_summary: true,
};

export interface CronState {
  morning_last?: string;
  morning_last_at?: string;
  sites_last_at?: string;
}

async function readKey<T>(key: string): Promise<{ ready: boolean; value: T | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, value: null };
  const { data, error } = await supabase.from('cockpit_settings').select('value').eq('key', key).maybeSingle();
  if (error) return { ready: false, value: null };
  return { ready: true, value: (data?.value as T) ?? null };
}

async function writeKey(key: string, value: unknown, asUserToken?: string): Promise<boolean> {
  // An admin's change is written with their own session (audit shows who did it);
  // cron bookkeeping keeps the service role (audit shows "sistem").
  const supabase = asUserToken ? getSupabaseAsUser(asUserToken) : getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from('cockpit_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  return !error;
}

export async function getNotifySettings(): Promise<NotifySettings & { ready: boolean }> {
  const { ready, value } = await readKey<Partial<NotifySettings>>('notify');
  const merged = { ...DEFAULT_NOTIFY, ...(value ?? {}) };
  if (!merged.email_to) merged.email_to = DEFAULT_NOTIFY.email_to;
  return { ...merged, ready };
}

export async function saveNotifySettings(patch: Partial<NotifySettings>, asUserToken?: string): Promise<boolean> {
  const { ready, ...current } = await getNotifySettings();
  if (!ready) return false;
  return writeKey('notify', { ...current, ...patch }, asUserToken);
}

export async function getCronState(): Promise<CronState> {
  return (await readKey<CronState>('state')).value ?? {};
}

export async function saveCronState(patch: CronState): Promise<boolean> {
  return writeKey('state', { ...(await getCronState()), ...patch });
}

/** Which integrations have their env vars set (values are never exposed). */
export function integrations() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    email: Boolean(process.env.RESEND_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    cronSecret: (process.env.CRON_SECRET ?? '').trim().length >= 32,
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    emailFrom: process.env.NOTIFY_EMAIL_FROM || 'Yoca <noreply@yoca.net>',
  };
}

/** Istanbul calendar date (UTC+3, no DST) as YYYY-MM-DD. */
export function istanbulDate(offsetDays = 0, from = Date.now()): string {
  return new Date(from + 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
