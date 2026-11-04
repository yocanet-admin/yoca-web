'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch, slugify } from '@/lib/insightsAdmin';
import { editableFields, LANG_STATE_LABEL, langState, LOCALE_NAME, OUTCOME_LABEL, type Blocker, type BulkMode, type BulkOutcome, type GroupLocale } from '@/lib/insightGroup';
import type { InsightRow } from '@/types';
import type { EditorState } from '@/components/admin/insights/InsightEditor';

/**
 * Yoca Admin — "Yayınla" for one article, every language in one screen.
 *
 * Opening the dialog asks the server for a dry run on the text as it is in
 * the editors (unsaved edits included): per language its title, state,
 * what would happen (Yayımla / Güncelle / Değişiklik yok) and what blocks it.
 * Ready languages are ticked one by one or with "Hazır dillerin tümünü seç".
 * A translation without the language check can be ticked too; it is then
 * published only when the admin also ticks the explicit confirmation for
 * exactly those languages (never pre-ticked, never assumed).
 * "Seçilen dilleri yayınla" sends one request with one request key: the
 * server saves each selected language's current edits, checks, publishes,
 * and reports per language (yayımlandı / güncellendi / değişmedi / başarısız).
 * The same key is reused on "Tekrar dene", so a retry or a double click
 * cannot publish twice. Languages that are not selected are not touched.
 */

export interface BulkResultItem {
  insightId: string;
  locale: string;
  title: string;
  mode: BulkMode | null;
  outcome?: BulkOutcome;
  blockers: Blocker[];
  warnings: string[];
  changed: boolean | null;
  needsReview: boolean;
  reviewSet?: boolean;
  fingerprint?: string;
  publishAt?: string | null;
  replay?: boolean;
}

interface Language {
  locale: GroupLocale;
  member: InsightRow | null;
  editor: EditorState | null;
}

interface Props {
  groupId: string;
  languages: Language[];
  onClose: () => void;
  onFinished: (results: BulkResultItem[]) => void;
}

/** The editor's unsaved "Çalışma durumu" choice: publishing sets the version to "Yayında" instead. */
function statusEdited(ed: EditorState | null): boolean {
  return Boolean(ed?.dirty && ed.base && ed.row.status !== ed.base.status);
}

const MODE_LABEL: Record<BulkMode, string> = { publish: 'Yayımla', update: 'Güncelle', unchanged: 'Değişiklik yok' };
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function BulkPublishDialog({ groupId, languages: given, onClose, onFinished }: Props) {
  // What the editors held when the dialog opened (the dialog covers them while it is open).
  const [languages] = useState(given);
  const requestKey = useRef<string>(crypto.randomUUID());
  const [verdicts, setVerdicts] = useState<Record<string, BulkResultItem> | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [keepFirst, setKeepFirst] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ items: BulkResultItem[]; summary: string } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [sentItems, setSentItems] = useState<unknown[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // What each language would send: its version, the base it was loaded from, its unsaved edits.
  const items = useMemo(() => languages.filter((l) => l.member).map((l) => {
    const m = l.member as InsightRow;
    const ed = l.editor;
    const changes = ed?.dirty ? { ...editableFields(ed.row as unknown as Record<string, unknown>), slug: slugify(String(ed.row.slug || ed.row.title)) } : undefined;
    return { insightId: m.id, locale: l.locale, expectedUpdatedAt: ed?.loadedUpdatedAt ?? m.updated_at, changes };
  }), [languages]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!items.length) { setVerdicts({}); return; }
      const r = await adminFetch<{ results?: BulkResultItem[] }>('/api/admin/insights/publish-group', { json: { groupId, dryRun: true, items: items.map(({ locale: _l, ...i }) => { void _l; return i; }) } });
      if (!alive) return;
      if (!r.ok || !r.results) { setCheckError(r.error ?? 'Kontrol yapılamadı.'); return; }
      setVerdicts(Object.fromEntries(r.results.map((x) => [x.insightId, x])));
    })();
    return () => { alive = false; };
  }, [groupId, items]);

  useEffect(() => {
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  const hard = (v: BulkResultItem) => v.blockers.filter((b) => b.code !== 'language_review');
  const needsConfirm = (v: BulkResultItem) => v.blockers.some((b) => b.code === 'language_review');
  const unknownPublished = (v: BulkResultItem) => v.mode === 'unchanged' && v.changed === null;
  const selectable = (v: BulkResultItem | undefined) => Boolean(v && hard(v).length === 0 && (v.mode !== 'unchanged' || unknownPublished(v)));
  const isReady = (v: BulkResultItem | undefined) => Boolean(v && selectable(v) && !needsConfirm(v) && !unknownPublished(v));

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const readyIds = verdicts ? Object.values(verdicts).filter(isReady).map((v) => v.insightId) : [];
  const chosen = verdicts ? Array.from(selected).map((id) => verdicts[id]).filter(Boolean) : [];
  const reviewLocales = chosen.filter(needsConfirm).map((v) => v.locale.toUpperCase());
  const reviewKey = reviewLocales.join(',');
  useEffect(() => { setReviewConfirmed(false); }, [reviewKey]);
  const hasUpdate = chosen.some((v) => v.mode === 'update' || unknownPublished(v));
  const canRun = chosen.length > 0 && !running && (!reviewLocales.length || reviewConfirmed);

  const run = async (payload?: unknown[]) => {
    const body = payload ?? items.filter((i) => selected.has(i.insightId)).map(({ locale: _l, ...i }) => {
      void _l;
      const v = verdicts?.[i.insightId];
      const confirm = Boolean(v && needsConfirm(v) && reviewConfirmed);
      // The confirmation is bound to the exact text checked in this dialog.
      return { ...i, confirmReview: confirm, reviewFingerprint: confirm ? v?.fingerprint : undefined, forceUpdate: Boolean(v && unknownPublished(v)) };
    });
    setSentItems(body);
    setRunning(true);
    setRunError(null);
    const r = await adminFetch<{ results?: BulkResultItem[]; summary?: string }>('/api/admin/insights/publish-group', { json: { groupId, requestKey: requestKey.current, keepFirstPublishDate: keepFirst, items: body } });
    setRunning(false);
    if (!r.ok || !r.results) {
      // No answer (network, timeout): the result is unknown. "Tekrar dene" sends the same request key.
      setRunError(r.error ?? 'Sunucudan yanıt alınamadı.');
      return;
    }
    setResults({ items: r.results, summary: r.summary ?? '' });
    onFinished(r.results);
  };

  const rowFor = (l: Language) => {
    const v = l.member ? verdicts?.[l.member.id] : undefined;
    const current = l.editor?.row ?? l.member;
    const state = langState(current as InsightRow | null);
    return { v, state };
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-title" className="admin-card grid max-h-[90vh] w-full max-w-[860px] gap-4 overflow-y-auto !bg-surface-deep shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bulk-title" className="text-lg font-extrabold">Yayınla · diller</h2>
            <p className="text-[12px] text-muted">Seçtiğiniz dillerin editördeki güncel hâli kaydedilir, denetlenir ve yayımlanır. Seçmediğiniz diller değişmez. Yayın e-posta göndermez.</p>
          </div>
          <button type="button" className="admin-btn !px-2.5 !py-1" onClick={onClose} disabled={running}>Kapat</button>
        </div>

        {checkError && <p className="text-[13px] text-red-300">Denetim yapılamadı: {checkError}</p>}
        {!verdicts && !checkError && <p className="text-[13px] text-muted" role="status">Diller denetleniyor…</p>}

        {verdicts && !results && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-subtle">{readyIds.length ? `${readyIds.length} dil hazır.` : 'Hazır dil yok.'}</p>
              <button type="button" className="admin-btn !px-2.5 !py-1 !text-[12px]" disabled={!readyIds.length || running} onClick={() => setSelected((cur) => new Set([...Array.from(cur), ...readyIds]))}>Hazır dillerin tümünü seç</button>
            </div>
            <ul className="grid gap-2">
              {languages.map((l) => {
                const { v, state } = rowFor(l);
                const canPick = selectable(v);
                const id = l.member?.id;
                return (
                  <li key={l.locale} className={`grid gap-1.5 border p-3 ${id && selected.has(id) ? 'border-yoca-lime' : 'border-line'}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="checkbox"
                        aria-label={`${LOCALE_NAME[l.locale]} seç`}
                        disabled={!canPick || running}
                        checked={Boolean(id && selected.has(id))}
                        onChange={() => id && toggle(id)}
                        className="h-4 w-4"
                      />
                      <span className="w-8 text-[13px] font-extrabold">{l.locale.toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white" dir={l.locale === 'ar' ? 'rtl' : 'ltr'}>{v?.title || l.member?.title || (l.member ? '(başlıksız)' : '—')}</span>
                      <span className="border border-line px-1.5 py-0.5 text-[11px] font-bold text-muted">{LANG_STATE_LABEL[state]}</span>
                      {v?.mode && (canPick || v.mode === 'unchanged') && <span className={`px-1.5 py-0.5 text-[11px] font-bold ${v.mode === 'unchanged' ? 'text-subtle' : 'bg-white text-black'}`}>{unknownPublished(v) ? 'Güncelle (karşılaştırılamıyor)' : MODE_LABEL[v.mode]}</span>}
                    </div>
                    {!l.member && <p className="ps-7 text-[12px] text-subtle">Bu dilde sürüm yok. Önce o dilin sekmesinde “Çeviri oluştur”.</p>}
                    {l.editor?.dirty && <p className="ps-7 text-[12px] text-yellow-200">Kaydedilmemiş düzenleme var; seçerseniz bu işlemle kaydedilir.</p>}
                    {l.editor && l.editor.base?.language_reviewed && l.editor.row.language_reviewed === false && <p className="ps-7 text-[12px] text-yellow-200">Editörde dil kontrolü kaldırıldı; bu dil, aşağıda yeniden onaylanmadan yayımlanmaz.</p>}
                    {statusEdited(l.editor) && <p className="ps-7 text-[12px] text-subtle">Editördeki çalışma durumu seçimi kaydedilmedi; yayımlanırsa durum “Yayında” olur.</p>}
                    {v && v.mode === 'unchanged' && !unknownPublished(v) && <p className="ps-7 text-[12px] text-subtle">Yayındaki metin değişmedi; tekrar yayımlanmaz.</p>}
                    {v && unknownPublished(v) && <p className="ps-7 text-[12px] text-subtle">Bu sürüm, değişiklik takibinden önce yayımlanmış; yayındakiyle karşılaştırılamıyor. Seçerseniz yeniden kaydedilip güncellenir.</p>}
                    {v && v.mode === 'update' && <p className="ps-7 text-[12px] text-muted">Yayında · {v.changed ? 'değişiklik var' : ''} · ilk yayın {fmt(l.member?.publish_at)}</p>}
                    {v?.blockers.map((b) => (
                      <p key={b.code + b.text} className={`ps-7 text-[12px] ${b.code === 'language_review' ? 'text-yellow-200' : 'text-red-300'}`}>
                        <span aria-hidden="true">{b.code === 'language_review' ? '◐ ' : '✕ '}</span>{b.code === 'language_review' ? 'Dil kontrolü onayı gerekiyor (aşağıda).' : b.text}
                      </p>
                    ))}
                    {v?.warnings.filter((w) => !w.startsWith('Kaydedilmemiş')).map((w) => <p key={w} className="ps-7 text-[12px] text-yellow-200">! {w}</p>)}
                  </li>
                );
              })}
            </ul>

            {reviewLocales.length > 0 && (
              <label className="flex items-start gap-2 border border-yellow-400/40 bg-yellow-400/10 p-3 text-[13px] text-yellow-100">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} disabled={running} />
                <span><strong>Dil kontrolü: {reviewLocales.join(', ')}.</strong> Bu dillerdeki metinleri o dili bilen biri okudu ve kontrol etti. “Dil kontrolü yapıldı” sizin adınızla ve şimdiki saatle kaydedilsin. (İşaretlemezseniz bu diller yayımlanmaz.)</span>
              </label>
            )}
            {hasUpdate && (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" checked={keepFirst} onChange={(e) => setKeepFirst(e.target.checked)} disabled={running} className="h-4 w-4" />
                Güncellenen dillerde ilk yayın tarihini koru
              </label>
            )}
            {runError && (
              <div className="grid gap-2 border border-red-500/40 p-3 text-[13px] text-red-300">
                <p>{runError} Sonuç bilinmiyor. “Tekrar dene” aynı işlem kimliğiyle gönderir; tamamlanmış diller ikinci kez yayımlanmaz.</p>
                <button type="button" className="admin-btn w-fit" disabled={running} onClick={() => run(sentItems ?? undefined)}>Tekrar dene</button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-[12px] text-subtle">
                {!chosen.length ? 'Yayımlanacak dili seçin.' : reviewLocales.length && !reviewConfirmed ? `${reviewLocales.join(', ')} için dil kontrolü onayı bekleniyor.` : `Seçili: ${chosen.map((v) => `${v.locale.toUpperCase()} (${unknownPublished(v) ? 'Güncelle' : MODE_LABEL[v.mode as BulkMode]})`).join(', ')}`}
              </p>
              <button type="button" className="admin-btn-primary" disabled={!canRun} onClick={() => run()}>{running ? 'Yayımlanıyor…' : 'Seçilen dilleri yayınla'}</button>
            </div>
          </>
        )}

        {results && (
          <div className="grid gap-3" role="status">
            <p className={`text-[14px] font-bold ${results.items.some((r) => r.outcome === 'failed') ? 'text-yellow-200' : 'text-yoca-green'}`}>{results.summary}</p>
            <ul className="grid gap-2">
              {results.items.map((r) => (
                <li key={r.insightId} className={`grid gap-1 border p-3 ${r.outcome === 'failed' ? 'border-red-500/50' : 'border-line'}`}>
                  <p className="text-[13px]"><strong className="me-2">{r.locale.toUpperCase()}</strong><span className={r.outcome === 'failed' ? 'font-bold text-red-300' : 'font-bold text-yoca-green'}>{OUTCOME_LABEL[r.outcome ?? 'failed']}</span>{r.replay ? <span className="text-subtle"> (önceki denemede tamamlanmıştı)</span> : null}{r.publishAt && r.outcome !== 'failed' ? <span className="text-subtle"> · yayın tarihi {fmt(r.publishAt)}</span> : null}{r.reviewSet && r.outcome !== 'failed' ? <span className="text-subtle"> · dil kontrolü kaydedildi</span> : null}</p>
                  {r.outcome === 'failed' && r.blockers.map((b) => <p key={b.text} className="text-[12px] text-red-300">✕ {b.text}</p>)}
                </li>
              ))}
            </ul>
            {(() => {
              const sent = new Set(results.items.map((r) => r.insightId));
              const untouched = languages.filter((l) => l.member && !sent.has(l.member.id)).map((l) => l.locale.toUpperCase());
              return untouched.length ? <p className="text-[12px] text-subtle">Seçilmeyen diller değişmedi: {untouched.join(', ')}.</p> : null;
            })()}
            {results.items.some((r) => r.outcome === 'failed') && <p className="text-[12px] text-subtle">Başarısız dillerin düzenlemeleri editörde duruyor. Sorunu giderip yeniden “Yayınla” diyebilirsiniz.</p>}
            <button type="button" className="admin-btn w-fit" onClick={onClose}>Kapat</button>
          </div>
        )}
      </div>
    </div>
  );
}
