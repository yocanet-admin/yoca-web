'use client';

/* eslint-disable @next/next/no-img-element */
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — media reveal + micro-parallax.
 * Clip-reveals from the start edge when entering, then the whole frame drifts
 * a few pixels against scroll (±14px). The image is never cropped: it always
 * shows edge to edge, which matters for narrow phone captures. Static under
 * reduced motion.
 */
interface ParallaxMediaProps {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  /** Video sources render a muted, lazy, looping <video> with poster. */
  video?: { src: string; poster: string };
  priority?: boolean;
}

export default function ParallaxMedia({ src, alt = '', width, height, className, video, priority }: ParallaxMediaProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [14, -14]);

  return (
    <motion.figure
      ref={ref}
      initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
      whileInView={{ clipPath: 'inset(0 0% 0 0)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.9, ease: EASE_YOCA }}
      style={{ y: reduced ? 0 : y }}
      className={`overflow-hidden border border-line bg-surface ${className ?? ''}`}
    >
      <div>
        {video ? (
          <video
            src={video.src}
            poster={video.poster}
            muted
            playsInline
            loop
            autoPlay
            preload="none"
            className="block h-auto w-full"
          />
        ) : (
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            className="block h-auto w-full"
          />
        )}
      </div>
    </motion.figure>
  );
}
