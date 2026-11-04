import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import { MARK_PATHS } from '@/components/ui/BrandMark';
import { brandText } from '@/components/ui/BrandText';

/**
 * Yoca — homepage hero (type-led composition).
 *
 * The promise is set at display scale across the full measure, on the
 * same horizontal construction lines the Yoca mark is drawn on. The two
 * emphasised words sit on lime modules (the mark's 4.83° parallelogram)
 * instead of a thin underline. Everything else — the mark, the three
 * systems, the description and both actions — is gathered in one ruled
 * base bar under the title.
 *
 * Motion is CSS only, so the title is in the first HTML and never waits
 * for JavaScript: words rise out of their line boxes, the lime modules
 * slide in behind the emphasised words, the base rule draws, the mark's
 * three pieces dock into place (~1.1 s in total, once). With reduced
 * motion everything is simply there. Server component.
 */

interface HeroProps {
  t: Dict['hero'];
  /** Locale base path, e.g. "/tr". */
  base: string;
  /** System names for the base bar (01 → 02 → 03). */
  rail?: string[];
}

const PUNCT = /^([\s.,;:!?"'()«»،؛؟\-–—]*)(.*?)([\s.,;:!?"'()«»،؛؟\-–—]*)$/;

/** Title words as rise-in spans; emphasised words get the lime module. */
function Title({ text, emphasis }: { text: string; emphasis: string[] }) {
  const marks = new Set(emphasis.map((e) => (PUNCT.exec(e)?.[2] ?? e).toLocaleLowerCase()));
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => {
        const [, lead = '', core = word, trail = ''] = PUNCT.exec(word) ?? [];
        const isMark = marks.has(core.toLocaleLowerCase());
        return (
          <span key={i}>
            <span className="hero-word" style={{ ['--i' as string]: i }}>
              <span>
                {lead}
                {isMark ? <span className="hero-mark-word">{core}</span> : core}
                {trail}
              </span>
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </>
  );
}

/** The Yoca mark, exact logo geometry; the three pieces dock in once. */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="-1 -0.5 70 70.5" aria-hidden="true" focusable="false" className={`hero-logo overflow-visible ${className ?? ''}`}>
      <path d={MARK_PATHS.lime} fill="#A2FF00" className="hero-logo-lime" />
      <path d={MARK_PATHS.green} fill="#40C401" className="hero-logo-green" />
      <path d={MARK_PATHS.y} fill="#FFFFFF" className="hero-logo-y" />
    </svg>
  );
}

export default function Hero({ t, base, rail = [] }: HeroProps) {
  return (
    <section className="hero relative z-[7] overflow-hidden bg-surface-deep">
      {/* Construction lines (the mark's horizontal guides), static */}
      <div aria-hidden="true" className="hero-guides pointer-events-none absolute inset-0" />

      <div className="container-y relative flex min-h-[100svh] flex-col pb-16 pt-[104px] lg:min-h-[min(100svh,980px)] lg:pb-24 lg:pt-[128px]">
        {/* Top row: eyebrow · (mobile) mark */}
        <div className="flex items-start justify-between gap-6">
          <p className="eyebrow hero-fade" style={{ ['--d' as string]: '0ms' }}>
            {brandText(t.eyebrow)}
          </p>
          <Mark className="h-[76px] w-auto flex-none lg:hidden" />
        </div>

        {/* The promise — display scale, full measure */}
        <h1 className="hero-title mt-7 text-[clamp(36px,10.2vw,64px)] font-extrabold leading-[1.02] tracking-[-0.045em] sm:text-[clamp(56px,9vw,88px)] lg:mt-10 lg:text-[clamp(88px,7vw,124px)] lg:leading-[0.98] rtl:leading-[1.28]">
          {/* Desktop: the mark is set into the title block, two lines tall, at the end of the first lines */}
          <Mark className="hero-title-mark hidden lg:block" />
          <Title text={t.title} emphasis={t.emphasis} />
        </h1>

        {/* Base bar: mark · systems · description · actions */}
        <div className="hero-bar relative mt-auto pt-12 lg:pt-16">
          <span aria-hidden="true" className="hero-rule absolute inset-x-0 top-12 block h-px bg-[rgba(255,255,255,0.18)] lg:top-16" />
          <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_auto] lg:items-end lg:gap-12 lg:pt-10">

            {rail.length > 0 && (
              <ol className="hero-fade order-3 grid gap-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle lg:order-none" style={{ ['--d' as string]: '620ms' }}>
                {rail.map((name, index) => (
                  <li key={name} className="flex items-center gap-3">
                    <span className="w-5 text-yoca-lime">{String(index + 1).padStart(2, '0')}</span>
                    <bdi lang="en">{name}</bdi>
                  </li>
                ))}
              </ol>
            )}

            <p className="hero-fade max-w-[50ch] text-[16px] leading-[1.65] text-muted lg:text-[17px]" style={{ ['--d' as string]: '540ms' }}>
              {t.description}
            </p>

            <div className="hero-fade grid gap-3 sm:flex sm:flex-wrap lg:grid lg:justify-items-stretch" style={{ ['--d' as string]: '700ms' }}>
              <Link href={`${base}/contact`} className="btn-primary h-[52px] justify-between gap-6 px-6 text-base">
                <span className="roll">
                  <span>{t.primaryCta}</span>
                  <span aria-hidden="true">{t.primaryCta}</span>
                </span>
                <span aria-hidden="true" className="icon-arrow">→</span>
              </Link>
              <Link href={`${base}/checkup`} className="btn-ghost h-[52px] justify-between gap-6 px-6 text-base">
                <span className="roll">
                  <span>{t.secondaryCta}</span>
                  <span aria-hidden="true">{t.secondaryCta}</span>
                </span>
                <span aria-hidden="true" className="slant block h-2.5 w-3 flex-none bg-yoca-lime" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
