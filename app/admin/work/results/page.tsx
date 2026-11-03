'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminClient } from '@/lib/adminClient';
import { DEFAULT_CASE_STUDY_SLUGS, staticCaseStudies } from '@/lib/workData';

/**
 * Yoca Admin — Sonuçlar ve referanslar (case_study_results, v14).
 * Each record: metric name & value, period, comparison baseline, source /
 * basis, client approval status + date, publication scope, testimonial text
 * and author title, and an approval-evidence note + file in the PRIVATE
 * "case-evidence" bucket (never the public media bucket). The public case
 * page shows a record only when it is approved, dated and scoped to "site".
 * Nothing is generated: enter only what the client approved in writing.
 */

interface Result {
  id?: string;
  case_slug: string;
  locale: string;
  metric_name: string;
  metric_value: string;
  period: string;
  baseline: string;
  source_basis: string;
  testimonial_text: string;
  testimonial_author: string;
  testimonial_author_title: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  approval_date: string | null;
  publication_scope: string[];
  evidence_note: string;
  evidence_path: string | null;
  sort_order: number;
  updated_at?: string;
}

const EMPTY: Result = {
  case_slug: DEFAULT_CASE_STUDY_SLUGS[0] ?? '',
  locale: 'all',
  metric_name: '',
  metric_value: '',
  period: '',
  baseline: '',
  source_basis: '',
  testimonial_text: '',
  testimonial_author: '',
  testimonial_author_title: '',
  approval_status: 'pending',
  approval_date: null,
  publication_scope: [],
  evidence_note: '',
  evidence_path: null,
  sort_order: 0,
};

const STATUS: Record<Result['approval_status'], string> = { pending: 'Onay bekliyor', approved: 'Müşteri onayladı', rejected: 'Reddedildi', withdrawn: 'Geri çekildi' };
const SCOPES: Array<{ key: string; label: string }> = [
  { key: 'site', label: 'Web sitesi' },
  { key: 'proposals', label: 'Teklif dosyaları' },
  { key: 'social', label: 'Sosyal medya' },
  { key: 'press', label: 'Basın' },
];

export default function AdminCaseResults() {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<Result[]>([]);
  const [slugs, setSlugs] = useState<string[]>(DEFAULT_CASE_STUDY_SLUGS);
  const [form, setForm] = useState<Result>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const [{ data, error: e }, cases] = await Promise.all([
      supabase.from('case_study_results').select('*').order('case_slug').order('sort_order'),
      supabase.from('case_studies').select('slug'),
    ]);
    if (e) setError(`Okunamadı: ${e.message} (supabase/upgrade-v14-content.sql çalıştırıldı mı?)`);
    setRows((data as Result[]) ?? []);
    const extra = ((cases.data as Array<{ slug: string }> | null) ?? []).map((c) => c.slug);
    setSlugs(Array.from(new Set([...DEFAULT_CASE_STUDY_SLUGS, ...extra])));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 4000);
  };

  const uploadEvidence = async (file: File) => {
    if (!supabase) return;
    if (file.size > 10 * 1024 * 1024) return flash('Dosya 10 MB’tan küçük olmalı.');
    setBusy(true);
    const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
    const path = `${form.case_slug}/${crypto.randomUUID()}-${safe}`;
    const { error: e } = await supabase.storage.from('case-evidence').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    setBusy(false);
    if (e) return flash(`Yüklenemedi: ${e.message}`);
    setForm((f) => ({ ...f, evidence_path: path }));
    flash('Kanıt dosyası özel depoya yüklendi (kaydetmeyi unutmayın).');
  };

  const openEvidence = async (path: string) => {
    if (!supabase) return;
    const { data } = await supabase.storage.from('case-evidence').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    else flash('Dosya açılamadı.');
  };

  const save = async () => {
    if (!supabase) return;
    if (!form.metric_name.trim() && !form.testimonial_text.trim()) return flash('Bir metrik ya da müşteri yorumu girin.');
    if (form.metric_name.trim() && !form.metric_value.trim()) return flash('Metrik değeri gerekli.');
    if (form.approval_status === 'approved') {
      if (!form.approval_date) return flash('Onay tarihi gerekli.');
      if (!form.evidence_note.trim() && !form.evidence_path) return flash('Onaylı kayıt için onay kanıtı (not veya dosya) gerekli.');
      if (form.publication_scope.includes('site') && !window.confirm('Bu kayıt proje sayfasında herkese açık gösterilecek. Müşterinin bu metni ve sayıyı web sitesinde yayınlamayı yazılı onayladığını teyit ediyor musunuz?')) return;
    }
    setBusy(true);
    const { data: session } = await supabase.auth.getSession();
    const { id, updated_at: _u, ...payload } = form;
    void _u;
    const values = { ...payload, approval_date: form.approval_date || null, updated_by: session.session?.user.email ?? null };
    const { error: e } = id ? await supabase.from('case_study_results').update(values).eq('id', id) : await supabase.from('case_study_results').insert(values);
    setBusy(false);
    if (e) return flash(`Kaydedilemedi: ${e.message}`);
    flash('Kaydedildi.');
    setForm(EMPTY);
    load();
  };

  const remove = async (row: Result) => {
    if (!supabase || !row.id) return;
    if (!window.confirm('Bu kayıt kalıcı olarak silinsin mi? (Yayından kaldırmak için durumu “Geri çekildi” yapmanız yeterli.)')) return;
    const { error: e } = await supabase.from('case_study_results').delete().eq('id', row.id);
    flash(e ? `Silinemedi: ${e.message}` : 'Silindi.');
    load();
  };

  const field = 'admin-input text-[13px]';
  const label = 'grid gap-1 text-[12px] font-bold text-subtle';
  const visible = (r: Result) => r.approval_status === 'approved' && Boolean(r.approval_date) && r.publication_scope.includes('site');

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-subtle"><Link href="/admin/work" className="hover:text-yoca-lime">← Work / Projeler</Link></p>
          <h1 className="text-2xl font-extrabold tracking-tight">Sonuçlar ve referanslar</h1>
          <p className="mt-1.5 max-w-3xl text-[14px] text-muted">Yalnızca müşterinin yazılı onayladığı sonuç ve yorumları girin. Proje sayfasında yalnızca “Müşteri onayladı” + onay tarihi + “Web sitesi” kapsamındaki kayıtlar görünür. Sayı veya yorum üretmeyin, tahmin girmeyin.</p>
        </div>
        {msg && <p role="status" className="text-[13px] font-bold text-yoca-lime">{msg}</p>}
      </header>
      {error && <p className="rounded-md border border-amber-400/40 px-4 py-3 text-[13px] text-amber-100">{error}</p>}

      <ExampleStructure />

      <section className="admin-card grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>Proje<select value={form.case_slug} onChange={(e) => setForm({ ...form, case_slug: e.target.value })} className={field}>{slugs.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className={label}>Dil<select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className={field}><option value="all">Tüm diller</option><option value="tr">TR</option><option value="en">EN</option><option value="az">AZ</option><option value="ar">AR</option></select></label>
          <label className={label}>Sıra<input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} className={field} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Metrik adı<input value={form.metric_name} onChange={(e) => setForm({ ...form, metric_name: e.target.value })} className={field} placeholder="Ör. Online randevu talebi" /></label>
          <label className={label}>Değer<input value={form.metric_value} onChange={(e) => setForm({ ...form, metric_value: e.target.value })} className={field} /></label>
          <label className={label}>Dönem<input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className={field} placeholder="Ör. Mart–Mayıs 2026" /></label>
          <label className={label}>Karşılaştırma (neye göre)<input value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} className={field} placeholder="Ör. önceki üç ay" /></label>
          <label className={`${label} sm:col-span-2`}>Kaynak / dayanak<input value={form.source_basis} onChange={(e) => setForm({ ...form, source_basis: e.target.value })} className={field} placeholder="Ör. müşterinin randevu sistemi raporu" /></label>
        </div>
        <label className={label}>Müşteri yorumu (orijinal metin, değiştirmeden)<textarea rows={3} value={form.testimonial_text} onChange={(e) => setForm({ ...form, testimonial_text: e.target.value })} className={field} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Yorum sahibi (ad, isteğe bağlı)<input value={form.testimonial_author} onChange={(e) => setForm({ ...form, testimonial_author: e.target.value })} className={field} /></label>
          <label className={label}>Unvanı<input value={form.testimonial_author_title} onChange={(e) => setForm({ ...form, testimonial_author_title: e.target.value })} className={field} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>Müşteri onayı<select value={form.approval_status} onChange={(e) => setForm({ ...form, approval_status: e.target.value as Result['approval_status'] })} className={field}>{(Object.keys(STATUS) as Array<Result['approval_status']>).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</select></label>
          <label className={label}>Onay tarihi<input type="date" value={form.approval_date ?? ''} onChange={(e) => setForm({ ...form, approval_date: e.target.value || null })} className={field} /></label>
          <fieldset className={label}>Yayın kapsamı
            <div className="flex flex-wrap gap-3 pt-1">
              {SCOPES.map((s) => (
                <label key={s.key} className="flex items-center gap-1.5 text-[12px] font-semibold text-soft">
                  <input type="checkbox" checked={form.publication_scope.includes(s.key)} onChange={(e) => setForm({ ...form, publication_scope: e.target.checked ? [...form.publication_scope, s.key] : form.publication_scope.filter((x) => x !== s.key) })} /> {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <label className={label}>Onay kanıtı notu (yalnızca yöneticiler görür)<textarea rows={2} value={form.evidence_note} onChange={(e) => setForm({ ...form, evidence_note: e.target.value })} className={field} placeholder="Ör. 12.05.2026 tarihli e-postada X onayladı" /></label>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <label className="admin-btn cursor-pointer">Kanıt dosyası yükle (özel depo)<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadEvidence(e.target.files[0])} /></label>
          {form.evidence_path && <button type="button" className="admin-btn" onClick={() => openEvidence(form.evidence_path as string)}>Dosyayı aç</button>}
          {form.evidence_path && <span className="text-subtle">{form.evidence_path}</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="admin-btn-primary" disabled={busy} onClick={save}>{form.id ? 'Güncelle' : 'Ekle'}</button>
          {form.id && <button type="button" className="admin-btn" onClick={() => setForm(EMPTY)}>Vazgeç</button>}
        </div>
      </section>

      <ul className="grid gap-2">
        {rows.length === 0 && <li className="text-[14px] text-muted">Kayıt yok. Proje sayfalarında sonuç/yorum bölümü gizli.</li>}
        {rows.map((r) => (
          <li key={r.id} className="admin-card flex flex-wrap items-center justify-between gap-3 !p-3.5 text-[13px]">
            <div className="min-w-0">
              <p className="font-extrabold">{r.case_slug} · {r.metric_name ? `${r.metric_name}: ${r.metric_value}` : 'Müşteri yorumu'}</p>
              <p className="text-[12px] text-subtle">{STATUS[r.approval_status]}{r.approval_date ? ` · ${r.approval_date}` : ''} · kapsam: {r.publication_scope.join(', ') || '—'} · {r.locale}{r.evidence_path || r.evidence_note ? ' · kanıt var' : ' · kanıt yok'}</p>
              <p className={`text-[11px] font-bold ${visible(r) ? 'text-yoca-green' : 'text-amber-300'}`}>{visible(r) ? 'Proje sayfasında görünüyor' : 'Sitede görünmüyor'}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="admin-btn" onClick={() => setForm({ ...EMPTY, ...r })}>Düzenle</button>
              <button type="button" className="admin-btn hover:!border-red-400 hover:!text-red-400" onClick={() => remove(r)}>Sil</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The case-study structure, shown with Prime Wash Car. Every sentence below is
 * read from lib/workData.ts (Turkish content) at render time — nothing is
 * added. Step 5 stays empty: there is no approved result for this project.
 */
function ExampleStructure() {
  const pwc = staticCaseStudies('tr').find((c) => c.slug === 'prime-wash-car');
  if (!pwc) return null;
  const steps: Array<{ n: string; title: string; text: string }> = [
    { n: '1', title: 'İhtiyaç', text: pwc.problem },
    { n: '2', title: 'Yoca’nın kapsamı', text: pwc.approach },
    { n: '3', title: 'Teslim edilen özellikler', text: pwc.solution },
    { n: '4', title: 'Görseller ve canlı bağlantı', text: `Proje görselleri (${pwc.image}) ve canlı site: ${pwc.liveUrl ?? '—'}` },
    { n: '5', title: 'Sonuç ve müşteri yorumu (yalnızca onaylıysa)', text: 'Bu proje için onaylı sonuç ya da yorum yok; bölüm sitede gösterilmez. “Randevular arttı” gibi bir ifade, müşterinin yazılı onayı, dönemi, karşılaştırma tabanı ve kaynağı olmadan yazılmaz.' },
  ];
  return (
    <details className="admin-card text-[13px]">
      <summary className="cursor-pointer font-bold text-white">Vaka yapısı — örnek: {pwc.name} (metin lib/workData.ts’den)</summary>
      <ol className="mt-3 grid gap-2">
        {steps.map((st) => (
          <li key={st.n} className="grid gap-0.5 border-t border-line pt-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-subtle">{st.n} · {st.title}</span>
            <span className="text-muted">{st.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
