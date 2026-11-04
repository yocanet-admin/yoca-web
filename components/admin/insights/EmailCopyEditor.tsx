'use client';

import { useEffect, useState } from 'react';
import { adminFetch, callAi, type AiRunInfo } from '@/lib/insightsAdmin';

/**
 * Yoca Admin — newsletter e-mail text per published language:
 * subject line, inbox preview line and a short teaser with a hook.
 * "OpenAI ile hazırla" suggests all languages at once (each in its own
 * language, from that version's text); the admin edits and saves. Saving
 * clears the test e-mail, so the next send needs a test with the new text.
 * Empty fields fall back to the article's title and excerpt.
 */

type Copy = { subject: string; preheader: string; teaser: string };
export interface PublishedRef { id: string; locale: string; title: string; excerpt: string }

const NAME: Record<string, string> = { tr: 'Türkçe', en: 'English', az: 'Azərbaycanca', ar: 'العربية' };
const empty: Copy = { subject: '', preheader: '', teaser: '' };
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function EmailCopyEditor({ insightId, published, saved, locked, onSaved }: { insightId: string; published: PublishedRef[]; saved: Record<string, Partial<Copy>>; locked: boolean; onSaved: () => Promise<void> }) {
  const [copy, setCopy] = useState<Record<string, Copy>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [active, setActive] = useState(published[0]?.locale ?? 'tr');

  // Reset only when the saved text or the published languages really change (props are new objects on every render).
  const savedKey = JSON.stringify([published.map((p) => p.id), saved]);
  useEffect(() => {
    setCopy(Object.fromEntries(published.map((p) => [p.locale, { ...empty, ...(saved[p.locale] ?? {}) }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const changed = published.some((p) => JSON.stringify({ ...empty, ...(saved[p.locale] ?? {}) }) !== JSON.stringify(copy[p.locale] ?? empty));
  const set = (l: string, patch: Partial<Copy>) => setCopy((c) => ({ ...c, [l]: { ...(c[l] ?? empty), ...patch } }));

  const suggest = async (only?: string) => {
    const list = only ? published.filter((p) => p.locale === only) : published;
    setBusy(`OpenAI e-posta metni hazırlıyor: ${list.map((p) => p.locale.toUpperCase()).join(', ')}…`);
    setMsg(null);
    let total = 0;
    let unknown = false;
    const errors: string[] = [];
    await Promise.all(list.map(async (p) => {
      try {
        const r = await callAi<{ subject: string; preheader: string; teaser: string; notes: string }>({ action: 'email_teaser', insightId: p.id, locale: p.locale, preset: 'economy' });
        set(p.locale, { subject: r.result.subject, preheader: r.result.preheader, teaser: r.result.teaser });
        setNotes((n) => ({ ...n, [p.locale]: r.result.notes }));
        const run = r.run as AiRunInfo | undefined;
        if (run?.estCostUsd === null) unknown = true;
        else total += run?.estCostUsd ?? 0;
      } catch (e) {
        errors.push(`${p.locale.toUpperCase()}: ${e instanceof Error ? e.message : 'başarısız'}`);
      }
    }));
    setBusy(null);
    setCost(unknown ? null : Math.round(total * 10_000) / 10_000);
    setMsg(errors.length ? errors.join(' · ') : 'Öneriler hazır. Okuyun, gerekirse düzeltin ve kaydedin.');
  };

  const save = async () => {
    setBusy('Kaydediliyor…');
    const r = await adminFetch('/api/admin/newsletter', { json: { action: 'save_copy', insightId, copy } });
    setBusy(null);
    setMsg(r.ok ? 'E-posta metni kaydedildi. Yeni metni görmek için kendinize yeniden deneme gönderin.' : r.error ?? 'Kaydedilemedi.');
    if (r.ok) await onSaved();
  };

  const c = copy[active] ?? empty;
  const ref = published.find((p) => p.locale === active);
  const dir = active === 'ar' ? 'rtl' : 'ltr';
  const field = 'admin-input !text-[13px]';
  const label = 'grid gap-1 text-[12px] font-semibold text-muted';

  return (
    <div className="grid gap-2 border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-white">E-posta metni</p>
        {!locked && <button type="button" className="admin-btn !px-2.5 !py-1 !text-[12px]" disabled={!!busy} onClick={() => suggest()}>OpenAI ile hazırla (tüm diller)</button>}
      </div>
      <p className="text-[12px] text-subtle">Konu satırı, gelen kutusundaki önizleme satırı ve okuru yazıya çeken kısa bir giriş. Yalnızca yazıdaki bilgiler kullanılır; tık tuzağı yok. Boş bırakılırsa başlık ve özet kullanılır.</p>
      <div className="flex flex-wrap gap-1" role="tablist">
        {published.map((p) => (
          <button key={p.locale} type="button" role="tab" aria-selected={active === p.locale} onClick={() => setActive(p.locale)} className={`px-2.5 py-1 text-[12px] font-bold ${active === p.locale ? 'bg-yoca-lime text-black' : 'border border-line text-muted hover:text-white'}`}>
            {p.locale.toUpperCase()}{(copy[p.locale]?.teaser || copy[p.locale]?.subject) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {ref && (
        <div className="grid gap-2" dir="ltr">
          <label className={label}>Konu satırı ({c.subject.length}/60)<input dir={dir} value={c.subject} disabled={locked} onChange={(e) => set(active, { subject: e.target.value })} placeholder={ref.title} className={field} /></label>
          <label className={label}>Önizleme satırı ({c.preheader.length}/100)<input dir={dir} value={c.preheader} disabled={locked} onChange={(e) => set(active, { preheader: e.target.value })} placeholder={ref.excerpt.slice(0, 100)} className={field} /></label>
          <label className={label}>Giriş metni ({words(c.teaser)} kelime; paragrafları boş satırla ayırın)<textarea dir={dir} value={c.teaser} disabled={locked} onChange={(e) => set(active, { teaser: e.target.value })} rows={6} placeholder={ref.excerpt} className={field} /></label>
          {notes[active] && <p className="text-[11px] text-subtle">OpenAI notu: {notes[active]}</p>}
          {!locked && <button type="button" className="admin-btn w-fit !px-2 !py-0.5 !text-[11px]" disabled={!!busy} onClick={() => suggest(active)}>{NAME[active] ?? active} için yeniden öner</button>}
        </div>
      )}
      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="admin-btn-primary !px-3 !py-1 !text-[12px]" disabled={!!busy || !changed} onClick={save}>E-posta metnini kaydet</button>
          {changed && <span className="text-[11px] text-yellow-300">Kaydedilmemiş değişiklik var.</span>}
          {cost !== null && cost > 0 && <span className="text-[11px] text-subtle">Son öneri: ~${cost.toFixed(4)}</span>}
        </div>
      )}
      {busy && <p role="status" className="text-[12px] text-yoca-lime">{busy}</p>}
      {msg && <p className="text-[12px] text-muted">{msg}</p>}
    </div>
  );
}
