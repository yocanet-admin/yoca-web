import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import HeroReel from '@/components/sections/HeroReel';
import { MARK_PATHS } from '@/components/ui/BrandMark';

/**
 * Yoca — home hero (2026).
 * Start side: a large, readable promise, one sentence of scope and two clear
 * links (see the work / tell us about your project). End side: a short muted
 * loop of a real Yoca site in a 16:10 window, tied to the type by the two
 * brand modules at its corner (they slide in once, ~0.5 s). Copy rises once
 * via CSS, so the hero is readable even before / without JavaScript, and
 * reduced motion shows everything immediately. No pointer parallax, no
 * looping scroll cue.
 */

export interface HeroReelData {
  slug: string;
  name: string;
  services: string[];
  video: string;
  poster: string;
}

interface HomeHeroProps {
  t: Dict['hero'];
  home: Dict['home'];
  base: string;
  reel: HeroReelData | null;
}

const stripPunct = (word: string) => word.replace(/^[\s.,;:!?"'()«»،؛؟\-–—]+|[\s.,;:!?"'()«»،؛؟\-–—]+$/g, '');

function Title({ text, emphasis }: { text: string; emphasis: string[] }) {
  const marks = new Set(emphasis.map(stripPunct));
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          {marks.has(stripPunct(word)) ? (
            <span className="underline decoration-yoca-lime decoration-[0.06em] underline-offset-[0.1em]">{word}</span>
          ) : (
            word
          )}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

export default function HomeHero({ t, home, base, reel }: HomeHeroProps) {
  return (
    <section className="relative z-[7] overflow-hidden bg-surface-deep pb-16 pt-28 lg:pb-24 lg:pt-36">
      {/* Static structural grid — the only backdrop, no motion */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'linear-gradient(#1A1E26 1px, transparent 1px), linear-gradient(90deg, #1A1E26 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'linear-gradient(180deg, #000 30%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 30%, transparent 95%)',
        }}
      />

      <div className={`container-y relative grid gap-12 lg:items-center lg:gap-14 ${reel ? 'lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]' : ''}`}>
        <div>
          <p className="eyebrow hero-rise">{t.eyebrow}</p>
          <h1
            className="hero-rise mt-6 max-w-[14ch] text-[clamp(42px,5.6vw,88px)] font-extrabold leading-[0.98] tracking-[-0.045em] rtl:leading-[1.2]"
            style={{ animationDelay: '60ms' }}
          >
            <Title text={t.title} emphasis={t.emphasis} />
          </h1>
          <p className="hero-rise mt-7 max-w-[46ch] text-[17px] leading-relaxed text-muted lg:text-[19px]" style={{ animationDelay: '120ms' }}>
            {t.description}
          </p>
          <div className="hero-rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: '180ms' }}>
            <Link href={`${base}/work`} className="btn-primary px-7 py-4 text-base">
              {home.ctaWork} <span aria-hidden="true" className="icon-arrow">→</span>
            </Link>
            <Link href={`${base}/contact`} className="btn-ghost px-7 py-4 text-base">
              {home.ctaBrief}
            </Link>
          </div>
        </div>

        {reel && (
          <div className="hero-rise relative" style={{ animationDelay: '140ms' }}>
            {/* The two modules of the Yoca mark (exact logo geometry), docking at the reel's corner once */}
            <svg viewBox="-0.5 0 26.5 33.5" aria-hidden="true" focusable="false" className="absolute -top-7 start-5 z-10 h-12 w-auto overflow-visible rtl:-scale-x-100 lg:-top-9 lg:h-16">
              <path d={MARK_PATHS.lime} fill="#A2FF00" className="hero-square" style={{ animationDelay: '320ms', transformBox: 'fill-box' }} />
              <path d={MARK_PATHS.green} fill="#40C401" className="hero-square" style={{ animationDelay: '400ms', transformBox: 'fill-box', ['--from-x' as string]: '24px', ['--from-y' as string]: '-24px' }} />
            </svg>
            <Link href={`${base}/work/${reel.slug}`} className="group block rounded-[10px] focus-visible:outline-offset-[6px]">
              <HeroReel video={reel.video} poster={reel.poster} alt={`${reel.name} — ${home.reelLabel}`} />
              <span className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{home.reelLabel}</span>
                <span className="text-[14px] font-bold text-soft transition-colors duration-200 group-hover:text-yoca-lime">
                  {reel.name}
                  {reel.services.length > 0 && <span className="font-semibold text-muted"> · {reel.services.join(', ')}</span>}
                  <span aria-hidden="true" className="icon-arrow ms-2">→</span>
                </span>
              </span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
