'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminClient } from '@/lib/adminClient';
import {
  adminFetch,
  emptyInsight,
  INSIGHT_LOCALES,
  isoToLocalInput,
  localInputToIso,
  saveRevision,
  slugify,
  STATUS_LABELS,
  toPayload,
  type EditableInsight,
} from '@/lib/insightsAdmin';
import { readingMinutes } from '@/lib/markdown';
import type { ArticleDraft, Translation } from '@/lib/ai/schemas';
import type { InsightCategoryRow, InsightRow, InsightSource, Locale } from '@/types';
import StudioPanel from '@/components/admin/insights/StudioPanel';
import PreviewModal from '@/components/admin/insights/PreviewModal';
import type { StudioImage } from '@/components/admin/insights/ImageStudio';

/**
 * Yoca Admin — Insight editor.
 * Left: the article (Markdown body, meta, publishing, relations, SEO,
 * sources, FAQ, translations, revisions). Right: İçerik stüdyosu.
 * Manual authoring is the default; AI proposals are previews the editor
 * applies. Before any apply/restore the current text is stored as a revision
 * AND pushed on an in-page undo stack ("Geri al" restores it in one click).
 * Saving checks updated_at so a stale tab cannot silently overwrite newer
 * text; unsaved edits are also kept in this browser until saved.
 * Publishing and scheduling are separate explicit buttons (publish route).
 */

type RevisionRow = { id: string; created_at: string; reason: string | null; title: string; excerpt: string; body_md: string; kind?: string | null; created_by?: string | null };
const REVISION_KIND: Record<string, string> = { snapshot: 'Anlık görüntü', ai_proposal: 'AI önerisi', restore: 'Geri yükleme öncesi', autosave: 'Otomatik', publish: 'Yayın öncesi' };
const EDITABLE_STATUSES: Array<EditableInsight['status']> = ['DRAFT', 'IN_REVIEW', 'ARCHIVED'];
const localKey = (id: string) => `yoca-insight-unsaved:${id}`;

const SERVICES = ['brand-strategy-identity', 'web-digital-experiences', 'growth-performance', 'creative-production', 'ai-automation', 'digital-product-development'];
const PRODUCTS = ['yocaserve', 'wonkick', 'yocastudio', 'demo-hub', 'labs'];

interface Props {
  id: string; // 'new' or uuid
}

export default function InsightEditor({ id }: Props) {
  const supabase = getAdminClient();
  const router = useRouter();
  const [row, setRow] = useState<EditableInsight | null>(null);
  const [categories, setCategories] = useState<InsightCategoryRow[]>([]);
  const [siblings, setSiblings] = useState<Array<Pick<InsightRow, 'id' | 'locale' | 'title' | 'status'>>>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [images, setImages] = useState<StudioImage[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [restorable, setRestorable] = useState<EditableInsight | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [tab, setTab] = useState<'content' | 'publish' | 'seo' | 'extras'>('content');
  const [aiOpen, setAiOpen] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  type UndoEntry = { label: string; title: string; excerpt: string; body_md: string };
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const pushUndo = (label: string) => { if (row) setUndoStack((st) => [...st.slice(-19), { label, title: row.title, excerpt: row.excerpt, body_md: row.body_md }]); };
  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((st) => st.slice(0, -1));
    update({ title: last.title, excerpt: last.excerpt, body_md: last.body_md });
    flash(`Geri alındı: ${last.label} — kaydetmeyi unutmayın.`);
  };

  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(null), 3000); };
  const update = (patch: Partial<EditableInsight>) => { setRow((r) => (r ? { ...r, ...patch } : r)); setDirty(true); };

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: cats } = await supabase.from('insight_categories').select('key,names,sort_order').order('sort_order');
      setCategories((cats as InsightCategoryRow[]) ?? []);
      if (id === 'new') { setRow(emptyInsight('tr')); return; }
      const { data } = await supabase.from('insights').select('*').eq('id', id).single();
      if (!data) { setRow(emptyInsight('tr')); return; }
      const r = data as InsightRow;
      setRow(r);
      setLoadedUpdatedAt(r.updated_at);
      setSlugTouched(true);
      try {
        const stored = window.localStorage.getItem(localKey(r.id));
        if (stored) {
          const parsed = JSON.parse(stored) as { at: string; row: EditableInsight; base: string };
          if (parsed.base === r.updated_at && (parsed.row.body_md !== r.body_md || parsed.row.title !== r.title)) setRestorable(parsed.row);
          else window.localStorage.removeItem(localKey(r.id));
        }
      } catch { /* storage unavailable */ }
      const { data: sib } = await supabase.from('insights').select('id,locale,title,status').eq('group_id', r.group_id);
      setSiblings((sib as typeof siblings) ?? []);
      await loadRevisions(r.id);
      await loadImages(r.group_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadRevisions = async (insightId: string) => {
    if (!supabase) return;
    const withKind = await supabase.from('insight_revisions').select('id,created_at,reason,title,excerpt,body_md,kind,created_by').eq('insight_id', insightId).order('created_at', { ascending: false }).limit(30);
    if (!withKind.error) { setRevisions((withKind.data as RevisionRow[]) ?? []); return; }
    const legacy = await supabase.from('insight_revisions').select('id,created_at,reason,title,excerpt,body_md').eq('insight_id', insightId).order('created_at', { ascending: false }).limit(30);
    setRevisions((legacy.data as RevisionRow[]) ?? []);
  };

  const loadImages = async (groupId: string) => {
    const r = await adminFetch<{ images?: StudioImage[] }>(`/api/admin/insights/images?groupId=${groupId}`);
    if (r.ok) setImages(r.images ?? []);
  };

  // Keep unsaved edits in this browser (cleared on save) so a crash or a closed tab loses nothing.
  useEffect(() => {
    if (!dirty || !row?.id || !loadedUpdatedAt) return;
    const t = setTimeout(() => {
      try { window.localStorage.setItem(localKey(row.id as string), JSON.stringify({ at: new Date().toISOString(), row, base: loadedUpdatedAt })); } catch { /* quota / private mode */ }
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, row, loadedUpdatedAt]);

  // Warn before leaving with unsaved edits (incl. unsaved AI output).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const save = async (force = false): Promise<string | null> => {
    if (!supabase || !row) return null;
    if (!row.title.trim()) { flash('Başlık gerekli.'); return null; }
    if ((row.status === 'PUBLISHED' || row.status === 'SCHEDULED') && !force && !window.confirm('Bu içerik yayında ya da zamanlanmış. Kaydettiğiniz değişiklikler sitede de görünür. Devam edilsin mi?')) return null;
    setSaving(true);
    const payload = toPayload(row);
    let savedId = row.id ?? null;
    if (row.id) {
      let query = supabase.from('insights').update(payload).eq('id', row.id);
      if (loadedUpdatedAt && !force) query = query.eq('updated_at', loadedUpdatedAt);
      const { data: saved, error } = await query.select('updated_at');
      if (error) { flash(`Kaydedilemedi: ${error.message} — metniniz editörde duruyor.`); setSaving(false); return null; }
      if (!saved || saved.length === 0) {
        setSaving(false);
        if (window.confirm('Bu içerik siz açtıktan sonra başka bir yerde kaydedilmiş. Sizin metniniz üzerine yazılsın mı? (İptal: hiçbir şey kaydedilmez; sayfayı yenileyip karşılaştırın.)')) {
          await saveRevision(row.id, row, 'Çakışma: üzerine yazmadan önce sizin metniniz');
          return save(true);
        }
        return null;
      }
      setLoadedUpdatedAt((saved[0] as { updated_at: string }).updated_at);
      try { window.localStorage.removeItem(localKey(row.id)); } catch { /* ignore */ }
    } else {
      const { data, error } = await supabase.from('insights').insert(payload).select('id').single();
      if (error || !data) { flash(`Kaydedilemedi: ${error?.message ?? ''}`); setSaving(false); return null; }
      savedId = (data as { id: string }).id;
      setRow({ ...row, id: savedId ?? undefined, slug: payload.slug });
      router.replace(`/admin/insights/${savedId}`);
    }
    setSaving(false); setDirty(false); flash('Kaydedildi.');
    return savedId;
  };

  const snapshot = async (reason: string, kind: 'snapshot' | 'restore' = 'snapshot') => {
    if (row?.id) {
      await saveRevision(row.id, row, reason, kind);
      await loadRevisions(row.id);
    }
  };

  const applyDraft = async (draft: ArticleDraft, sources?: InsightSource[]) => {
    pushUndo('AI taslağı');
    await snapshot('AI taslak uygulanmadan önce');
    update({
      title: draft.title,
      slug: slugTouched && row?.slug ? row.slug : slugify(draft.title),
      excerpt: draft.excerpt,
      body_md: draft.body,
      seo_title: draft.seoTitle,
      meta_description: draft.metaDescription,
      tags: draft.suggestedTags,
      faq: draft.faq,
      category_key: row?.category_key ?? (draft.suggestedCategory || null),
      related_service: row?.related_service ?? (draft.suggestedService || null),
      cta_type: row?.cta_type === 'none' && draft.suggestedService ? 'service' : row?.cta_type ?? 'none',
      sources: sources && sources.length ? sources : row?.sources ?? [],
    });
    flash('AI taslağı editöre aktarıldı — önceki metin sürüm geçmişinde. Kaydetmeyi unutmayın.');
  };

  const replaceBody = async (text: string, reason: string) => {
    pushUndo('metin düzenlemesi');
    await snapshot(reason);
    update({ body_md: text });
    flash('Değişiklikler editöre uygulandı — kaydetmeyi unutmayın.');
  };

  const insertAtCursor = (markdown: string) => {
    if (!row) return;
    const el = bodyRef.current;
    const pos = el ? el.selectionEnd : row.body_md.length;
    const before = row.body_md.slice(0, pos);
    const after = row.body_md.slice(pos);
    update({ body_md: `${before}${before && !before.endsWith('\n\n') ? '\n\n' : ''}${markdown}\n\n${after.replace(/^\n+/, '')}` });
    setTab('content');
    flash('Görsel metne eklendi (taslak referansı; yayında herkese açık adrese çevrilir).');
  };

  const locate = (excerpt: string) => {
    const el = bodyRef.current;
    if (!el || !row) return;
    setTab('content');
    const idx = row.body_md.indexOf(excerpt.trim());
    if (idx < 0) { flash('Alıntı metinde bulunamadı.'); return; }
    setTimeout(() => { el.focus(); el.setSelectionRange(idx, idx + excerpt.trim().length); }, 50);
  };

  const publishAction = async (action: 'publish' | 'schedule' | 'unpublish') => {
    if (!row?.id) return;
    if (dirty) { flash('Önce kaydedin; yayın kaydedilmiş sürümle yapılır.'); return; }
    const verb = action === 'publish' ? 'şimdi yayınlansın' : action === 'schedule' ? `${scheduleAt.replace('T', ' ')} için zamanlansın` : 'yayından kaldırılsın (taslağa dönsün)';
    if (!window.confirm(`Bu içerik ${verb} mı?`)) return;
    setPublishing(true);
    const r = await adminFetch<{ insight?: { status: EditableInsight['status']; publish_at: string; updated_at: string }; promoted?: number }>('/api/admin/insights/publish', {
      json: { insightId: row.id, action, publishAt: action === 'schedule' ? localInputToIso(scheduleAt) : undefined, expectedUpdatedAt: loadedUpdatedAt },
    });
    setPublishing(false);
    if (!r.ok) { flash(r.error ?? 'İşlem başarısız.'); return; }
    if (supabase) {
      const { data } = await supabase.from('insights').select('*').eq('id', row.id).single();
      if (data) { setRow(data as InsightRow); setLoadedUpdatedAt((data as InsightRow).updated_at); setDirty(false); }
    }
    await loadImages(row.group_id);
    await loadRevisions(row.id);
    flash(action === 'publish' ? 'Yayınlandı.' : action === 'schedule' ? 'Zamanlandı.' : 'Taslağa alındı.');
  };

  const replaceSelection = async (text: string) => {
    const el = bodyRef.current;
    if (!el || !row) return;
    // The selection the AI saw must still be in place; otherwise find it, or refuse.
    let start = el.selectionStart, end = el.selectionEnd;
    if (!selection || row.body_md.slice(start, end) !== selection) {
      const idx = selection ? row.body_md.indexOf(selection) : -1;
      if (idx < 0) { flash('Seçili metin bu arada değişti; öneri uygulanmadı.'); return; }
      start = idx; end = idx + selection.length;
    }
    pushUndo('bölüm yeniden yazımı');
    await snapshot('AI yeniden yazma öncesi');
    const next = row.body_md.slice(0, start) + text + row.body_md.slice(end);
    update({ body_md: next });
    setSelection('');
  };

  const createTranslation = async (to: Locale, tr: Translation) => {
    if (!supabase || !row?.id) return;
    const base = emptyInsight(to, row.group_id);
    const payload = toPayload({
      ...base,
      title: tr.title, excerpt: tr.excerpt, body_md: tr.body, slug: slugify(tr.slug || tr.title),
      seo_title: tr.seoTitle, meta_description: tr.metaDescription,
      category_key: row.category_key, tags: row.tags, author_name: row.author_name, author_role: row.author_role,
      related_service: row.related_service, related_product: row.related_product, cta_type: row.cta_type,
      cover_url: row.cover_url, cover_alt: row.cover_alt, sources: row.sources, faq: [],
      status: 'DRAFT',
    });
    const { data, error } = await supabase.from('insights').insert(payload).select('id').single();
    if (error || !data) { flash(`Çeviri oluşturulamadı: ${error?.message ?? ''}`); return; }
    flash(`Çeviri taslağı oluşturuldu (${to.toUpperCase()}).`);
    router.push(`/admin/insights/${(data as { id: string }).id}`);
  };

  const restore = async (rev: RevisionRow) => {
    if (!window.confirm('Bu sürüm editöre geri yüklensin mi? Mevcut metin önce sürüm geçmişine kaydedilir.')) return;
    pushUndo('sürüm geri yükleme');
    await snapshot('Geri yükleme öncesi', 'restore');
    update({ title: rev.title, excerpt: rev.excerpt, body_md: rev.body_md });
    flash('Sürüm geri yüklendi — kaydedin.');
  };

  if (!row) return <p className="text-[14px] text-muted">Yükleniyor…</p>;

  const selectedCover = images.find((i) => i.selected) ?? null;
  const imageUrls = Object.fromEntries(images.filter((i) => i.url).map((i) => [i.id, i.url as string]));

  const field = 'admin-input';
  const label = 'grid gap-1.5 text-[13px] font-semibold text-muted';
  const words = row.body_md.trim() ? row.body_md.trim().split(/\s+/).length : 0;

  return (
    <div className="grid gap-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">İçerik / Insights · {STATUS_LABELS[row.status]} · {row.locale.toUpperCase()}</p>
          <p className="truncate text-[12px] text-muted">yoca.net/{row.locale}/insights/{slugify(row.slug || row.title) || '…'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {undoStack.length > 0 && <button type="button" onClick={undo} className="admin-btn" title={`Son uygulanan değişikliği geri al (${undoStack[undoStack.length - 1].label})`}>Geri al</button>}
          <button type="button" onClick={() => setPreviewOpen(true)} className="admin-btn">Önizle</button>
          <button type="button" onClick={() => setAiOpen((v) => !v)} className="admin-btn lg:hidden">{aiOpen ? 'Stüdyoyu gizle' : 'İçerik stüdyosu'}</button>
          <button type="button" onClick={() => save()} disabled={saving} className="admin-btn-primary">{saving ? 'Kaydediliyor…' : dirty ? 'Kaydet •' : 'Kaydet'}</button>
        </div>
      </div>
      {message && <p role="status" className="rounded-sm border border-yoca-green/40 bg-yoca-green/10 px-4 py-2 text-[13px] text-yoca-green">{message}</p>}
      {restorable && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-yellow-400/40 bg-yellow-400/10 px-4 py-2 text-[13px] text-yellow-200">
          Bu tarayıcıda kaydedilmemiş bir sürüm bulundu.
          <button type="button" className="admin-btn !px-2 !py-0.5 !text-[12px]" onClick={() => { setRow(restorable); setDirty(true); setRestorable(null); }}>Geri getir</button>
          <button type="button" className="admin-btn !px-2 !py-0.5 !text-[12px]" onClick={() => { try { window.localStorage.removeItem(localKey(row.id as string)); } catch { /* ignore */ } setRestorable(null); }}>Sil</button>
        </div>
      )}
      {previewOpen && (
        <PreviewModal title={row.title} excerpt={row.excerpt} body={row.body_md} locale={row.locale} coverUrl={selectedCover?.url ?? row.cover_url} coverAlt={selectedCover?.alt_text ?? row.cover_alt ?? ''} imageUrls={imageUrls} onClose={() => setPreviewOpen(false)} />
      )}

      <div className={`grid gap-5 ${aiOpen ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]' : ''}`}>
        {/* ── Editor ─────────────────────────────────────────── */}
        <div className="grid content-start gap-4">
          <div className="flex flex-wrap gap-1">
            {([['content', 'İçerik'], ['publish', 'Yayın'], ['seo', 'SEO'], ['extras', 'Kaynaklar · FAQ · Sürümler']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-1.5 text-[12px] font-bold ${tab === k ? 'bg-yoca-lime text-black' : 'border border-line text-muted hover:text-white'}`}>{l}</button>
            ))}
          </div>

          {tab === 'content' && (
            <div className="admin-card grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <label className={label}>Başlık<input value={row.title} onChange={(e) => { update({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) }); }} className={`${field} !text-[18px] !font-bold`} /></label>
                <label className={label}>Dil<select value={row.locale} onChange={(e) => update({ locale: e.target.value as Locale })} className={field}>{INSIGHT_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
              </div>
              <label className={label}>Slug (URL)<input value={row.slug} onChange={(e) => { setSlugTouched(true); update({ slug: e.target.value }); }} onBlur={() => update({ slug: slugify(row.slug || row.title) })} className={field} /></label>
              <label className={label}>Özet (giriş)<textarea value={row.excerpt} onChange={(e) => update({ excerpt: e.target.value })} rows={2} className={field} /></label>
              <label className={label}>
                <span className="flex items-center justify-between"><span>Gövde (Markdown: ## başlık, ### alt başlık, listeler, **kalın**, *italik*, &gt; alıntı, [bağlantı](url), ![alt](görsel) *başlık*, ---)</span><span className="text-[11px] text-subtle">{words} kelime · ~{readingMinutes(row.body_md)} dk</span></span>
                <textarea
                  ref={bodyRef}
                  value={row.body_md}
                  onChange={(e) => update({ body_md: e.target.value })}
                  onSelect={(e) => { const el = e.currentTarget; setSelection(el.value.slice(el.selectionStart, el.selectionEnd)); }}
                  rows={26}
                  dir={row.locale === 'ar' ? 'rtl' : 'ltr'}
                  className={`${field} min-h-[520px] font-mono !text-[13px] leading-relaxed`}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>Kategori<select value={row.category_key ?? ''} onChange={(e) => update({ category_key: e.target.value || null })} className={field}><option value="">—</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.names.tr ?? c.names.en}</option>)}</select></label>
                <label className={label}>Etiketler (virgül)<input value={row.tags.join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className={field} /></label>
                <label className={label}>Yazar<input value={row.author_name} onChange={(e) => update({ author_name: e.target.value })} className={field} /></label>
                <label className={label}>Yazar unvanı<input value={row.author_role ?? ''} onChange={(e) => update({ author_role: e.target.value || null })} className={field} /></label>
              </div>
              <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <p className="text-[13px] font-semibold text-muted">Kapak görseli (isteğe bağlı)</p>
                  {selectedCover?.url ? (
                    <img src={selectedCover.url} alt={selectedCover.alt_text} className="mt-2 aspect-[16/10] w-full object-cover" />
                  ) : row.cover_url ? (
                    <img src={row.cover_url} alt={row.cover_alt ?? ''} className="mt-2 aspect-[16/10] w-full object-cover" />
                  ) : (
                    <p className="mt-2 grid aspect-[16/10] place-items-center border border-dashed border-line text-[12px] text-subtle">Yok</p>
                  )}
                  <p className="mt-1 text-[11px] text-subtle">{selectedCover ? (selectedCover.public_url ? 'Seçili kapak · yayında' : 'Seçili kapak · taslak (yayında kopyalanır)') : 'Kapak yüklemek/üretmek için stüdyoda “Görsel” adımı.'}</p>
                  {row.cover_url && <button type="button" onClick={() => update({ cover_url: null })} className="admin-btn mt-2 !px-2.5 !py-1 !text-[12px]">Yayındaki kapak adresini kaldır</button>}
                </div>
                <div className="grid gap-3">
                  <label className={label}>Görsel URL (alternatif)<input value={row.cover_url ?? ''} onChange={(e) => update({ cover_url: e.target.value || null })} className={field} /></label>
                  <label className={label}>Alt metin<input value={row.cover_alt ?? ''} onChange={(e) => update({ cover_alt: e.target.value || null })} className={field} /></label>
                  <label className={label}>Görsel açıklaması<input value={row.cover_caption ?? ''} onChange={(e) => update({ cover_caption: e.target.value || null })} className={field} /></label>
                </div>
              </div>
            </div>
          )}

          {tab === 'publish' && (
            <div className="admin-card grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>Çalışma durumu
                  {EDITABLE_STATUSES.includes(row.status) ? (
                    <select value={row.status} onChange={(e) => update({ status: e.target.value as EditableInsight['status'] })} className={field}>{EDITABLE_STATUSES.map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}</select>
                  ) : (
                    <span className={`${field} !text-yoca-green`}>{STATUS_LABELS[row.status]}{row.publish_at ? ` · ${new Date(row.publish_at).toLocaleString('tr-TR')}` : ''}</span>
                  )}
                </label>
                <label className="flex items-center gap-2 self-end text-[13px] font-semibold text-muted"><input type="checkbox" checked={row.featured} onChange={(e) => update({ featured: e.target.checked })} /> Öne çıkan</label>
              </div>
              <div className="grid gap-3 border-t border-line pt-4">
                <p className="text-[13px] font-semibold text-muted">Yayın (ayrı ve açık işlemler)</p>
                {!row.id ? <p className="text-[12px] text-yellow-300">Önce kaydedin.</p> : (
                  <div className="flex flex-wrap items-end gap-2">
                    <button type="button" className="admin-btn-primary" disabled={publishing || dirty || row.status === 'PUBLISHED'} onClick={() => publishAction('publish')}>Şimdi yayınla</button>
                    <label className={label}>Zamanla (yerel saat)<input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className={field} /></label>
                    <button type="button" className="admin-btn" disabled={publishing || dirty || !scheduleAt} onClick={() => publishAction('schedule')}>Zamanla</button>
                    {(row.status === 'PUBLISHED' || row.status === 'SCHEDULED') && <button type="button" className="admin-btn" disabled={publishing || dirty} onClick={() => publishAction('unpublish')}>Yayından kaldır</button>}
                  </div>
                )}
                <p className="text-[12px] text-subtle">Yayın kaydedilmiş sürümle yapılır; kullanılan taslak görseller o anda herkese açık depoya kopyalanır. Metinde [KAYNAK GEREKLİ] kaldıysa yayın engellenir. Zamanlanmış içerik saatinden önce görünmez. Yapay zekâ işlemleri hiçbir zaman yayınlamaz.</p>
                {row.publish_at && <p className="text-[12px] text-subtle">Kayıtlı yayın zamanı: {new Date(row.publish_at).toLocaleString('tr-TR')} ({isoToLocalInput(row.publish_at)})</p>}
              </div>
              <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
                <label className={label}>İlgili hizmet<select value={row.related_service ?? ''} onChange={(e) => update({ related_service: e.target.value || null })} className={field}><option value="">—</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className={label}>İlgili ürün<select value={row.related_product ?? ''} onChange={(e) => update({ related_product: e.target.value || null })} className={field}><option value="">—</option>{PRODUCTS.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className={label}>CTA<select value={row.cta_type} onChange={(e) => update({ cta_type: e.target.value as EditableInsight['cta_type'] })} className={field}><option value="none">Yok</option><option value="contact">İletişim</option><option value="checkup">Dijital Check-Up</option><option value="service">İlgili hizmet</option><option value="product">İlgili ürün</option></select></label>
              </div>
              <div className="border-t border-line pt-4">
                <p className="text-[13px] font-semibold text-muted">Çeviriler (aynı grup)</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                  {INSIGHT_LOCALES.map((l) => {
                    const s = siblings.find((x) => x.locale === l.code) ?? (l.code === row.locale && row.id ? { id: row.id, locale: row.locale, title: row.title, status: row.status } : null);
                    return s ? (
                      <a key={l.code} href={`/admin/insights/${s.id}`} className="border border-yoca-green/50 px-2.5 py-1 font-bold text-yoca-green">{l.code.toUpperCase()} ✓ · {STATUS_LABELS[s.status]}</a>
                    ) : (
                      <span key={l.code} className="border border-line px-2.5 py-1 text-subtle">{l.code.toUpperCase()} —</span>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-subtle">Yeni çeviri için AI panelindeki “Çevir” sekmesini kullanın; çeviri taslak olarak açılır.</p>
              </div>
            </div>
          )}

          {tab === 'seo' && (
            <div className="admin-card grid gap-3">
              <label className={label}>SEO başlığı <span className="text-subtle">({(row.seo_title ?? '').length}/60)</span><input value={row.seo_title ?? ''} onChange={(e) => update({ seo_title: e.target.value || null })} className={field} /></label>
              <label className={label}>Meta açıklama <span className="text-subtle">({(row.meta_description ?? '').length}/155)</span><textarea value={row.meta_description ?? ''} onChange={(e) => update({ meta_description: e.target.value || null })} rows={2} className={field} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>OG başlığı<input value={row.og_title ?? ''} onChange={(e) => update({ og_title: e.target.value || null })} className={field} /></label>
                <label className={label}>OG görseli (URL)<input value={row.og_image ?? ''} onChange={(e) => update({ og_image: e.target.value || null })} className={field} /></label>
                <label className={`${label} sm:col-span-2`}>OG açıklaması<textarea value={row.og_description ?? ''} onChange={(e) => update({ og_description: e.target.value || null })} rows={2} className={field} /></label>
                <label className={label}>Canonical (override)<input value={row.canonical_override ?? ''} onChange={(e) => update({ canonical_override: e.target.value || null })} className={field} /></label>
                <label className="flex items-center gap-2 self-end text-[13px] font-semibold text-muted"><input type="checkbox" checked={row.noindex} onChange={(e) => update({ noindex: e.target.checked })} /> noindex (yalnızca gerçekten gerekiyorsa)</label>
              </div>
            </div>
          )}

          {tab === 'extras' && (
            <div className="grid gap-4">
              <div className="admin-card grid gap-3">
                <p className="text-[13px] font-semibold text-muted">Kaynaklar ({row.sources.length})</p>
                {row.sources.length === 0 && <p className="text-[12px] text-subtle">Kaynak yok. Taslak, sunucunun gerçekten okuduğu adreslerle oluşturulduysa bu liste kendiliğinden dolar; elle de ekleyebilirsiniz (elle eklenen adres “okundu” sayılmaz).</p>}
                <ul className="grid gap-2">
                  {row.sources.map((s, i) => (
                    <li key={s.url + i} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-yoca-lime hover:underline">{s.title || s.domain}</a>
                      <span className="text-subtle">— {s.domain}</span>
                      <button type="button" onClick={() => update({ sources: row.sources.filter((_, j) => j !== i) })} className="admin-btn !px-2 !py-0.5 !text-[11px]">Kaldır</button>
                    </li>
                  ))}
                </ul>
                <SourceAdder onAdd={(s) => update({ sources: [...row.sources, s] })} />
              </div>
              <div className="admin-card grid gap-3">
                <p className="text-[13px] font-semibold text-muted">FAQ ({row.faq.length}) — isteğe bağlı</p>
                {row.faq.map((f, i) => (
                  <div key={i} className="grid gap-2 border-t border-line pt-3">
                    <input value={f.q} onChange={(e) => update({ faq: row.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} className={field} placeholder="Soru" />
                    <textarea value={f.a} onChange={(e) => update({ faq: row.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} rows={2} className={field} placeholder="Yanıt" />
                    <button type="button" onClick={() => update({ faq: row.faq.filter((_, j) => j !== i) })} className="admin-btn w-fit !px-2 !py-0.5 !text-[11px]">Kaldır</button>
                  </div>
                ))}
                <button type="button" onClick={() => update({ faq: [...row.faq, { q: '', a: '' }] })} className="admin-btn w-fit">+ Soru ekle</button>
              </div>
              <div className="admin-card grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-muted">Sürüm geçmişi (son 30)</p>
                  {row.id && <button type="button" className="admin-btn !px-2 !py-0.5 !text-[11px]" onClick={() => snapshot('Elle alınan sürüm')}>Şimdiki metni sürüm olarak sakla</button>}
                </div>
                {revisions.length === 0 ? <p className="text-[12px] text-subtle">Henüz sürüm yok. AI önerileri, uygulama ve geri yükleme öncesinde otomatik alınır.</p> : (
                  <ul className="grid gap-1 text-[13px]">
                    {revisions.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
                        <span><span className="text-white">{new Date(r.created_at).toLocaleString('tr-TR')}</span> <span className="text-subtle">· {REVISION_KIND[r.kind ?? 'snapshot'] ?? r.kind} · {r.reason ?? '—'} · {r.title}{r.created_by ? ` · ${r.created_by}` : ''}</span></span>
                        <button type="button" onClick={() => restore(r)} className="admin-btn !px-2 !py-0.5 !text-[11px]">Geri yükle</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── AI Assistant ───────────────────────────────────── */}
        {aiOpen && (
          <div className="lg:sticky lg:top-6 lg:self-start">
            <StudioPanel
              article={row}
              selection={selection}
              images={images}
              reloadImages={() => loadImages(row.group_id)}
              onApplyDraft={applyDraft}
              onReplaceSelection={replaceSelection}
              onReplaceBody={replaceBody}
              onApplySeo={(seo) => update(seo)}
              onApplyFaq={(faq) => update({ faq })}
              onCreateTranslation={createTranslation}
              onSetTitle={(title) => update({ title, ...(slugTouched ? {} : { slug: slugify(title) }) })}
              onInsertImage={insertAtCursor}
              onOpenPreview={() => setPreviewOpen(true)}
              onSetLocale={(locale) => update({ locale })}
              onMarkInReview={() => { if (EDITABLE_STATUSES.includes(row.status)) { update({ status: 'IN_REVIEW' }); flash('Durum: İncelemede — kaydedin.'); } }}
              onGoPublish={() => setTab('publish')}
              onLocate={locate}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SourceAdder({ onAdd }: { onAdd: (s: InsightSource) => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[12px] font-semibold text-muted">Başlık<input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input !w-[220px]" /></label>
      <label className="grid gap-1 text-[12px] font-semibold text-muted">URL<input value={url} onChange={(e) => setUrl(e.target.value)} className="admin-input !w-[280px]" placeholder="https://" /></label>
      <button
        type="button"
        onClick={() => {
          try {
            const u = new URL(url);
            if (!/^https?:$/.test(u.protocol)) return;
            onAdd({ title: title || u.hostname, url: u.toString(), domain: u.hostname.replace(/^www\./, ''), accessed_at: new Date().toISOString(), source_type: 'manual' });
            setUrl(''); setTitle('');
          } catch { /* invalid url — ignore */ }
        }}
        className="admin-btn"
      >
        + Kaynak ekle
      </button>
    </div>
  );
}
