import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/cockpit/auth';
import { LEASE_S, MANUAL_GAP_S } from '@/lib/cockpit/schedule';
import { runSiteChecks } from '@/lib/cockpit/siteRunner';
import { loadRunRows, loadSiteStatuses, SiteScheduleMissing } from '@/lib/cockpit/siteStatus';
import { getSupabaseServiceRole } from '@/lib/supabase';

/**
 * Yoca cockpit — "Şimdi kontrol et" for ONE site (admin only). POST { id }.
 * A real check like the cron's: same alert rules, same messages. The database
 * refuses a second manual check of the same site within 2 minutes, and a site
 * another run is checking right now. Afterwards the next automatic check moves
 * to one interval from now (or 15 minutes, as the single confirmation, after a
 * first failure); a "manual only" site gets no automatic check.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id || !UUID.test(body.id)) return NextResponse.json({ ok: false, error: 'Geçersiz site.' }, { status: 400 });
  const supabase = getSupabaseServiceRole();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Sunucu anahtarı (service role) tanımlı değil.' }, { status: 503 });

  const claim = await supabase.rpc('site_check_claim_manual', { p_site_id: body.id, p_min_gap_seconds: MANUAL_GAP_S, p_lease_seconds: LEASE_S });
  if (claim.error) {
    const pending = /site_check_claim_manual|site_check_state|does not exist|schema cache|Could not find/i.test(claim.error.message);
    return NextResponse.json({ ok: false, error: pending ? new SiteScheduleMissing().message : 'Kontrol başlatılamadı.' }, { status: pending ? 503 : 500 });
  }
  if (claim.data === 'missing') return NextResponse.json({ ok: false, error: 'Site bulunamadı.' }, { status: 404 });
  if (claim.data === 'busy') return NextResponse.json({ ok: false, error: 'Bu site şu anda kontrol ediliyor; sonuç birazdan görünecek.' }, { status: 409 });
  if (claim.data === 'too_soon') return NextResponse.json({ ok: false, error: `Aynı site ${MANUAL_GAP_S / 60} dakikada bir elle kontrol edilebilir.` }, { status: 429 });
  if (claim.data !== 'ok') return NextResponse.json({ ok: false, error: 'Kontrol başlatılamadı (beklenmeyen veritabanı yanıtı).' }, { status: 500 });

  try {
    const rows = await loadRunRows(supabase, [body.id]);
    const run = await runSiteChecks(supabase, rows);
    if (run.dbErrors.length) {
      await supabase.from('site_check_state').update({ lease_until: null }).eq('site_id', body.id);
      return NextResponse.json({ ok: false, error: `Kontrol yapıldı ama sonuç kaydedilemedi: ${run.dbErrors.join('; ')}` }, { status: 500 });
    }
    const site = (await loadSiteStatuses(supabase)).find((s) => s.id === body.id) ?? null;
    return NextResponse.json({ ok: true, site, sent: run.sent });
  } catch (error) {
    await supabase.from('site_check_state').update({ lease_until: null }).eq('site_id', body.id);
    return NextResponse.json({ ok: false, error: error instanceof SiteScheduleMissing ? error.message : 'Kontrol tamamlanamadı.' }, { status: 500 });
  }
}
