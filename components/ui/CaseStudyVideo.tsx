'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Yoca — case-study video ("system in motion").
 * Poster first; the 8-second WebM is only attached when the element is near
 * the viewport, plays muted/inline while visible and pauses when it leaves.
 * Under prefers-reduced-motion the poster is shown and nothing plays.
 * WebM first, MP4 (H.264) fallback; if neither plays, the poster stays as a still image.
 */
interface CaseStudyVideoProps {
  src: string;
  /** H.264 fallback; defaults to the same path with .mp4. */
  mp4Src?: string;
  poster: string;
  alt: string;
  className?: string;
}

export default function CaseStudyVideo({ src, mp4Src, poster, alt, className }: CaseStudyVideoProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const visible = useRef(false);
  // WebM (VP9) first, H.264 MP4 for browsers without VP9 (older Safari / iOS).
  const mp4 = mp4Src ?? (src.endsWith('.webm') ? src.replace(/\.webm$/, '.mp4') : undefined);

  useEffect(() => {
    if (reduced || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible.current = entry.isIntersecting;
          if (entry.isIntersecting) {
            setNear(true);
            if (el.currentSrc || el.querySelector('source')) el.play().catch(() => undefined);
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
    const el = ref.current;
    if (!near || !el) return;
    el.load(); // pick up the <source> children that were just attached
    if (visible.current) el.play().catch(() => undefined);
  }, [near]);

  // Reduced motion, or no playable source: show the poster as a still image.
  if (reduced || failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt={alt} width={1600} height={900} loading="lazy" className={`block h-auto w-full ${className ?? ''}`} />;
  }

  return (
    <video
      ref={ref}
      poster={poster}
      muted
      playsInline
      loop
      preload="none"
      aria-label={alt}
      onError={() => setFailed(true)}
      className={`block h-auto w-full ${className ?? ''}`}
    >
      {near && <source src={src} type="video/webm" onError={mp4 ? undefined : () => setFailed(true)} />}
      {near && mp4 && <source src={mp4} type="video/mp4" onError={() => setFailed(true)} />}
    </video>
  );
}
