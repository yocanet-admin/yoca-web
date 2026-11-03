'use client';

import { getAdminClient } from '@/lib/adminClient';
import { readingMinutes } from '@/lib/markdown';
import type { InsightRow, Locale } from '@/types';

/**
 * Yoca — admin-side Insights helpers (browser, Supabase Auth + RLS).
 * Slug generation, editable payload building, revisions, AI endpoint calls.
 * Publishing is NOT done here: status PUBLISHED/SCHEDULED is set only by the
 * explicit publish route (app/api/admin/insights/publish).
 */

export const INSIGHT_LOCALES: Array<{ code: Locale; label: string }> = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'az', label: 'Azərbaycanca' },
  { code: 'ar', label: 'العربية' },
];

export const STATUS_LABELS: Record<InsightRow['status'], string> = {
  DRAFT: 'Taslak',
  IN_REVIEW: 'İncelemede',
  SCHEDULED: 'Zamanlandı',
  PUBLISHED: 'Yayında',
  ARCHIVED: 'Arşiv',
};

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', ə: 'e', İ: 'i' };

export function slugify(input: string): string {
  const mapped = input.split('').map((ch) => TR_MAP[ch] ?? ch).join('');
  const ascii = mapped
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-');
  return ascii || `insight-${Date.now().toString(36)}`;
}

export type EditableInsight = Omit<InsightRow, 'id' | 'created_at' | 'updated_at' | 'reading_minutes'> & { id?: string };

export function emptyInsight(locale: Locale = 'tr', groupId?: string): EditableInsight {
  return {
    group_id: groupId ?? crypto.randomUUID(),
    locale,
    slug: '',
    title: '',
    excerpt: '',
    body_md: '',
    cover_url: null,
    cover_alt: null,
    cover_caption: null,
    category_key: null,
    tags: [],
    author_name: 'Yoca',
    author_role: null,
    status: 'DRAFT',
    publish_at: null,
    featured: false,
    related_service: null,
    related_product: null,
    related_insight_id: null,
    cta_type: 'none',
    seo_title: null,
    meta_description: null,
    canonical_override: null,
    og_title: null,
    og_description: null,
    og_image: null,
    noindex: false,
    sources: [],
    faq: [],
  };
}

export function toPayload(row: EditableInsight) {
  const { id: _id, ...rest } = row;
  void _id;
  return {
    ...rest,
    slug: slugify(rest.slug || rest.title),
    reading_minutes: readingMinutes(rest.body_md),
    publish_at: rest.publish_at || null,
    // Status/publish_at consistency: PUBLISHED needs a publish time (now if empty);
    // SCHEDULED needs a future time, otherwise it is simply published now.
    ...(rest.status === 'PUBLISHED' && !rest.publish_at ? { publish_at: new Date().toISOString() } : {}),
    ...(rest.status === 'SCHEDULED' && rest.publish_at && new Date(rest.publish_at) <= new Date() ? { status: 'PUBLISHED' as const } : {}),
  };
}

export type RevisionKind = 'snapshot' | 'ai_proposal' | 'restore' | 'autosave' | 'publish';

export async function saveRevision(insightId: string, row: Pick<EditableInsight, 'title' | 'excerpt' | 'body_md'>, reason: string, kind: RevisionKind = 'snapshot'): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase || !row.body_md) return false;
  const { data } = await supabase.auth.getSession();
  const withKind = await supabase.from('insight_revisions').insert({ insight_id: insightId, title: row.title, excerpt: row.excerpt, body_md: row.body_md, reason, kind, created_by: data.session?.user.email ?? null });
  if (!withKind.error) return true;
  // Before v14 the table has no kind/created_by columns: keep the old behaviour.
  const legacy = await supabase.from('insight_revisions').insert({ insight_id: insightId, title: row.title, excerpt: row.excerpt, body_md: row.body_md, reason });
  return !legacy.error;
}

async function accessToken(): Promise<string> {
  const supabase = getAdminClient();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error('Oturum bulunamadı — yeniden giriş yapın.');
  return token;
}

export interface AiRunInfo {
  id: string;
  model: string;
  usage: { input_tokens?: number; output_tokens?: number; cached_tokens?: number; images?: number };
  estCostUsd: number | null;
  mock: boolean;
}

export class AiCallError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Call the server AI endpoint. Every call carries a fresh idempotency key: the
 * button is disabled while it runs and the server refuses a second job with
 * the same key. Never throws for HTTP errors without a Turkish message.
 */
export async function callAi<T = unknown>(payload: Record<string, unknown>, requestKey: string = crypto.randomUUID()): Promise<{ result: T; run?: AiRunInfo; replay?: boolean }> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, requestKey }),
    });
  } catch {
    throw new AiCallError('Sunucuya ulaşılamadı. Metniniz değişmedi; bağlantıyı kontrol edip tekrar deneyin.');
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; run?: AiRunInfo; replay?: boolean; error?: string; code?: string };
  if (!res.ok || !json.ok) {
    const map: Record<string, string> = { unauthorized: 'Yetkisiz — yeniden giriş yapın.', unknown_action: 'Bilinmeyen işlem.' };
    throw new AiCallError(map[json.error ?? ''] ?? json.error ?? `Yapay zekâ isteği başarısız oldu (HTTP ${res.status}). Metniniz değişmedi.`, json.code);
  }
  return { result: json.result as T, run: json.run, replay: json.replay };
}

/** Authenticated JSON/multipart call to an admin route. */
export async function adminFetch<T = unknown>(path: string, init: { method?: 'GET' | 'POST'; json?: unknown; form?: FormData } = {}): Promise<T & { ok: boolean; error?: string }> {
  const token = await accessToken();
  try {
    const res = await fetch(path, {
      method: init.method ?? (init.json || init.form ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${token}`, ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
      body: init.form ?? (init.json ? JSON.stringify(init.json) : undefined),
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as T & { ok: boolean; error?: string };
    if (!res.ok && json.ok !== false) return { ...json, ok: false, error: `HTTP ${res.status}` };
    return json;
  } catch {
    return { ok: false, error: 'Sunucuya ulaşılamadı.' } as T & { ok: boolean; error?: string };
  }
}

/** Local datetime-local ↔ ISO helpers (editor shows local time, stores UTC). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
