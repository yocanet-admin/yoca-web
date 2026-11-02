'use client';

import { getAdminClient } from '@/lib/adminClient';

/**
 * Yoca cockpit — browser helpers.
 * adminApi() calls /api/admin/* with the signed-in user's access token.
 */

async function authHeader(): Promise<Record<string, string>> {
  const supabase = getAdminClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Turkish message for a failed admin API response. */
function failure(status: number | null, detail?: string): { ok: false; error: string } {
  if (status === 401) return { ok: false, error: 'Oturum süresi dolmuş olabilir — sayfayı yenileyin veya yeniden giriş yapın.' };
  if (status === 403) return { ok: false, error: 'Bu hesabın yönetim paneline erişim izni yok.' };
  if (status === 504 || status === 408) return { ok: false, error: 'Sunucu zamanında yanıt vermedi (zaman aşımı). Tekrar deneyin.' };
  if (status === null) return { ok: false, error: `Sunucuya ulaşılamadı${detail ? `: ${detail}` : ''}. İnternet bağlantınızı kontrol edip tekrar deneyin.` };
  return { ok: false, error: detail || `Sunucu hatası (HTTP ${status}). Tekrar deneyin.` };
}

/**
 * Shared fetch for /api/admin/*. Never throws: a network error, a non-JSON
 * body (e.g. a platform timeout page) or an HTTP error without a JSON error
 * becomes `{ ok: false, error }` with a Turkish message.
 */
async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
  } catch (error) {
    return failure(null, (error as Error)?.message) as T;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return failure(response.status) as T;
  }
  if (!body || typeof body !== 'object') return failure(response.status) as T;
  if (!response.ok) {
    const record = body as { error?: unknown };
    const known = failure(response.status);
    const error = response.status === 401 || response.status === 403 || typeof record.error !== 'string' || record.error === 'unauthorized' ? known.error : record.error;
    return { ...(body as object), ok: false, error } as T;
  }
  return body as T;
}

/** GET an admin API route with the session token. Never throws (see request()). */
export async function adminApi<T>(path: string): Promise<T> {
  return request<T>(path, { headers: await authHeader() });
}

/** POST JSON to an admin API route with the session token. Never throws. */
export async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
}

// ── Lead pipeline ─────────────────────────────────────────────────

export const LEAD_STATUSES = ['new', 'contacted', 'proposal', 'won', 'lost', 'spam'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_LABEL: Record<LeadStatus, string> = {
  new: 'Yeni',
  contacted: 'Görüşülüyor',
  proposal: 'Teklif',
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
  spam: 'Spam',
};

/** Pill styling per stage — text label always present, colour only supports it. */
export const LEAD_PILL: Record<LeadStatus, string> = {
  new: 'border-yoca-lime/60 text-yoca-lime',
  contacted: 'border-sky-400/50 text-sky-300',
  proposal: 'border-amber-400/50 text-amber-300',
  won: 'border-emerald-400/60 text-emerald-300',
  lost: 'border-line text-subtle',
  spam: 'border-red-400/40 text-red-300',
};

export const OPEN_STATUSES: LeadStatus[] = ['new', 'contacted', 'proposal'];

// ── Formatting ────────────────────────────────────────────────────

const TZ = 'Europe/Istanbul';

/** Today's calendar date in Istanbul as YYYY-MM-DD (due dates / follow-ups are Istanbul days, not UTC days). */
export function istanbulToday(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  }
}

export function fmtNumber(value: number): string {
  if (value >= 10_000) return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  return new Intl.NumberFormat('tr-TR').format(value);
}

export function fmtDate(iso: string, withTime = true): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', withTime ? { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ } : { dateStyle: 'medium', timeZone: TZ }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function fmtDay(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
  } catch {
    return isoDate;
  }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  return fmtDate(iso, false);
}

/** Signed change vs previous period, or null when there is no base. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
