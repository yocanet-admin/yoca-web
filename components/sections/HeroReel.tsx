'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';

/**
 * Yoca — hero reel window (K72-inspired "video inside the composition",
 * written from scratch). The poster is plain server-rendered <img> (fast
 * first paint, reserved 16:10 box, no layout shift). The muted 8-second loop
 * of a real Yoca site is attached only on screens ≥ 768px without reduced
 * motion, plays only while on screen and pauses when it leaves. Small
 * screens and reduced motion keep the still frame.
 */
interface HeroReelProps {
  video: string;
  poster: string;
  alt: string;
}

export default function HeroReel({ video, poster, alt }: HeroReelProps) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    const v = videoRef.current;
    if (!enabled || !el || !v) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) v.play().catch(() => undefined);
      else v.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  return (
    <span ref={boxRef} className="relative block aspect-[16/10] overflow-hidden rounded-[10px] bg-surface-elevated">
      <img src={poster} alt={alt} width={1600} height={1000} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      {enabled && (
        <video
          ref={videoRef}
          aria-hidden="true"
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          onPlaying={() => setReady(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}
        >
          <source src={video} type='video/webm; codecs="vp9"' />
          <source src={video.replace(/\.webm$/, '.mp4')} type="video/mp4" />
        </video>
      )}
    </span>
  );
}
