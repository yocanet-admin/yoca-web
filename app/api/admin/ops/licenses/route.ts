import { NextRequest, NextResponse } from 'next/server';
import { bearerToken, requireAdmin } from '@/lib/cockpit/auth';
import { getSupabaseAsUser } from '@/lib/supabase';
import { licenseApiConfigured, licenseCall, type RemoteLicense } from '@/lib/ops/licenseApi';
import { readOpsSettings } from '@/lib/ops/serverSettings';
import { canLicense, LICENSE_ACTIONS, type LicenseAction } from '@/lib/ops/settings';

/**
 * Yoca Operasyon — licenses (admin only), a management UI over
 * license.yoca.net (the source of truth).
 *
 * GET  → configured?, the list as read NOW from the license system with its
 *        read time — or an error. Never a stale list presented as current.
 * POST { action, requestKey, licenseId?, payload } → one license action:
 *   - the admin needs that action's permission (Operasyon ayarları);
 *   - ops_license_ops has one row per request key: a retry or double click
 *     returns the same row; a "pending" row means it is still running;
 *   - an UNKNOWN outcome (timeout) is checked at the license system with the
 *     same key before anything is sent again — never re-created blindly.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH: Record<LicenseAction, (id?: string) => string> = {
  create: () => '/api/v1/admin/licenses',
  extend: (id) => `/api/v1/admin/licenses/${encodeURIComponent(String(id))}/extend`,
  suspend: (id) => `/api/v1/admin/licenses/${encodeURIComponent(String(id))}/suspend`,
  resume: (id) => `/api/v1/admin/licenses/${encodeURIComponent(String(id))}/resume`,
  revoke: (id) => `/api/v1/admin/licenses/${encodeURIComponent(String(id))}/revoke`,
};

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const cfg = licenseApiConfigured();
  const { settings } = await readOpsSettings();
  const permissions = Object.fromEntries(LICENSE_ACTIONS.map((a) => [a, canLicense(settings, admin.email, a)]));
  if (!cfg.configured) return NextResponse.json({ ok: true, configured: false, missing: cfg.missing, permissions, licenses: null });
  const r = await licenseCall<{ licenses: RemoteLicense[] }>('GET', '/api/v1/admin/licenses?limit=200');
  if (!r.ok) return NextResponse.json({ ok: true, configured: true, permissions, licenses: null, error: r.error, errorKind: r.kind });
  return NextResponse.json({ ok: true, configured: true, permissions, licenses: r.data.licenses ?? [], fetchedAt: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; requestKey?: string; licenseId?: string; payload?: Record<string, unknown> };
  const action = body.action as LicenseAction;
  if (!LICENSE_ACTIONS.includes(action)) return NextResponse.json({ ok: false, error: 'Geçersiz işlem.' }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(String(body.requestKey ?? ''))) return NextResponse.json({ ok: false, error: 'requestKey gerekli.' }, { status: 400 });
  if (action !== 'create' && !body.licenseId) return NextResponse.json({ ok: false, error: 'licenseId gerekli.' }, { status: 400 });
  const { settings } = await readOpsSettings();
  if (!canLicense(settings, admin.email, action)) return NextResponse.json({ ok: false, error: 'Bu lisans işlemi için yetkiniz yok (Operasyon ayarları → Lisans yetkileri).' }, { status: 403 });
  const cfg = licenseApiConfigured();
  if (!cfg.configured) return NextResponse.json({ ok: false, code: 'not_configured', error: `Lisans API’si bağlı değil (${cfg.missing.join(', ')}). İşlem yapılmadı.` }, { status: 503 });
  const db = getSupabaseAsUser(bearerToken(request));
  if (!db) return NextResponse.json({ ok: false, error: 'Sunucu anahtarı yok.' }, { status: 503 });

  // One row per request key.
  const ins = await db.from('ops_license_ops').insert({ request_key: body.requestKey, action, license_id: body.licenseId ?? null, payload: body.payload ?? {}, status: 'pending', created_by: admin.email ?? admin.id }).select('*').maybeSingle();
  if (ins.error) {
    const { data: prev } = await db.from('ops_license_ops').select('*').eq('request_key', body.requestKey as string).maybeSingle();
    if (!prev) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
    const p = prev as { id: string; status: string; response: unknown; error: string | null };
    if (p.status === 'succeeded') return NextResponse.json({ ok: true, replay: true, result: p.response });
    if (p.status === 'failed') return NextResponse.json({ ok: false, replay: true, error: p.error ?? 'Başarısız.' }, { status: 422 });
    if (p.status === 'pending') return NextResponse.json({ ok: false, code: 'in_progress', error: 'Bu işlem zaten sürüyor; sonucunu bekleyin.' }, { status: 409 });
    // unknown → ask the license system what happened to this key before doing anything.
    const check = await licenseCall<{ status: string; result?: unknown }>('GET', `/api/v1/admin/requests/${encodeURIComponent(String(body.requestKey))}`);
    if (!check.ok) return NextResponse.json({ ok: false, code: 'unknown', error: `Önceki denemenin sonucu hâlâ bilinmiyor: ${check.error} Yeniden gönderilmedi.` }, { status: 502 });
    if (check.data.status === 'succeeded') {
      await db.from('ops_license_ops').update({ status: 'succeeded', response: check.data.result ?? null, finished_at: new Date().toISOString() }).eq('id', p.id);
      return NextResponse.json({ ok: true, replay: true, result: check.data.result });
    }
    if (check.data.status !== 'not_found') return NextResponse.json({ ok: false, code: 'unknown', error: `Lisans sistemi bu isteği “${check.data.status}” olarak gösteriyor. Yeniden gönderilmedi.` }, { status: 409 });
    // The license system never received it: safe to send with the same key.
  }

  const r = await licenseCall<unknown>('POST', PATH[action](body.licenseId), body.payload ?? {}, body.requestKey);
  const now = new Date().toISOString();
  if (r.ok) {
    await db.from('ops_license_ops').update({ status: 'succeeded', response: r.data as object, finished_at: now }).eq('request_key', body.requestKey as string);
    return NextResponse.json({ ok: true, result: r.data });
  }
  const status = r.kind === 'unreachable' ? 'unknown' : 'failed';
  await db.from('ops_license_ops').update({ status, error: r.error, finished_at: now }).eq('request_key', body.requestKey as string);
  return NextResponse.json({ ok: false, code: status, error: status === 'unknown' ? `${r.error} Lisans sisteminde kontrol etmeden yeniden oluşturmayın; “Tekrar dene” önce kontrol eder.` : r.error }, { status: status === 'unknown' ? 502 : 422 });
}
