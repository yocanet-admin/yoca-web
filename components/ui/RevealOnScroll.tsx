'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Yoca — progressive section reveal (one observer per page).
 *
 * Server HTML is always fully visible: elements marked [data-reveal] are only
 * hidden by this script, only while they are still BELOW the viewport, and
 * only when the visitor has not asked for reduced motion. When one scrolls
 * in, it rises 20px and fades in over ~500 ms (CSS in globals.css). No JS,
 * no IntersectionObserver or reduced motion → nothing is ever hidden.
 */
export default function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = 'in';
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    const vh = window.innerHeight;
    document.querySelectorAll<HTMLElement>('[data-reveal=""], [data-reveal="auto"]').forEach((el) => {
      if (el.getBoundingClientRect().top < vh * 0.92) return; // already on screen: leave it alone
      el.dataset.reveal = 'pending';
      io.observe(el);
    });
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
