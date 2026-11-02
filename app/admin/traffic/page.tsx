'use client';

import { useEffect, useState } from 'react';
import { Card, DailyBars, Notice, RankList, StatTile } from '@/components/admin/cockpit/Widgets';
import { adminApi, delta, fmtNumber } from '@/lib/cockpit/client';
import type { TrafficReport } from '@/lib/cockpit/vercel';
import { TokenHelp } from '@/components/admin/cockpit/TokenHelp';

/**
 * Yoca Admin — Trafik (Vercel Web Analytics).
 * One date-range row scopes every number on the page; previous period for
 * deltas. Conversion funnel from the track() events on the public site.
 */

type Response = { ok: boolean; configured?: boolean; report?: TrafficReport; error?: string };

const EVENT_LABEL: Record<string, string> = {
  cta_click: 'İletişim / Check-Up linkine tıklama',
  checkup_start: 'Check-Up başlatma',
  checkup_submit: 'Check-Up gönderme',
  contact_submit: 'İletişim formu gönderme',
};

const COUNTRY = (() => {
  try {
    const names = new Intl.DisplayNames(['tr'], { type: 'region' });
    return (code: string) => (code && code.length === 2 ? `${names.of(code) ?? code}` : code || '—');
  } catch {
    return (code: string) => code;
  }
})();

const DEVICE: Record<string, string> = { desktop: 'Masaüstü', mobile: 'Mobil', tablet: 'Tablet' };

export default function AdminTraffic() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<'visitors' | 'pageviews'>('visitors');
  const [result, setResult] = useState<Response | null>(null);
  const [busy, setBusy] = useState(true);

  const load = async (fresh = false) => {
    setBusy(true);
    setResult(await adminApi<Response>(`/api/admin/traffic?days=${days}${fresh ? '&refresh=1' : ''}`));
    setBusy(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const report = result?.report;
  const events = report?.events ?? [];
  const eventCount = (name: string) => events.find((e) => e.name === name)?.count ?? 0;
  const leads = eventCount('contact_submit') + eventCount('checkup_submit');
  const conversion = report && report.totals.visitors ? ((leads / report.totals.visitors) * 100).toFixed(1) : null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Trafik</h1>
          <p className="mt-1.5 text-[14px] text-muted">yoca.net — Vercel Web Analytics (çerezsiz, admin hariç).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-sm border px-3 py-1.5 text-[12px] font-bold ${days === d ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-line text-muted hover:text-white'}`}
            >
              Son {d} gün
            </button>
          ))}
          <button type="button" onClick={() => load(true)} className="admin-btn !py-1.5 text-[12px]">
            ↻ Yenile
          </button>
        </div>
      </header>

      {result && result.configured === false && <TokenHelp />}
      {result && result.configured && !result.ok && (
        <Notice tone="warning">Vercel verisi alınamadı: {result.error ?? 'bilinmeyen hata'}. Anahtarın süresi dolmuş ya da yetkisi eksik olabilir.</Notice>
      )}

      {(busy || report) && (
        <div className={`grid gap-6 transition-opacity ${busy && report ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Ziyaretçi" value={report ? fmtNumber(report.totals.visitors) : null} deltaPct={report ? delta(report.totals.visitors, report.previous.visitors) : null} deltaLabel={`önceki ${days} güne göre`} />
            <StatTile label="Sayfa görüntüleme" value={report ? fmtNumber(report.totals.pageviews) : null} deltaPct={report ? delta(report.totals.pageviews, report.previous.pageviews) : null} deltaLabel={`önceki ${days} güne göre`} />
            <StatTile label="Lead (form gönderimi)" value={report ? fmtNumber(leads) : null} hint="İletişim + Check-Up" />
            <StatTile label="Dönüşüm oranı" value={report ? (conversion === null ? '–' : `%${conversion}`) : null} hint="lead / ziyaretçi" />
          </div>

          <Card
            title={metric === 'visitors' ? 'Günlük ziyaretçi' : 'Günlük sayfa görüntüleme'}
            action={
              <div className="flex gap-1">
                {(['visitors', 'pageviews'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m} className={`rounded-sm px-2 py-1 text-[12px] font-bold ${metric === m ? 'bg-surface text-white' : 'text-subtle hover:text-white'}`}>
                    {m === 'visitors' ? 'Ziyaretçi' : 'Görüntüleme'}
                  </button>
                ))}
              </div>
            }
          >
            {report ? <DailyBars data={report.daily.map((d) => ({ date: d.date, value: d[metric] }))} label={metric === 'visitors' ? 'Ziyaretçi' : 'Sayfa görüntüleme'} /> : <div className="h-40 animate-pulse rounded-sm bg-surface" />}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="En çok bakılan sayfalar">
              <RankList rows={(report?.pages ?? []).map((r) => ({ label: r.label, value: r.pageviews }))} />
            </Card>
            <Card title="Kaynaklar">
              <RankList rows={(report?.referrers ?? []).map((r) => ({ label: r.label === '—' ? 'Doğrudan / bilinmiyor' : r.label, value: r.visitors }))} />
            </Card>
            <Card title="Ülkeler">
              <RankList rows={(report?.countries ?? []).map((r) => ({ label: r.label, value: r.visitors }))} format={COUNTRY} />
            </Card>
            <Card title="Cihazlar">
              <RankList rows={(report?.devices ?? []).map((r) => ({ label: r.label, value: r.visitors }))} format={(l) => DEVICE[l] ?? l} />
            </Card>
          </div>

          <Card title="İmzadan gelenler">
            <RankList
              rows={(report?.signatures ?? []).map((r) => ({ label: r.label, value: r.count }))}
              empty="Henüz imzadan gelen ziyaret yok. İmza sayfasında “Site adresi”ni doldurup kodu sitelere yeniden ekleyin."
            />
            <p className="mt-3 text-[12px] text-subtle">
              Müşteri sitelerindeki “Built by YOCA” imzasına tıklayıp yoca.net’e gelenler, siteye göre. Takip parametresi olmayan eski imzalar da, site Siteler listesinde izleniyorsa o siteden gelen ziyaretlerle sayılır.
            </p>
          </Card>

          <Card title="Dönüşüm hunisi">
            <RankList
              rows={[
                { label: 'Ziyaretçi', value: report?.totals.visitors ?? 0 },
                ...(['cta_click', 'checkup_start', 'checkup_submit', 'contact_submit'] as const).map((name) => ({ label: EVENT_LABEL[name], value: eventCount(name) })),
              ]}
            />
            <p className="mt-3 text-[12px] text-subtle">Olaylar bu sürümle toplanmaya başladı; önceki günlerde sıfır görünür.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
