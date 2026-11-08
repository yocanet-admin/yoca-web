'use client';

import { useState } from 'react';
import { Card } from '@/components/admin/cockpit/Widgets';
import { Badge, field, small } from '@/components/admin/ops/ui';
import { fmtDay, fmtNumber } from '@/lib/cockpit/client';
import { countryLabel, ctrText, keywordFiltersText, KEYWORD_LANGS, NO_DATA, POSITION_LABEL, positionText, SOURCE_LABEL, STATUS_LABEL, type KeywordSource, type KeywordStatus } from '@/lib/seoPanel/model';
import type { SeoKeyword } from '@/components/admin/seo/types';
import type { DateRange, SeoFilters } from '@/lib/seoPanel/model';

type Act = (body: Record<string, unknown>, ok: string) => Promise<boolean>;
interface Draft { id?: string; keyword: string; language: string; country: string; targetPath: string; source: KeywordSource; status: KeywordStatus; note: string }
const EMPTY: Draft = { keyword: '', language: 'tr', country: 'tur', targetPath: '/tr', source: 'manual', status: 'active', note: '' };

function KeywordForm({ draft, onCancel, onSave, busy }: { draft: Draft; onCancel: () => void; onSave: (d: Draft) => void; busy: boolean }) {
  const [d, setD] = useState(draft);
  const lab = 'grid gap-1 text-[12px] font-semibold text-muted';
  return (
    <form className="grid gap-3 rounded-md border border-yoca-lime/30 p-4" onSubmit={(e) => { e.preventDefault(); onSave(d); }} data-testid="seo-keyword-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`${lab} lg:col-span-2`}>Anahtar kelime<input className={field} value={d.keyword} onChange={(e) => setD({ ...d, keyword: e.target.value })} required maxLength={200} /></label>
        <label className={lab}>Dil<select className={field} value={d.language} onChange={(e) => setD({ ...d, language: e.target.value })}>{KEYWORD_LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
        <label className={lab}>Hedef ülke (ISO-3, boş = tüm ülkeler)<input className={field} value={d.country} onChange={(e) => setD({ ...d, country: e.target.value.toLowerCase() })} maxLength={3} placeholder="tur" /></label>
        <label className={`${lab} lg:col-span-2`}>Hedef sayfa (yoca.net yolu)<input className={field} value={d.targetPath} onChange={(e) => setD({ ...d, targetPath: e.target.value })} required placeholder="/tr/services/brand-strategy-identity" /></label>
        <label className={lab}>Durum<select className={field} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as KeywordStatus })}>
          {(d.source === 'suggested' ? (['proposed', 'active', 'paused'] as const) : (['active', 'paused'] as const)).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select></label>
        <label className={lab}>Kaynak<input className={`${field} opacity-70`} value={SOURCE_LABEL[d.source]} readOnly /></label>
        <label className={`${lab} sm:col-span-2 lg:col-span-4`}>Not<input className={field} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={1000} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="admin-btn admin-btn-primary !py-1.5 text-[12px]" disabled={busy}>Kaydet</button>
        <button type="button" className="admin-btn !py-1.5 text-[12px]" onClick={onCancel}>Vazgeç</button>
      </div>
    </form>
  );
}

const toDraft = (k: SeoKeyword): Draft => ({ id: k.id, keyword: k.keyword, language: k.language, country: k.country, targetPath: k.target_path, source: k.source as KeywordSource, status: k.status, note: k.note });

function MetricCells({ k }: { k: SeoKeyword }) {
  if (k.status !== 'active') return <td colSpan={5} className="px-1 py-1.5 text-right text-subtle">ölçülmüyor ({STATUS_LABEL[k.status].toLowerCase()})</td>;
  const p = k.prevMetrics;
  const prev = <td className="px-1 py-1.5 text-right text-[12px] tabular-nums text-subtle" data-testid="seo-kw-prev">{p && p.impressions ? `${fmtNumber(p.clicks)} tık · ${fmtNumber(p.impressions)} gös. · ${positionText(p.position)}` : NO_DATA}</td>;
  if (!k.metrics || !k.metrics.impressions) return <><td colSpan={4} className="px-1 py-1.5 text-right text-subtle" data-testid="seo-kw-nodata">{NO_DATA}</td>{prev}</>;
  const m = k.metrics;
  return (
    <>
      <td className="px-1 py-1.5 text-right tabular-nums">{fmtNumber(m.clicks)}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{fmtNumber(m.impressions)}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{ctrText(m.ctr, m.impressions)}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{positionText(m.position)}</td>
      {prev}
    </>
  );
}

export function Keywords({ keywords, gscQueries, act, busy, connected, filters, range, prevRange }: { filters: SeoFilters; range: DateRange | null; prevRange: DateRange | null; keywords: SeoKeyword[]; gscQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null; mapped: KeywordStatus | null }>; act: Act; busy: boolean; connected: boolean }) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const targets = keywords.filter((k) => k.status !== 'proposed');
  const proposed = keywords.filter((k) => k.status === 'proposed');
  const save = async (d: Draft) => {
    if (await act({ action: 'keyword_save', ...d }, d.id ? 'Kelime güncellendi.' : 'Kelime eklendi.')) setEditing(null);
  };
  const remove = (k: SeoKeyword) => {
    if (window.confirm(`“${k.keyword}” silinsin mi? Haftalık kayıttaki geçmiş satırları kalır.`)) void act({ action: 'keyword_delete', id: k.id }, 'Kelime silindi.');
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <Card title={`Hedef kelimeler (${targets.length})`} action={<button type="button" className={small} onClick={() => setEditing({ ...EMPTY })}>+ Kelime ekle</button>}>
        {range && <p className="mb-1.5 rounded-sm border border-yoca-lime/30 bg-yoca-lime/[0.04] px-3 py-2 text-[12px] text-soft" data-testid="seo-kw-filters">{keywordFiltersText(filters, `${fmtDay(range.start)}–${fmtDay(range.end)}`)}{prevRange && <span className="text-subtle"> · önceki dönem {fmtDay(prevRange.start)}–{fmtDay(prevRange.end)}, aynı filtreler</span>}</p>}
        <p className="mb-3 text-[12px] text-subtle">Her aktif kelime kendi hedef ülkesiyle ölçülür (sayfadaki ülke seçimi kelime değerlerine uygulanmaz); cihaz, arama türü, veri durumu ve dönem sayfadaki seçimdir. Sorguyla <strong>tam eşleşme</strong>. {POSITION_LABEL} bir ortalamadır, kesin sıra değildir.</p>
        {editing && <div className="mb-4"><KeywordForm draft={editing} onCancel={() => setEditing(null)} onSave={save} busy={busy} /></div>}
        {targets.length === 0 ? <p className="text-[13px] text-subtle">Henüz aktif hedef kelime yok. Aşağıdaki listelerden ekleyin.</p> : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-[13px]" data-testid="seo-keyword-table">
              <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-subtle">
                {['Kelime', 'Dil', 'Hedef ülke', 'Hedef sayfa', 'Kaynak', 'Durum', 'Tıklama', 'Gösterim', 'TO', POSITION_LABEL, 'Önceki dönem', ''].map((h, i) => <th key={i} className={`px-1 py-2 font-bold ${i >= 6 && i < 11 ? 'text-right' : ''}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {targets.map((k) => (
                  <tr key={k.id} className="border-b border-line/50 align-top">
                    <td className="px-1 py-1.5 font-semibold text-white">{k.keyword}{k.note && <p className="mt-0.5 max-w-[16rem] text-[11px] font-normal text-subtle">{k.note}</p>}</td>
                    <td className="px-1 py-1.5">{k.language}</td>
                    <td className="px-1 py-1.5">{countryLabel(k.country)}</td>
                    <td className="px-1 py-1.5 font-mono text-[12px]">{k.target_path}</td>
                    <td className="px-1 py-1.5 text-subtle">{SOURCE_LABEL[k.source as KeywordSource] ?? k.source}</td>
                    <td className="px-1 py-1.5"><Badge tone={k.status === 'active' ? 'ok' : 'muted'}>{STATUS_LABEL[k.status]}</Badge></td>
                    <MetricCells k={k} />
                    <td className="whitespace-nowrap px-1 py-1.5 text-right">
                      <button type="button" className={small} onClick={() => setEditing(toDraft(k))}>Düzenle</button>{' '}
                      <button type="button" className={small} disabled={busy} onClick={() => act({ action: 'keyword_status', id: k.id, status: k.status === 'active' ? 'paused' : 'active' }, k.status === 'active' ? 'Duraklatıldı.' : 'Etkinleştirildi.')}>{k.status === 'active' ? 'Duraklat' : 'Etkinleştir'}</button>{' '}
                      <button type="button" className={`${small} !text-red-300`} disabled={busy} onClick={() => remove(k)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Mevcut sorgular (Search Console)" className="min-w-0">
          <p className="mb-3 text-[12px] text-subtle">Seçilen dönemde gerçekten gösterim alan sorgular. “Hedefe ekle” sorguyu aktif hedef kelime yapar; hedef sayfa en çok tıklanan sayfadır (sonra değiştirilebilir).</p>
          {!connected ? <p className="text-[13px] text-subtle">Search Console bağlantısı kurulmadı.</p> : gscQueries.length === 0 ? <p className="text-[13px] text-subtle">{NO_DATA}</p> : (
            <ul className="grid gap-1" data-testid="seo-gsc-queries">
              {gscQueries.slice(0, 20).map((q) => (
                <li key={q.query} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate text-white">{q.query}</span>
                  <span className="flex items-center gap-3 text-[12px] tabular-nums text-subtle">
                    <span>{fmtNumber(q.clicks)} tık · {fmtNumber(q.impressions)} gös. · ort. poz. {positionText(q.position)}</span>
                    {q.mapped === 'active' ? <Badge tone="ok">Hedefte</Badge> : q.mapped === 'paused' ? <Badge>Duraklatıldı</Badge> : q.mapped === 'proposed' ? <Badge tone="info" title="Önerilen listesinde; oradan etkinleştirin">Önerilerde</Badge> : <button type="button" className={small} disabled={busy} onClick={() => act({ action: 'adopt', query: q.query }, `“${q.query}” hedef kelimelere eklendi.`)}>Hedefe ekle</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Önerilen hedef kelimeler (${proposed.length})`} className="min-w-0">
          <p className="mb-3 text-[12px] text-subtle">Taslak liste: arama hacmi bilinmiyor, otomatik etkinleşmez ve etkinleştirilene kadar ölçülmez. Düzenleyip “Etkinleştir” deyin ya da silin.</p>
          {proposed.length === 0 ? <p className="text-[13px] text-subtle">Öneri kalmadı.</p> : (
            <ul className="grid gap-1" data-testid="seo-proposed">
              {proposed.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 py-1.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="text-white">{k.keyword}</span>{' '}
                    <span className="text-[11px] text-subtle">{k.language} · {countryLabel(k.country)} · <span className="font-mono">{k.target_path}</span>{k.note ? ` · ${k.note}` : ''}</span>
                  </span>
                  <span className="flex gap-1.5">
                    <button type="button" className={small} disabled={busy} onClick={() => act({ action: 'keyword_status', id: k.id, status: 'active' }, `“${k.keyword}” etkinleştirildi.`)}>Etkinleştir</button>
                    <button type="button" className={small} onClick={() => setEditing(toDraft(k))}>Düzenle</button>
                    <button type="button" className={`${small} !text-red-300`} disabled={busy} onClick={() => remove(k)}>Sil</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
