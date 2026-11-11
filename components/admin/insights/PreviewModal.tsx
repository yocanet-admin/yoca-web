'use client';

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { Markdown } from '@/lib/markdown';
import { replaceImageRefs } from '@/lib/insightImages';

/**
 * Yoca Admin — in-editor preview (desktop / mobile width, cover crop).
 * Uses the current, unsaved editor state and short-lived signed URLs for
 * draft images. Nothing here is public.
 */

interface Props {
  title: string;
  excerpt: string;
  body: string;
  locale: string;
  coverUrl: string | null;
  coverAlt: string;
  imageUrls: Record<string, string>;
  onClose: () => void;
}

export default function PreviewModal({ title, excerpt, body, locale, coverUrl, coverAlt, imageUrls, onClose }: Props) {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const md = replaceImageRefs(body, imageUrls);
  return (
    <div role="dialog" aria-modal="true" aria-label="Önizleme" className="fixed inset-0 z-[80] grid grid-rows-[auto_1fr] bg-[rgb(4_5_7/94%)]">
      {/* the shared panel bar: kicker on the left, segmented width switch, primary close */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line,#262a31)] bg-[var(--island,#101216)] px-4 py-3">
        <p className="admin-kicker min-w-0">Önizleme · kaydedilmemiş değişiklikler dahil · herkese açık değil</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="admin-tabs" role="group" aria-label="Önizleme genişliği">
            <button type="button" className="admin-tab" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>Masaüstü</button>
            <button type="button" className="admin-tab" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')}>Mobil (390 px)</button>
          </div>
          <button type="button" className="admin-btn-primary" onClick={onClose}>Kapat</button>
        </div>
      </div>
      <div className="overflow-auto p-4">
        <article dir={locale === 'ar' ? 'rtl' : 'ltr'} className={`mx-auto bg-[#0b0b0b] p-6 text-white ${width === 'mobile' ? 'max-w-[390px]' : 'max-w-[860px]'}`}>
          <h1 className="text-[clamp(28px,4vw,44px)] font-extrabold leading-tight tracking-[-0.02em]">{title || 'Başlıksız'}</h1>
          {excerpt && <p className="mt-4 text-[18px] leading-relaxed text-soft">{excerpt}</p>}
          {coverUrl && (
            <figure className="mt-6">
              <img src={coverUrl} alt={coverAlt} className={`w-full object-cover ${width === 'mobile' ? 'aspect-[4/5]' : 'aspect-[16/9]'}`} />
              <figcaption className="mt-1 text-[11px] text-subtle">{width === 'mobile' ? 'Mobil kırpım (4:5) önizlemesi' : 'Kapak (16:9) önizlemesi'}</figcaption>
            </figure>
          )}
          <div className="mt-8">
            <Markdown md={md} className="prose-yoca mx-auto" />
          </div>
        </article>
      </div>
    </div>
  );
}
