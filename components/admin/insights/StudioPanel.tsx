'use client';

import { useState } from 'react';
import { adminFetch, callAi, INSIGHT_LOCALES, type AiRunInfo, type EditableInsight } from '@/lib/insightsAdmin';
import type { ArticleDraft, SeoPack, SourceClaim, StyleFinding, Translation } from '@/lib/ai/schemas';
import MultilangPanel, { type SiblingInfo } from '@/components/admin/insights/MultilangPanel';
import type { InsightSource, Locale } from '@/types';
import { SLOP_PATTERNS } from '@/lib/ai/prompts/no-ai-slop';
import DiffView from '@/components/admin/insights/DiffView';
import { countSourceMarkers } from '@/lib/ai/sourceText';
import ImageStudio, { type StudioImage } from '@/components/admin/insights/ImageStudio';

/**
 * Yoca Admin — İçerik stüdyosu (AI panel beside the editor).
 *
 * Default guided flow, one step at a time without re-asking:
 *   Konu → Taslak → Editörlük kontrolü → Görsel → Önizleme → İnceleme → Diller → Yayın
 * Any step can also be opened directly. Every AI result is a PROPOSAL: the
 * editor previews it and applies it; applying first stores the current text
 * as a revision, and only "Kaydet" writes the article. Nothing here publishes.
 * Style check (no-ai-slop patterns) and source check are separate tools.
 * "Diller" translates a finished source article into every other language
 * and reviews/edits each one in its own language (MultilangPanel).
 */

type Step = 'topic' | 'draft' | 'check' | 'image' | 'preview' | 'review' | 'langs' | 'publish';
const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'topic', label: 'Konu' },
  { key: 'draft', label: 'Taslak' },
  { key: 'check', label: 'Editörlük kontrolü' },
  { key: 'image', label: 'Görsel' },
  { key: 'preview', label: 'Önizleme' },
  { key: 'review', label: 'İnceleme' },
  { key: 'langs', label: 'Diller' },
  { key: 'publish', label: 'Yayın' },
];

const SERVICES = ['brand-strategy-identity', 'web-digital-experiences', 'growth-performance', 'creative-production', 'ai-automation', 'digital-product-development'];
const PATTERN_LABEL = Object.fromEntries(SLOP_PATTERNS.map((p) => [p.id, p.label]));

interface FetchedInfo {
  url: string;
  finalUrl?: string;
  status: 'fetched' | 'failed' | 'skipped';
  reason?: string;
  title?: string;
  chars?: number;
  fetchedAt: string;
  warnings?: string[];
  preview?: string;
}

interface Props {
  article: EditableInsight;
  selection: string;
  images: StudioImage[];
  reloadImages: () => Promise<void>;
  onApplyDraft: (draft: ArticleDraft, sources: InsightSource[]) => Promise<void>;
  onReplaceSelection: (text: string) => Promise<void>;
  onReplaceBody: (text: string, reason: string) => Promise<void>;
  onSetTitle: (title: string) => void;
  onApplySeo: (seo: Partial<Pick<EditableInsight, 'seo_title' | 'meta_description'>>) => void;
  onApplyFaq: (faq: Array<{ q: string; a: string }>) => void;
  dirty: boolean;
  siblings: SiblingInfo[];
  onSaveTranslations: (items: Array<{ locale: Locale; translation: Translation }>, fingerprint: string) => Promise<Record<string, string>>;
  onInsertImage: (markdown: string) => void;
  onOpenPreview: () => void;
  onSetLocale: (locale: Locale) => void;
  onMarkInReview: () => void;
  onGoPublish: () => void;
  onLocate: (excerpt: string) => void;
}

export default function StudioPanel(props: Props) {
  const { article, selection } = props;
  const [step, setStep] = useState<Step>(article.body_md.trim() ? 'check' : 'topic');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiRunInfo | null>(null);
  const [textPreset, setTextPreset] = useState<'economy' | 'quality'>('economy');
  const [imagePreset, setImagePreset] = useState<'economy' | 'quality'>('economy');

  // Simple screen
  const [topic, setTopic] = useState(article.title || '');
  const [reader, setReader] = useState('İşletme sahipleri ve pazarlama yöneticileri');
  const [length, setLength] = useState<'short' | 'standard' | 'deep'>('standard');
  const [sourceUrls, setSourceUrls] = useState(article.sources.map((s) => s.url).join('\n'));
  const [notes, setNotes] = useState('');
  const [existingText, setExistingText] = useState('');
  // Advanced (collapsed)
  const [goal, setGoal] = useState('');
  const [service, setService] = useState(article.related_service ?? '');
  const [keyword, setKeyword] = useState('');
  const [tone, setTone] = useState('default');
  const [cta, setCta] = useState('');

  const [ideas, setIdeas] = useState<Array<{ title: string; angle: string; keyword: string; why: string }> | null>(null);
  const [research, setResearch] = useState<{ digest: string; citations: Array<{ url: string; title: string; domain: string; serverFetched: false }> } | null>(null);
  const [fetched, setFetched] = useState<FetchedInfo[] | null>(null);
  const [draft, setDraft] = useState<{ draft: ArticleDraft; sources: FetchedInfo[] } | null>(null);
  const [titles, setTitles] = useState<string[] | null>(null);
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [findings, setFindings] = useState<StyleFinding[] | null>(null);
  const [edit, setEdit] = useState<{ before: string; after: string; changes: string[] } | null>(null);
  const [check, setCheck] = useState<{ sources: FetchedInfo[]; claims: SourceClaim[]; unsupportedNumbers: Array<{ sentence: string; numbers: string[] }> } | null>(null);
  const [seo, setSeo] = useState<SeoPack | null>(null);
  const [repurposed, setRepurposed] = useState<{ platform: string; output: string } | null>(null);

  const urlList = () => sourceUrls.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 5);

  const ai = async <T,>(label: string, payload: Record<string, unknown>, kind: 'text' | 'image' = 'text'): Promise<T | null> => {
    if (busy) return null; // one job at a time; the server also refuses duplicates
    setBusy(label);
    setError(null);
    try {
      const r = await callAi<T>({ ...payload, locale: article.locale, insightId: article.id, preset: kind === 'text' ? textPreset : imagePreset });
      if (r.run) setLastRun(r.run);
      return r.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yapay zekâ isteği başarısız oldu. Metniniz değişmedi.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const fetchSourcesNow = async () => {
    if (busy) return;
    setBusy('Kaynaklar okunuyor…');
    setError(null);
    const r = await adminFetch<{ result?: { sources: FetchedInfo[] } }>('/api/ai', { json: { action: 'fetch_sources', urls: urlList() } }).catch(() => null);
    setBusy(null);
    if (!r?.ok || !r.result) setError(r?.error ?? 'Kaynaklar okunamadı.');
    else setFetched(r.result.sources);
  };

  const doIdeas = async () => {
    const r = await ai<{ ideas: Array<{ title: string; angle: string; keyword: string; why: string }> }>('Fikirler hazırlanıyor…', { action: 'ideas', topic, reader, goal, service });
    if (r) setIdeas(r.ideas);
  };

  const doResearch = async () => {
    const r = await ai<{ digest: string; citations: Array<{ url: string; title: string; domain: string; serverFetched: false }> }>('Web’de araştırılıyor (1–2 dk)…', { action: 'research', topic });
    if (r) setResearch(r);
  };

  const addCitationsToSources = () => {
    if (!research) return;
    const current = urlList();
    const merged = Array.from(new Set([...current, ...research.citations.map((c) => c.url)])).slice(0, 5);
    setSourceUrls(merged.join('\n'));
  };

  const doDraft = async () => {
    const r = await ai<{ draft: ArticleDraft; sources: FetchedInfo[] }>('Taslak hazırlanıyor (1–2 dk)…', { action: 'draft', topic, reader, length, notes, existingText, sourceUrls: urlList(), goal, service, keyword, tone, cta });
    if (r) {
      setDraft(r);
      setFetched(r.sources);
      setStep('draft');
    }
  };

  const applyDraft = async () => {
    if (!draft) return;
    const sources: InsightSource[] = draft.sources
      .filter((s) => s.status === 'fetched')
      .map((s) => ({ title: s.title || s.url, url: s.finalUrl ?? s.url, domain: new URL(s.finalUrl ?? s.url).hostname.replace(/^www\./, ''), accessed_at: s.fetchedAt, source_type: 'web' }));
    await props.onApplyDraft(draft.draft, sources);
    setDraft(null);
    setStep('check');
  };

  const doStyleReview = async () => {
    const r = await ai<{ findings: StyleFinding[] }>('Yazım kalıpları inceleniyor…', { action: 'style_review', text: article.body_md });
    if (r) setFindings(r.findings);
  };

  const doStyleEdit = async () => {
    const before = article.body_md;
    const r = await ai<{ text: string; changes: string[] }>('Metin düzenleniyor (en az değişiklikle)…', { action: 'style_edit', text: before, scope: 'body', title: article.title, excerpt: article.excerpt });
    if (r) setEdit({ before, after: r.text, changes: r.changes });
  };

  const doSourceCheck = async () => {
    const r = await ai<{ sources: FetchedInfo[]; claims: SourceClaim[]; unsupportedNumbers: Array<{ sentence: string; numbers: string[] }> }>('Kaynaklar okunup iddialar kontrol ediliyor…', { action: 'source_check', body: article.body_md, sourceUrls: urlList(), notes });
    if (r) setCheck(r);
  };

  // Also counts markers with a note, e.g. [KAYNAK GEREKLİ: işletmenin kendi verisi].
  const sourceMarkers = countSourceMarkers(article.body_md);
  const cover = props.images.find((i) => i.selected);
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].key);

  const field = 'admin-input !text-[13px]';
  const label = 'grid gap-1 text-[12px] font-semibold text-muted';
  const small = 'admin-btn !px-2.5 !py-1 !text-[12px]';

  return (
    <aside className="admin-card grid content-start gap-4 !p-4" aria-label="İçerik stüdyosu">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em]">İçerik stüdyosu</h2>
        <span className="text-[11px] text-subtle">Öneri üretir · yayınlamaz</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Metin modeli<select value={textPreset} onChange={(e) => setTextPreset(e.target.value as 'economy')} className={field}><option value="economy">Ekonomik</option><option value="quality">Yüksek kalite</option></select></label>
        <label className={label}>Görsel modeli<select value={imagePreset} onChange={(e) => setImagePreset(e.target.value as 'economy')} className={field}><option value="economy">Ekonomik</option><option value="quality">Yüksek kalite</option></select></label>
      </div>

      <ol className="flex flex-wrap gap-1" aria-label="Adımlar">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={() => setStep(s.key)} aria-current={step === s.key ? 'step' : undefined} className={`px-2 py-1 text-[11px] font-bold ${step === s.key ? 'bg-yoca-lime text-black' : i < stepIndex ? 'border border-yoca-green/50 text-yoca-green' : 'border border-line text-muted hover:text-white'}`}>
              {i + 1} · {s.label}
            </button>
          </li>
        ))}
      </ol>

      {busy && <p role="status" className="rounded-sm border border-yoca-lime/40 bg-yoca-lime/10 px-3 py-2 text-[12px] text-yoca-lime">{busy}</p>}
      {error && <p role="alert" className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}

      {/* ── 1 · Konu ── */}
      {step === 'topic' && (
        <div className="grid gap-3">
          <label className={label}>Konu / fikir<textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} className={field} placeholder="Ör. Hizmet işletmelerinde randevu talebini kolaylaştıran web sitesi akışı" /></label>
          <label className={label}>Hedef okur<input value={reader} onChange={(e) => setReader(e.target.value)} className={field} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Dil<select value={article.locale} onChange={(e) => props.onSetLocale(e.target.value as Locale)} className={field}>{INSIGHT_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
            <label className={label}>Uzunluk<select value={length} onChange={(e) => setLength(e.target.value as 'short')} className={field}><option value="short">Kısa</option><option value="standard">Standart</option><option value="deep">Ayrıntılı</option></select></label>
          </div>
          <label className={label}>Kaynak adresleri (isteğe bağlı, her satıra bir URL, en fazla 5)<textarea value={sourceUrls} onChange={(e) => setSourceUrls(e.target.value)} rows={2} className={field} placeholder="https://…" /></label>
          {urlList().length > 0 && <button type="button" className={`${small} w-fit`} disabled={!!busy} onClick={fetchSourcesNow}>Kaynakları şimdi oku</button>}
          {fetched && <SourceStatus sources={fetched} />}
          <label className={label}>Notlar (isteğe bağlı — kendi bilgileriniz, rakamlar ve dayanakları)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={field} /></label>
          <label className={label}>Mevcut metin (isteğe bağlı)<textarea value={existingText} onChange={(e) => setExistingText(e.target.value)} rows={3} className={field} /></label>
          <details className="border border-line p-2">
            <summary className="cursor-pointer text-[12px] font-bold text-muted">Gelişmiş: amaç, hizmet, anahtar kelime, ton, CTA</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={label}>Amaç<input value={goal} onChange={(e) => setGoal(e.target.value)} className={field} placeholder="Ör. Okur kendi formunu kontrol edebilsin" /></label>
              <label className={label}>İlgili hizmet<select value={service} onChange={(e) => setService(e.target.value)} className={field}><option value="">—</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className={label}>Anahtar kelime<input value={keyword} onChange={(e) => setKeyword(e.target.value)} className={field} /></label>
              <label className={label}>Ton<select value={tone} onChange={(e) => setTone(e.target.value)} className={field}><option value="default">Yoca (sade, somut)</option><option value="analytical">Daha analitik</option><option value="concise">Daha öz</option><option value="technical">Daha teknik</option><option value="educational">Daha eğitici</option></select></label>
              <label className={`${label} col-span-2`}>CTA<input value={cta} onChange={(e) => setCta(e.target.value)} className={field} placeholder="Ör. Formunuzu birlikte gözden geçirelim" /></label>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn" disabled={!!busy} onClick={doIdeas}>Fikir öner</button>
            <button type="button" className="admin-btn" disabled={!!busy || !topic.trim()} onClick={doResearch} title="İsteğe bağlı: OpenAI web araması. Bulunan adresler doğrulanmamış sayılır.">Web’de araştır</button>
            <button type="button" className="admin-btn-primary" disabled={!!busy || !topic.trim()} onClick={doDraft}>Taslak oluştur</button>
          </div>
          {research && (
            <div className="grid gap-2 border border-yellow-400/40 p-2 text-[12px]">
              <p className="font-bold text-yellow-300">Araştırma özeti — modelin yazdığı metin, kaynak sayılmaz ve taslağa otomatik girmez</p>
              <p className="max-h-48 overflow-auto whitespace-pre-wrap text-muted">{research.digest || '—'}</p>
              {research.citations.length === 0 ? (
                <p className="text-subtle">Model adres göstermedi.</p>
              ) : (
                <ul className="grid gap-1">
                  {research.citations.map((c) => (
                    <li key={c.url} className="border border-line p-1.5">
                      <span className="me-2 font-bold text-yellow-300">Doğrulanmadı</span>
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-all text-soft hover:text-yoca-lime">{c.title || c.domain}</a>
                      <span className="text-subtle"> · {c.domain} · OpenAI web araması buldu; sunucumuz okumadı</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {research.citations.length > 0 && <button type="button" className={small} onClick={addCitationsToSources}>Adresleri kaynak listesine ekle (en fazla 5)</button>}
                <button type="button" className={small} onClick={() => setResearch(null)}>Kapat</button>
              </div>
              <p className="text-[11px] text-subtle">Bir adres ancak “Kaynakları şimdi oku” ile sunucu sayfayı gerçekten indirip okuduğunda kaynak olur; taslak ve kaynak kontrolü yalnızca o metni kullanır. Web arama ücreti tahmini maliyete dahil değildir.</p>
            </div>
          )}
          {ideas && (
            <ul className="grid gap-2">
              {ideas.map((i) => (
                <li key={i.title} className="border border-line p-2">
                  <button type="button" className="text-start font-bold text-white hover:text-yoca-lime" onClick={() => { setTopic(i.title); setKeyword(i.keyword); setIdeas(null); }}>{i.title}</button>
                  <p className="text-[12px] text-muted">{i.angle}</p>
                  <p className="text-[11px] text-subtle">{i.keyword} · {i.why}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── 2 · Taslak ── */}
      {step === 'draft' && (
        <div className="grid gap-3 text-[13px]">
          {draft ? (
            <div className="grid gap-2 border border-line p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Taslak önerisi · sürüm geçmişine kaydedildi</p>
              <p className="font-bold text-white">{draft.draft.title}</p>
              <p className="text-muted">{draft.draft.excerpt}</p>
              <p className="max-h-60 overflow-auto whitespace-pre-wrap border border-line p-2 text-[12px] text-muted">{draft.draft.body}</p>
              <SourceStatus sources={draft.sources} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="admin-btn-primary" onClick={applyDraft}>Editöre aktar</button>
                <button type="button" className="admin-btn" disabled={!!busy} onClick={doDraft}>Yeniden dene</button>
                <button type="button" className="admin-btn" onClick={() => setDraft(null)}>Vazgeç</button>
              </div>
              <p className="text-[11px] text-subtle">Aktarınca mevcut metin önce sürüm geçmişine kaydedilir. Durum değişmez; yayın ayrı bir adımdır.</p>
            </div>
          ) : (
            <p className="text-[12px] text-muted">Taslak önerisi yok. “Konu” adımından oluşturun ya da tek işlemleri kullanın.</p>
          )}
          <div className="grid gap-2 border-t border-line pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Tek işlemler</p>
            <p className="text-[12px] text-muted">{selection ? `Seçili: ${selection.length} karakter` : 'Bölüm işlemleri için editörde metin seçin.'}</p>
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} className={field} placeholder="Ek talimat (isteğe bağlı)" />
            <div className="flex flex-wrap gap-1" aria-label="Hazır talimatlar">
              {['Daha net', 'Daha doğal', 'Daha teknik', 'Daha editoryal', 'Tekrarları kaldır', 'Girişi güçlendir', 'Bu bölümü derinleştir (yeni bilgi uydurmadan)'].map((chip) => (
                <button key={chip} type="button" className="border border-line px-2 py-0.5 text-[11px] text-muted hover:text-white" onClick={() => setInstruction(chip)}>{chip}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={small} disabled={!!busy || !selection} onClick={async () => { const r = await ai<{ text: string }>('Seçili bölüm yeniden yazılıyor…', { action: 'rewrite', mode: 'rewrite', selection, context: article.body_md, instruction }); if (r) setRewrite(r.text); }}>Seçili bölümü yeniden yaz</button>
              <button type="button" className={small} disabled={!!busy || !selection} onClick={async () => { const r = await ai<{ text: string }>('Kısaltılıyor…', { action: 'rewrite', mode: 'simplify', selection, context: article.body_md, instruction }); if (r) setRewrite(r.text); }}>Kısalt / sadeleştir</button>
              <button type="button" className={small} disabled={!!busy || !article.body_md} onClick={async () => { const r = await ai<{ titles: string[] }>('Başlıklar hazırlanıyor…', { action: 'titles', title: article.title, excerpt: article.excerpt, body: article.body_md }); if (r) setTitles(r.titles); }}>Başlık alternatifleri</button>
            </div>
            {rewrite !== null && selection && (
              <DiffView before={selection} after={rewrite} onApply={async (text) => { await props.onReplaceSelection(text); setRewrite(null); }} onCancel={() => setRewrite(null)} />
            )}
            {titles && (
              <ul className="grid gap-1">
                {titles.map((t) => (
                  <li key={t} className="flex items-center justify-between gap-2"><span>{t}</span><button type="button" className="admin-btn !px-2 !py-0.5 !text-[11px]" onClick={() => props.onSetTitle(t)}>Kullan</button></li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="admin-btn w-fit" onClick={next}>Sonraki adım → Editörlük kontrolü</button>
        </div>
      )}

      {/* ── 3 · Editörlük kontrolü ── */}
      {step === 'check' && (
        <div className="grid gap-4 text-[13px]">
          <section className="grid gap-2">
            <p className="font-bold text-white">Yazım kalıpları</p>
            <p className="text-[12px] text-muted">Kalıpları cümle cümle listeler; “% yapay zekâ” puanı vermez. Düzeltmeyi siz seçersiniz.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="admin-btn-primary" disabled={!!busy || !article.body_md.trim()} onClick={doStyleReview}>Yazım kalıplarını incele</button>
              <button type="button" className="admin-btn" disabled={!!busy || !article.body_md.trim()} onClick={doStyleEdit}>Metni düzenle</button>
            </div>
            {findings && (
              findings.length === 0 ? <p className="text-yoca-green">Listelenen kalıplardan biri bulunmadı.</p> : (
                <ul className="grid max-h-80 gap-2 overflow-auto">
                  {findings.map((f, i) => (
                    <li key={i} className="border border-line p-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-yellow-300">{PATTERN_LABEL[f.pattern] ?? f.pattern}</p>
                      <button type="button" disabled={!f.found} onClick={() => props.onLocate(f.excerpt)} className="text-start text-white hover:text-yoca-lime disabled:text-muted">“{f.excerpt}”</button>
                      {!f.found && <p className="text-[11px] text-subtle">Bu alıntı metinde birebir bulunamadı.</p>}
                      <p className="text-[12px] text-muted">Öneri: {f.suggestion}</p>
                    </li>
                  ))}
                </ul>
              )
            )}
            {edit && (
              <DiffView before={edit.before} after={edit.after} changes={edit.changes} onApply={async (text) => { await props.onReplaceBody(text, 'Yazım düzenlemesi öncesi'); setEdit(null); }} onCancel={() => setEdit(null)} />
            )}
          </section>
          <section className="grid gap-2 border-t border-line pt-3">
            <p className="font-bold text-white">Kaynak kontrolü</p>
            <p className="text-[12px] text-muted">Yalnızca sunucunun gerçekten okuduğu adresler ve sizin notlarınız kaynak sayılır. Modelin “hatırladığı” bir adres kaynak değildir.</p>
            <label className={label}>Kaynak adresleri<textarea value={sourceUrls} onChange={(e) => setSourceUrls(e.target.value)} rows={2} className={field} /></label>
            <button type="button" className="admin-btn-primary w-fit" disabled={!!busy || !article.body_md.trim()} onClick={doSourceCheck}>Kaynakları kontrol et</button>
            {sourceMarkers > 0 && <p className="text-yellow-300">Metinde {sourceMarkers} adet [KAYNAK GEREKLİ] işareti var.</p>}
            {check && (
              <div className="grid gap-2">
                <SourceStatus sources={check.sources} />
                {check.unsupportedNumbers.length > 0 && (
                  <div className="border border-yellow-400/40 p-2">
                    <p className="text-[12px] font-bold text-yellow-300">Okunan kaynaklarda geçmeyen sayılar</p>
                    <ul className="list-disc ps-5 text-[12px]">{check.unsupportedNumbers.map((u, i) => <li key={i}><button type="button" className="text-start hover:text-yoca-lime" onClick={() => props.onLocate(u.sentence)}>{u.sentence}</button> <span className="text-subtle">({u.numbers.join(', ')})</span></li>)}</ul>
                  </div>
                )}
                <ul className="grid gap-1.5">
                  {check.claims.map((c, i) => (
                    <li key={i} className="border border-line p-2">
                      <span className={`me-2 text-[11px] font-bold uppercase ${c.status === 'supported' ? 'text-yoca-green' : 'text-yellow-300'}`}>{c.status === 'supported' ? 'Destekleniyor' : c.status === 'contradicted' ? 'Çelişiyor' : c.status === 'needs_source' ? 'Kaynak gerekli' : 'Desteklenmiyor'}</span>
                      {c.claim}
                      <p className="text-[11px] text-subtle">{c.source ? `${c.source} · ` : ''}{c.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <button type="button" className="admin-btn w-fit" onClick={next}>Sonraki adım → Görsel</button>
        </div>
      )}

      {/* ── 4 · Görsel ── */}
      {step === 'image' && (
        <div className="grid gap-3">
          <ImageStudio
            insightId={article.id}
            groupId={article.group_id}
            title={article.title}
            excerpt={article.excerpt}
            body={article.body_md}
            images={props.images}
            reload={props.reloadImages}
            onInsert={props.onInsertImage}
            onRun={(r) => r && setLastRun(r)}
            preset={imagePreset}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
          <button type="button" className="admin-btn w-fit" onClick={next}>Sonraki adım → Önizleme</button>
        </div>
      )}

      {/* ── 5 · Önizleme ── */}
      {step === 'preview' && (
        <div className="grid gap-3 text-[13px]">
          <p className="text-muted">Kaydedilmemiş değişiklikler dahil; masaüstü ve mobil genişlikte, kapak kırpımıyla.</p>
          <button type="button" className="admin-btn-primary w-fit" onClick={props.onOpenPreview}>Önizlemeyi aç</button>
          <button type="button" className="admin-btn w-fit" onClick={next}>Sonraki adım → İnceleme</button>
        </div>
      )}

      {/* ── 6 · İnceleme ── */}
      {step === 'review' && (
        <div className="grid gap-3 text-[13px]">
          <ul className="grid gap-1.5">
            <Check ok={Boolean(article.title.trim() && article.excerpt.trim())} text="Başlık ve özet dolu" />
            <Check ok={sourceMarkers === 0} text={sourceMarkers ? `${sourceMarkers} adet [KAYNAK GEREKLİ] işareti kaldı (yayın engellenir)` : 'Kaynak işareti kalmadı'} />
            <Check ok={check !== null} text={check ? 'Kaynak kontrolü yapıldı' : 'Kaynak kontrolü henüz yapılmadı'} />
            <Check ok={findings !== null} text={findings ? `Yazım kalıpları incelendi (${findings.length} bulgu)` : 'Yazım kalıpları henüz incelenmedi'} />
            <Check ok={Boolean(cover ? cover.alt_text : article.cover_alt || !article.cover_url)} text={cover || article.cover_url ? 'Kapak alt metni' : 'Kapak yok (isteğe bağlı)'} />
            <Check ok={Boolean(article.seo_title && article.meta_description)} text="SEO başlığı ve meta açıklama" />
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn" disabled={!!busy || !article.body_md} onClick={async () => { const r = await ai<SeoPack>('SEO alanları hazırlanıyor…', { action: 'seo', title: article.title, excerpt: article.excerpt, body: article.body_md, keyword }); if (r) setSeo(r); }}>SEO alanlarını hazırla</button>
            <button type="button" className="admin-btn" disabled={!!busy || !article.body_md} onClick={async () => { const r = await ai<{ faq: Array<{ q: string; a: string }> }>('SSS hazırlanıyor…', { action: 'faq', title: article.title, body: article.body_md }); if (r && r.faq.length) props.onApplyFaq(r.faq); }}>SSS öner ve ekle</button>
            <button type="button" className="admin-btn" onClick={props.onMarkInReview}>Durumu “İncelemede” yap</button>
          </div>
          {seo && (
            <div className="grid gap-1 border border-line p-2">
              <p><span className="text-subtle">SEO başlığı:</span> {seo.seoTitle} <span className="text-subtle">({seo.seoTitle.length})</span></p>
              <p><span className="text-subtle">Meta:</span> {seo.metaDescription} <span className="text-subtle">({seo.metaDescription.length})</span></p>
              {seo.internalLinks.length > 0 && <ul className="text-[12px] text-muted">{seo.internalLinks.map((l) => <li key={l.path}>{l.path} — {l.anchor}</li>)}</ul>}
              <button type="button" className="admin-btn-primary w-fit" onClick={() => { props.onApplySeo({ seo_title: seo.seoTitle, meta_description: seo.metaDescription }); setSeo(null); }}>SEO alanlarını uygula</button>
            </div>
          )}
          <button type="button" className="admin-btn w-fit" onClick={next}>Sonraki adım → Diller</button>
        </div>
      )}

      {/* ── 7 · Diller ── */}
      {step === 'langs' && (
        <div className="grid gap-3">
          <MultilangPanel
            article={article}
            dirty={props.dirty}
            siblings={props.siblings}
            preset={textPreset}
            busy={busy}
            setBusy={setBusy}
            onRun={setLastRun}
            onSave={props.onSaveTranslations}
          />
          <button type="button" className="admin-btn w-fit" onClick={next}>Sonraki adım → Yayın</button>
        </div>
      )}

      {/* ── 8 · Yayın ── */}
      {step === 'publish' && (
        <div className="grid gap-3 text-[13px]">
          <p className="text-muted">Yayınlama ve zamanlama yalnızca “Yayın” sekmesindeki ayrı düğmelerle yapılır. Yapay zekâ işlemleri hiçbir zaman yayınlamaz. Kaynak yazıda “Tüm dilleri yayınla”, yalnızca dil kontrolü işaretlenmiş çevirileri yayınlar.</p>
          <button type="button" className="admin-btn-primary w-fit" onClick={props.onGoPublish}>Yayın sekmesine git</button>
          <div className="grid gap-2 border-t border-line pt-3">
            <p className="font-bold text-white">Sosyal medya / bülten metni</p>
            <p className="text-[12px] text-muted">Yazıdan kısa bir paylaşım metni önerir; hiçbir yere gönderilmez, kopyalayıp siz paylaşırsınız.</p>
            <div className="flex flex-wrap gap-1.5">
              {(['linkedin', 'instagram', 'newsletter', 'x'] as const).map((p) => (
                <button key={p} type="button" className={small} disabled={!!busy || !article.body_md.trim()} onClick={async () => { const r = await ai<{ platform: string; output: string }>('Paylaşım metni hazırlanıyor…', { action: 'repurpose', platform: p, title: article.title, body: article.body_md }); if (r) setRepurposed(r); }}>{p === 'x' ? 'X' : p === 'linkedin' ? 'LinkedIn' : p === 'instagram' ? 'Instagram carousel' : 'Bülten'}</button>
              ))}
            </div>
            {repurposed && (
              <div className="grid gap-1.5">
                <textarea readOnly value={repurposed.output} rows={8} className={`${field} font-mono !text-[12px]`} />
                <div className="flex gap-2">
                  <button type="button" className={small} onClick={() => navigator.clipboard?.writeText(repurposed.output)}>Kopyala</button>
                  <button type="button" className={small} onClick={() => setRepurposed(null)}>Kapat</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {lastRun && (
        <p className="border-t border-line pt-2 text-[11px] text-subtle">
          Son işlem: {lastRun.mock ? 'MOCK (OpenAI çağrılmadı)' : lastRun.model} · giriş {lastRun.usage.input_tokens ?? 0} / çıkış {lastRun.usage.output_tokens ?? 0} token{lastRun.usage.images ? ` · ${lastRun.usage.images} görsel` : ''} · tahmini maliyet {lastRun.estCostUsd === null ? 'bilinmiyor (fiyat tablosunda yok)' : `$${lastRun.estCostUsd.toFixed(4)}`}
        </p>
      )}
    </aside>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className={ok ? 'text-yoca-green' : 'text-yellow-300'}>{ok ? '✓' : '!'}</span>
      <span>{text}</span>
    </li>
  );
}

function SourceStatus({ sources }: { sources: FetchedInfo[] }) {
  if (!sources.length) return <p className="text-[12px] text-subtle">Kaynak adresi verilmedi; metin kaynaksız yazıldı/kontrol edildi.</p>;
  return (
    <ul className="grid gap-1 text-[12px]">
      {sources.map((s, i) => (
        <li key={i} className="border border-line p-1.5">
          <span className={`me-2 font-bold ${s.status === 'fetched' ? 'text-yoca-green' : 'text-yellow-300'}`}>{s.status === 'fetched' ? 'Okundu' : s.status === 'failed' ? 'Okunamadı' : 'Atlandı'}</span>
          <span className="break-all">{s.finalUrl ?? s.url}</span>
          {s.status === 'fetched' ? <span className="text-subtle"> · {s.title} · {s.chars} karakter · {new Date(s.fetchedAt).toLocaleString('tr-TR')}</span> : <span className="text-subtle"> · {s.reason}</span>}
          {s.warnings?.map((w, j) => <p key={j} className="text-[11px] text-yellow-300">{w}</p>)}
        </li>
      ))}
    </ul>
  );
}
