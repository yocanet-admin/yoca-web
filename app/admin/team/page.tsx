'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type FormEvent } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import type { TeamMemberRow } from '@/types';

/** Yoca Admin — ekip yönetimi (CRUD + sıralama). */

interface TeamForm {
  name: string;
  role: string;
  image_url: string;
  linkedin: string;
  tags: string;
}

const EMPTY_FORM: TeamForm = { name: '', role: '', image_url: '', linkedin: '', tags: '' };

export default function AdminTeam() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The form as it was when editing started; anything else counts as unsaved.
  const [baseline, setBaseline] = useState<TeamForm>(EMPTY_FORM);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

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
    const { data } = await supabase.from('team_members').select('*').order('order_index');
    setRows((data as TeamMemberRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseTags = (value: string): string[] =>
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      image_url: form.image_url.trim() || null,
      linkedin: form.linkedin.trim() || null,
      tags: parseTags(form.tags),
    };

    const nextOrder = rows.length > 0 ? Math.max(...rows.map((row) => row.order_index)) + 1 : 0;
    const { error } =
      editingId !== null
        ? await supabase.from('team_members').update(payload).eq('id', editingId)
        : await supabase.from('team_members').insert({ ...payload, order_index: nextOrder, is_active: true });
    if (error) {
      // Keep the form filled in so nothing is lost.
      flash(`Kaydedilemedi: ${error.message}`);
      return;
    }
    flash(editingId !== null ? 'Ekip üyesi güncellendi.' : 'Ekip üyesi eklendi.');
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setEditingId(null);
    load();
  };

  const move = async (row: TeamMemberRow, direction: -1 | 1) => {
    if (!supabase) return;
    const sorted = [...rows].sort((a, b) => a.order_index - b.order_index);
    const index = sorted.findIndex((item) => item.id === row.id);
    const target = sorted[index + direction];
    if (!target) return;
    await Promise.all([
      supabase.from('team_members').update({ order_index: target.order_index }).eq('id', row.id),
      supabase.from('team_members').update({ order_index: row.order_index }).eq('id', target.id),
    ]);
    load();
  };

  const toggle = async (row: TeamMemberRow) => {
    if (!supabase) return;
    await supabase.from('team_members').update({ is_active: !row.is_active }).eq('id', row.id);
    load();
  };

  const remove = async (row: TeamMemberRow) => {
    if (!supabase) return;
    if (!window.confirm(`${row.name} kalıcı olarak silinsin mi? Bu geri alınamaz. (Sadece sitede gizlemek için “Gizle”yi kullanın.)`)) return;
    const { error } = await supabase.from('team_members').delete().eq('id', row.id);
    flash(error ? `Silinemedi: ${error.message}` : 'Ekip üyesi silindi.');
    load();
  };

  const startEdit = (row: TeamMemberRow) => {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')) return;
    const next = {
      name: row.name,
      role: row.role,
      image_url: row.image_url ?? '',
      linkedin: row.linkedin ?? '',
      tags: (row.tags ?? []).join(', '),
    };
    setEditingId(row.id);
    setForm(next);
    setBaseline(next);
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Ekip</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Yalnızca gerçek ekip üyeleri. Fotoğrafı Supabase Storage&apos;a yükleyip public URL&apos;ini
            buraya yapıştırın. Tablo boşken ekip bölümü sitede hiç görünmez.
          </p>
        </div>
        {message && <p className="text-[13px] font-bold text-yoca-lime">{message}</p>}
      </header>

      <form onSubmit={submit} className="admin-card grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Ad Soyad *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="admin-input"
            required
          />
          <input
            placeholder="Unvan (örn. Growth Lead)"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            className="admin-input"
          />
          <input
            placeholder="Fotoğraf URL (Supabase Storage public URL)"
            value={form.image_url}
            onChange={(event) => setForm({ ...form, image_url: event.target.value })}
            className="admin-input"
          />
          <input
            placeholder="LinkedIn URL"
            value={form.linkedin}
            onChange={(event) => setForm({ ...form, linkedin: event.target.value })}
            className="admin-input"
          />
        </div>
        <input
          placeholder="Uzmanlık etiketleri — virgülle ayırın (SEO, CRO, Paid Media)"
          value={form.tags}
          onChange={(event) => setForm({ ...form, tags: event.target.value })}
          className="admin-input"
        />
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
                setBaseline(EMPTY_FORM);
              }}
            >
              Vazgeç
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-[14px] text-muted">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-muted">Henüz ekip üyesi yok.</p>
      ) : (
        <div className="grid gap-2.5">
          {[...rows]
            .sort((a, b) => a.order_index - b.order_index)
            .map((row, index, list) => (
              <div key={row.id} className="admin-card flex flex-wrap items-center gap-4 !p-3.5">
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
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt=""
                    className="h-11 w-11 flex-none rounded-sm object-cover grayscale"
                  />
                ) : (
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-sm border border-line text-[15px] font-extrabold text-subtle">
                    {row.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-extrabold ${row.is_active ? '' : 'text-subtle line-through'}`}>
                    {row.name}
                  </p>
                  <p className="truncate text-[12px] text-subtle">
                    {row.role}
                    {row.tags && row.tags.length > 0 ? ` · ${row.tags.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex flex-none gap-2">
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
        </div>
      )}
    </div>
  );
}
