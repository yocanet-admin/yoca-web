import { createHash } from 'node:crypto';
import { getSupabaseServiceRole } from '@/lib/supabase';

/**
 * Yoca — shared guards for the public forms (server only).
 *
 * Rate limit: 5 submissions per IP per hour and form, counted in Postgres
 * (public.hit_rate_limit, upgrade v13) so every Vercel instance sees the same
 * count. The IP is stored only as a SHA-256 hash. When the function is not
 * installed yet (v13 not run) or the service role key is missing, it falls back
 * to the old per-instance memory counter and logs that once per instance.
 *
 * Cost: no new service; one extra database call per form submission and a
 * table that holds at most a few rows per active IP (old windows are deleted
 * by the same function).
 */

export const RATE_LIMIT = 5;
export const RATE_WINDOW_SECONDS = 60 * 60;

const memory = new Map<string, number[]>();
let warned = false;

function memoryLimited(key: string): boolean {
  const now = Date.now();
  const list = (memory.get(key) ?? []).filter((ts) => ts > now - RATE_WINDOW_SECONDS * 1000);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  memory.set(key, list);
  return false;
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
}

/** True when this IP has used up its submissions for this form in the current window. */
export async function rateLimited(form: 'contact' | 'checkup', ip: string): Promise<boolean> {
  const key = createHash('sha256').update(`${form}:${ip}`).digest('hex');
  const service = getSupabaseServiceRole();
  if (service) {
    const { data, error } = await service.rpc('hit_rate_limit', {
      p_key: key,
      p_window_seconds: RATE_WINDOW_SECONDS,
      p_max: RATE_LIMIT,
    });
    if (!error && typeof data === 'boolean') return !data;
    if (!warned) {
      warned = true;
      console.error('[rate-limit] hit_rate_limit() unavailable, using per-instance memory:', error?.message ?? 'unexpected result');
    }
  } else if (!warned) {
    warned = true;
    console.error('[rate-limit] SUPABASE_SERVICE_ROLE_KEY missing, using per-instance memory');
  }
  return memoryLimited(key);
}

// ── Duplicate detection ────────────────────────────────────────
// A technical re-send (double click, retry after a slow response) carries
// exactly the same content. A changed submission from the same person is a
// new, real submission and is stored. Comparison ignores case and surrounding
// whitespace of text fields and the order of answers.

const norm = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export type CheckupFingerprintInput = {
  name: string;
  company: string;
  email: string;
  phone: string;
  locale: string;
  answers: Record<string, { i: number }>;
};

export function checkupFingerprint(input: CheckupFingerprintInput): string {
  const answers = Object.keys(input.answers)
    .sort()
    .map((key) => `${key}=${input.answers[key]?.i}`)
    .join('&');
  return [norm(input.name), norm(input.company), norm(input.email), norm(input.phone), norm(input.locale), answers].join('|');
}

/** Fingerprint of a stored checkup_submissions row (same shape as checkupFingerprint). */
export function storedCheckupFingerprint(row: {
  data_json?: Record<string, { i?: number }> | null;
  contact_info_json?: Record<string, unknown> | null;
}): string {
  const info = row.contact_info_json ?? {};
  const answers: Record<string, { i: number }> = {};
  for (const [key, value] of Object.entries(row.data_json ?? {})) answers[key] = { i: Number(value?.i) };
  return checkupFingerprint({
    name: String(info.name ?? ''),
    company: String(info.company ?? ''),
    email: String(info.email ?? ''),
    phone: String(info.phone ?? ''),
    locale: String(info.locale ?? ''),
    answers,
  });
}

export function contactFingerprint(input: { name: string; company: string; email: string; message: string; locale?: string }): string {
  return [norm(input.name), norm(input.company), norm(input.email), norm(input.message)].join('|');
}
