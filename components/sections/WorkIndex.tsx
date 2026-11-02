import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import type { Locale } from '@/types';
import { getCaseStudies } from '@/lib/work';
import WorkIndexList from '@/components/sections/WorkIndexList';
import SplitWords from '@/components/ui/SplitWords';

/**
 * Yoca — selected work as a typographic index (Server Component).
 * No image grid: each project is a hairline row — name at display scale,
 * sector · services · year, an honest status label — and on desktop the
 * project visual slides in at the row's end on hover. Reads from the same
 * case_studies source as /work; the "Concept Project" labelling is preserved.
 */

interface WorkIndexProps {
  t: Dict['work'];
  locale: Locale;
  base: string;
  /** Maximum rows on the homepage. */
  limit?: number;
}

export default async function WorkIndex({ t, locale, base, limit = 4 }: WorkIndexProps) {
  const studies = (await getCaseStudies(locale)).slice(0, limit);
  if (studies.length === 0) return null;

  const status = {
    client: t.statusClient,
    concept: t.statusConcept,
    product: t.statusProduct,
    experimental: t.statusExp,
    venture: t.statusVenture,
  } as const;

  return (
    <section className="relative z-[7] border-t border-line bg-surface py-20 lg:py-32" aria-label={t.heading}>
      <div className="container-y">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 className="mt-5 max-w-[16ch] text-[clamp(34px,4.6vw,64px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
              <SplitWords text={t.heading} />
            </h2>
          </div>
          <Link
            href={`${base}/work`}
            className="inline-flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted transition-colors hover:text-yoca-lime"
          >
            {t.allWork} <span aria-hidden="true" className="icon-arrow">→</span>
          </Link>
        </div>

        <WorkIndexList studies={studies} base={base} viewCase={t.viewCase} status={status} />
      </div>
    </section>
  );
}
