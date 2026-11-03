'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch, callAi, INSIGHT_LOCALES, type AiRunInfo, type EditableInsight } from '@/lib/insightsAdmin';
import type { StyleFinding, Translation } from '@/lib/ai/schemas';
import type { Locale } from '@/types';
import { SLOP_PATTERNS } from '@/lib/ai/prompts/no-ai-slop';
import { estimateMultilangCost, sourceFingerprint, targetLocales } from '@/lib/ai/translateHelpers';
import DiffView from '@/components/admin/insights/DiffView';

/**
 * Yoca Admin — "Tüm dilleri oluştur".
 *
 * For a saved source article (one that is not itself a translation):
 *   1. every other language is translated in parallel (all fields: title,
 *      excerpt, body, SEO, OG, FAQ, tags, cover alt/caption, slug);
 *   2. for each language the no-ai-slop review (title + excerpt + body) and
 *      the minimal style edit (body) run in that language;
 *   3. results appear per language: findings, a before/after view whose
 *      changes the editor keeps or drops, editable title/excerpt/SEO fields.
 * Nothing is written until "Dil taslaklarını kaydet". Saving creates DRAFT
 * rows (or updates draft siblings after a revision snapshot); a published
 * sibling is never changed — the new text is stored as a proposal revision.
 * Results are kept in this browser until saved.
 */

const PATTERN_LABEL = Object.fromEntries(SLOP_PATTERNS.map((p) => [p.id, p.label]));
const NAME: Record<string, string> = Object.fromEntries(INSIGHT_LOCALES.map((l) => [l.code, l.label]));
const storeKey = (id: string) => `yoca-multilang:${id}`;

type JobStatus = 'translate' | 'check' | 'ready' | 'error' | 'saved';
export interface LangJob {
  status: JobStatus;
  error?: string;
  translation?: Translation;
  findings?: StyleFinding[] | null;
  findingsError?: string;
  edit?: { before: string; after: string; changes: string[] } | null;
  editError?: string;
  editState?: 'pending' | 'applied' | 'dismissed';
  savedNote?: string;
  cost?: number | null;
}

export interface SiblingInfo {
  id: string;
  locale: Locale;
  title: string;
  status: EditableInsight['status'];
  source_insight_id?: string | null;
  source_hash?: string | null;
  language_reviewed?: boolean;
}

interface Props {
  article: EditableInsight;
  dirty: boolean;
  siblings: SiblingInfo[];
  preset: 'economy' | 'quality';
  busy: string | null;
  setBusy: (v: string | null) => void;
  onRun: (r: AiRunInfo) => void;
  onSave: (items: Array<{ locale: Locale; translation: Translation }>, fingerprint: string) => Promise<Record<string, string>>;
}

interface AiInfo {
  price: { input: number; output?: number } | null;
  model: string;
  spent: number | null;
  budget: number | null;
}

export default function MultilangPanel({ article, dirty, siblings, preset, busy, setBusy, onRun, onSave }: Props) {
  const targets = useMemo(() => targetLocales(article.locale), [article.locale]);
  const [jobs, setJobs] = useState<Partial<Record<Locale, LangJob>>>({});
  const [active, setActive] = useState<Locale>(targets[0]);
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [restoredStale, setRestoredStale] = useState(false);
  const [saving, setSaving] = useState(false);

  const isTranslation = Boolean(article.source_insight_id);
  const fields = {
    title: article.title,
    excerpt: article.excerpt,
    body_md: article.body_md,
    seo_title: article.seo_title,
    meta_description: article.meta_description,
    og_title: article.og_title,
    og_description: article.og_description,
    faq: article.faq,
    tags: article.tags,
    cover_alt: article.cover_alt,
    cover_caption: article.cover_caption,
  };

  // Price, active model and this month's spend for the estimate.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await adminFetch<{ settings?: { models: Record<string, string>; prices: Record<string, { input: number; output?: number }>; monthlyBudgetUsd: number }; spend?: { spent: number } | null }>('/api/admin/ai').catch(() => null);
      if (!alive || !r?.ok || !r.settings) return;
      const model = preset === 'quality' ? r.settings.models.textQuality : r.settings.models.textEconomy;
      setInfo({ model, price: r.settings.prices[model] ?? null, spent: r.spend?.spent ?? null, budget: r.settings.monthlyBudgetUsd ?? null });
    })();
    return () => { alive = false; };
  }, [preset]);

  // Restore unsaved results from this browser.
  useEffect(() => {
    if (!article.id) return;
    try {
      const raw = window.localStorage.getItem(storeKey(article.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { fingerprint: string; jobs: Partial<Record<Locale, LangJob>> };
      const restored = Object.fromEntries(Object.entries(parsed.jobs).map(([l, j]) => [l, j && (j.status === 'translate' || j.status === 'check') ? { ...j, status: 'error', error: 'İşlem yarıda kaldı (sayfa kapandı). Yeniden deneyin.' } : j])) as Partial<Record<Locale, LangJob>>;
      setJobs(restored);
      sourceFingerprint(fields).then((fp) => setRestoredStale(fp !== parsed.fingerprint)).catch(() => undefined);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  const persist = (next: Partial<Record<Locale, LangJob>>) => {
    if (!article.id) return;
    sourceFingerprint(fields)
      .then((fingerprint) => {
        try {
          const open = Object.values(next).some((j) => j && j.status !== 'saved');
          if (open) window.localStorage.setItem(storeKey(article.id as string), JSON.stringify({ fingerprint, jobs: next }));
          else window.localStorage.removeItem(storeKey(article.id as string));
        } catch { /* quota / private mode */ }
      })
      .catch(() => undefined);
  };

  const patchJob = (locale: Locale, patch: Partial<LangJob> | ((j: LangJob) => Partial<LangJob>)) =>
    setJobs((cur) => {
      const prev = cur[locale] ?? { status: 'translate' as JobStatus };
      const next = { ...cur, [locale]: { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) } };
      persist(next);
      return next;
    });

  const sourceChars = article.title.length + article.excerpt.length + article.body_md.length + (article.meta_description ?? '').length + article.faq.reduce((n, f) => n + f.q.length + f.a.length, 0);
  const estimate = estimateMultilangCost({ bodyChars: sourceChars, languages: targets.length, price: info?.price });
  const overBudget = estimate !== null && info?.spent !== null && info?.spent !== undefined && info.budget ? info.spent + estimate >= info.budget : false;

  const runOne = async (to: Locale): Promise<void> => {
    patchJob(to, { status: 'translate', error: undefined, translation: undefined, findings: undefined, findingsError: undefined, edit: undefined, editError: undefined, editState: undefined, savedNote: undefined, cost: 0 });
    let cost = 0;
    let unknown = false;
    const track = (run?: AiRunInfo) => {
      if (!run) return;
      onRun(run);
      if (run.estCostUsd === null) unknown = true;
      else cost += run.estCostUsd;
    };
    let tr: Translation;
    try {
      const r = await callAi<Translation>({
        action: 'translate',
        locale: article.locale,
        to,
        insightId: article.id,
        preset,
        title: article.title,
        excerpt: article.excerpt,
        body: article.body_md,
        seoTitle: article.seo_title ?? '',
        metaDescription: article.meta_description ?? '',
        ogTitle: article.og_title ?? '',
        ogDescription: article.og_description ?? '',
        faq: article.faq,
        tags: article.tags,
        coverAlt: article.cover_alt ?? '',
        coverCaption: article.cover_caption ?? '',
      });
      track(r.run);
      tr = r.result;
    } catch (e) {
      patchJob(to, { status: 'error', error: e instanceof Error ? e.message : 'Çeviri başarısız oldu.' });
      return;
    }
    patchJob(to, { status: 'check', translation: tr });
    const reviewText = `${tr.title}\n\n${tr.excerpt}\n\n${tr.body}`;
    const [review, edit] = await Promise.allSettled([
      callAi<{ findings: StyleFinding[] }>({ action: 'style_review', locale: to, insightId: article.id, preset, text: reviewText }),
      callAi<{ text: string; changes: string[] }>({ action: 'style_edit', locale: to, insightId: article.id, preset, text: tr.body }),
    ]);
    if (review.status === 'fulfilled') track(review.value.run);
    if (edit.status === 'fulfilled') track(edit.value.run);
    patchJob(to, {
      status: 'ready',
      findings: review.status === 'fulfilled' ? review.value.result.findings : null,
      findingsError: review.status === 'rejected' ? (review.reason instanceof Error ? review.reason.message : 'Yazım kalıbı incelemesi başarısız.') : undefined,
      edit: edit.status === 'fulfilled' ? { before: tr.body, after: edit.value.result.text, changes: edit.value.result.changes } : null,
      editError: edit.status === 'rejected' ? (edit.reason instanceof Error ? edit.reason.message : 'Düzenleme başarısız.') : undefined,
      editState: edit.status === 'fulfilled' ? 'pending' : undefined,
      cost: unknown ? null : Math.round(cost * 10_000) / 10_000,
    });
  };

  const runAll = async (only?: Locale[]) => {
    if (busy) return;
    const list = only ?? targets;
    const existing = list.filter((l) => siblings.some((s) => s.locale === l));
    if (!only && overBudget && !window.confirm(`Tahmini maliyet ($${estimate?.toFixed(3)}) ile bu ayın tahmini harcaması aylık eşiği ($${info?.budget}) aşabilir; eşik aşılırsa sonraki istekler durur. Devam edilsin mi?`)) return;
    if (!only && existing.length && !window.confirm(`${existing.map((l) => l.toUpperCase()).join(', ')} dilinde zaten bir yazı var. Yeni çeviri kaydedildiğinde taslaksa önce sürüm geçmişine alınıp güncellenir; yayındaysa değiştirilmez, öneri olarak saklanır. Devam edilsin mi?`)) return;
    setBusy(`Diller hazırlanıyor: ${list.map((l) => l.toUpperCase()).join(', ')} (çeviri + yazım kalıbı + düzenleme, 2–4 dk)…`);
    setActive(list[0]);
    setRestoredStale(false);
    try {
      await Promise.all(list.map((l) => runOne(l)));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const ready = targets.filter((l) => jobs[l]?.status === 'ready' && jobs[l]?.translation);
    if (!ready.length) return;
    const pending = ready.filter((l) => jobs[l]?.editState === 'pending');
    if (pending.length && !window.confirm(`${pending.map((l) => l.toUpperCase()).join(', ')}: düzenleme önerisi henüz uygulanmadı ya da kapatılmadı. Çeviri düzenlemesiz kaydedilsin mi?`)) return;
    setSaving(true);
    const fingerprint = await sourceFingerprint(fields);
    const errors = await onSave(ready.map((l) => ({ locale: l, translation: jobs[l]!.translation as Translation })), fingerprint);
    setSaving(false);
    for (const l of ready) {
      const msg = errors[l];
      if (msg && msg.startsWith('!')) patchJob(l, { error: msg.slice(1) });
      else patchJob(l, { status: 'saved', savedNote: msg || 'Taslak olarak kaydedildi.', error: undefined });
    }
  };

  const setTr = (l: Locale, patch: Partial<Translation>) => patchJob(l, (j) => ({ translation: j.translation ? { ...j.translation, ...patch } : j.translation }));

  if (isTranslation) {
    return <p className="text-[12px] text-muted">Bu yazı bir çeviri. Diğer dilleri kaynak yazıdan oluşturun.</p>;
  }

  const job = jobs[active];
  const tr = job?.translation;
  const dir = active === 'ar' ? 'rtl' : 'ltr';
  const field = 'admin-input !text-[13px]';
  const label = 'grid gap-1 text-[12px] font-semibold text-muted';
  const small = 'admin-btn !px-2.5 !py-1 !text-[12px]';
  const anyReady = targets.some((l) => jobs[l]?.status === 'ready');
  const totalCost = targets.reduce<number | null>((sum, l) => (sum === null || jobs[l]?.cost === null ? null : sum + (jobs[l]?.cost ?? 0)), 0);
  const blocked = !article.id || dirty || !article.body_md.trim() || !article.title.trim();

  return (
    <div className="grid gap-3 text-[13px]">
      <p className="text-muted">Kaynak dil: <strong className="text-white">{NAME[article.locale]}</strong>. Tek düğmeyle {targets.map((l) => NAME[l]).join(', ')} hazırlanır: tüm alanlar (SEO, OG, SSS, etiketler, kapak metni, slug) çevrilir, her dilde yazım kalıpları incelenir ve en az değişiklikle düzenleme önerilir. Kaydedene kadar hiçbir şey yazılmaz; kaydedilenler taslaktır.</p>
      <div className="grid gap-1 border border-line p-2 text-[12px]">
        <p>Tahmini maliyet: <strong className="text-white">{estimate === null ? 'bilinmiyor (modelin fiyatı tabloda yok — istek engellenir)' : `~$${estimate.toFixed(3)}`}</strong> <span className="text-subtle">· {targets.length} dil × 3 istek · {info?.model ?? '…'}</span></p>
        {info?.spent !== null && info?.spent !== undefined && info.budget ? <p className="text-subtle">Bu ay tahmini: ${info.spent.toFixed(3)} / eşik ${info.budget}</p> : null}
        {overBudget && <p className="font-bold text-yellow-300">Bu işlemle aylık tahmini kullanım eşiği aşılabilir. Eşik aşılırsa sonraki yapay zekâ istekleri durur (eşik kesin bir harcama sınırı değildir).</p>}
      </div>
      {blocked && <p className="text-[12px] text-yellow-300">{!article.id ? 'Önce yazıyı kaydedin.' : dirty ? 'Önce kaydedin; çeviri kaydedilmiş metinden yapılır.' : 'Başlık ve gövde dolu olmalı.'}</p>}
      <button type="button" className="admin-btn-primary w-fit" disabled={!!busy || blocked || estimate === null} onClick={() => runAll()}>Tüm dilleri oluştur</button>
      {restoredStale && <p className="text-[12px] text-yellow-300">Bu tarayıcıda kaydedilmemiş çeviriler bulundu, ancak kaynak metin o zamandan beri değişti. Yeniden oluşturmanız önerilir.</p>}

      {Object.keys(jobs).length > 0 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Diller">
            {targets.map((l) => {
              const j = jobs[l];
              const badge = !j ? '—' : j.status === 'translate' ? 'çevriliyor…' : j.status === 'check' ? 'inceleniyor…' : j.status === 'ready' ? 'hazır' : j.status === 'saved' ? 'kaydedildi' : 'hata';
              return (
                <button key={l} type="button" role="tab" aria-selected={active === l} onClick={() => setActive(l)} className={`px-2.5 py-1 text-[12px] font-bold ${active === l ? 'bg-yoca-lime text-black' : j?.status === 'error' ? 'border border-red-500/50 text-red-300' : 'border border-line text-muted hover:text-white'}`}>
                  {l.toUpperCase()} · {badge}
                </button>
              );
            })}
          </div>

          {job?.error && (
            <div className="grid gap-2 border border-red-500/40 p-2 text-[12px] text-red-300">
              <p>{job.error}</p>
              <button type="button" className={`${small} w-fit`} disabled={!!busy || blocked} onClick={() => runAll([active])}>{NAME[active]} için yeniden dene</button>
            </div>
          )}
          {job?.savedNote && <p className="text-[12px] text-yoca-green">{job.savedNote}</p>}

          {tr && (
            <div className="grid gap-3" dir="ltr">
              <label className={label}>Başlık<input dir={dir} value={tr.title} onChange={(e) => setTr(active, { title: e.target.value })} className={field} disabled={job?.status === 'saved'} /></label>
              <label className={label}>Özet<textarea dir={dir} value={tr.excerpt} onChange={(e) => setTr(active, { excerpt: e.target.value })} rows={2} className={field} disabled={job?.status === 'saved'} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>SEO başlığı ({tr.seoTitle.length}/60)<input dir={dir} value={tr.seoTitle} onChange={(e) => setTr(active, { seoTitle: e.target.value })} className={field} disabled={job?.status === 'saved'} /></label>
                <label className={label}>Slug<input value={tr.slug} onChange={(e) => setTr(active, { slug: e.target.value })} className={field} disabled={job?.status === 'saved'} /></label>
              </div>
              <label className={label}>Meta açıklama ({tr.metaDescription.length}/155)<textarea dir={dir} value={tr.metaDescription} onChange={(e) => setTr(active, { metaDescription: e.target.value })} rows={2} className={field} disabled={job?.status === 'saved'} /></label>
              <details className="border border-line p-2 text-[12px]">
                <summary className="cursor-pointer font-bold text-muted">OG, SSS ({tr.faq.length}), etiketler ({tr.tags.length}), kapak metni</summary>
                <div className="mt-2 grid gap-1 text-muted" dir={dir}>
                  <p><span className="text-subtle">OG:</span> {tr.ogTitle || '—'} — {tr.ogDescription || '—'}</p>
                  <p><span className="text-subtle">Etiketler:</span> {tr.tags.join(', ') || '—'}</p>
                  <p><span className="text-subtle">Kapak alt metni:</span> {tr.coverAlt || '—'} · <span className="text-subtle">açıklama:</span> {tr.coverCaption || '—'}</p>
                  {tr.faq.map((f, i) => <p key={i}><strong className="text-soft">{f.q}</strong> {f.a}</p>)}
                </div>
              </details>

              <section className="grid gap-2">
                <p className="font-bold text-white">Yazım kalıpları ({NAME[active]})</p>
                {job?.status === 'check' && <p className="text-[12px] text-subtle">İnceleniyor…</p>}
                {job?.findingsError && <p className="text-[12px] text-yellow-300">{job.findingsError}</p>}
                {job?.findings && (job.findings.length === 0 ? <p className="text-yoca-green">Listelenen kalıplardan biri bulunmadı.</p> : (
                  <ul className="grid max-h-64 gap-2 overflow-auto">
                    {job.findings.map((f, i) => (
                      <li key={i} className="border border-line p-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-yellow-300">{PATTERN_LABEL[f.pattern] ?? f.pattern}</p>
                        <p dir={dir} className="text-white">“{f.excerpt}”</p>
                        <p className="text-[12px] text-muted">Öneri: {f.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                ))}
              </section>

              <section className="grid gap-2">
                <p className="font-bold text-white">Metni düzenle ({NAME[active]})</p>
                {job?.editError && <p className="text-[12px] text-yellow-300">{job.editError}</p>}
                {job?.edit && job.editState === 'pending' && job.status !== 'saved' && (
                  <div dir={dir}>
                    <DiffView
                      before={tr.body}
                      after={job.edit.after}
                      changes={job.edit.changes}
                      onApply={(text) => patchJob(active, (j) => ({ translation: j.translation ? { ...j.translation, body: text } : j.translation, editState: 'applied' }))}
                      onCancel={() => patchJob(active, { editState: 'dismissed' })}
                    />
                  </div>
                )}
                {job?.editState === 'applied' && <p className="text-[12px] text-yoca-green">Seçilen düzenlemeler çeviriye uygulandı.</p>}
                {job?.editState === 'dismissed' && <p className="text-[12px] text-subtle">Düzenleme önerisi kapatıldı; çeviri olduğu gibi.</p>}
              </section>

              <details className="border border-line p-2">
                <summary className="cursor-pointer text-[12px] font-bold text-muted">Gövde (elle düzenlenebilir)</summary>
                <textarea dir={dir} value={tr.body} onChange={(e) => setTr(active, { body: e.target.value })} rows={14} className={`${field} mt-2 font-mono !text-[12px]`} disabled={job?.status === 'saved'} />
              </details>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="admin-btn-primary" disabled={!anyReady || saving || !!busy} onClick={save}>{saving ? 'Kaydediliyor…' : 'Dil taslaklarını kaydet'}</button>
            {totalCost !== null && totalCost > 0 && <span className="text-[11px] text-subtle">Bu işlemin tahmini maliyeti: ${totalCost.toFixed(4)}</span>}
          </div>
          <p className="text-[11px] text-subtle">Kaydedilen çeviriler taslaktır. Her biri, o dili bilen biri okuyup “Dil kontrolü yapıldı” işaretlenmeden yayınlanamaz. Kategori, hizmet, CTA, kaynaklar ve kapak görseli kaynak yazıdan kopyalanır.</p>
        </div>
      )}
    </div>
  );
}
