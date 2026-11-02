'use client';

import { motion, useScroll, useSpring } from 'framer-motion';
import { usePathname } from 'next/navigation';

/**
 * Yoca — page scroll progress bar.
 * A 2px Electric Lime line under the fixed header that fills as the
 * visitor scrolls; springs for a fluid feel. Not shown in /admin.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-[72px] z-[101] h-[2px] origin-left bg-yoca-lime"
    />
  );
}
