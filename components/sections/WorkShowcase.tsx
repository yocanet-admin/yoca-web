/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import type { Locale } from '@/types';
import { getCaseStudies } from '@/lib/work';
import { getWorkMedia } from '@/lib/workMedia';
import SplitWords from '@/components/ui/SplitWords';

/**
 * Yoca — homepage work showcase (Server Component).
 * A live strip instead of a fixed grid: two rows of REAL screen captures
 * (desktop above, phones below) drift in opposite directions. Hovering a row
 * pauses it and reveals the project's name and sector; every screen links to
 * its case study. Grows by itself as projects are added. Under reduced motion
 * the rows stand still and scroll sideways instead.
 */

interface WorkShowcaseProps {
  t: Dict['work'];
  locale: Locale;
  base: string;
}

interface Shot {
  key: string;
  src: string;
  slug: string;
  name: string;
  sector: string;
}

function Row({ shots, base, phone, viewCase, reverse }: { shots: Shot[]; base: string; phone?: boolean; viewCase: string; reverse?: boolean }) {
  if (shots.length === 0) return null;
  const card = phone ? 'h-[clamp(300px,34vw,460px)] aspect-[1/2] rounded-[22px]' : 'h-[clamp(200px,22vw,340px)] aspect-[16/10] rounded-[12px]';
  const copies = [0, 1];
  return (
    <div className="group/row marquee-mask overflow-hidden motion-reduce:overflow-x-auto" dir="ltr">
      <ul
        className={`flex w-max gap-5 animate-marquee motion-reduce:animate-none group-hover/row:[animation-play-state:paused] group-focus-within/row:[animation-play-state:paused] lg:gap-7 ${reverse ? '[animation-direction:reverse]' : ''}`}
        style={{ animationDuration: `${Math.max(40, shots.length * (phone ? 9 : 11))}s` }}
      >
        {copies.map((copy) =>
          shots.map((shot) => (
            <li key={`${copy}-${shot.key}`} aria-hidden={copy === 1 ? true : undefined} className="shrink-0">
              <Link
                href={`${base}/work/${shot.slug}`}
                tabIndex={copy === 1 ? -1 : undefined}
                className={`group/card relative block overflow-hidden border border-line bg-surface ${card}`}
              >
                <img
                  src={shot.src}
                  alt={copy === 1 ? '' : `${shot.name} — ${shot.sector}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover/card:scale-[1.03]"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-16 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-extrabold text-white">{shot.name}</span>
                    <span className="block truncate text-[11px] font-bold uppercase tracking-[0.1em] text-white/70">{shot.sector}</span>
                  </span>
                  <span className="flex-none text-[11px] font-extrabold uppercase tracking-[0.1em] text-yoca-lime">
                    {viewCase} <span aria-hidden="true">→</span>
                  </span>
                </span>
              </Link>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

export default async function WorkShowcase({ t, locale, base }: WorkShowcaseProps) {
  const studies = await getCaseStudies(locale);
  if (studies.length === 0) return null;

  const desktop: Shot[] = [];
  const phones: Shot[] = [];
  for (const study of studies) {
    const media = getWorkMedia(study.slug);
    const shot = (src: string, i: number): Shot => ({ key: `${study.slug}-${i}-${src}`, src, slug: study.slug, name: study.name, sector: study.sector });
    (media.desktop?.length ? media.desktop : study.image ? [study.image] : []).forEach((src, i) => desktop.push(shot(src, i)));
    (media.mobile ?? []).forEach((src, i) => phones.push(shot(src, i)));
  }
  // Interleave projects so the same site never sits twice in a row.
  const interleave = (list: Shot[]) => {
    const groups = new Map<string, Shot[]>();
    for (const s of list) groups.set(s.slug, [...(groups.get(s.slug) ?? []), s]);
    const out: Shot[] = [];
    const queues = Array.from(groups.values());
    while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
    return out;
  };

  return (
    <section className="relative z-[7] overflow-hidden border-t border-line bg-surface py-20 lg:py-32" aria-label={t.heading}>
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
      </div>

      <div className="mt-12 grid gap-5 lg:mt-16 lg:gap-7">
        <Row shots={interleave(desktop)} base={base} viewCase={t.viewCase} />
        <Row shots={interleave(phones)} base={base} viewCase={t.viewCase} phone reverse />
      </div>
    </section>
  );
}
