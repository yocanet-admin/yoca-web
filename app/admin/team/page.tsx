'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type FormEvent } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import type { TeamMemberRow } from '@/types';

/**
 * Yoca Admin — ekip yönetimi.
 * A card is public only when it is visible (Göster) AND verified: name, role
 * and photo each confirmed by an admin. Changing the name, role or photo
 * clears that confirmation. Real people only — no placeholder people and no
 * AI-generated portraits. Photos go to the "team-photos" bucket (v14; public
 * by URL, shown on the site only for verified cards).
 */

interface TeamForm {
  name: string;
  role: string;
  bio: string;
  image_url: string;
  linkedin: string;
  links: string;
  tags: string;
  name_confirmed: boolean;
  role_confirmed: boolean;
  photo_confirmed: boolean;
}

const EMPTY_FORM: TeamForm = { name: '', role: '', bio: '', image_url: '', linkedin: '', links: '', tags: '', name_confirmed: false, role_confirmed: false, photo_confirmed: false };

const linksToText = (links?: Array<{ label: string; url: string }>) => (links ?? []).map((l) => `${l.label} | ${l.url}`).join('\n');
function textToLinks(text: string): Array<{ label: string; url: string }> {
  return text
    .split('\n')
    .map((line) => line.split('|').map((x) => x.trim()))
    .filter(([label, url]) => label && /^https:\/\//.test(url ?? ''))
    .slice(0, 4)
    .map(([label, url]) => ({ label: label.slice(0, 40), url: url.slice(0, 300) }));
}

export default function AdminTeam() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
    setTimeout(() => setMessage(null), 4000);
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

  const parseTags = (value: string): string[] => value.split(',').map((tag) => tag.trim()).filter(Boolean);

  // Editing a confirmed field clears its confirmation.
  const setField = (key: 'name' | 'role' | 'image_url', value: string) => {
    const confirm = key === 'name' ? 'name_confirmed' : key === 'role' ? 'role_confirmed' : 'photo_confirmed';
    setForm((f) => ({ ...f, [key]: value, [confirm]: false }));
  };

  const upload = async (file: File) => {
    if (!supabase) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      flash('Fotoğraf JPEG, PNG veya WebP ve 5 MB altında olmalı.');
      return;
    }
    setUploading(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('team-photos').upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) {
      flash(`Yüklenemedi: ${error.message} (v14 SQL çalıştırıldı mı?)`);
      return;
    }
    setField('image_url', supabase.storage.from('team-photos').getPublicUrl(path).data.publicUrl);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !form.name.trim()) return;
    const verified = form.name_confirmed && form.role_confirmed && form.photo_confirmed && Boolean(form.image_url.trim()) && Boolean(form.role.trim());
    const { data: session } = await supabase.auth.getSession();
    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      bio: form.bio.trim().slice(0, 400),
      image_url: form.image_url.trim() || null,
      linkedin: form.linkedin.trim() || null,
      links: textToLinks(form.links),
      tags: parseTags(form.tags),
      name_confirmed: form.name_confirmed,
      role_confirmed: form.role_confirmed,
      photo_confirmed: form.photo_confirmed && Boolean(form.image_url.trim()),
      verified,
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? session.session?.user.email ?? null : null,
    };

    const nextOrder = rows.length > 0 ? Math.max(...rows.map((row) => row.order_index)) + 1 : 0;
    const { error } =
      editingId !== null
        ? await supabase.from('team_members').update(payload).eq('id', editingId)
        : await supabase.from('team_members').insert({ ...payload, order_index: nextOrder, is_active: true });
    if (error) {
      flash(`Kaydedilemedi: ${error.message}${/column/.test(error.message) ? ' — supabase/upgrade-v14-content.sql gerekli.' : ''}`);
      return;
    }
    flash(verified ? 'Kaydedildi — doğrulandı; “Göster” açıksa sitede görünür.' : 'Kaydedildi — doğrulanmadığı için sitede görünmez.');
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
    const next: TeamForm = {
      name: row.name,
      role: row.role,
      bio: row.bio ?? '',
      image_url: row.image_url ?? '',
      linkedin: row.linkedin ?? '',
      links: linksToText(row.links),
      tags: (row.tags ?? []).join(', '),
      name_confirmed: Boolean(row.name_confirmed),
      role_confirmed: Boolean(row.role_confirmed),
      photo_confirmed: Boolean(row.photo_confirmed),
    };
    setEditingId(row.id);
    setForm(next);
    setBaseline(next);
  };

  const publicState = (row: TeamMemberRow) => (row.is_active && row.verified ? 'Sitede görünüyor' : !row.verified ? 'Doğrulanmadı — sitede yok' : 'Gizli');

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Ekip</h1>
          <p className="mt-1.5 max-w-3xl text-[14px] text-muted">
            Yalnızca gerçek ekip üyeleri. Kart, ad, unvan ve fotoğraf ayrı ayrı onaylanınca (“doğrulandı”) ve “Göster” açıkken sitede görünür. Yapay zekâ ile üretilmiş portre kullanmayın. Doğrulanmış üye yokken ekip bölümü sitede hiç görünmez.
          </p>
        </div>
        {message && <p role="status" className="text-[13px] font-bold text-yoca-lime">{message}</p>}
      </header>

      <form onSubmit={submit} className="admin-card grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[12px] font-bold text-subtle">Ad Soyad *<input value={form.name} onChange={(event) => setField('name', event.target.value)} className="admin-input" required /></label>
          <label className="grid gap-1 text-[12px] font-bold text-subtle">Unvan<input value={form.role} onChange={(event) => setField('role', event.target.value)} className="admin-input" placeholder="Ör. Tasarım" /></label>
        </div>
        <label className="grid gap-1 text-[12px] font-bold text-subtle">Kısa biyografi (en fazla 400 karakter; kişinin onayladığı metin)
          <textarea rows={2} maxLength={400} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} className="admin-input" />
        </label>
        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <div className="grid place-items-center border border-dashed border-line">
            {form.image_url ? <img src={form.image_url} alt="" className="aspect-square w-full object-cover" /> : <span className="p-4 text-[12px] text-subtle">Fotoğraf yok</span>}
          </div>
          <div className="grid content-start gap-2">
            <label className="admin-btn w-fit cursor-pointer">{uploading ? 'Yükleniyor…' : 'Fotoğraf yükle'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            <input placeholder="veya fotoğraf URL’i (https://)" value={form.image_url} onChange={(event) => setField('image_url', event.target.value)} className="admin-input" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[12px] font-bold text-subtle">LinkedIn URL<input value={form.linkedin} onChange={(event) => setForm({ ...form, linkedin: event.target.value })} className="admin-input" /></label>
          <label className="grid gap-1 text-[12px] font-bold text-subtle">Uzmanlık etiketleri (virgülle)<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="admin-input" /></label>
        </div>
        <label className="grid gap-1 text-[12px] font-bold text-subtle">Diğer bağlantılar — her satır: Etiket | https://… (en fazla 4)
          <textarea rows={2} value={form.links} onChange={(event) => setForm({ ...form, links: event.target.value })} className="admin-input font-mono text-[12px]" />
        </label>
        <fieldset className="grid gap-1.5 rounded-sm border border-line p-3">
          <legend className="px-1 text-[12px] font-bold text-subtle">Doğrulama (kişiyle teyit edildi)</legend>
          {([['name_confirmed', 'Ad soyad doğru ve kişi sitede yer almayı kabul etti'], ['role_confirmed', 'Unvan doğru'], ['photo_confirmed', 'Fotoğraf kişinin gerçek fotoğrafı ve kullanım izni var']] as const).map(([key, text]) => (
            <label key={key} className="flex items-center gap-2 text-[13px] text-soft">
              <input type="checkbox" checked={form[key]} disabled={key === 'photo_confirmed' && !form.image_url} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="h-4 w-4 accent-yoca-lime" /> {text}
            </label>
          ))}
          <p className="text-[11px] text-subtle">Üçü de işaretli değilse kart sitede görünmez. Ad, unvan veya fotoğraf değişince ilgili onay kalkar.</p>
        </fieldset>
        <div className="flex gap-2">
          <button type="submit" className="admin-btn-primary">{editingId !== null ? 'Güncelle' : 'Ekle'}</button>
          {editingId !== null && (
            <button type="button" className="admin-btn" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setBaseline(EMPTY_FORM); }}>Vazgeç</button>
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
                  <button type="button" aria-label="Yukarı taşı" className="admin-btn !px-2.5 !py-1" disabled={index === 0} onClick={() => move(row, -1)}>↑</button>
                  <button type="button" aria-label="Aşağı taşı" className="admin-btn !px-2.5 !py-1" disabled={index === list.length - 1} onClick={() => move(row, 1)}>↓</button>
                </div>
                {row.image_url ? (
                  <img src={row.image_url} alt="" className="h-11 w-11 flex-none rounded-sm object-cover grayscale" />
                ) : (
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-sm border border-line text-[15px] font-extrabold text-subtle">{row.name.slice(0, 1)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-extrabold ${row.is_active ? '' : 'text-subtle line-through'}`}>{row.name}</p>
                  <p className="truncate text-[12px] text-subtle">{row.role}{row.tags && row.tags.length > 0 ? ` · ${row.tags.join(', ')}` : ''}</p>
                  <p className={`text-[11px] font-bold ${row.is_active && row.verified ? 'text-yoca-green' : 'text-amber-300'}`}>{publicState(row)}</p>
                </div>
                <div className="flex flex-none gap-2">
                  <button type="button" className="admin-btn" onClick={() => toggle(row)}>{row.is_active ? 'Gizle' : 'Göster'}</button>
                  <button type="button" className="admin-btn" onClick={() => startEdit(row)}>Düzenle</button>
                  <button type="button" className="admin-btn hover:!border-red-400 hover:!text-red-400" onClick={() => remove(row)}>Sil</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
