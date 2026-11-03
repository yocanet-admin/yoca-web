import { cache } from 'react';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { DEFAULT_RESPONSE_TIMES, sanitizeResponseTimes, type ResponseTimes } from '@/lib/responseCopy';
import { DEFAULT_COMPANY, DEFAULT_KVKK_PUBLISH, sanitizeCompany, sanitizeKvkkPublish, type CompanyInfo, type KvkkPublish } from '@/lib/companyInfo';

/**
 * Yoca — site settings managed in the admin (server only).
 * cockpit_settings keys:
 *   "site_copy"      response targets for the contact / Check-Up texts
 *                    (+ the owner's "Süreleri sitede göster" approval)
 *   "company_info"   data controller / KVKK facts (empty = "tamamlanacak")
 *   "kvkk_published" { published } — the notice is linked as final only when ON
 *   "about_intro"    About-page draft text (shown only when approved)
 * The table is admin-only (RLS); public pages read it here with the service
 * role and fall back to safe defaults (neutral copy, empty official fields,
 * draft notice, unpublished About draft) when it cannot be read.
 */

export const SETTING_KEYS = ['site_copy', 'company_info', 'kvkk_published', 'about_intro'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface AboutIntro {
  status: 'draft' | 'approved';
  text: Partial<Record<'tr' | 'en' | 'az' | 'ar', string>>;
  approvedAt: string | null;
  approvedBy: string | null;
  note: string;
}

export const DEFAULT_ABOUT_INTRO: AboutIntro = {
  status: 'draft',
  text: {
    tr: 'Yoca’da marka, tasarım, yazılım ve pazarlama çalışmalarını projenin ihtiyacına göre bir araya getiriyoruz. Başlangıçta kapsamı ve teslimleri belirliyor, çalışma boyunca ilerlemeyi paylaşıyoruz.',
  },
  approvedAt: null,
  approvedBy: null,
  note: '',
};

export function sanitizeAboutIntro(input: Partial<AboutIntro> | null | undefined): AboutIntro {
  const v = input ?? {};
  const text: AboutIntro['text'] = {};
  for (const l of ['tr', 'en', 'az', 'ar'] as const) {
    const t = (v.text as Record<string, unknown> | undefined)?.[l];
    if (typeof t === 'string' && t.trim()) text[l] = t.trim().slice(0, 1200);
  }
  return {
    status: v.status === 'approved' ? 'approved' : 'draft',
    text: Object.keys(text).length ? text : DEFAULT_ABOUT_INTRO.text,
    approvedAt: typeof v.approvedAt === 'string' ? v.approvedAt : null,
    approvedBy: typeof v.approvedBy === 'string' ? v.approvedBy : null,
    note: typeof v.note === 'string' ? v.note.slice(0, 1000) : '',
  };
}

const readAll = cache(async (): Promise<{ ok: boolean; values: Record<string, unknown> }> => {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return { ok: false, values: {} };
  try {
    const { data, error } = await supabase.from('cockpit_settings').select('key, value').in('key', [...SETTING_KEYS]);
    if (error) return { ok: false, values: {} };
    return { ok: true, values: Object.fromEntries(((data ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value])) };
  } catch {
    return { ok: false, values: {} };
  }
});

export async function getResponseTimes(): Promise<ResponseTimes> {
  const { values } = await readAll();
  return values.site_copy ? sanitizeResponseTimes(values.site_copy as Partial<ResponseTimes>) : DEFAULT_RESPONSE_TIMES;
}

export async function getCompanyInfo(): Promise<CompanyInfo> {
  const { values } = await readAll();
  return values.company_info ? sanitizeCompany(values.company_info as Partial<CompanyInfo>) : DEFAULT_COMPANY;
}

/** Owner flag: the notice is presented as final only when this is ON (default OFF). */
export async function getKvkkPublish(): Promise<KvkkPublish> {
  const { values } = await readAll();
  return values.kvkk_published ? sanitizeKvkkPublish(values.kvkk_published as Partial<KvkkPublish>) : DEFAULT_KVKK_PUBLISH;
}

export async function getAboutIntro(): Promise<AboutIntro> {
  const { values } = await readAll();
  return values.about_intro ? sanitizeAboutIntro(values.about_intro as Partial<AboutIntro>) : DEFAULT_ABOUT_INTRO;
}

/** Uncached read for the admin API (no React request cache). */
export async function readSettingFresh(key: SettingKey): Promise<{ ready: boolean; value: unknown }> {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return { ready: false, value: null };
  const { data, error } = await supabase.from('cockpit_settings').select('value').eq('key', key).maybeSingle();
  if (error) return { ready: false, value: null };
  return { ready: true, value: (data as { value: unknown } | null)?.value ?? null };
}

/** Contact / Check-Up copy for a locale with the current response-time settings. */
export async function getFormCopy(locale: 'tr' | 'en' | 'az' | 'ar') {
  const [{ buildResponseCopy }, { getDict }] = await Promise.all([import('@/lib/responseCopy'), import('@/lib/i18n')]);
  return buildResponseCopy(locale, await getResponseTimes(), getDict(locale).checkup.questions.length);
}
