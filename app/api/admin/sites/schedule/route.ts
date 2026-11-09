import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { isInterval } from '@/lib/cockpit/schedule';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';

/**
 * Yoca cockpit — change one site's check frequency (admin only).
 * POST { id, interval: '15m' | '1h' | '6h' | '24h' | '7d' | 'manual' }.
 * The setting is written with the admin's own session (audit log shows who);
 * only the schedule moves (site_check_reschedule): fail count, alert state and
 * the last result stay, and no message is sent. Switching to "manual" also
 * cancels a pending confirmation; a check that is running when the frequency
 * changes finishes and then plans with the new frequency.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; interval?: string };
  if (!body.id || !UUID.test(body.id) || !isInterval(body.interval)) return NextResponse.json({ ok: false, error: 'Geçersiz site veya sıklık.' }, { status: 400 });
  const asUser = getSupabaseAsUser(bearerToken(request));
  const service = getSupabaseServiceRole();
  if (!asUser || !service) return NextResponse.json({ ok: false, error: 'Supabase yapılandırılmamış.' }, { status: 503 });

  const updated = await asUser.from('monitored_sites').update({ check_interval: body.interval }).eq('id', body.id).select('id').maybeSingle();
  if (updated.error) return NextResponse.json({ ok: false, error: /check_interval/.test(updated.error.message) ? 'supabase/upgrade-v28-site-schedule.sql bekleniyor.' : 'Kaydedilemedi.' }, { status: 500 });
  if (!updated.data) return NextResponse.json({ ok: false, error: 'Site bulunamadı.' }, { status: 404 });

  // the next check is planned in the database under the row lock (v28 site_check_reschedule)
  const planned = await service.rpc('site_check_reschedule', { p_site_id: body.id });
  if (planned.error || (planned.data !== 'ok' && planned.data !== 'checking')) {
    return NextResponse.json({ ok: false, error: 'Sıklık kaydedildi, sonraki kontrol zamanı hesaplanamadı. Sayfayı yenileyip tekrar seçin.' }, { status: 500 });
  }
  const state = await service.from('site_check_state').select('next_check_at, confirm_pending').eq('site_id', body.id).maybeSingle();
  return NextResponse.json({
    ok: true,
    interval: body.interval,
    // 'after_check': a check is running; it plans with the new frequency when it ends
    applied: planned.data === 'checking' ? 'after_check' : 'now',
    next_check_at: (state.data?.next_check_at as string | null) ?? null,
    confirm_pending: Boolean(state.data?.confirm_pending),
  });
}
