'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';

/**
 * Yoca — Ambient & Theme Engine.
 *
 * 1. 3%-opacity film grain / noise overlay (pure CSS texture).
 * 2. Soft blurred mesh-gradient orbs drifting behind the content.
 * 3. Interactive lime spotlight that follows the mouse (spring-smoothed).
 *
 * All layers are pointer-events-none and respect prefers-reduced-motion.
 */
export default function AmbientBackground() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [spotlightOn, setSpotlightOn] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 120, damping: 26, mass: 0.6 });
  const springY = useSpring(mouseY, { stiffness: 120, damping: 26, mass: 0.6 });

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(hover: hover)').matches) return;

    const onMove = (event: MouseEvent) => {
      mouseX.set(event.clientX);
      mouseY.set(event.clientY);
      setSpotlightOn(true);
    };
    const onLeave = () => setSpotlightOn(false);

    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [mouseX, mouseY, prefersReducedMotion]);

  return (
    <>
      {/* Mesh gradient orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[5] overflow-hidden mix-blend-screen"
      >
        <div
          className="absolute -top-56 h-[560px] w-[560px] rounded-full opacity-50 blur-[120px] motion-safe:animate-orb-drift"
          style={{ background: 'radial-gradient(circle, rgba(162,255,0,0.10), transparent 70%)', right: '-160px' }}
        />
        <div
          className="absolute top-[45%] h-[480px] w-[480px] rounded-full opacity-50 blur-[120px] motion-safe:animate-orb-drift"
          style={{
            background: 'radial-gradient(circle, rgba(64,196,1,0.07), transparent 70%)',
            left: '-220px',
            animationDelay: '-9s',
          }}
        />
        <div
          className="absolute -bottom-44 h-[420px] w-[420px] rounded-full opacity-50 blur-[120px] motion-safe:animate-orb-drift"
          style={{
            background: 'radial-gradient(circle, rgba(38,120,0,0.08), transparent 70%)',
            right: '18%',
            animationDelay: '-17s',
          }}
        />
      </div>

      {/* Mouse spotlight follower */}
      {!prefersReducedMotion && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[6] mix-blend-screen transition-opacity duration-500"
          style={{ opacity: spotlightOn ? 1 : 0 }}
        >
          <motion.div
            className="absolute h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: springX,
              top: springY,
              background: 'radial-gradient(circle, rgba(162,255,0,0.05), transparent 65%)',
            }}
          />
        </motion.div>
      )}

      {/* Film grain / noise — 3% opacity */}
      <div
        aria-hidden="true"
        className="grain-texture pointer-events-none fixed -inset-1/2 z-[80] opacity-[0.03]"
      />
    </>
  );
}
