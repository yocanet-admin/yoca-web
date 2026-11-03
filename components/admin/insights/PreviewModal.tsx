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
    <div role="dialog" aria-modal="true" aria-label="Önizleme" className="fixed inset-0 z-50 grid grid-rows-[auto_1fr] bg-black/90">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">Önizleme · kaydedilmemiş değişiklikler dahil · herkese açık değil</p>
        <div className="flex gap-2">
          <button type="button" className={`admin-btn ${width === 'desktop' ? '!border-yoca-lime !text-yoca-lime' : ''}`} onClick={() => setWidth('desktop')}>Masaüstü</button>
          <button type="button" className={`admin-btn ${width === 'mobile' ? '!border-yoca-lime !text-yoca-lime' : ''}`} onClick={() => setWidth('mobile')}>Mobil (390 px)</button>
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
