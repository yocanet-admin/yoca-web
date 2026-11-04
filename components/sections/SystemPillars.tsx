import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import { brandText } from '@/components/ui/BrandText';

/**
 * Yoca — "One methodology. Three connected systems." (soft-white)
 *
 * Canonical order never changes: 01 Yoca Brand System™ → 02 Yoca Growth
 * Engine™ → 03 Yoca Scale Framework™.
 *
 * The three systems are set as a stair that steps down from left to
 * right — the same stepped rhythm as the modules of the Yoca mark — joined
 * by one connector line. Each step: its colour module (ink → green → lime),
 * number, name, tagline, body, points and the link to its service anchor.
 * Static, the stair already tells the order; while scrolling in, the steps
 * settle and the connector draws (CSS scroll-driven, progressive). Phones:
 * a vertical run on a single rail, each step indented one module further.
 * Server component, no JavaScript.
 */

interface SystemPillarsProps {
  t: Dict['systems'];
  base: string;
}

const ANCHORS = ['brand', 'growth', 'scale'];
const TONE = ['bg-[#050505]', 'bg-yoca-green', 'bg-yoca-lime'];
/** Desktop step offset per system (px). */
const STEP = [0, 88, 176];

export default function SystemPillars({ t, base }: SystemPillarsProps) {
  const items = t.items.slice(0, 3);

  return (
    <section className="section-light relative z-[7] pb-24 pt-24 lg:pb-32 lg:pt-36" aria-labelledby="systems-title">
      <div className="container-y">
        {/* Head */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <h2 id="systems-title" className="max-w-[14ch] text-[clamp(40px,5.6vw,84px)] font-extrabold leading-[0.98] tracking-[-0.045em] rtl:leading-[1.25]">
            {t.heading}
          </h2>
          <p className="light-muted max-w-[42ch] text-[16px] leading-[1.65] lg:justify-self-end lg:text-[18px]">{t.sub}</p>
        </div>

        {/* The stair */}
        <div className="relative mt-14 lg:mt-24">
          {/* Connector across the three modules (desktop) */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 hidden h-[200px] w-full overflow-visible lg:block rtl:-scale-x-100"
            viewBox="0 0 1200 200"
            preserveAspectRatio="none"
          >
            <path
              pathLength={1}
              className="ystair-link"
              d="M 34 14 H 412 V 102 H 824 V 190 H 1200"
              fill="none"
              stroke="rgba(5,5,5,0.28)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <ol className="relative grid border-s border-[rgba(5,5,5,0.16)] ps-6 lg:grid-cols-3 lg:gap-8 lg:border-0 lg:ps-0">
            {items.map((system, index) => (
              <li key={system.name} className="ystep relative pb-12 last:pb-0 lg:pb-0" style={{ ['--rise' as string]: `${32 + index * 24}px` }}>
                <div className="lg:[margin-top:var(--step)]" style={{ ['--step' as string]: `${STEP[index]}px` }}>
                  <Link href={`${base}/services#${ANCHORS[index]}`} className="group relative block rounded-[2px] focus-visible:outline-offset-[6px]">
                    {/* The step's module, sitting on the connector / rail */}
                    <span
                      aria-hidden="true"
                      className={`slant relative -ms-[37px] block h-[22px] w-[26px] transition-transform duration-300 ease-out group-hover:scale-110 motion-reduce:transition-none lg:ms-0 lg:h-[28px] lg:w-[34px] ${TONE[index]}`}
                    />
                    <div className="mt-6 border-t-2 border-[#050505] pt-5 lg:mt-8">
                      <p aria-hidden="true" className="text-[13px] font-extrabold tracking-[0.12em] text-[#267800]">
                        {String(index + 1).padStart(2, '0')}
                      </p>
                      <h3 className="mt-3 text-[clamp(26px,2.4vw,34px)] font-extrabold leading-[1.05] tracking-[-0.03em] transition-transform duration-[250ms] ease-out group-hover:translate-x-1 rtl:group-hover:-translate-x-1 motion-reduce:transform-none">
                        {system.name}
                      </h3>
                      <p className="light-subtle mt-2 text-[12px] font-bold uppercase tracking-[0.14em]">{brandText(system.tagline)}</p>
                      <p className="light-muted mt-5 max-w-[38ch] text-[16px] leading-[1.65]">{system.body}</p>
                      <ul className="mt-6 grid gap-2">
                        {system.points.map((point) => (
                          <li key={point} className="flex items-center gap-2.5 text-[14px] font-semibold text-[rgba(5,5,5,0.8)]">
                            <span aria-hidden="true" className={`slant block h-2 w-2.5 flex-none ${TONE[index]}`} />
                            {point}
                          </li>
                        ))}
                      </ul>
                      <span className="mt-7 inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#267800]">
                        {String(index + 1).padStart(2, '0')} <span aria-hidden="true" className="icon-arrow">→</span>
                      </span>
                    </div>
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
