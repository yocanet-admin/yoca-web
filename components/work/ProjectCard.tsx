'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { runCoverTransition, shouldIntercept } from '@/lib/coverTransition';

/**
 * Yoca — shared project card (home "Selected projects" + /work).
 *
 * Layout idea from Ochi (large image, big readable title, small scope tags),
 * rebuilt for Yoca: the name, the scope and the link are ALWAYS visible —
 * nothing depends on hover. On desktop pointers a short muted clip of the
 * real site replaces the cover while hovered; only one clip plays on the
 * whole page at a time. Touch / small screens and reduced motion keep the
 * still cover. Clicking may run the cover → detail transition
 * (lib/coverTransition.ts) when the detail page supports it.
 */

/** The one clip allowed to play at any moment (shared by every card). */
let playing: HTMLVideoElement | null = null;

export interface ProjectCardData {
  slug: string;
  name: string;
  services: string[];
  sector?: string;
  year?: string;
  cover?: string;
  clip?: { video: string; poster: string };
}

interface ProjectCardProps {
  project: ProjectCardData;
  href: string;
  /** Wide = full row (2:1 on md+), half = one column (16:10). */
  size?: 'wide' | 'half';
  tone?: 'light' | 'dark';
  viewLabel: string;
  /** Detail page has a matching cover → run the cover transition. */
  transition?: boolean;
  priority?: boolean;
  headingLevel?: 'h2' | 'h3';
}

export default function ProjectCard({
  project,
  href,
  size = 'half',
  tone = 'light',
  viewLabel,
  transition = false,
  priority = false,
  headingLevel = 'h3',
}: ProjectCardProps) {
  const router = useRouter();
  const frameRef = useRef<HTMLSpanElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const intent = useRef<number | undefined>(undefined);
  const [canHover, setCanHover] = useState(false);
  const [showClip, setShowClip] = useState(false);
  const [clipReady, setClipReady] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(intent.current);
      if (playing === videoRef.current) playing = null;
    },
    [],
  );

  const enter = () => {
    if (!canHover || !project.clip || clipFailed) return;
    window.clearTimeout(intent.current);
    // Short hover intent so sweeping across the grid does not start clips.
    intent.current = window.setTimeout(() => setShowClip(true), 140);
  };
  const leave = () => {
    window.clearTimeout(intent.current);
    if (videoRef.current && playing === videoRef.current) playing = null;
    setShowClip(false);
    setClipReady(false);
  };
  const onPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing && playing !== v) playing.pause();
    playing = v;
  };

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!transition || !project.cover || !frameRef.current || !shouldIntercept(event)) return;
    leave();
    const started = runCoverTransition({
      frame: frameRef.current,
      img: imgRef.current,
      slug: project.slug,
      navigate: () => router.push(href),
    });
    if (started) event.preventDefault();
  };

  const dark = tone === 'dark';
  const Heading = headingLevel;
  const frameAspect = size === 'wide' ? 'aspect-[16/10] md:aspect-[2/1]' : 'aspect-[16/10]';
  const meta = [project.sector, project.year].filter(Boolean).join(' · ');

  return (
    <Link
      href={href}
      onClick={onClick}
      onPointerEnter={(e) => e.pointerType === 'mouse' && enter()}
      onPointerLeave={leave}
      className="group block rounded-[10px] focus-visible:outline-offset-[6px]"
    >
      <span
        ref={frameRef}
        className={`relative block overflow-hidden rounded-[10px] ${frameAspect} ${dark ? 'bg-surface-elevated' : 'bg-[#E4E4DF]'}`}
      >
        {project.cover ? (
          <img
            ref={imgRef}
            src={project.cover}
            alt=""
            width={1920}
            height={1200}
            sizes={size === 'wide' ? '(min-width: 1280px) 1200px, 100vw' : '(min-width: 768px) 50vw, 100vw'}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          /* No authentic capture yet: a quiet typographic plate, never a fake screen. */
          <span aria-hidden="true" className={`absolute inset-0 flex items-end p-6 lg:p-10 ${dark ? 'text-white/10' : 'text-black/10'}`}>
            <span className="text-[clamp(48px,8vw,140px)] font-extrabold leading-none tracking-[-0.05em]">{project.name}</span>
          </span>
        )}
        {showClip && project.clip && (
          <video
            ref={videoRef}
            aria-hidden="true"
            muted
            loop
            playsInline
            autoPlay
            preload="none"
            poster={project.clip.poster}
            onPlay={onPlay}
            onPlaying={() => setClipReady(true)}
            onError={() => setClipFailed(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${clipReady ? 'opacity-100' : 'opacity-0'}`}
          >
            <source src={project.clip.video} type='video/webm; codecs="vp9"' />
            <source src={project.clip.video.replace(/\.webm$/, '.mp4')} type="video/mp4" onError={() => setClipFailed(true)} />
          </video>
        )}
      </span>

      <div className="mt-5 flex items-start justify-between gap-6 lg:mt-6">
        <div className="min-w-0">
          <Heading
            className={`font-extrabold leading-[0.98] tracking-[-0.035em] ${
              size === 'wide' ? 'text-[clamp(34px,4.4vw,68px)]' : 'text-[clamp(28px,3vw,46px)]'
            }`}
          >
            {project.name}
          </Heading>
          {project.services.length > 0 && (
            <span className="mt-4 flex flex-wrap gap-2">
              {project.services.map((service) => (
                <span
                  key={service}
                  className={`rounded-full border px-3 py-1 text-[12px] font-bold uppercase tracking-[0.06em] ${
                    dark ? 'border-line text-muted' : 'border-[rgba(5,5,5,0.22)] text-[rgba(5,5,5,0.72)]'
                  }`}
                >
                  {service}
                </span>
              ))}
            </span>
          )}
          {meta && <span className={`mt-3 block text-[13px] font-semibold ${dark ? 'text-subtle' : 'text-[rgba(5,5,5,0.56)]'}`}>{meta}</span>}
        </div>
        <span
          className={`mt-1 inline-flex flex-none items-center gap-2 whitespace-nowrap text-[13px] font-extrabold uppercase tracking-[0.08em] ${
            dark ? 'text-yoca-lime' : 'text-[#267800]'
          }`}
        >
          <span className="max-sm:sr-only">{viewLabel}</span>
          <span
            aria-hidden="true"
            className={`grid h-11 w-11 place-items-center rounded-full border transition-colors duration-200 ${
              dark ? 'border-line group-hover:border-yoca-lime group-hover:bg-yoca-lime group-hover:text-black' : 'border-[rgba(5,5,5,0.22)] group-hover:border-[#050505] group-hover:bg-[#050505] group-hover:text-yoca-lime'
            }`}
          >
            <span className="icon-arrow">→</span>
          </span>
        </span>
      </div>
    </Link>
  );
}
