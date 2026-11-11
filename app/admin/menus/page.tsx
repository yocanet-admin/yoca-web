'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import type { MenuRow } from '@/types';

/** Yoca Admin — menü yöneticisi (header + footer, sıralama, gizleme). */

type Location = 'header' | 'footer';

const EMPTY_FORM = { title: '', url: '', location: 'header' as Location };

export default function AdminMenus() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  };

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('menus')
      .select('*')
      .order('location')
      .order('order_index');
    setRows((data as MenuRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !form.title.trim() || !form.url.trim()) return;

    if (editingId !== null) {
      await supabase
        .from('menus')
        .update({ title: form.title.trim(), url: form.url.trim(), location: form.location })
        .eq('id', editingId);
      flash('Menü güncellendi.');
    } else {
      const siblings = rows.filter((row) => row.location === form.location);
      const nextOrder =
        siblings.length > 0 ? Math.max(...siblings.map((row) => row.order_index)) + 1 : 0;
      await supabase.from('menus').insert({
        title: form.title.trim(),
        url: form.url.trim(),
        location: form.location,
        order_index: nextOrder,
        is_active: true,
      });
      flash('Menü eklendi.');
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    load();
  };

  const move = async (row: MenuRow, direction: -1 | 1) => {
    if (!supabase) return;
    const siblings = rows
      .filter((item) => item.location === row.location)
      .sort((a, b) => a.order_index - b.order_index);
    const index = siblings.findIndex((item) => item.id === row.id);
    const target = siblings[index + direction];
    if (!target) return;
    await Promise.all([
      supabase.from('menus').update({ order_index: target.order_index }).eq('id', row.id),
      supabase.from('menus').update({ order_index: row.order_index }).eq('id', target.id),
    ]);
    load();
  };

  const toggle = async (row: MenuRow) => {
    if (!supabase) return;
    await supabase.from('menus').update({ is_active: !row.is_active }).eq('id', row.id);
    load();
  };

  const remove = async (row: MenuRow) => {
    if (!supabase) return;
    if (!window.confirm(`“${row.title}” menü öğesi kalıcı olarak silinsin mi? (Sadece gizlemek için “Gizle”yi kullanın.)`)) return;
    const { error } = await supabase.from('menus').delete().eq('id', row.id);
    flash(error ? `Silinemedi: ${error.message}` : 'Menü silindi.');
    load();
  };

  const startEdit = (row: MenuRow) => {
    setEditingId(row.id);
    setForm({ title: row.title, url: row.url, location: row.location });
  };

  const group = (location: Location) =>
    rows
      .filter((row) => row.location === location)
      .sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="grid gap-6">
      <header className="admin-head">
        <div className="admin-head-text">
          <p className="admin-kicker">Site içeriği</p>
          <h1 className="admin-h1">Menüler</h1>
          <p className="admin-lede">
            Bilinen sayfaların başlıkları sitede ziyaretçinin dilinde gösterilir; özel linklerde
            yazdığınız başlık kullanılır.
          </p>
        </div>
        {message && <p className="text-[13px] font-bold text-yoca-lime">{message}</p>}
      </header>

      <form onSubmit={submit} className="admin-card grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
        <input
          placeholder="Başlık (örn. Blog)"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          className="admin-input"
          required
        />
        <input
          placeholder="URL (örn. /blog veya https://…)"
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
          className="admin-input"
          required
        />
        <select
          value={form.location}
          onChange={(event) => setForm({ ...form, location: event.target.value as Location })}
          className="admin-input"
        >
          <option value="header">Header</option>
          <option value="footer">Footer</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="admin-btn-primary">
            {editingId !== null ? 'Güncelle' : 'Ekle'}
          </button>
          {editingId !== null && (
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              Vazgeç
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : (
        (['header', 'footer'] as Location[]).map((location) => (
          <section key={location} className="grid gap-2.5">
            <h2 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-subtle">
              {location === 'header' ? 'Header Menüsü' : 'Footer Menüsü'}
            </h2>
            {group(location).map((row, index, list) => (
              <div key={row.id} className="admin-card flex flex-wrap items-center gap-3 !p-3.5">
                <div className="flex flex-none gap-1">
                  <button
                    type="button"
                    aria-label="Yukarı taşı"
                    className="admin-btn admin-btn-sm"
                    disabled={index === 0}
                    onClick={() => move(row, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Aşağı taşı"
                    className="admin-btn admin-btn-sm"
                    disabled={index === list.length - 1}
                    onClick={() => move(row, 1)}
                  >
                    ↓
                  </button>
                </div>
                <div className="min-w-[10rem] flex-1">
                  <p className={`text-[14px] font-extrabold ${row.is_active ? '' : 'text-subtle line-through'}`}>
                    {row.title}
                  </p>
                  <p className="truncate text-[12px] text-subtle">{row.url}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-none">
                  <button type="button" className="admin-btn" onClick={() => toggle(row)}>
                    {row.is_active ? 'Gizle' : 'Göster'}
                  </button>
                  <button type="button" className="admin-btn" onClick={() => startEdit(row)}>
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
          </section>
        ))
      )}
    </div>
  );
}
