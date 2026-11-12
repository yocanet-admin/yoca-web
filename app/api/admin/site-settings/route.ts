import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireRole } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { readSettingFresh, sanitizeAboutIntro, DEFAULT_ABOUT_INTRO, type AboutIntro } from '@/lib/siteSettings';
import { DEFAULT_RESPONSE_TIMES, dueBusinessDay, sanitizeResponseTimes, type ResponseTimes } from '@/lib/responseCopy';
import { DEFAULT_COMPANY, DEFAULT_KVKK_PUBLISH, missingForNotice, sanitizeCompany, sanitizeKvkkPublish, type CompanyInfo, type KvkkPublish } from '@/lib/companyInfo';

/**
 * Yoca — site settings managed by admins (cockpit_settings):
 *   site_copy       response targets + "Süreleri sitede göster (sahip onayı)"
 *   company_info    data controller / KVKK facts
 *   kvkk_published  owner flag: notice linked as final (default OFF)
 *   about_intro     About-page draft text
 * Admin: every key. Content editor (v30): only about_intro (Metinler →
 * Hakkımızda taslağı) — GET returns only that, POST refuses other keys, and
 * the database allows the editor that one cockpit_settings row only.
 * Writes go through the user's own session so the audit log records who
 * changed what.
 * GET  → everything (+ what is missing for the notice, due-date preview)
 * POST { key, value }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

async function currentCompany(): Promise<CompanyInfo> {
  const c = await readSettingFresh('company_info');
  return c.value ? sanitizeCompany(c.value as Partial<CompanyInfo>) : DEFAULT_COMPANY;
}

export async function GET(request: NextRequest) {
  const user = await requireRole(request, ['admin', 'editor']);
  if (!user) return unauthorized();
  if (user.role === 'editor') {
    const about = await readSettingFresh('about_intro');
    return NextResponse.json({ ok: true, ready: about.ready, about: about.value ? sanitizeAboutIntro(about.value as Partial<AboutIntro>) : DEFAULT_ABOUT_INTRO });
  }
  const [rt, company, about, kvkk] = await Promise.all([readSettingFresh('site_copy'), readSettingFresh('company_info'), readSettingFresh('about_intro'), readSettingFresh('kvkk_published')]);
  const responseTimes = rt.value ? sanitizeResponseTimes(rt.value as Partial<ResponseTimes>) : DEFAULT_RESPONSE_TIMES;
  const companyInfo = company.value ? sanitizeCompany(company.value as Partial<CompanyInfo>) : DEFAULT_COMPANY;
  const now = new Date();
  return NextResponse.json({
    ok: true,
    ready: rt.ready && company.ready && about.ready && kvkk.ready,
    responseTimes,
    preview: {
      now: now.toISOString(),
      contactDue: dueBusinessDay(now, responseTimes.contactDays, responseTimes.holidays),
      checkupDue: dueBusinessDay(now, responseTimes.checkupDays, responseTimes.holidays),
    },
    company: companyInfo,
    missing: missingForNotice(companyInfo),
    kvkk: kvkk.value ? sanitizeKvkkPublish(kvkk.value as Partial<KvkkPublish>) : DEFAULT_KVKK_PUBLISH,
    about: about.value ? sanitizeAboutIntro(about.value as Partial<AboutIntro>) : DEFAULT_ABOUT_INTRO,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireRole(request, ['admin', 'editor']);
  if (!admin) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { key?: string; value?: Record<string, unknown> };
  if (admin.role === 'editor' && body.key !== 'about_intro') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const client = getSupabaseAsUser(bearerToken(request));
  if (!client) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });
  let value: unknown;
  switch (body.key) {
    case 'site_copy': {
      const prev = await readSettingFresh('site_copy');
      const prevValue = prev.value ? sanitizeResponseTimes(prev.value as Partial<ResponseTimes>) : DEFAULT_RESPONSE_TIMES;
      const next = sanitizeResponseTimes(body.value as Partial<ResponseTimes>);
      // Approval is recorded with who and when; turning it off clears it.
      next.approvedAt = next.approved ? (prevValue.approved ? prevValue.approvedAt ?? new Date().toISOString() : new Date().toISOString()) : null;
      next.approvedBy = next.approved ? (prevValue.approved ? prevValue.approvedBy ?? admin.email ?? null : admin.email ?? null) : null;
      value = next;
      break;
    }
    case 'company_info': {
      const next = sanitizeCompany(body.value as Partial<CompanyInfo>);
      value = next;
      // If the notice was published and a required field is now emptied, it falls back to draft.
      if (missingForNotice(next).length > 0) {
        const flag = await readSettingFresh('kvkk_published');
        if (flag.value && sanitizeKvkkPublish(flag.value as Partial<KvkkPublish>).published) {
          await client.from('cockpit_settings').upsert({ key: 'kvkk_published', value: DEFAULT_KVKK_PUBLISH, updated_at: new Date().toISOString() });
        }
      }
      break;
    }
    case 'kvkk_published': {
      const wanted = (body.value as Partial<KvkkPublish> | undefined)?.published === true;
      if (wanted) {
        const missing = missingForNotice(await currentCompany());
        if (missing.length) return NextResponse.json({ ok: false, error: `Önce eksik alanlar tamamlanmalı: ${missing.join(' · ')}` }, { status: 422 });
      }
      value = wanted ? { published: true, publishedAt: new Date().toISOString(), publishedBy: admin.email ?? null } : DEFAULT_KVKK_PUBLISH;
      break;
    }
    case 'about_intro': {
      const next = sanitizeAboutIntro(body.value as Partial<AboutIntro>);
      next.approvedAt = next.status === 'approved' ? new Date().toISOString() : null;
      next.approvedBy = next.status === 'approved' ? admin.email ?? null : null;
      value = next;
      break;
    }
    default:
      return NextResponse.json({ ok: false, error: 'Bilinmeyen ayar.' }, { status: 400 });
  }
  const { error } = await client.from('cockpit_settings').upsert({ key: body.key, value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ ok: false, error: `Kaydedilemedi: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, value });
}
