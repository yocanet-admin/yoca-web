'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminClient } from '@/lib/adminClient';
import {
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
import AiPanel from '@/components/admin/insights/AiPanel';

/**
 * Yoca Admin — Insight editor.
 * Left: the article (Markdown body, meta, publishing, relations, SEO,
 * sources, FAQ, translations, revisions). Right: AI Assistant panel.
 * Manual authoring is the default; AI proposals are previews the editor
 * applies. Before an AI rewrite/apply we snapshot a revision.
 */

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
  const [revisions, setRevisions] = useState<Array<{ id: string; created_at: string; reason: string | null; title: string; excerpt: string; body_md: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [tab, setTab] = useState<'content' | 'publish' | 'seo' | 'extras'>('content');
  const [aiOpen, setAiOpen] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [slugTouched, setSlugTouched] = useState(false);

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
      setSlugTouched(true);
      const [{ data: sib }, { data: rev }] = await Promise.all([
        supabase.from('insights').select('id,locale,title,status').eq('group_id', r.group_id),
        supabase.from('insight_revisions').select('id,created_at,reason,title,excerpt,body_md').eq('insight_id', r.id).order('created_at', { ascending: false }).limit(10),
      ]);
      setSiblings((sib as typeof siblings) ?? []);
      setRevisions((rev as typeof revisions) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Warn before leaving with unsaved edits (incl. unsaved AI output).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const save = async (): Promise<string | null> => {
    if (!supabase || !row) return null;
    if (!row.title.trim()) { flash('Başlık gerekli.'); return null; }
    setSaving(true);
    const payload = toPayload(row);
    let savedId = row.id ?? null;
    if (row.id) {
      const { error } = await supabase.from('insights').update(payload).eq('id', row.id);
      if (error) { flash(`Kaydedilemedi: ${error.message}`); setSaving(false); return null; }
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

  const snapshot = async (reason: string) => { if (row?.id) await saveRevision(row.id, row, reason); };

  const applyDraft = async (draft: ArticleDraft, sources?: InsightSource[]) => {
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
      status: 'DRAFT',
    });
    flash('AI taslağı editöre aktarıldı — kaydetmeyi unutmayın. Durum: Taslak.');
  };

  const replaceSelection = async (text: string) => {
    const el = bodyRef.current;
    if (!el || !row) return;
    await snapshot('AI yeniden yazma öncesi');
    const start = el.selectionStart, end = el.selectionEnd;
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

  const uploadCover = async (file: File) => {
    if (!supabase || !row) return;
    if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024) { flash('Görsel 6 MB altında ve resim olmalı.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${row.group_id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('insights').upload(path, file, { upsert: false, contentType: file.type });
    if (error) { flash(`Yükleme başarısız: ${error.message}`); return; }
    const { data } = supabase.storage.from('insights').getPublicUrl(path);
    update({ cover_url: data.publicUrl });
  };

  const restore = async (rev: (typeof revisions)[number]) => {
    if (!window.confirm('Bu sürüm geri yüklensin mi? Mevcut metin bir revizyon olarak saklanır.')) return;
    await snapshot('Geri yükleme öncesi');
    update({ title: rev.title, excerpt: rev.excerpt, body_md: rev.body_md });
    flash('Sürüm geri yüklendi — kaydedin.');
  };

  // Preview URL: the secret is typed by the editor at click time (never bundled).
  const previewUrl = () => (row?.id ? `/${row.locale}/insights/${slugify(row.slug || row.title)}?preview=${row.id}&token=` : null);

  if (!row) return <p className="text-[14px] text-muted">Yükleniyor…</p>;

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
          {row.id && (
            <button type="button" onClick={() => { const url = previewUrl(); if (url) window.open(url + (window.prompt('Önizleme anahtarı (INSIGHTS_PREVIEW_SECRET)') ?? ''), '_blank'); }} className="admin-btn">Önizle</button>
          )}
          <button type="button" onClick={() => setAiOpen((v) => !v)} className="admin-btn lg:hidden">{aiOpen ? 'AI panelini gizle' : 'AI Asistan'}</button>
          <button type="button" onClick={save} disabled={saving} className="admin-btn-primary">{saving ? 'Kaydediliyor…' : dirty ? 'Kaydet •' : 'Kaydet'}</button>
        </div>
      </div>
      {message && <p className="rounded-sm border border-yoca-green/40 bg-yoca-green/10 px-4 py-2 text-[13px] text-yoca-green">{message}</p>}

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
                  {row.cover_url ? <img src={row.cover_url} alt={row.cover_alt ?? ''} className="mt-2 aspect-[16/10] w-full object-cover" /> : <p className="mt-2 grid aspect-[16/10] place-items-center border border-dashed border-line text-[12px] text-subtle">Yok</p>}
                  <div className="mt-2 flex gap-2">
                    <label className="admin-btn cursor-pointer !px-2.5 !py-1 !text-[12px]">Yükle<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} /></label>
                    {row.cover_url && <button type="button" onClick={() => update({ cover_url: null })} className="admin-btn !px-2.5 !py-1 !text-[12px]">Kaldır</button>}
                  </div>
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
                <label className={label}>Durum<select value={row.status} onChange={(e) => update({ status: e.target.value as EditableInsight['status'] })} className={field}>{(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}</select></label>
                <label className={label}>Yayın tarihi / saati (yerel)<input type="datetime-local" value={isoToLocalInput(row.publish_at)} onChange={(e) => update({ publish_at: localInputToIso(e.target.value) })} className={field} /></label>
                <label className="flex items-center gap-2 self-end text-[13px] font-semibold text-muted"><input type="checkbox" checked={row.featured} onChange={(e) => update({ featured: e.target.checked })} /> Öne çıkan</label>
              </div>
              <p className="text-[12px] text-subtle">Zamanlanmış içerik yayın saatinden önce herkese açık görünmez (veritabanı seviyesinde). Yapay zekâ üretimleri her zaman Taslak olarak gelir.</p>
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
                {row.sources.length === 0 && <p className="text-[12px] text-subtle">Kaynak yok. Araştırmalı taslaklarda otomatik dolar; elle de ekleyebilirsiniz.</p>}
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
                <p className="text-[13px] font-semibold text-muted">Sürümler (son 10)</p>
                {revisions.length === 0 ? <p className="text-[12px] text-subtle">Henüz sürüm yok. AI yeniden yazma ve taslak aktarma öncesinde otomatik alınır.</p> : (
                  <ul className="grid gap-1 text-[13px]">
                    {revisions.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
                        <span><span className="text-white">{new Date(r.created_at).toLocaleString('tr-TR')}</span> <span className="text-subtle">· {r.reason ?? '—'} · {r.title}</span></span>
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
            <AiPanel
              article={row}
              selection={selection}
              onApplyDraft={applyDraft}
              onReplaceSelection={replaceSelection}
              onApplySeo={(seo) => update(seo)}
              onApplyFaq={(faq) => update({ faq })}
              onCreateTranslation={createTranslation}
              onSetTitle={(title) => update({ title, ...(slugTouched ? {} : { slug: slugify(title) }) })}
              onSetCover={(url, alt) => update({ cover_url: url, cover_alt: alt })}
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
