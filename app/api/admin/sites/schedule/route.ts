import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { isInterval, nextAfterIntervalChange } from '@/lib/cockpit/schedule';
import { getSupabaseAsUser, getSupabaseServiceRole } from '@/lib/supabase';

/**
 * Yoca cockpit — change one site's check frequency (admin only).
 * POST { id, interval: '15m' | '1h' | '6h' | '24h' | '7d' | 'manual' }.
 * The setting is written with the admin's own session (audit log shows who);
 * only the schedule moves: fail count, alert state and the last result stay,
 * and no message is sent.
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

  const updated = await asUser.from('monitored_sites').update({ check_interval: body.interval }).eq('id', body.id).select('id, last_checked_at').maybeSingle();
  if (updated.error) return NextResponse.json({ ok: false, error: /check_interval/.test(updated.error.message) ? 'supabase/upgrade-v28-site-schedule.sql bekleniyor.' : 'Kaydedilemedi.' }, { status: 500 });
  if (!updated.data) return NextResponse.json({ ok: false, error: 'Site bulunamadı.' }, { status: 404 });

  await service.from('site_check_state').upsert({ site_id: body.id }, { onConflict: 'site_id', ignoreDuplicates: true });
  const state = await service.from('site_check_state').select('next_check_at, confirm_pending').eq('site_id', body.id).maybeSingle();
  const next = nextAfterIntervalChange({
    interval: body.interval,
    lastCheckedAt: (updated.data as { last_checked_at: string | null }).last_checked_at,
    confirmPending: Boolean(state.data?.confirm_pending),
    currentNext: (state.data?.next_check_at as string | null) ?? null,
    now: Date.now(),
  });
  const write = await service.from('site_check_state').update({ ...next, updated_at: new Date().toISOString() }).eq('site_id', body.id);
  if (write.error) return NextResponse.json({ ok: false, error: 'Sıklık kaydedildi, sonraki kontrol zamanı güncellenemedi.' }, { status: 500 });
  return NextResponse.json({ ok: true, interval: body.interval, ...next });
}
