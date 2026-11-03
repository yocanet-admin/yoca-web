'use client';

import { useState } from 'react';
import { callAi, INSIGHT_LOCALES, type EditableInsight } from '@/lib/insightsAdmin';
import type { ArticleDirection, ArticleDraft, EditorialReview, SeoPack, Translation } from '@/lib/ai/schemas';
import type { InsightSource, Locale } from '@/types';

/**
 * Yoca Admin — AI Assistant panel (beside the editor, drawer on small screens).
 * Primary: Taslak Oluştur (2-step: yön → makale, or Doğrudan Taslak) · Metni
 * İyileştir (selection actions) · SEO · Araştır · Çevir. Secondary grouped:
 * Editör Kontrolü, FAQ, İçeriği Dönüştür, Konu Öner, Brief. Every result is
 * a preview the editor applies explicitly — nothing overwrites silently, and
 * nothing is published.
 */

interface AiPanelProps {
  article: EditableInsight;
  selection: string;
  onApplyDraft: (draft: ArticleDraft, sources?: InsightSource[]) => void;
  onReplaceSelection: (text: string) => void;
  onApplySeo: (seo: Partial<Pick<EditableInsight, 'seo_title' | 'meta_description'>>) => void;
  onApplyFaq: (faq: Array<{ q: string; a: string }>) => void;
  onCreateTranslation: (to: Locale, tr: Translation) => void;
  onSetTitle: (title: string) => void;
  onSetCover: (url: string, alt: string) => void;
}

type DraftResult = ArticleDraft & { polishChanges?: string[] };
type CoverResult = { url: string; alt: string; subject: string };

type Busy = null | 'direction' | 'draft' | 'research' | 'rewrite' | 'review' | 'seo' | 'faq' | 'translate' | 'repurpose' | 'topics' | 'brief' | 'cover';
type Tab = 'draft' | 'improve' | 'cover' | 'seo' | 'research' | 'translate' | 'more';

const OBJECTIVES = ['Thought Leadership', 'SEO', 'Educational', 'Lead Generation', 'Product Insight', 'Industry Perspective'];
const AUDIENCES = ['Founder', 'Marketing Director', 'Brand Manager', 'Product Team', 'Growth Team', 'General Business Audience'];
const SERVICES = ['brand-strategy-identity', 'web-digital-experiences', 'growth-performance', 'creative-production', 'ai-automation', 'digital-product-development'];
const PRODUCTS = ['yocaserve', 'wonkick', 'yocastudio', 'demo-hub', 'labs'];
const INLINE: Array<{ key: string; label: string }> = [
  { key: 'house-style', label: 'Yapay dili temizle' },
  { key: 'rewrite', label: 'Yeniden yaz' }, { key: 'shorter', label: 'Daha kısa' }, { key: 'natural', label: 'Daha doğal' },
  { key: 'clearer', label: 'Daha net' }, { key: 'technical', label: 'Daha teknik' }, { key: 'editorial', label: 'Daha editoryal' },
  { key: 'yoca-tone', label: 'Yoca tonuna getir' }, { key: 'strengthen-intro', label: 'Girişi güçlendir' },
  { key: 'add-example', label: 'Örnek ekle' }, { key: 'remove-repetition', label: 'Tekrarları kaldır' }, { key: 'section-rewrite', label: 'Bu bölümü yeniden yaz' },
];

export default function AiPanel(props: AiPanelProps) {
  const { article, selection } = props;
  const [tab, setTab] = useState<Tab>('draft');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // Brief form
  const [topic, setTopic] = useState('');
  const [objective, setObjective] = useState(OBJECTIVES[0]);
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [mainKeyword, setMainKeyword] = useState('');
  const [supporting, setSupporting] = useState('');
  const [relatedService, setRelatedService] = useState(article.related_service ?? '');
  const [relatedProduct, setRelatedProduct] = useState(article.related_product ?? '');
  const [depth, setDepth] = useState<'short' | 'standard' | 'deep'>('standard');
  const [tone, setTone] = useState('default');
  const [researchMode, setResearchMode] = useState(false);
  const [direction, setDirection] = useState<ArticleDirection | null>(null);
  const [chosenTitle, setChosenTitle] = useState('');
  const [research, setResearch] = useState<{ digest: string; sources: InsightSource[] } | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [cover, setCover] = useState<CoverResult | null>(null);
  const [withCover, setWithCover] = useState(true);

  // Improve
  const [rewritePreview, setRewritePreview] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  // Results
  const [review, setReview] = useState<EditorialReview | null>(null);
  const [seo, setSeo] = useState<SeoPack | null>(null);
  const [faq, setFaq] = useState<Array<{ q: string; a: string }> | null>(null);
  const [translateTo, setTranslateTo] = useState<Locale>('en');
  const [repurposed, setRepurposed] = useState<{ platform: string; output: string } | null>(null);
  const [topics, setTopics] = useState<Array<{ title: string; angle: string; keyword: string; why: string }> | null>(null);
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null);

  const run = async <T,>(kind: Busy, payload: Record<string, unknown>): Promise<T | null> => {
    setBusy(kind);
    setError(null);
    try {
      return await callAi<T>({ ...payload, locale: article.locale, insightId: article.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI isteği başarısız oldu.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const briefPayload = () => ({
    topic, objective, audience, mainKeyword,
    supportingKeywords: supporting.split(',').map((s) => s.trim()).filter(Boolean),
    relatedService: relatedService || undefined, relatedProduct: relatedProduct || undefined,
    depth, tone, research: research?.digest,
  });

  const doResearch = async () => {
    const r = await run<{ digest: string; sources: InsightSource[] }>('research', { action: 'research', topic, keywords: [mainKeyword, ...supporting.split(',')].map((s) => s.trim()).filter(Boolean) });
    if (r) setResearch(r);
    return r;
  };
  const doDirection = async () => {
    if (researchMode && !research) { const r = await doResearch(); if (!r) return; }
    const d = await run<ArticleDirection>('direction', { action: 'direction', ...briefPayload(), research: research?.digest });
    if (d) { setDirection(d); setChosenTitle(d.titles[0] ?? ''); }
  };
  const doDraft = async (direct = false) => {
    if (researchMode && !research) { const r = await doResearch(); if (!r) return; }
    const d = await run<DraftResult>('draft', { action: 'draft', ...briefPayload(), research: research?.digest, direction: direct ? undefined : direction ? { ...direction, chosenTitle } : undefined });
    if (d) {
      setDraft(d);
      if (withCover) await doCover(d.title, d.excerpt);
    }
  };
  const doCover = async (title = article.title, excerpt = article.excerpt) => {
    const c = await run<CoverResult>('cover', { action: 'cover', title, excerpt, groupId: article.group_id });
    if (c) setCover(c);
  };

  const busyLabel: Record<Exclude<Busy, null>, string> = {
    direction: 'Yön hazırlanıyor…', draft: 'Taslak hazırlanıyor…', research: 'Araştırma yapılıyor…', rewrite: 'Metin yeniden yazılıyor…',
    review: 'Editör kontrolü yapılıyor…', seo: 'SEO alanları hazırlanıyor…', faq: 'FAQ üretiliyor…', translate: 'Çeviri hazırlanıyor…',
    repurpose: 'İçerik dönüştürülüyor…', topics: 'Konular öneriliyor…', brief: 'Brief hazırlanıyor…', cover: 'Kapak görseli üretiliyor (1 dk kadar)…',
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'draft', label: 'Taslak Oluştur' }, { key: 'improve', label: 'Metni İyileştir' }, { key: 'cover', label: 'Kapak' }, { key: 'seo', label: 'SEO' },
    { key: 'research', label: 'Araştır' }, { key: 'translate', label: 'Çevir' }, { key: 'more', label: 'Diğer' },
  ];

  const field = 'admin-input !text-[13px]';
  const label = 'grid gap-1 text-[12px] font-semibold text-muted';

  return (
    <aside className="admin-card grid content-start gap-4 !p-4" aria-label="AI Asistan">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em]">AI Asistan</h2>
        <span className="text-[11px] text-subtle">Yalnızca taslak üretir · yayınlamaz</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`px-2.5 py-1 text-[12px] font-bold ${tab === t.key ? 'bg-yoca-lime text-black' : 'border border-line text-muted hover:text-white'}`}>{t.label}</button>
        ))}
      </div>
      {busy && <p className="rounded-sm border border-yoca-lime/40 bg-yoca-lime/10 px-3 py-2 text-[12px] text-yoca-lime">{busyLabel[busy]}</p>}
      {error && <p className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}

      {/* ── Taslak Oluştur ─────────────────────────────────────── */}
      {tab === 'draft' && (
        <div className="grid gap-3">
          <label className={label}>Konu<textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} className={field} placeholder="Ör. Marka sistemi neden tek kampanyadan daha uzun yaşar" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Amaç<select value={objective} onChange={(e) => setObjective(e.target.value)} className={field}>{OBJECTIVES.map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className={label}>Hedef kitle<input list="ai-audiences" value={audience} onChange={(e) => setAudience(e.target.value)} className={field} /><datalist id="ai-audiences">{AUDIENCES.map((a) => <option key={a} value={a} />)}</datalist></label>
            <label className={label}>Ana anahtar kelime<input value={mainKeyword} onChange={(e) => setMainKeyword(e.target.value)} className={field} /></label>
            <label className={label}>Destek kelimeler (virgül)<input value={supporting} onChange={(e) => setSupporting(e.target.value)} className={field} /></label>
            <label className={label}>İlgili hizmet<select value={relatedService} onChange={(e) => setRelatedService(e.target.value)} className={field}><option value="">—</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className={label}>İlgili ürün<select value={relatedProduct} onChange={(e) => setRelatedProduct(e.target.value)} className={field}><option value="">—</option>{PRODUCTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className={label}>Derinlik<select value={depth} onChange={(e) => setDepth(e.target.value as 'short')} className={field}><option value="short">Kısa (600–900)</option><option value="standard">Standart (1000–1500)</option><option value="deep">Derinlemesine (1800–2800)</option></select></label>
            <label className={label}>Ton<select value={tone} onChange={(e) => setTone(e.target.value)} className={field}><option value="default">Yoca Editorial</option><option value="analytical">Daha analitik</option><option value="concise">Daha öz</option><option value="technical">Daha teknik</option><option value="provocative">Daha iddialı</option><option value="educational">Daha eğitici</option></select></label>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-muted"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> Taslakla birlikte kapak görseli üret</label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-muted">
            <input type="checkbox" checked={researchMode} onChange={(e) => setResearchMode(e.target.checked)} /> Araştırmalı Taslak (web araması + kaynaklar)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!topic || !!busy} onClick={doDirection} className="admin-btn-primary">1 · Yön öner</button>
            <button type="button" disabled={!topic || !!busy} onClick={() => doDraft(true)} className="admin-btn">Doğrudan taslak</button>
          </div>

          {direction && (
            <div className="grid gap-2 border-t border-line pt-3 text-[13px]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Yön</p>
              <p><span className="text-subtle">Açı:</span> {direction.angle}</p>
              <p><span className="text-subtle">Ana argüman:</span> {direction.centralArgument}</p>
              <div className="grid gap-1">
                {direction.titles.map((t) => (
                  <label key={t} className="flex items-start gap-2"><input type="radio" name="ai-title" checked={chosenTitle === t} onChange={() => setChosenTitle(t)} /><span>{t}</span></label>
                ))}
              </div>
              <ol className="list-decimal ps-5 text-muted">{direction.outline.map((o) => <li key={o.heading}><span className="text-white">{o.heading}</span> — {o.summary}</li>)}</ol>
              <button type="button" disabled={!!busy} onClick={() => doDraft(false)} className="admin-btn-primary w-fit">2 · Onayla ve makaleyi üret</button>
            </div>
          )}

          {draft && (
            <div className="grid gap-2 border-t border-line pt-3 text-[13px]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Taslak hazır — önizleme</p>
              <p className="font-bold text-white">{draft.title}</p>
              <p className="text-muted">{draft.excerpt}</p>
              <p className="max-h-40 overflow-auto whitespace-pre-wrap border border-line p-2 text-[12px] text-muted">{draft.body.slice(0, 1500)}{draft.body.length > 1500 ? '…' : ''}</p>
              {!!draft.polishChanges?.length && (
                <details className="text-[12px] text-muted">
                  <summary className="cursor-pointer font-bold text-white">Yazım temizliği: {draft.polishChanges.length} düzeltme</summary>
                  <ul className="mt-1 list-disc ps-5">{draft.polishChanges.map((c) => <li key={c}>{c}</li>)}</ul>
                </details>
              )}
              {cover && (
                <figure className="grid gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.url} alt={cover.alt} className="aspect-[3/2] w-full border border-line object-cover" />
                  <figcaption className="text-[11px] text-subtle">Kapak önerisi · {cover.alt}</figcaption>
                </figure>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { props.onApplyDraft(draft, research?.sources); if (cover) props.onSetCover(cover.url, cover.alt); setDraft(null); setCover(null); }} className="admin-btn-primary">{cover ? 'Taslağı ve kapağı aktar' : 'Editöre aktar (taslak)'}</button>
                {!cover && <button type="button" disabled={!!busy} onClick={() => doCover(draft.title, draft.excerpt)} className="admin-btn">Kapak üret</button>}
                <button type="button" onClick={() => setDraft(null)} className="admin-btn">Vazgeç</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Metni İyileştir ────────────────────────────────────── */}
      {tab === 'improve' && (
        <div className="grid gap-3">
          <p className="text-[12px] text-muted">{selection ? `Seçili metin: ${selection.length} karakter` : 'Editörde bir metin seçin; işlem yalnızca seçime uygulanır ve önce önizleme gösterilir.'}</p>
          <label className={label}>Ek talimat (isteğe bağlı)<input value={instruction} onChange={(e) => setInstruction(e.target.value)} className={field} /></label>
          <div className="flex flex-wrap gap-1.5">
            {INLINE.map((a) => (
              <button key={a.key} type="button" disabled={!selection || !!busy} onClick={async () => { const r = await run<{ text: string }>('rewrite', { action: 'rewrite', inlineAction: a.key, selection, context: article.body_md, instruction }); if (r) setRewritePreview(r.text); }} className="admin-btn !px-2.5 !py-1 !text-[12px]">{a.label}</button>
            ))}
            <button type="button" disabled={!article.title || !!busy} onClick={async () => { const r = await run<{ text: string }>('rewrite', { action: 'rewrite', inlineAction: 'improve-title', selection: article.title, context: article.body_md }); if (r) props.onSetTitle(r.text.trim()); }} className="admin-btn !px-2.5 !py-1 !text-[12px]">Başlığı iyileştir</button>
          </div>
          {rewritePreview !== null && (
            <div className="grid gap-2 border-t border-line pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Öneri</p>
              <p className="max-h-56 overflow-auto whitespace-pre-wrap border border-line p-2 text-[13px]">{rewritePreview}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { props.onReplaceSelection(rewritePreview); setRewritePreview(null); }} className="admin-btn-primary">Seçimi değiştir</button>
                <button type="button" onClick={() => setRewritePreview(null)} className="admin-btn">Vazgeç</button>
              </div>
            </div>
          )}
          <div className="border-t border-line pt-3">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!article.body_md || !!busy} onClick={async () => { const r = await run<{ text: string }>('rewrite', { action: 'rewrite', inlineAction: 'condense', selection: article.body_md, context: '' }); if (r) setRewritePreview(r.text); }} className="admin-btn !px-2.5 !py-1 !text-[12px]">İçeriği kısalt (tümü)</button>
              <button type="button" disabled={!selection || !!busy} onClick={async () => { const r = await run<{ text: string }>('rewrite', { action: 'rewrite', inlineAction: 'expand', selection, context: article.body_md }); if (r) setRewritePreview(r.text); }} className="admin-btn !px-2.5 !py-1 !text-[12px]">Seçimi derinleştir</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kapak ─────────────────────────────────────────────── */}
      {tab === 'cover' && (
        <div className="grid gap-3 text-[13px]">
          <p className="text-muted">Sitedeki görsellerle aynı dilde soyut bir stüdyo görseli üretir: koyu zemin, taş/metal nesneler, tek lime ışık. Yazı, insan, ekran ve logo içermez.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!article.title || !!busy} onClick={() => doCover()} className="admin-btn-primary">{cover ? 'Yeniden üret' : 'Kapak görseli üret'}</button>
          </div>
          {!article.title && <p className="text-[12px] text-subtle">Önce bir başlık yazın.</p>}
          {cover && (
            <figure className="grid gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.url} alt={cover.alt} className="aspect-[3/2] w-full border border-line object-cover" />
              <figcaption className="text-[12px] text-subtle">{cover.alt}</figcaption>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { props.onSetCover(cover.url, cover.alt); setCover(null); }} className="admin-btn-primary">Kapak yap</button>
                <button type="button" onClick={() => setCover(null)} className="admin-btn">Vazgeç</button>
              </div>
            </figure>
          )}
        </div>
      )}

      {/* ── SEO ────────────────────────────────────────────────── */}
      {tab === 'seo' && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!article.body_md || !!busy} onClick={async () => { const r = await run<SeoPack>('seo', { action: 'seo', title: article.title, excerpt: article.excerpt, body: article.body_md, mainKeyword }); if (r) setSeo(r); }} className="admin-btn-primary">SEO optimize et</button>
            <button type="button" disabled={!article.body_md || !!busy} onClick={async () => { const r = await run<{ faq: Array<{ q: string; a: string }> }>('faq', { action: 'faq', title: article.title, body: article.body_md }); if (r) setFaq(r.faq); }} className="admin-btn">FAQ üret</button>
          </div>
          {seo && (
            <div className="grid gap-2 border-t border-line pt-3 text-[13px]">
              <p><span className="text-subtle">SEO başlığı:</span> {seo.seoTitle} <span className="text-subtle">({seo.seoTitle.length})</span></p>
              <p><span className="text-subtle">Meta açıklama:</span> {seo.metaDescription} <span className="text-subtle">({seo.metaDescription.length})</span></p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">5 başlık önerisi</p>
              <ul className="grid gap-1">{seo.titleOptions.map((t) => <li key={t} className="flex items-center justify-between gap-2"><span>{t}</span><button type="button" onClick={() => props.onSetTitle(t)} className="admin-btn !px-2 !py-0.5 !text-[11px]">Kullan</button></li>)}</ul>
              {seo.internalLinks.length > 0 && (<><p className="text-[11px] font-bold uppercase tracking-wide text-subtle">İç bağlantı önerileri</p><ul className="grid gap-1 text-muted">{seo.internalLinks.map((l) => <li key={l.path}><span className="text-white">{l.path}</span> — {l.anchor} <span className="text-subtle">({l.why})</span></li>)}</ul></>)}
              <button type="button" onClick={() => props.onApplySeo({ seo_title: seo.seoTitle, meta_description: seo.metaDescription })} className="admin-btn-primary w-fit">SEO alanlarını uygula</button>
            </div>
          )}
          {faq && (
            <div className="grid gap-2 border-t border-line pt-3 text-[13px]">
              {faq.length === 0 ? <p className="text-muted">Anlamlı bir FAQ çıkmadı — bu makale için boş bırakmak daha doğru.</p> : faq.map((f) => <p key={f.q}><span className="font-bold text-white">{f.q}</span><br />{f.a}</p>)}
              {faq.length > 0 && <button type="button" onClick={() => props.onApplyFaq(faq)} className="admin-btn-primary w-fit">FAQ’yu uygula</button>}
            </div>
          )}
        </div>
      )}

      {/* ── Araştır ────────────────────────────────────────────── */}
      {tab === 'research' && (
        <div className="grid gap-3">
          <p className="text-[12px] text-muted">Araştırma modu web araması yapar, kaynakları ayrı tutar ve taslak üretiminde referans olarak kullanır. Sayısal iddialar kaynağa dayanmıyorsa metne girmez.</p>
          <label className={label}>Konu<textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} className={field} /></label>
          <button type="button" disabled={!topic || !!busy} onClick={doResearch} className="admin-btn-primary w-fit">Araştır</button>
          {research && (
            <div className="grid gap-2 border-t border-line pt-3 text-[13px]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Kaynaklar ({research.sources.length})</p>
              <ul className="grid gap-1">{research.sources.map((s) => <li key={s.url} className="truncate"><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-yoca-lime hover:underline">{s.title || s.domain}</a> <span className="text-subtle">— {s.domain}</span></li>)}</ul>
              <p className="max-h-48 overflow-auto whitespace-pre-wrap border border-line p-2 text-[12px] text-muted">{research.digest}</p>
              <p className="text-[12px] text-subtle">Araştırmalı taslak için “Taslak Oluştur” sekmesinde Araştırmalı Taslak seçeneği açık kalsın; kaynaklar taslakla birlikte editöre aktarılır.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Çevir ──────────────────────────────────────────────── */}
      {tab === 'translate' && (
        <div className="grid gap-3">
          <p className="text-[12px] text-muted">Çeviri, aynı çeviri grubunda yeni bir <strong>taslak</strong> olarak oluşturulur; inceleyip yayınlarsınız.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={translateTo} onChange={(e) => setTranslateTo(e.target.value as Locale)} className={`${field} !w-auto`}>
              {INSIGHT_LOCALES.filter((l) => l.code !== article.locale).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <button type="button" disabled={!article.body_md || !article.id || !!busy} onClick={async () => { const r = await run<Translation>('translate', { action: 'translate', to: translateTo, title: article.title, excerpt: article.excerpt, body: article.body_md, seoTitle: article.seo_title, metaDescription: article.meta_description }); if (r) props.onCreateTranslation(translateTo, r); }} className="admin-btn-primary">Çeviri taslağı oluştur</button>
          </div>
          {!article.id && <p className="text-[12px] text-yellow-300">Önce makaleyi kaydedin.</p>}
        </div>
      )}

      {/* ── Diğer ──────────────────────────────────────────────── */}
      {tab === 'more' && (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <button type="button" disabled={!article.body_md || !!busy} onClick={async () => { const r = await run<EditorialReview>('review', { action: 'review', title: article.title, body: article.body_md }); if (r) setReview(r); }} className="admin-btn-primary w-fit">Yoca Editör Kontrolü</button>
            {review && (
              <div className="grid gap-2 border border-line p-3 text-[13px]">
                <p className="text-[11px] text-subtle">Editoryal kalite kontrolü — sezgisel rehberlik, bilimsel skor değil.</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {([['Marka sesi', review.scores.brandVoice], ['Netlik', review.scores.clarity], ['Somutluk', review.scores.specificity], ['Yapı', review.scores.structure], ['SEO', review.scores.seo]] as const).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="font-bold tabular-nums">{Math.round(v)}</dd></div>)}
                  <div className="flex justify-between"><dt className="text-muted">Klişe riski</dt><dd className="font-bold uppercase">{review.clicheRisk}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Doğrulanmamış iddia</dt><dd className="font-bold">{review.unverifiedClaims.length}</dd></div>
                </dl>
                {review.unverifiedClaims.length > 0 && <ul className="list-disc ps-4 text-yellow-300">{review.unverifiedClaims.map((c) => <li key={c}>{c}</li>)}</ul>}
                <ul className="list-disc ps-4 text-muted">{[...review.issues, ...review.suggestions].map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="grid gap-2 border-t border-line pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">İçeriği Dönüştür</p>
            <div className="flex flex-wrap gap-1.5">
              {(['linkedin', 'instagram', 'newsletter', 'x'] as const).map((p) => (
                <button key={p} type="button" disabled={!article.body_md || !!busy} onClick={async () => { const r = await run<{ platform: string; output: string }>('repurpose', { action: 'repurpose', platform: p, title: article.title, body: article.body_md }); if (r) setRepurposed(r); }} className="admin-btn !px-2.5 !py-1 !text-[12px]">{p === 'x' ? 'X' : p === 'linkedin' ? 'LinkedIn' : p === 'instagram' ? 'Instagram carousel' : 'Newsletter'}</button>
              ))}
            </div>
            {repurposed && (
              <div className="grid gap-2">
                <p className="max-h-56 overflow-auto whitespace-pre-wrap border border-line p-2 text-[13px]">{repurposed.output}</p>
                <button type="button" onClick={() => navigator.clipboard?.writeText(repurposed.output)} className="admin-btn w-fit !px-2.5 !py-1 !text-[12px]">Kopyala</button>
              </div>
            )}
          </div>
          <div className="grid gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={async () => { const r = await run<{ ideas: Array<{ title: string; angle: string; keyword: string; why: string }> }>('topics', { action: 'topics', category: article.category_key ?? relatedService, audience, goal: objective }); if (r) setTopics(r.ideas); }} className="admin-btn">Konu öner</button>
              <button type="button" disabled={!topic || !!busy} onClick={async () => { const r = await run<Record<string, unknown>>('brief', { action: 'brief', topic, audience, goal: objective }); if (r) setBrief(r); }} className="admin-btn">Brief oluştur</button>
            </div>
            {topics && <ul className="grid gap-2 text-[13px]">{topics.map((i) => <li key={i.title} className="border border-line p-2"><button type="button" onClick={() => { setTopic(i.title); setMainKeyword(i.keyword); setTab('draft'); }} className="text-start font-bold text-white hover:text-yoca-lime">{i.title}</button><p className="text-muted">{i.angle}</p><p className="text-[11px] text-subtle">{i.keyword} · {i.why}</p></li>)}</ul>}
            {brief && <pre className="max-h-64 overflow-auto whitespace-pre-wrap border border-line p-2 text-[12px] text-muted">{JSON.stringify(brief, null, 2)}</pre>}
          </div>
        </div>
      )}
    </aside>
  );
}
