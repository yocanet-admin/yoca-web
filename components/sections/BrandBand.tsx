/**
 * Yoca — brand band (the index line "Strateji. Kimlik. Deneyim. Büyüme.").
 *
 * One ruled line set across the full measure on Electric Lime, its long
 * edges cut on a slight lean and overlapping the hero's lower edge, so the
 * dark hero, the band and the soft-white methodology read as one built
 * stack. Desktop: a single justified line that only drifts a few percent
 * while you scroll past (CSS scroll-driven, never on its own). Phones: the
 * four words as a 2 × 2 block — a static arrangement made for the narrow
 * screen, not a squeezed marquee. Decorative (aria-hidden): the same words
 * are already part of the page's text. Server component, no JavaScript.
 */

interface BrandBandProps {
  line: string;
}

export default function BrandBand({ line }: BrandBandProps) {
  const words = line.split('.').map((w) => w.trim()).filter(Boolean);
  return (
    <div aria-hidden="true" className="yband relative z-[8] -mt-6 bg-yoca-lime text-black lg:-mt-10">
      {/* Desktop: one justified line */}
      <div className="hidden overflow-hidden py-9 lg:block">
        <div className="yband-line container-y flex items-center justify-between gap-6">
          {words.map((word, index) => (
            <span key={word} className="flex items-center gap-6">
              <span className="whitespace-nowrap text-[clamp(44px,4.6vw,74px)] font-extrabold leading-none tracking-[-0.045em]">{word}.</span>
              {index < words.length - 1 && <span className="slant block h-[26px] w-[30px] flex-none bg-black" />}
            </span>
          ))}
        </div>
      </div>

      {/* Phones / tablets: a 2 × 2 block */}
      <div className="container-y grid grid-cols-2 gap-x-4 gap-y-3 py-8 lg:hidden">
        {words.map((word, index) => (
          <span key={word} className={`flex items-center gap-2.5 ${index % 2 === 1 ? 'justify-self-end' : ''}`}>
            <span className={`slant block h-3 w-3.5 flex-none ${index % 2 === 0 ? 'bg-black' : 'bg-[#267800]'}`} />
            <span className="text-[clamp(28px,8.4vw,44px)] font-extrabold leading-none tracking-[-0.04em]">{word}.</span>
          </span>
        ))}
      </div>
    </div>
  );
}
