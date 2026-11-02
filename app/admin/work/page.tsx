'use client';

import { useEffect, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/adminClient';
import { getDefaultCaseStudyRows } from '@/lib/workData';
import type { CaseStudyLocalized, CaseStudyRow, Locale } from '@/types';

/** Yoca Admin — Work / vaka çalışmaları yönetimi (4 dilde içerik). */

const LOCALES: Array<{ code: Locale; label: string }> = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'az', label: 'Azərbaycanca' },
  { code: 'ar', label: 'العربية' },
];

const EMPTY_LOCALIZED: CaseStudyLocalized = {
  name: '',
  sector: '',
  summary: '',
  problem: '',
  approach: '',
  solution: '',
  results: '',
};

type TextField = 'name' | 'sector' | 'summary' | 'problem' | 'approach' | 'solution' | 'results' | 'metricBadge' | 'quote' | 'quoteAuthor';

const LOCALIZED_FIELDS: Array<{ key: TextField; label: string; multiline: boolean }> = [
  { key: 'name', label: 'Proje adı', multiline: false },
  { key: 'sector', label: 'Sektör', multiline: false },
  { key: 'summary', label: 'Özet', multiline: true },
  { key: 'problem', label: '1 · Meydan Okuma (Challenge)', multiline: true },
  { key: 'approach', label: '2 · Uygulanan Sistem', multiline: true },
  { key: 'solution', label: '3 · Uygulama ve Teknoloji', multiline: true },
  { key: 'results', label: '4 · Sonuç anlatısı (müşteri: Doğrulanmış Sonuçlar / konsept: Tasarlanan Sonuç)', multiline: true },
  { key: 'metricBadge', label: 'Metrik rozeti — YALNIZCA doğrulanmış, müşteri onaylı veri girin', multiline: false },
  { key: 'quote', label: '5 · Müşteri Yorumu (boşsa bölüm gizlenir — gerçek yorum girin)', multiline: true },
  { key: 'quoteAuthor', label: 'Yorum sahibi (ad — unvan)', multiline: false },
];

/** stats textarea satır formatı: Etiket | Değer | 0-100 (çubuk yüzdesi) */
function statsToText(stats?: Array<{ label: string; value: string; bar?: number }>): string {
  return (stats ?? []).map((s) => `${s.label} | ${s.value} | ${s.bar ?? 50}`).join('\n');
}

function textToStats(text: string): Array<{ label: string; value: string; bar: number }> {
  return text
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map((parts) => ({
      label: parts[0],
      value: parts[1] ?? '',
      bar: Math.min(100, Math.max(0, parseInt(parts[2] ?? '50', 10) || 50)),
    }));
}

type EditableRow = Omit<CaseStudyRow, 'id'> & { id?: number };

function parseServices(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** A locale with no text and no stats is left out of `content`, so the site falls back to English instead of showing a blank card. */
function isEmptyLocalized(value: CaseStudyLocalized | undefined): boolean {
  if (!value) return true;
  const hasText = Object.entries(value).some(([key, v]) => key !== 'stats' && typeof v === 'string' && v.trim().length > 0);
  return !hasText && !(value.stats && value.stats.length > 0);
}

function saveErrorText(error: PostgrestError): string {
  if (error.code === '23505') return 'Bu slug zaten kullanılıyor — farklı bir slug girin.';
  if (error.code === '42501' || /row-level security/i.test(error.message)) return 'Yetki hatası — oturumunuz kapanmış olabilir, yeniden giriş yapın.';
  return `Kaydedilemedi: ${error.message}`;
}

function newRow(orderIndex: number): EditableRow {
  return {
    slug: '',
    year: '',
    market: '',
    image_url: '',
    services: [],
    order_index: orderIndex,
    is_active: true,
    kind: 'client',
    video_url: null,
    live_url: null,
    content: {
      tr: { ...EMPTY_LOCALIZED },
      en: { ...EMPTY_LOCALIZED },
      az: { ...EMPTY_LOCALIZED },
      ar: { ...EMPTY_LOCALIZED },
    },
  };
}

export default function AdminWork() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<CaseStudyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditableRow | null>(null);
  const [editLocale, setEditLocale] = useState<Locale>('tr');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Raw text of the comma / line based inputs: parsed only on save, so typing "," or a new line is never eaten.
  const [servicesText, setServicesText] = useState('');
  const [statsText, setStatsText] = useState<Partial<Record<Locale, string>>>({});

  const open = (row: EditableRow) => {
    setEditLocale('tr');
    setEditing(row);
    setServicesText((row.services ?? []).join(', '));
    setStatsText({});
    setError(null);
    setDirty(false);
  };
  const change = (next: EditableRow) => {
    setEditing(next);
    setDirty(true);
  };
  const close = () => {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler kaybolacak. Çıkılsın mı?')) return;
    setEditing(null);
    setDirty(false);
    setError(null);
  };

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('case_studies').select('*').order('order_index');
    setRows((data as CaseStudyRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importDefaults = async () => {
    if (!supabase) return;
    setSaving(true);
    const { error: importError } = await supabase.from('case_studies').insert(getDefaultCaseStudyRows());
    setSaving(false);
    if (importError) flash(saveErrorText(importError));
    else flash('Varsayılan 4 proje içe aktarıldı.');
    load();
  };

  const saveEditing = async () => {
    if (!supabase || !editing || !editing.slug.trim()) return;
    // Apply the raw stats text of every locale that was edited, then drop locales that stayed empty.
    const content: EditableRow['content'] = {};
    for (const { code } of LOCALES) {
      const current = editing.content[code];
      const raw = statsText[code];
      const next = raw === undefined ? current : { ...(current ?? EMPTY_LOCALIZED), stats: textToStats(raw) };
      if (next && !isEmptyLocalized(next)) content[code] = next;
    }
    if (!Object.values(content).some((value) => value?.name?.trim())) {
      setError('En az bir dilde proje adı girin (tercihen English — diğer diller boşsa ona düşer).');
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      slug: editing.slug.trim(),
      year: editing.year.trim(),
      market: editing.market.trim(),
      image_url: editing.image_url.trim(),
      services: parseServices(servicesText),
      order_index: editing.order_index,
      is_active: editing.is_active,
      kind: editing.kind,
      video_url: editing.video_url?.trim() || null,
      live_url: editing.live_url?.trim() || null,
      content,
    };
    const { error: saveError } =
      editing.id !== undefined
        ? await supabase.from('case_studies').update(payload).eq('id', editing.id)
        : await supabase.from('case_studies').insert(payload);
    setSaving(false);
    if (saveError) {
      // Keep the form open so nothing typed is lost.
      setError(saveErrorText(saveError));
      return;
    }
    flash(editing.id !== undefined ? 'Proje güncellendi.' : 'Proje eklendi.');
    setEditing(null);
    setDirty(false);
    load();
  };

  const move = async (row: CaseStudyRow, direction: -1 | 1) => {
    if (!supabase) return;
    const sorted = [...rows].sort((a, b) => a.order_index - b.order_index);
    const index = sorted.findIndex((item) => item.id === row.id);
    const target = sorted[index + direction];
    if (!target) return;
    await Promise.all([
      supabase.from('case_studies').update({ order_index: target.order_index }).eq('id', row.id),
      supabase.from('case_studies').update({ order_index: row.order_index }).eq('id', target.id),
    ]);
    load();
  };

  const toggle = async (row: CaseStudyRow) => {
    if (!supabase) return;
    await supabase.from('case_studies').update({ is_active: !row.is_active }).eq('id', row.id);
    load();
  };

  const remove = async (row: CaseStudyRow) => {
    if (!supabase) return;
    const name = row.content?.tr?.name || row.content?.en?.name || row.slug;
    if (!window.confirm(`“${name}” kalıcı olarak silinsin mi? Bu geri alınamaz. (Sadece sitede gizlemek için “Gizle”yi kullanın.)`)) return;
    const { error: deleteError } = await supabase.from('case_studies').delete().eq('id', row.id);
    flash(deleteError ? saveErrorText(deleteError) : 'Proje silindi.');
    load();
  };

  const setLocalizedField = (key: TextField, value: string) => {
    if (!editing) return;
    const current = editing.content[editLocale] ?? { ...EMPTY_LOCALIZED };
    change({
      ...editing,
      content: { ...editing.content, [editLocale]: { ...current, [key]: value } },
    });
  };

  const setLocalizedStats = (text: string) => {
    setStatsText((current) => ({ ...current, [editLocale]: text }));
    setDirty(true);
  };

  // ── Edit form ────────────────────────────────────────────────
  if (editing) {
    const localized = editing.content[editLocale] ?? EMPTY_LOCALIZED;
    return (
      <div className="grid gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {editing.id !== undefined ? `Düzenle: ${editing.slug}` : 'Yeni Proje'}
          </h1>
          <div className="flex gap-2">
            <button type="button" className="admin-btn" onClick={close}>
              Vazgeç
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={saving || !editing.slug.trim()}
              onClick={saveEditing}
            >
              {saving ? 'Kaydediliyor…' : dirty ? 'Kaydet •' : 'Kaydet'}
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="rounded-md border border-amber-400/40 px-4 py-3 text-[13px] font-bold text-amber-300">
            {error}
          </p>
        )}

        <div className="admin-card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Slug (URL) *
            <input
              value={editing.slug}
              onChange={(event) => change({ ...editing, slug: event.target.value })}
              placeholder="orn-proje-adi"
              className="admin-input"
            />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Yıl
            <input
              value={editing.year}
              onChange={(event) => change({ ...editing, year: event.target.value })}
              className="admin-input"
            />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Pazar
            <input
              value={editing.market}
              onChange={(event) => change({ ...editing, market: event.target.value })}
              className="admin-input"
            />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Hizmetler (virgülle)
            <input
              value={servicesText}
              onChange={(event) => {
                setServicesText(event.target.value);
                setDirty(true);
              }}
              placeholder="Web, SEO, Marka"
              className="admin-input"
            />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Tür
            <select
              value={editing.kind}
              onChange={(event) =>
                change({
                  ...editing,
                  kind: event.target.value as 'client' | 'concept' | 'product' | 'experimental' | 'venture',
                })
              }
              className="admin-input"
            >
              <option value="client">Müşteri Projesi (doğrulanmış)</option>
              <option value="concept">Konsept Proje</option>
              <option value="product">Yoca Ürünü</option>
              <option value="venture">Yoca Girişimi</option>
              <option value="experimental">Deneysel</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle sm:col-span-2 lg:col-span-3">
            Hover video URL (opsiyonel — .mp4/.webm; karta gelince sessiz döngüyle oynar)
            <input
              value={editing.video_url ?? ''}
              onChange={(event) => change({ ...editing, video_url: event.target.value })}
              className="admin-input"
            />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle sm:col-span-2 lg:col-span-4">
            Canlı proje linki (opsiyonel — vaka sayfasında "Canlı Görüntüle" butonu)
            <input
              value={editing.live_url ?? ''}
              onChange={(event) => change({ ...editing, live_url: event.target.value })}
              className="admin-input"
            />
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle sm:col-span-2 lg:col-span-4">
            Görsel URL (/work/… veya https://…)
            <input
              value={editing.image_url}
              onChange={(event) => change({ ...editing, image_url: event.target.value })}
              className="admin-input"
            />
          </label>
        </div>

        <div className="flex gap-1 rounded-sm border border-line p-1 sm:w-fit">
          {LOCALES.map((locale) => (
            <button
              key={locale.code}
              type="button"
              onClick={() => setEditLocale(locale.code)}
              className={`flex-1 rounded-sm px-4 py-1.5 text-[13px] font-bold transition-colors sm:flex-none ${
                editLocale === locale.code ? 'bg-yoca-lime text-black' : 'text-muted hover:text-white'
              }`}
            >
              {locale.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3">
          {LOCALIZED_FIELDS.map((field) => (
            <label key={field.key} className="admin-card grid gap-2 !p-4 text-[13px] font-extrabold">
              {field.label}
              {field.multiline ? (
                <textarea
                  rows={3}
                  value={localized[field.key] ?? ''}
                  onChange={(event) => setLocalizedField(field.key, event.target.value)}
                  className="admin-input resize-y font-medium"
                />
              ) : (
                <input
                  value={localized[field.key] ?? ''}
                  onChange={(event) => setLocalizedField(field.key, event.target.value)}
                  className="admin-input font-medium"
                />
              )}
            </label>
          ))}
          <label className="admin-card grid gap-2 !p-4 text-[13px] font-extrabold">
            Sonuç istatistikleri — her satır: Etiket | Değer | 0-100 çubuk yüzdesi
            <textarea
              rows={4}
              value={statsText[editLocale] ?? statsToText(localized.stats)}
              onChange={(event) => setLocalizedStats(event.target.value)}
              placeholder={'Online randevu | +87% | 87\nOrganik trafik | +120% | 95'}
              className="admin-input resize-y font-medium"
            />
          </label>
        </div>
      </div>
    );
  }

  // ── List ─────────────────────────────────────────────────────
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Work / Projeler</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Vaka çalışmaları 4 dilde yönetilir; tablo boşken sitede koddaki varsayılanlar gösterilir.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && <p className="text-[13px] font-bold text-yoca-lime">{message}</p>}
          {rows.length === 0 && !loading && (
            <button type="button" className="admin-btn" disabled={saving} onClick={importDefaults}>
              Varsayılan 4 projeyi içe aktar
            </button>
          )}
          <button
            type="button"
            className="admin-btn-primary"
            onClick={() => open(newRow(rows.length ? Math.max(...rows.map((r) => r.order_index)) + 1 : 0))}
          >
            Yeni Proje
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-muted">
          Henüz veritabanında proje yok — site koddaki 4 varsayılan projeyi gösteriyor.
        </p>
      ) : (
        <div className="grid gap-2.5">
          {[...rows]
            .sort((a, b) => a.order_index - b.order_index)
            .map((row, index, list) => (
              <div key={row.id} className="admin-card flex flex-wrap items-center gap-3 !p-3.5">
                <div className="flex flex-none gap-1">
                  <button
                    type="button"
                    aria-label="Yukarı taşı"
                    className="admin-btn !px-2.5 !py-1"
                    disabled={index === 0}
                    onClick={() => move(row, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Aşağı taşı"
                    className="admin-btn !px-2.5 !py-1"
                    disabled={index === list.length - 1}
                    onClick={() => move(row, 1)}
                  >
                    ↓
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-extrabold ${row.is_active ? '' : 'text-subtle line-through'}`}>
                    {row.content?.tr?.name || row.content?.en?.name || row.slug}
                  </p>
                  <p className="truncate text-[12px] text-subtle">
                    /work/{row.slug} · {row.year} · {row.market}
                  </p>
                </div>
                <div className="flex flex-none gap-2">
                  <button type="button" className="admin-btn" onClick={() => toggle(row)}>
                    {row.is_active ? 'Gizle' : 'Göster'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => open({ ...row, services: row.services ?? [] })}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="admin-btn hover:!border-red-400 hover:!text-red-400"
                    onClick={() => remove(row)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
