/* eslint-disable @next/next/no-img-element */
import Reveal from '@/components/ui/Reveal';

/**
 * Yoca — page key visual (services, about, check-up).
 * A wide, decorative image band under the page intro. The visuals are
 * abstract studio objects made for Yoca (no people, screens, logos or
 * numbers), so they carry no information: alt is empty by default.
 * 3:2 on phones, a calm 21:9 crop from lg up (subject sits centre-right).
 */
interface PageVisualProps {
  src: string;
  alt?: string;
  /** Above the fold on most screens → load eagerly. */
  priority?: boolean;
  /** Section background behind the band (matches the intro by default). */
  tone?: 'deep' | 'surface';
}

export default function PageVisual({ src, alt = '', priority = false, tone = 'deep' }: PageVisualProps) {
  return (
    <section className={`relative z-[7] pb-12 lg:pb-20 ${tone === 'deep' ? 'bg-surface-deep' : 'bg-surface'}`}>
      <div className="container-y">
        <Reveal mode="mask">
          <figure className="relative overflow-hidden rounded-md border border-line bg-[#0b0b0b]">
            <img
              src={src}
              alt={alt}
              width={1536}
              height={1024}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              {...(priority ? { fetchPriority: 'high' as const } : {})}
              className="block aspect-[3/2] h-auto w-full object-cover object-[62%_50%] lg:aspect-[21/9]"
            />
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
