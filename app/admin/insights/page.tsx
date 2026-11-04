'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { adminFetch, STATUS_LABELS, slugify } from '@/lib/insightsAdmin';
import { GROUP_LOCALES, LANG_STATE_LABEL, LOCALE_NAME, groupInsights, langState, matchesFilter, memberFor, type ArticleGroup, type GroupLocale, type LangState } from '@/lib/insightGroup';
import type { InsightRow } from '@/types';

/**
 * Yoca Admin — İçerik / Insights listesi: one row per article.
 * The language versions of an article (rows sharing group_id) are one line:
 * title (Turkish when there is one), then TR · EN · AR · AZ with each one's
 * state in words (Yok, Taslak, Kontrol bekliyor, Hazır, Yayında, Zamanlandı).
 * A language badge opens that language in the article workspace; a missing
 * one opens its "Çeviri oluştur" tab. Filters: language and state.
 * "Dil sürümleri" lists the versions with the previous per-version actions
 * (Düzenle · Çoğalt · Yayınla / Yayından kaldır · Sil).
 */

type Row = Pick<InsightRow, 'id' | 'group_id' | 'locale' | 'slug' | 'title' | 'body_md' | 'author_name' | 'category_key' | 'status' | 'updated_at' | 'publish_at' | 'featured' | 'source_insight_id' | 'language_reviewed'>;
const COLUMNS = 'id,group_id,locale,slug,title,body_md,author_name,category_key,status,updated_at,publish_at,featured,source_insight_id,language_reviewed';
const COLUMNS_LEGACY = 'id,group_id,locale,slug,title,body_md,author_name,category_key,status,updated_at,publish_at,featured';

const STATE_STYLE: Record<LangState, string> = {
  missing: 'border-dashed border-line text-subtle',
  draft: 'border-line text-muted',
  review: 'border-yellow-400/60 text-yellow-200',
  ready: 'border-yoca-green/70 text-yoca-green',
  published: 'border-yoca-lime bg-yoca-lime text-black',
  scheduled: 'border-yoca-green/50 text-yoca-green',
};
const STATE_ORDER: LangState[] = ['missing', 'draft', 'review', 'ready', 'published', 'scheduled'];

export default function AdminInsights() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterLocale, setFilterLocale] = useState<GroupLocale | 'all'>('all');
  const [filterState, setFilterState] = useState<LangState | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const load = async () => {
    if (!supabase) return;
    const [res, { data: cats }] = await Promise.all([
      supabase.from('insights').select(COLUMNS).order('updated_at', { ascending: false }),
      supabase.from('insight_categories').select('key,names'),
    ]);
    let data = res.data as Row[] | null;
    if (res.error) data = ((await supabase.from('insights').select(COLUMNS_LEGACY).order('updated_at', { ascending: false })).data as Row[] | null) ?? [];
    setRows(data ?? []);
    const map: Record<string, string> = {};
    for (const c of (cats as Array<{ key: string; names: Record<string, string> }> | null) ?? []) map[c.key] = c.names.tr ?? c.names.en;
    setCategories(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-version actions (unchanged): publishing goes through the explicit server route.
  const setStatus = async (row: Row, status: InsightRow['status']) => {
    const action = status === 'PUBLISHED' ? 'publish' : 'unpublish';
    if (!window.confirm(action === 'publish' ? `“${row.title}” (${row.locale.toUpperCase()}) şimdi yayınlansın mı?` : `“${row.title}” (${row.locale.toUpperCase()}) yayından kaldırılsın mı?`)) return;
    const r = await adminFetch('/api/admin/insights/publish', { json: { insightId: row.id, action } });
    flash(r.ok ? (action === 'publish' ? 'Yayınlandı.' : 'Yayından kaldırıldı.') : r.error ?? 'İşlem başarısız.');
    load();
  };

  const duplicate = async (row: Row) => {
    if (!supabase) return;
    const { data } = await supabase.from('insights').select('*').eq('id', row.id).single();
    if (!data) return;
    const src = data as InsightRow;
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
    void _id; void _c; void _u;
    const copy = {
      ...rest,
      slug: `${slugify(src.slug)}-kopya-${Date.now().toString(36).slice(-4)}`,
      title: `${src.title} (kopya)`,
      status: 'DRAFT' as const,
      publish_at: null,
      featured: false,
      group_id: crypto.randomUUID(),
      // A copy is a new article: it is no longer a translation of the original.
      ...('source_insight_id' in src ? { source_insight_id: null, source_hash: null, language_reviewed: false, language_reviewed_at: null, language_reviewed_by: null } : {}),
    };
    const { data: created } = await supabase.from('insights').insert(copy).select('id').single();
    flash('Kopya taslak oluşturuldu.');
    if (created) window.location.href = `/admin/insights/${(created as { id: string }).id}`;
  };

  const remove = async (row: Row) => {
    if (!supabase) return;
    if (!window.confirm(`"${row.title || row.slug}" (${row.locale.toUpperCase()}) kalıcı olarak silinsin mi? Bu işlem geri alınamaz. Diğer dil sürümleri silinmez.`)) return;
    await supabase.from('insights').delete().eq('id', row.id);
    flash('Silindi.');
    load();
  };

  const groups = useMemo(() => groupInsights(rows), [rows]);
  const visible = groups.filter((g) => matchesFilter(g, { locale: filterLocale, state: filterState }));
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const toggle = (gid: string) => setExpanded((cur) => { const n = new Set(cur); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });
  const filterNote = filterLocale !== 'all' && filterState !== 'all'
    ? `${LOCALE_NAME[filterLocale]} sürümü “${LANG_STATE_LABEL[filterState]}” olan yazılar`
    : filterLocale !== 'all' ? `${LOCALE_NAME[filterLocale]} sürümü olan yazılar`
    : filterState !== 'all' ? `En az bir dili “${LANG_STATE_LABEL[filterState]}” olan yazılar` : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">İçerik / Insights</h1>
          <p className="mt-1 text-[13px] text-muted">Her satır bir yazı; dilleri yanında. Yapay zekâ yalnızca taslak üretir; yayın kararı sizindir.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="flt-lang">Dil</label>
          <select id="flt-lang" value={filterLocale} onChange={(e) => setFilterLocale(e.target.value as GroupLocale | 'all')} className="admin-input !w-auto">
            <option value="all">Tüm diller</option>
            {GROUP_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAME[l]}</option>)}
          </select>
          <label className="sr-only" htmlFor="flt-state">Durum</label>
          <select id="flt-state" value={filterState} onChange={(e) => setFilterState(e.target.value as LangState | 'all')} className="admin-input !w-auto">
            <option value="all">Tüm durumlar</option>
            {STATE_ORDER.map((s) => <option key={s} value={s}>{LANG_STATE_LABEL[s]}</option>)}
          </select>
          <Link href="/admin/insights/new" className="admin-btn-primary">+ Yeni içerik</Link>
        </div>
      </div>

      {message && <p className="rounded-sm border border-yoca-green/40 bg-yoca-green/10 px-4 py-2 text-[13px] text-yoca-green">{message}</p>}
      {filterNote && <p className="text-[12px] text-subtle">Filtre: {filterNote} · {visible.length} yazı</p>}

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : groups.length === 0 ? (
        <div className="admin-card grid justify-items-start gap-4">
          <p className="text-[15px] font-semibold">Henüz içerik yok. İlk içeriği oluştur.</p>
          <Link href="/admin/insights/new" className="admin-btn-primary">İlk içeriği oluştur</Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-card text-[14px] text-muted">Filtreye uyan yazı yok.</div>
      ) : (
        <div className="admin-card overflow-x-auto !p-0">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead className="text-start text-[11px] uppercase tracking-[0.1em] text-subtle">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-start">
                <th>Yazı</th><th>Diller</th><th>Kategori</th><th>Yazar</th><th>Güncelleme</th><th>İlk yayın</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => <GroupRow key={g.groupId} g={g} categories={categories} open={expanded.has(g.groupId)} onToggle={() => toggle(g.groupId)} fmt={fmt} actions={{ setStatus, duplicate, remove }} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupRow({ g, categories, open, onToggle, fmt, actions }: {
  g: ArticleGroup<Row>;
  categories: Record<string, string>;
  open: boolean;
  onToggle: () => void;
  fmt: (iso: string | null) => string;
  actions: { setStatus: (r: Row, s: InsightRow['status']) => void; duplicate: (r: Row) => void; remove: (r: Row) => void };
}) {
  const p = g.primary;
  return (
    <Fragment>
      <tr className="border-t border-line align-middle [&>td]:px-4 [&>td]:py-3">
        <td className="max-w-[340px]">
          <Link href={`/admin/insights/${p.id}`} className="font-bold text-white hover:text-yoca-lime" dir={g.titleLocale === 'ar' ? 'rtl' : 'ltr'}>{g.title || '(başlıksız)'}</Link>
          <p className="truncate text-[11px] text-subtle">/{p.locale}/insights/{p.slug}{g.titleLocale !== 'tr' ? ` · başlık ${g.titleLocale.toUpperCase()} (Türkçe sürüm yok)` : ''}</p>
          {g.warnings.map((w) => <p key={w} className="mt-1 text-[11px] text-yellow-200">! {w}</p>)}
        </td>
        <td>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_LOCALES.map((l) => {
              const m = memberFor(g, l);
              const st = langState(m);
              const href = m ? `/admin/insights/${m.id}` : `/admin/insights/${p.id}?lang=${l}`;
              return (
                <Link key={l} href={href} aria-label={`${LOCALE_NAME[l]}: ${LANG_STATE_LABEL[st]} — ${m ? 'düzenle' : 'çeviri oluştur'}`} className={`whitespace-nowrap border px-2 py-1 text-[11px] font-bold hover:border-white ${STATE_STYLE[st]}`}>
                  {l.toUpperCase()} · {LANG_STATE_LABEL[st]}{(g.byLocale[l]?.length ?? 0) > 1 ? ` (+${(g.byLocale[l]?.length ?? 1) - 1})` : ''}
                </Link>
              );
            })}
          </div>
        </td>
        <td>{categories[p.category_key ?? ''] ?? '—'}</td>
        <td>{p.author_name}</td>
        <td className="whitespace-nowrap text-muted">{fmt(g.updatedAt)}</td>
        <td className="whitespace-nowrap text-muted">{fmt(g.firstPublishedAt)}</td>
        <td className="whitespace-nowrap text-end">
          <div className="flex justify-end gap-1.5">
            <Link href={`/admin/insights/${p.id}`} className="admin-btn !px-2.5 !py-1">Aç</Link>
            <button type="button" onClick={onToggle} aria-expanded={open} className="admin-btn !px-2.5 !py-1">Dil sürümleri {open ? '▴' : '▾'}</button>
          </div>
        </td>
      </tr>
      {open && g.members.map((row) => (
        <tr key={row.id} className="border-t border-line/50 bg-white/[0.02] align-middle text-[12px] [&>td]:px-4 [&>td]:py-2">
          <td className="ps-8">
            <span className="me-2 font-bold uppercase">{row.locale}</span>
            <Link href={`/admin/insights/${row.id}`} className="text-white hover:text-yoca-lime" dir={row.locale === 'ar' ? 'rtl' : 'ltr'}>{row.title || '(başlıksız)'}</Link>
            <p className="truncate text-[11px] text-subtle">/{row.locale}/insights/{row.slug}</p>
          </td>
          <td>{LANG_STATE_LABEL[langState(row)]} <span className="text-subtle">· {STATUS_LABELS[row.status]}{row.featured ? ' · ★' : ''}</span></td>
          <td colSpan={2} className="text-muted">{row.source_insight_id ? `Çeviri${row.language_reviewed ? ' · dil kontrolü ✓' : ' · dil kontrolü bekliyor'}` : 'Kaynak'}</td>
          <td className="whitespace-nowrap text-muted">{fmt(row.updated_at)}</td>
          <td className="whitespace-nowrap text-muted">{fmt(row.publish_at)}</td>
          <td className="whitespace-nowrap text-end">
            <div className="flex flex-wrap justify-end gap-1.5">
              <Link href={`/admin/insights/${row.id}`} className="admin-btn !px-2.5 !py-1">Düzenle</Link>
              <button type="button" onClick={() => actions.duplicate(row)} className="admin-btn !px-2.5 !py-1">Çoğalt</button>
              {row.status === 'PUBLISHED' || row.status === 'SCHEDULED' ? (
                <button type="button" onClick={() => actions.setStatus(row, 'DRAFT')} className="admin-btn !px-2.5 !py-1">Yayından kaldır</button>
              ) : (
                <button type="button" onClick={() => actions.setStatus(row, 'PUBLISHED')} className="admin-btn !px-2.5 !py-1">Yayınla</button>
              )}
              <button type="button" onClick={() => actions.remove(row)} className="admin-btn !border-red-500/40 !px-2.5 !py-1 !text-red-300">Sil</button>
            </div>
          </td>
        </tr>
      ))}
    </Fragment>
  );
}
