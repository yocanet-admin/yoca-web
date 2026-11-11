'use client';

import { useState } from 'react';
import { Card, DailyBars, Notice, StatTile } from '@/components/admin/cockpit/Widgets';
import { Badge, field, small, ScrollArea } from '@/components/admin/ops/ui';
import { DateField } from '@/components/admin/DateField';
import { fmtDay, fmtNumber } from '@/lib/cockpit/client';
import {
  COUNTRY_OPTIONS, countryLabel, ctrText, DATA_LAG_NOTE, FINALITY_UNKNOWN, DATA_STATE_LABEL, DEVICE_LABEL, DEVICES, eachDay, HISTORY_SCOPE, NO_DATA, POSITION_LABEL, POSITION_NOTE,
  positionText, PRESETS, SEARCH_TYPE_LABEL, SEARCH_TYPES, type Preset, type SeoFilters,
} from '@/lib/seoPanel/model';
import type { Report } from '@/lib/seoPanel/report';
import type { WeeklyTotal } from '@/components/admin/seo/types';

export interface Query { preset: Preset | null; start: string; end: string; filters: SeoFilters }

const dayYear = (d: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const rangeText = (r: { start: string; end: string }) => `${fmtDay(r.start)} – ${dayYear(r.end)}`;
const sign = (n: number) => (n > 0 ? `+${n.toLocaleString('tr-TR')}` : n.toLocaleString('tr-TR'));

export function Filters({ query, onChange, today }: { query: Query; onChange: (q: Query) => void; today: string }) {
  const [custom, setCustom] = useState({ start: query.start, end: query.end });
  const f = query.filters;
  const set = (patch: Partial<SeoFilters>) => onChange({ ...query, filters: { ...f, ...patch } });
  return (
    <div className="grid gap-3 admin-box p-4" data-testid="seo-filters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-muted">Dönem</span>
        {PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={query.preset === p} onClick={() => onChange({ ...query, preset: p, start: '', end: '' })}
            className={`rounded-sm border px-3 py-1.5 text-[12px] font-bold ${query.preset === p ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-line text-muted hover:text-white'}`}>
            Son {p} gün
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-muted" role="group" aria-label="Özel tarih aralığı">
          <span>Özel</span>
          <DateField label="Başlangıç tarihi" value={custom.start} today={today} max={custom.end || today} onChange={(v) => setCustom({ ...custom, start: v })} />
          <span aria-hidden="true">–</span>
          <DateField label="Bitiş tarihi" value={custom.end} today={today} min={custom.start || null} max={today} onChange={(v) => setCustom({ ...custom, end: v })} />
          <button type="button" className={small} disabled={!custom.start || !custom.end || custom.start > custom.end} onClick={() => onChange({ ...query, preset: null, start: custom.start, end: custom.end })}>Uygula</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid min-w-0 gap-1 text-[12px] font-semibold text-muted">Ülke
          <select className={`${field} w-full min-w-0`} value={f.country} onChange={(e) => set({ country: e.target.value })}>
            <option value="">{countryLabel('')}</option>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{countryLabel(c)}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-[12px] font-semibold text-muted">Cihaz
          <select className={`${field} w-full min-w-0`} value={f.device} onChange={(e) => set({ device: e.target.value as SeoFilters['device'] })}>
            {DEVICES.map((d) => <option key={d} value={d}>{DEVICE_LABEL[d]}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-[12px] font-semibold text-muted">Arama türü
          <select className={`${field} w-full min-w-0`} value={f.searchType} onChange={(e) => set({ searchType: e.target.value as SeoFilters['searchType'] })}>
            {SEARCH_TYPES.map((t) => <option key={t} value={t}>{SEARCH_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-[12px] font-semibold text-muted">Veri
          <select className={`${field} w-full min-w-0`} value={f.dataState} onChange={(e) => set({ dataState: e.target.value as SeoFilters['dataState'] })}>
            <option value="final">{DATA_STATE_LABEL.final}</option>
            <option value="all">{DATA_STATE_LABEL.all}</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function DataLag({ report }: { report: Report }) {
  const c = report.current;
  const p = report.previous;
  const f = report.freshness;
  const list = (days: string[]) => (days.length ? days.map(fmtDay).join(', ') : 'yok');
  return (
    <div className="grid gap-1.5 admin-box p-4 text-[13px] leading-relaxed text-soft" data-testid="seo-lag">
      {f.known && f.finalThrough && f.firstIncompleteDate ? (
        <p>
          <strong className="text-white">Son kesin veri günü:</strong> {dayYear(f.finalThrough)} <span className="text-subtle">(ilk kesinleşmemiş gün {dayYear(f.firstIncompleteDate)}; Search Console yanıtından doğrulandı)</span>. {DATA_LAG_NOTE}
        </p>
      ) : (
        <p data-testid="seo-finality-unknown">
          <strong className="text-amber-200">{FINALITY_UNKNOWN}.</strong> Search Console yanıtı ilk kesinleşmemiş günü bildirmedi.{f.estimate && <> Tahmini son kesin gün: {dayYear(f.estimate)} <Badge tone="warn">tahmini</Badge> (doğrulanmadı; tipik 3 günlük gecikmeye göre).</>}
          {report.rangeEstimated && <> Dönemin bitişi bu tahmine göre seçildi.</>}
        </p>
      )}
      <p>
        <strong className="text-white">Gösterim olmayan günler ({c.zeroDays.length}):</strong> {list(c.zeroDays)}
        <span className="text-subtle"> — kesinleşmiş, o gün hiç gösterim yok.</span>
      </p>
      {c.pendingDays.length > 0 && (
        <p><strong className="text-white">Henüz kesinleşmemiş günler ({c.pendingDays.length}):</strong> {list(c.pendingDays)} <span className="text-subtle">— değerler {report.current.filters.dataState === 'all' ? 'değişebilir (taze veri)' : 'kesin veriye dahil değil'}.</span></p>
      )}
      {c.unknownDays.length > 0 && (
        <p><strong className="text-white">Veri olmayan günler, durumu belirsiz ({c.unknownDays.length}):</strong> {list(c.unknownDays)} <span className="text-subtle">— gösterim olmayan veya henüz kesinleşmemiş gün olabilir.</span></p>
      )}
      {(p.zeroDays.length > 0 || p.unknownDays.length > 0) && (
        <p className="text-subtle">Önceki dönem: {p.zeroDays.length ? `gösterim olmayan ${p.zeroDays.length} gün (${list(p.zeroDays)})` : ''}{p.unknownDays.length ? `${p.zeroDays.length ? ' · ' : ''}durumu belirsiz ${p.unknownDays.length} gün` : ''}</p>
      )}
    </div>
  );
}

export function Comparison({ report }: { report: Report }) {
  return (
    <div className="grid gap-1 rounded-md border border-yoca-lime/30 bg-yoca-lime/[0.04] px-4 py-3 text-[13px] text-soft" data-testid="seo-comparison">
      <p><strong className="text-white">Karşılaştırma:</strong> {rangeText(report.current.range)} <span className="text-subtle">↔ önceki</span> {rangeText(report.previous.range)} <span className="text-subtle">(aynı gün sayısı)</span></p>
      <p><strong className="text-white">İki dönemde aynı filtreler:</strong> {report.filtersText}</p>
    </div>
  );
}

export function Totals({ report }: { report: Report }) {
  const t = report.current.totals;
  const p = report.previous.totals;
  const d = report.deltas;
  const label = 'önceki döneme göre';
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Tıklama" value={fmtNumber(t.clicks)} deltaPct={d.clicksPct} deltaLabel={label} hint={d.clicksPct === null ? `önceki: ${fmtNumber(p.clicks)}` : undefined} />
      <StatTile label="Gösterim" value={fmtNumber(t.impressions)} deltaPct={d.impressionsPct} deltaLabel={label} hint={d.impressionsPct === null ? `önceki: ${fmtNumber(p.impressions)}` : undefined} />
      <StatTile label="Tıklama oranı (TO)" value={t.impressions ? ctrText(t.ctr, t.impressions) : '–'} hint={d.ctrPoints === null ? (t.impressions ? '' : NO_DATA) : `${sign(d.ctrPoints)} puan ${label} (önceki ${ctrText(p.ctr, p.impressions)})`} />
      <div className="admin-box p-5" data-testid="seo-position">
        <p className="text-[12px] font-semibold text-muted">{POSITION_LABEL}</p>
        <p className="mt-2 text-[30px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-white">{t.position === null ? '–' : positionText(t.position)}</p>
        <p className="mt-2 text-[12px] text-subtle">
          {d.positionDiff === null ? (t.position === null ? NO_DATA : `önceki: ${positionText(p.position)}`) : `önceki ${positionText(p.position)} · ${d.positionDiff === 0 ? 'değişmedi' : d.positionDiff < 0 ? `ortalama ${Math.abs(d.positionDiff).toLocaleString('tr-TR')} düştü (daha önde)` : `ortalama ${d.positionDiff.toLocaleString('tr-TR')} yükseldi (daha geride)`}`}
        </p>
        <p className="mt-1.5 text-[11px] leading-snug text-subtle">{POSITION_NOTE}</p>
      </div>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: Array<Array<string | number>>; empty: string }) {
  if (!rows.length) return <p className="text-[13px] text-subtle">{empty}</p>;
  return (
    <ScrollArea label="Performans tablosu">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-subtle">{head.map((h, i) => <th key={h} className={`px-1 py-2 font-bold ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/50">{r.map((c, j) => <td key={j} className={`px-1 py-1.5 ${j ? 'text-right tabular-nums text-soft' : 'max-w-[22rem] truncate text-white'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </ScrollArea>
  );
}

export function TopLists({ report }: { report: Report }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <Card title="En çok tıklanan sorgular" className="min-w-0">
        <Table head={['Sorgu', 'Tıklama', 'Gösterim', 'TO', POSITION_LABEL, 'Önceki']} empty={NO_DATA}
          rows={report.queries.map((q) => [q.keys?.[0] ?? '', fmtNumber(q.clicks), fmtNumber(q.impressions), ctrText(q.clicks / (q.impressions || 1), q.impressions), positionText(q.position), q.prevPosition === null ? '—' : positionText(q.prevPosition)])} />
        <p className="mt-3 text-[11px] text-subtle">Anonimleştirilmiş sorgular Search Console’da listelenmez; toplamlar bu yüzden satırların toplamından büyük olabilir.</p>
      </Card>
      <Card title="En çok tıklanan sayfalar" className="min-w-0">
        <Table head={['Sayfa', 'Tıklama', 'Gösterim', 'TO', POSITION_LABEL]} empty={NO_DATA}
          rows={report.pages.map((p) => [p.path, fmtNumber(p.clicks), fmtNumber(p.impressions), ctrText(p.clicks / (p.impressions || 1), p.impressions), positionText(p.position)])} />
      </Card>
    </div>
  );
}

export function Daily({ report }: { report: Report }) {
  const byDay = new Map(report.current.daily.map((d) => [d.date, d.clicks]));
  const data = eachDay(report.current.range).map((date) => ({ date, value: byDay.get(date) ?? 0 }));
  return (
    <Card title="Günlük tıklama">
      {report.current.totals.impressions ? <DailyBars data={data} label="Tıklama" /> : <p className="text-[13px] text-subtle">{NO_DATA}</p>}
      <p className="mt-2 text-[11px] text-subtle">Veri olmayan günler sıfır çubukla gösterilir ve yukarıda tek tek listelenir.</p>
    </Card>
  );
}

export function Weekly({ weekly, onSave, busy, canSave }: { weekly: WeeklyTotal[]; onSave: () => void; busy: boolean; canSave: boolean }) {
  return (
    <Card title="Haftalık kayıt" action={<button type="button" className="admin-btn admin-btn-sm" disabled={busy || !canSave} onClick={onSave}>{busy ? 'Kaydediliyor…' : 'Şimdi kaydet'}</button>}>
      <p className="mb-3 max-w-[90ch] text-[12px] leading-relaxed text-subtle" data-testid="seo-history-scope">{HISTORY_SCOPE} Haftalar pazartesi başlar; yalnızca tamamlanmış ve Search Console’un kesinleştiğini bildirdiği haftalar kaydedilir; kesinleşme belirlenemezse hafta atlanır. Aynı hafta tekrar kaydedilirse haftanın tüm kaydı tek işlemde yenilenir (çift veya artık satır kalmaz; yazma başarısız olursa önceki kayıt korunur). Haftalık otomatik kayıt: perşembe 04:10 UTC.</p>
      {weekly.length === 0 ? <p className="text-[13px] text-subtle">Henüz haftalık kayıt yok.</p> : (
        <ScrollArea label="Performans tablosu">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-subtle">{['Hafta', 'Tıklama', 'Gösterim', 'TO', POSITION_LABEL, 'Gösterim olan gün', 'Kesinleşme', 'Satırlar'].map((h, i) => <th key={h} className={`px-1 py-2 font-bold ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.week_start} className="border-b border-line/50">
                  <td className="px-1 py-1.5 text-white">{fmtDay(w.week_start)} haftası</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtNumber(w.clicks)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtNumber(w.impressions)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{ctrText(Number(w.ctr), w.impressions)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{positionText(w.position === null ? null : Number(w.position))}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{w.days_with_data}/7</td>
                  <td className="px-1 py-1.5 text-right">{w.data_through ? `${fmtDay(w.data_through)}'e kadar doğrulandı` : '—'}</td>
                  <td className="px-1 py-1.5 text-right text-subtle">{w.counts.query ?? 0} sorgu · {w.counts.page ?? 0} sayfa · {w.counts.keyword ?? 0} kelime</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </Card>
  );
}

export function ConnectionNotice({ mode, message, step }: { mode: string; message: string | null; step: string | null }) {
  if (mode !== 'none') return null;
  return (
    <Notice tone="warning">
      <strong>{message ?? 'Search Console bağlantısı kurulmadı.'}</strong> {step}
    </Notice>
  );
}

export const SampleBadge = () => <Badge tone="warn" title="SEO_FIXTURE=1: sentetik veri, Google’a istek yapılmadı">Örnek veri</Badge>;
