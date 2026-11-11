'use client';

import { useSyncExternalStore } from 'react';
import { MotionGlobalConfig } from 'framer-motion';

/**
 * Yoca — hydration-safe "prefers-reduced-motion" (use instead of framer's
 * useReducedMotion in components that render on the server).
 *
 * framer's hook reads matchMedia during the very first client render, so a
 * visitor with "reduce motion" on hydrated a different tree / different
 * initial styles than the server sent (the server cannot know the setting):
 * React #418/#423, the page was thrown away and rendered again on the client.
 *
 * Here:
 *  - while hydrating the hook returns false, exactly what the server rendered;
 *    right after hydration React re-renders with the real value (no remount);
 *    on client-side navigation the real value is used from the first render;
 *  - so that the hydration frame cannot start any movement for those
 *    visitors, framer's global skipAnimations is switched on as soon as this
 *    module loads in the browser (before hydration): every framer animation
 *    jumps straight to its end state. Both follow live preference changes.
 */

const QUERY = '(prefers-reduced-motion: reduce)';
const mql: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;

if (mql) {
  MotionGlobalConfig.skipAnimations = mql.matches;
  mql.addEventListener?.('change', (event) => {
    MotionGlobalConfig.skipAnimations = event.matches;
  });
}

function subscribe(onChange: () => void) {
  mql?.addEventListener?.('change', onChange);
  return () => mql?.removeEventListener?.('change', onChange);
}

const clientValue = () => mql?.matches ?? false;
const serverValue = () => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, clientValue, serverValue);
}
