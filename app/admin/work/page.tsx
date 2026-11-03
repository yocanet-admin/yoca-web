'use client';

import { useEffect, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/adminClient';
import { Notice } from '@/components/admin/cockpit/Widgets';
import { DEFAULT_CASE_STUDY_SLUGS, getDefaultCaseStudyRow, mergeWorkSources } from '@/lib/workData';
import { getWorkMedia, type WorkMedia } from '@/lib/workMedia';
import type { CaseStudyLocalized, CaseStudyRow, Locale } from '@/types';

/**
 * Yoca Admin — Work / vaka çalışmaları yönetimi (4 dilde içerik).
 *
 * One list, merged per slug exactly like the public site (mergeWorkSources):
 * database rows + code projects whose slug has no database row. A code
 * project becomes editable by copying it into ONE database row
 * ("Düzenlemeye al"); nothing is ever bulk-imported.
 */

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

function hasMedia(media: WorkMedia): boolean {
  return Boolean(
    media.hero || media.brand?.length || media.desktop?.length || media.mobile?.length || media.interaction,
  );
}

/** Read-only summary of the media registered for a slug in lib/workMedia.ts. */
function MediaSummary({ slug }: { slug: string }) {
  const media = getWorkMedia(slug);
  const items: Array<[string, string]> = [
    ['Hero', media.hero ? 'var' : 'yok'],
    ['Masaüstü', String(media.desktop?.length ?? 0)],
    ['Mobil', String(media.mobile?.length ?? 0)],
    ['Video', media.interaction ? 'var' : 'yok'],
  ];
  if (media.brand?.length) items.push(['Marka panosu', String(media.brand.length)]);
  return (
    <div className="admin-card grid gap-2 !p-4 text-[13px]">
      <p className="font-extrabold">
        Medya{slug ? ` — /work/${slug}/` : ''} <span className="font-medium text-subtle">(salt okunur)</span>
      </p>
      {slug ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {items.map(([label, value]) => (
            <li key={label}>
              <span className="text-subtle">{label}:</span> <span className="font-bold">{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-subtle">Slug girilmedi.</p>
      )}
      <p className="text-[12px] text-subtle">
        Medya dosyaları depodaki /public/work/&lt;slug&gt;/ klasöründen gelir; slug değişirse medya bağlantısı kopar.
        {slug && !hasMedia(media) && ' Bu slug için kayıtlı medya yok — vaka sayfası sade tipografik kapakla açılır.'}
      </p>
    </div>
  );
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
  // Slug of the row as stored when the editor opened ('' for a new row) — media and code defaults are keyed by it.
  const [originalSlug, setOriginalSlug] = useState('');
  // Saved rows whose slug is a code project's or has media files keep their slug.
  const slugLocked = originalSlug !== '' && (DEFAULT_CASE_STUDY_SLUGS.includes(originalSlug) || hasMedia(getWorkMedia(originalSlug)));

  const open = (row: EditableRow) => {
    setEditLocale('tr');
    setEditing(row);
    setOriginalSlug(row.id !== undefined ? row.slug : '');
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

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (): Promise<CaseStudyRow[]> => {
    if (!supabase) return [];
    const { data, error: readError } = await supabase.from('case_studies').select('*').order('order_index').order('id');
    const next = (data as CaseStudyRow[]) ?? [];
    setLoadError(readError ? readError.message : null);
    setRows(next);
    setLoading(false);
    return next;
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = mergeWorkSources(rows, { includeHidden: true });
  const dbCount = rows.length;
  const hiddenCount = rows.filter((row) => !row.is_active).length;
  const codeCount = entries.filter((entry) => entry.source === 'code').length;
  const visibleCount = dbCount - hiddenCount + codeCount;
  const takenOverCount = DEFAULT_CASE_STUDY_SLUGS.length - codeCount;

  /** Copy ONE code project into the database (all 4 languages, services, links, code position) and open it. */
  const takeOver = async (slug: string) => {
    if (!supabase || loadError) return;
    const existing = rows.find((row) => row.slug === slug);
    if (existing) {
      open({ ...existing, services: existing.services ?? [] });
      return;
    }
    const defaults = getDefaultCaseStudyRow(slug);
    if (!defaults) return;
    setSaving(true);
    const { data, error: insertError } = await supabase.from('case_studies').insert(defaults).select('*').single();
    setSaving(false);
    if (insertError || !data) {
      flash(insertError ? saveErrorText(insertError) : 'Kaydedilemedi.');
      // Someone else may have created it meanwhile — reload and open that row instead of duplicating.
      const fresh = await load();
      const row = fresh.find((item) => item.slug === slug);
      if (row) open({ ...row, services: row.services ?? [] });
      return;
    }
    await load();
    flash('Proje veritabanına alındı — artık buradan düzenlenir.');
    const row = data as CaseStudyRow;
    open({ ...row, services: row.services ?? [] });
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
    // A slug is the project's identity: code defaults and media files are keyed by it.
    // Changing it on such a project would show the code version again next to the renamed row.
    const nextSlug = editing.slug.trim();
    if (slugLocked && nextSlug !== originalSlug) {
      setError(`Bu projenin slug’ı “${originalSlug}” sabit (kod varsayılanı ve medya dosyaları bu slug’a bağlı).`);
      return;
    }
    if (editing.id === undefined && DEFAULT_CASE_STUDY_SLUGS.includes(nextSlug)) {
      setError(`“${nextSlug}” koddaki bir projenin slug’ı. O projeyi listede “Düzenlemeye al” ile açın.`);
      return;
    }
    if (rows.some((row) => row.slug === nextSlug && row.id !== editing.id)) {
      setError(`“${nextSlug}” slug’ı başka bir projede kullanılıyor.`);
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

  /** Swap the position with the neighbouring DATABASE row (code projects keep their code position). */
  const move = async (row: CaseStudyRow, direction: -1 | 1) => {
    if (!supabase) return;
    const sorted = entries.flatMap((entry) => (entry.source === 'db' ? [entry.row] : []));
    const index = sorted.findIndex((item) => item.id === row.id);
    const target = sorted[index + direction];
    if (!target) return;
    // Equal order_index: swapping would change nothing, so step past the neighbour instead.
    const nextOrder = target.order_index === row.order_index ? row.order_index + direction : target.order_index;
    await Promise.all([
      supabase.from('case_studies').update({ order_index: nextOrder }).eq('id', row.id),
      target.order_index === row.order_index
        ? Promise.resolve()
        : supabase.from('case_studies').update({ order_index: row.order_index }).eq('id', target.id),
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
    const backToCode = DEFAULT_CASE_STUDY_SLUGS.includes(row.slug)
      ? ' Bu slug koddaki varsayılan bir projeye ait: silerseniz sitede koddaki varsayılan sürüm yeniden görünür.'
      : '';
    if (!window.confirm(`“${name}” kalıcı olarak silinsin mi? Bu geri alınamaz.${backToCode} (Sadece sitede gizlemek için “Gizle”yi kullanın.)`)) return;
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
    const slugChanged = editing.id !== undefined && originalSlug !== '' && editing.slug.trim() !== originalSlug;
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
        {slugChanged && hasMedia(getWorkMedia(originalSlug)) && (
          <Notice tone="warning">
            Slug “{originalSlug}” → “{editing.slug.trim() || '…'}” olarak değişiyor. /public/work/{originalSlug}/ klasöründeki
            medya (hero, ekranlar, video) bu projeye artık bağlanmaz; vaka sayfası medyasız açılır. Medyayı korumak için slug’ı
            eski hâline getirin.
          </Notice>
        )}
        {slugChanged && DEFAULT_CASE_STUDY_SLUGS.includes(originalSlug) && (
          <Notice tone="warning">
            “{originalSlug}” koddaki varsayılan bir projenin slug’ı. Slug’ı değiştirirseniz bu slug’da veritabanı kaydı kalmaz ve
            koddaki varsayılan sürüm sitede yeniden görünür (proje iki kez listelenebilir).
          </Notice>
        )}
        {editing.id === undefined && DEFAULT_CASE_STUDY_SLUGS.includes(editing.slug.trim()) && (
          <Notice tone="warning">
            “{editing.slug.trim()}” koddaki varsayılan bir projenin slug’ı. Boş bir kayıt yerine listedeki “Düzenlemeye al”
            düğmesini kullanın — o, koddaki tüm metinleri kopyalar.
          </Notice>
        )}
        {!editing.is_active && (
          <Notice tone="warning">
            Bu proje gizli: sitede hiç görünmez (koddaki varsayılan sürüm de geri gelmez). Listeden “Göster” ile yayına alın.
          </Notice>
        )}

        <MediaSummary slug={originalSlug || editing.slug.trim()} />

        <div className="admin-card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Slug (URL) *
            <input
              value={editing.slug}
              onChange={(event) => change({ ...editing, slug: event.target.value })}
              placeholder="orn-proje-adi"
              readOnly={slugLocked}
              aria-describedby={slugLocked ? 'slug-locked-note' : undefined}
              className={`admin-input ${slugLocked ? 'cursor-not-allowed opacity-70' : ''}`}
            />
            {slugLocked && (
              <span id="slug-locked-note" className="text-[11px] font-semibold text-subtle">
                Sabit: kod varsayılanı ve medya bu slug’a bağlı.
              </span>
            )}
          </label>
          <label className="grid gap-1.5 text-[12px] font-bold text-subtle">
            Sıra (küçük önce; kod projeleri 0–{DEFAULT_CASE_STUDY_SLUGS.length - 1})
            <input
              type="number"
              value={editing.order_index}
              onChange={(event) => change({ ...editing, order_index: parseInt(event.target.value, 10) || 0 })}
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
  const maxOrder = Math.max(DEFAULT_CASE_STUDY_SLUGS.length - 1, ...rows.map((row) => row.order_index));
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Work / Projeler</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            {loading
              ? 'Vaka çalışmaları 4 dilde yönetilir.'
              : `Sitede ${visibleCount} proje görünüyor: ${dbCount - hiddenCount} veritabanından, ${codeCount} koddan (varsayılan)${
                  hiddenCount > 0 ? ` · ${hiddenCount} gizli` : ''
                }.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && <p className="text-[13px] font-bold text-yoca-lime">{message}</p>}
          <button type="button" className="admin-btn-primary" disabled={loading} onClick={() => open(newRow(maxOrder + 1))}>
            Yeni Proje
          </button>
        </div>
      </header>

      <Notice>
        <strong>Veritabanı</strong> kayıtları buradan düzenlenir. <strong>Kod (varsayılan)</strong> projeler, aynı slug’da
        veritabanı kaydı olmadığı sürece koddan gösterilir; düzenlemek için “Düzenlemeye al” o projeyi tüm dilleriyle tek bir
        veritabanı kaydına kopyalar (koddaki {DEFAULT_CASE_STUDY_SLUGS.length} projeden {takenOverCount} tanesi alındı).
        <br />
        <strong>Gizle</strong>: proje sitede tamamen gizlenir — koddaki varsayılan sürüm geri gelmez. Koddaki sürüme dönmek için
        kaydı silin.
      </Notice>

      {loadError && (
        <p role="alert" className="rounded-md border border-amber-400/40 px-4 py-3 text-[13px] font-bold text-amber-300">
          Veritabanı okunamadı ({loadError}). Liste eksik olabilir; “Düzenlemeye al” sayfa yenilenene kadar kapalı.
        </p>
      )}

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : entries.length === 0 ? (
        <p className="text-[14px] text-muted">Henüz proje yok.</p>
      ) : (
        <div className="grid gap-2.5">
          {entries.map((entry) => {
            if (entry.source === 'code') {
              const defaults = getDefaultCaseStudyRow(entry.slug);
              const name = defaults?.content.tr?.name || defaults?.content.en?.name || entry.slug;
              return (
                <div key={`code-${entry.slug}`} className="admin-card flex flex-wrap items-center gap-3 !p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-extrabold">
                      {name}
                      <span className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-subtle">
                        Kod (varsayılan)
                      </span>
                    </p>
                    <p className="truncate text-[12px] text-subtle">
                      /work/{entry.slug} · sıra {entry.order}
                      {defaults?.year ? ` · ${defaults.year}` : ''}
                      {defaults?.market ? ` · ${defaults.market}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={saving || Boolean(loadError)}
                      title="Bu projeyi tüm dilleriyle tek bir veritabanı kaydına kopyalar ve düzenleyicide açar."
                      onClick={() => takeOver(entry.slug)}
                    >
                      Düzenlemeye al
                    </button>
                  </div>
                </div>
              );
            }
            const row = entry.row;
            const dbRows = entries.filter((item) => item.source === 'db');
            const dbIndex = dbRows.findIndex((item) => item.source === 'db' && item.row.id === row.id);
            return (
              <div key={row.id} className="admin-card flex flex-wrap items-center gap-3 !p-3.5">
                <div className="flex flex-none gap-1">
                  <button
                    type="button"
                    aria-label="Yukarı taşı"
                    title="Bir önceki veritabanı kaydıyla yer değiştirir"
                    className="admin-btn !px-2.5 !py-1"
                    disabled={dbIndex === 0}
                    onClick={() => move(row, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Aşağı taşı"
                    title="Bir sonraki veritabanı kaydıyla yer değiştirir"
                    className="admin-btn !px-2.5 !py-1"
                    disabled={dbIndex === dbRows.length - 1}
                    onClick={() => move(row, 1)}
                  >
                    ↓
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-extrabold">
                    <span className={row.is_active ? '' : 'text-subtle line-through'}>
                      {row.content?.tr?.name || row.content?.en?.name || row.slug}
                    </span>
                    <span className="rounded-sm border border-yoca-lime/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yoca-lime">
                      Veritabanı
                    </span>
                    {!row.is_active && (
                      <span className="rounded-sm border border-amber-400/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        Sitede gizli
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-subtle">
                    /work/{row.slug} · sıra {row.order_index}
                    {row.year ? ` · ${row.year}` : ''}
                    {row.market ? ` · ${row.market}` : ''}
                  </p>
                </div>
                <div className="flex flex-none gap-2">
                  <button
                    type="button"
                    className="admin-btn"
                    title={
                      row.is_active
                        ? 'Projeyi sitede gizler (koddaki varsayılan sürüm geri gelmez).'
                        : 'Projeyi sitede yeniden gösterir.'
                    }
                    onClick={() => toggle(row)}
                  >
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
            );
          })}
        </div>
      )}
    </div>
  );
}
