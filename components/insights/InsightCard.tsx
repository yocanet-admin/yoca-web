/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { InsightSummary } from '@/lib/insights';
import { formatInsightDate } from '@/lib/insights';
import type { Locale } from '@/types';
import { categoryCover } from '@/lib/visuals';

/**
 * Yoca — Insights card. Text-first by design: category · title · excerpt ·
 * date · reading time · arrow. A cover is optional and never required for
 * the card to look finished.
 */
interface InsightCardProps {
  item: InsightSummary;
  category: string;
  base: string;
  locale: Locale;
  minRead: string;
  featured?: boolean;
}

export default function InsightCard({ item, category, base, locale, minRead, featured = false }: InsightCardProps) {
  // Articles without their own cover borrow the key visual of their topic.
  const cover = item.cover_url || categoryCover(item.category_key);
  return (
    <Link
      href={`${base}/insights/${item.slug}`}
      className={`group relative flex h-full flex-col overflow-hidden border border-line bg-surface transition-colors duration-300 hover:border-yoca-lime/60 ${featured ? 'lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : ''}`}
    >
      {cover && (
        <span className={`block overflow-hidden ${featured ? 'order-2 aspect-[16/10] lg:aspect-auto' : 'aspect-[16/10]'}`}>
          <img
            src={cover}
            alt={item.cover_url ? item.cover_alt ?? '' : ''}
            width={1600}
            height={1000}
            loading={featured ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        </span>
      )}
      <span className={`flex flex-1 flex-col ${featured ? 'p-8 lg:p-12' : 'p-6 lg:p-7'}`}>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
          {category && <span className="text-yoca-lime">{category}</span>}
          {category && <span aria-hidden="true" className="h-3 w-px bg-line" />}
          <span>{formatInsightDate(item.publish_at, locale)}</span>
          <span aria-hidden="true" className="h-3 w-px bg-line" />
          <span>{item.reading_minutes} {minRead}</span>
        </span>
        <span className={`mt-4 block font-extrabold leading-[1.1] tracking-[-0.025em] transition-transform duration-500 ease-out group-hover:translate-x-1 rtl:group-hover:-translate-x-1 ${featured ? 'text-[clamp(28px,3.4vw,48px)]' : 'text-[clamp(20px,1.8vw,26px)]'}`}>
          {item.title}
        </span>
        <span className={`mt-3 block text-muted ${featured ? 'max-w-[56ch] text-[16px] leading-relaxed lg:text-[17px]' : 'line-clamp-3 text-[15px] leading-relaxed'}`}>
          {item.excerpt}
        </span>
        <span className="mt-auto flex items-center gap-1.5 pt-6 text-[13px] font-extrabold uppercase tracking-[0.08em] text-yoca-lime">
          <span aria-hidden="true" className="icon-arrow">→</span>
        </span>
      </span>
      <span aria-hidden="true" className="absolute bottom-0 start-0 h-[3px] w-0 bg-yoca-lime transition-all duration-300 group-hover:w-full" />
    </Link>
  );
}
