'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Yoca — case-study video ("system in motion").
 * Poster first; the 8-second WebM is only attached when the element is near
 * the viewport, plays muted/inline while visible and pauses when it leaves.
 * Under prefers-reduced-motion the poster is shown and nothing plays.
 */
interface CaseStudyVideoProps {
  src: string;
  poster: string;
  alt: string;
  className?: string;
}

export default function CaseStudyVideo({ src, poster, alt, className }: CaseStudyVideoProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const visible = useRef(false);

  useEffect(() => {
    if (reduced || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible.current = entry.isIntersecting;
          if (entry.isIntersecting) {
            setNear(true);
            if (el.currentSrc) el.play().catch(() => undefined);
          } else {
            el.pause();
          }
        });
      },
      { rootMargin: '25% 0px', threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  // The source is attached only once the video comes near; start it then
  // (play() before a source exists never loads with preload="none").
  useEffect(() => {
    if (near && visible.current) ref.current?.play().catch(() => undefined);
  }, [near]);

  if (reduced) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt={alt} width={1600} height={900} loading="lazy" className={`block h-auto w-full ${className ?? ''}`} />;
  }

  return (
    <video
      ref={ref}
      src={near ? src : undefined}
      poster={poster}
      muted
      playsInline
      loop
      preload="none"
      aria-label={alt}
      className={`block h-auto w-full ${className ?? ''}`}
    />
  );
}
