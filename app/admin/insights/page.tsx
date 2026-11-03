'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { adminFetch, INSIGHT_LOCALES, STATUS_LABELS, slugify } from '@/lib/insightsAdmin';
import type { InsightRow, Locale } from '@/types';

/**
 * Yoca Admin — İçerik / Insights listesi.
 * Başlık · dil · yazar · kategori · durum · güncelleme · yayın · öne çıkan.
 * Eylemler: Düzenle · Çoğalt · Önizle · Yayınla / Yayından kaldır · Sil.
 */

type Row = Pick<InsightRow, 'id' | 'group_id' | 'locale' | 'slug' | 'title' | 'author_name' | 'category_key' | 'status' | 'updated_at' | 'publish_at' | 'featured'>;

const STATUS_STYLE: Record<InsightRow['status'], string> = {
  DRAFT: 'border-line text-muted',
  IN_REVIEW: 'border-yellow-400/50 text-yellow-300',
  SCHEDULED: 'border-yoca-green/50 text-yoca-green',
  PUBLISHED: 'border-yoca-lime bg-yoca-lime text-black',
  ARCHIVED: 'border-line text-subtle',
};

export default function AdminInsights() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterLocale, setFilterLocale] = useState<Locale | 'all'>('all');
  const [message, setMessage] = useState<string | null>(null);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const load = async () => {
    if (!supabase) return;
    const [{ data }, { data: cats }] = await Promise.all([
      supabase.from('insights').select('id,group_id,locale,slug,title,author_name,category_key,status,updated_at,publish_at,featured').order('updated_at', { ascending: false }),
      supabase.from('insight_categories').select('key,names'),
    ]);
    setRows((data as Row[]) ?? []);
    const map: Record<string, string> = {};
    for (const c of (cats as Array<{ key: string; names: Record<string, string> }> | null) ?? []) map[c.key] = c.names.tr ?? c.names.en;
    setCategories(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publishing goes through the same explicit server route as the editor (image
  // promotion, [KAYNAK GEREKLİ] check, snapshot) — never a direct status write.
  const setStatus = async (row: Row, status: InsightRow['status']) => {
    const action = status === 'PUBLISHED' ? 'publish' : 'unpublish';
    if (!window.confirm(action === 'publish' ? `“${row.title}” şimdi yayınlansın mı?` : `“${row.title}” yayından kaldırılsın mı?`)) return;
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
    };
    const { data: created } = await supabase.from('insights').insert(copy).select('id').single();
    flash('Kopya taslak oluşturuldu.');
    if (created) window.location.href = `/admin/insights/${(created as { id: string }).id}`;
  };

  const remove = async (row: Row) => {
    if (!supabase) return;
    if (!window.confirm(`"${row.title || row.slug}" kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
    await supabase.from('insights').delete().eq('id', row.id);
    flash('Silindi.');
    load();
  };

  const visible = rows.filter((r) => filterLocale === 'all' || r.locale === filterLocale);
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.group_id, [...(groups.get(r.group_id) ?? []), r]);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">İçerik / Insights</h1>
          <p className="mt-1 text-[13px] text-muted">İçgörüler: taslak → inceleme → zamanlama → yayın. Yapay zekâ yalnızca taslak üretir; yayın kararı sizindir.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterLocale} onChange={(e) => setFilterLocale(e.target.value as Locale | 'all')} className="admin-input !w-auto">
            <option value="all">Tüm diller</option>
            {INSIGHT_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <Link href="/admin/insights/new" className="admin-btn-primary">+ Yeni içerik</Link>
        </div>
      </div>

      {message && <p className="rounded-sm border border-yoca-green/40 bg-yoca-green/10 px-4 py-2 text-[13px] text-yoca-green">{message}</p>}

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        <div className="admin-card grid justify-items-start gap-4">
          <p className="text-[15px] font-semibold">Henüz içerik yok. İlk içeriği oluştur.</p>
          <Link href="/admin/insights/new" className="admin-btn-primary">İlk içeriği oluştur</Link>
        </div>
      ) : (
        <div className="admin-card overflow-x-auto !p-0">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead className="text-start text-[11px] uppercase tracking-[0.1em] text-subtle">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-start">
                <th>Başlık</th><th>Dil</th><th>Çeviriler</th><th>Yazar</th><th>Kategori</th><th>Durum</th><th>Güncelleme</th><th>Yayın</th><th>Öne çıkan</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const siblings = groups.get(row.group_id) ?? [];
                return (
                  <tr key={row.id} className="border-t border-line align-middle [&>td]:px-4 [&>td]:py-3">
                    <td className="max-w-[320px]">
                      <Link href={`/admin/insights/${row.id}`} className="font-bold text-white hover:text-yoca-lime">{row.title || '(başlıksız)'}</Link>
                      <p className="truncate text-[11px] text-subtle">/{row.locale}/insights/{row.slug}</p>
                    </td>
                    <td className="uppercase font-bold">{row.locale}</td>
                    <td className="whitespace-nowrap text-[11px] font-bold tracking-wide">
                      {INSIGHT_LOCALES.map((l) => {
                        const has = siblings.find((s) => s.locale === l.code);
                        return <span key={l.code} className={`me-1.5 ${has ? 'text-yoca-green' : 'text-subtle'}`}>{l.code.toUpperCase()} {has ? '✓' : '—'}</span>;
                      })}
                    </td>
                    <td>{row.author_name}</td>
                    <td>{categories[row.category_key ?? ''] ?? '—'}</td>
                    <td><span className={`inline-block border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[row.status]}`}>{STATUS_LABELS[row.status]}</span></td>
                    <td className="whitespace-nowrap text-muted">{fmt(row.updated_at)}</td>
                    <td className="whitespace-nowrap text-muted">{fmt(row.publish_at)}</td>
                    <td>{row.featured ? '★' : ''}</td>
                    <td className="whitespace-nowrap text-end">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link href={`/admin/insights/${row.id}`} className="admin-btn !px-2.5 !py-1">Düzenle</Link>
                        <button type="button" onClick={() => duplicate(row)} className="admin-btn !px-2.5 !py-1">Çoğalt</button>
                        {row.status === 'PUBLISHED' || row.status === 'SCHEDULED' ? (
                          <button type="button" onClick={() => setStatus(row, 'DRAFT')} className="admin-btn !px-2.5 !py-1">Yayından kaldır</button>
                        ) : (
                          <button type="button" onClick={() => setStatus(row, 'PUBLISHED')} className="admin-btn-primary !px-2.5 !py-1">Yayınla</button>
                        )}
                        <button type="button" onClick={() => remove(row)} className="admin-btn !border-red-500/40 !px-2.5 !py-1 !text-red-300">Sil</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
