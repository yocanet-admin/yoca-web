'use client';

import { useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { LOCALE_NAME, type GroupLocale } from '@/lib/insightGroup';
import { createManualTranslation, saveTranslationsToGroup } from '@/lib/insightTranslations';
import { sourceFingerprint } from '@/lib/ai/translateHelpers';
import type { EditableInsight } from '@/lib/insightsAdmin';
import type { InsightRow, Locale } from '@/types';
import MultilangPanel from '@/components/admin/insights/MultilangPanel';

/**
 * Yoca Admin — a language tab with no version yet: "Çeviri oluştur".
 *  1. AI translation of the saved source article, only for this language
 *     (the same translate → style review → minimal edit flow as "Diller"),
 *     saved as a DRAFT in the same article group;
 *  2. or an empty draft for a manual translation.
 * Both are linked to the source, so they need the language check before
 * they can be published. Nothing here publishes.
 */

interface Props {
  locale: GroupLocale;
  source: InsightRow | null;
  /** The source editor has no unsaved edits (translations are made from the saved text). */
  sourceSaved: boolean;
  onCreated: (id: string) => void | Promise<void>;
  onOpenSource: () => void;
}

export default function MissingLanguage({ locale, source, sourceSaved, onCreated, onOpenSource }: Props) {
  const supabase = getAdminClient();
  const [preset, setPreset] = useState<'economy' | 'quality'>('economy');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const name = LOCALE_NAME[locale];

  const fingerprintOf = (s: InsightRow) => sourceFingerprint({
    title: s.title, excerpt: s.excerpt, body_md: s.body_md, seo_title: s.seo_title, meta_description: s.meta_description,
    og_title: s.og_title, og_description: s.og_description, faq: s.faq ?? [], tags: s.tags ?? [], cover_alt: s.cover_alt, cover_caption: s.cover_caption,
  });

  const findNew = async (): Promise<string | null> => {
    if (!supabase || !source) return null;
    const { data } = await supabase.from('insights').select('id').eq('group_id', source.group_id).eq('locale', locale).order('created_at', { ascending: false }).limit(1);
    return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
  };

  return (
    <div className="grid gap-4">
      <div className="admin-card grid gap-2">
        <p className="text-[15px] font-bold">{name} sürümü yok</p>
        <p className="text-[13px] text-muted">Bu yazının {name} sürümü henüz oluşturulmadı. Oluşturulan sürüm taslaktır; yayımlanmaz. Yayın için o dili bilen birinin dil kontrolü ve üstteki “Yayınla” gerekir.</p>
      </div>

      {!source ? (
        <div className="admin-card text-[13px] text-yellow-200">Bu yazıda kaynak (çeviri olmayan) bir sürüm yok, bu yüzden çeviri oluşturulamıyor.</div>
      ) : (
        <>
          {!sourceSaved && (
            <div className="admin-notice admin-notice-warn flex flex-wrap items-center gap-2">
              Kaynak ({source.locale.toUpperCase()}) sürümünde kaydedilmemiş düzenleme var. Çeviri kaydedilmiş metinden yapılır; önce kaynağı kaydedin.
              <button type="button" className="admin-btn admin-btn-sm" onClick={onOpenSource}>Kaynağa git</button>
            </div>
          )}

          <section className="admin-card grid gap-3" aria-labelledby={`create-ai-${locale}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`create-ai-${locale}`} className="text-[14px] font-bold">Çeviri oluştur · yapay zekâ ile ({source.locale.toUpperCase()} → {locale.toUpperCase()})</h2>
              <label className="flex items-center gap-2 text-[12px] text-muted">Model
                <select value={preset} onChange={(e) => setPreset(e.target.value as 'economy' | 'quality')} className="admin-input !w-auto !py-1 !text-[12px]">
                  <option value="economy">Ekonomik</option>
                  <option value="quality">Kalite</option>
                </select>
              </label>
            </div>
            {busy && <p className="text-[12px] text-yoca-green" role="status">{busy}</p>}
            <MultilangPanel
              article={source as EditableInsight}
              dirty={!sourceSaved}
              siblings={[]}
              preset={preset}
              busy={busy}
              setBusy={setBusy}
              onRun={() => undefined}
              onlyLocales={[locale as Locale]}
              onSave={async (items, fingerprint) => {
                if (!supabase) return { [locale]: '!Oturum yok.' };
                const out = await saveTranslationsToGroup(supabase, source as EditableInsight & { id: string }, items, fingerprint);
                if (!String(out[locale] ?? '').startsWith('!')) {
                  const id = await findNew();
                  if (id) await onCreated(id);
                }
                return out;
              }}
            />
          </section>

          <section className="admin-card grid gap-2" aria-labelledby={`create-manual-${locale}`}>
            <h2 id={`create-manual-${locale}`} className="text-[14px] font-bold">Elle çeviri</h2>
            <p className="text-[12px] text-muted">Boş bir {name} taslağı açar. Kategori, yazar, CTA, kapak ve kaynaklar kaynak yazıdan kopyalanır; metni siz yazarsınız.</p>
            {error && <p className="text-[12px] text-red-300">{error}</p>}
            <button
              type="button"
              className="admin-btn w-fit"
              disabled={creating || !sourceSaved}
              onClick={async () => {
                if (!supabase) return;
                setCreating(true);
                setError(null);
                const r = await createManualTranslation(supabase, source as EditableInsight & { id: string }, locale as Locale, await fingerprintOf(source));
                setCreating(false);
                if (r.error || !r.id) { setError(`Oluşturulamadı: ${r.error ?? ''}`); return; }
                await onCreated(r.id);
              }}
            >
              {creating ? 'Oluşturuluyor…' : `Boş ${name} taslağı oluştur`}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
