'use client';

import { getAdminClient } from '@/lib/adminClient';

/**
 * Yoca cockpit — browser helpers.
 * adminApi() calls /api/admin/* with the signed-in user's access token.
 */

export async function adminApi<T>(path: string): Promise<T> {
  const supabase = getAdminClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  return (await response.json()) as T;
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
