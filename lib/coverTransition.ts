/**
 * Yoca — project card → detail cover transition (client only).
 *
 * The idea comes from the Codrops "image to content" demo, implemented from
 * scratch for the Next.js App Router:
 *   1. On a plain click the navigation starts IMMEDIATELY (router.push) —
 *      the effect never waits in front of the route change.
 *   2. Meanwhile a fixed copy of the clicked cover grows from the card's
 *      rectangle towards the detail cover's position over a quiet backdrop.
 *   3. When the detail page has rendered its cover
 *      ([data-cover-target="<slug>"]), the copy settles on that exact
 *      rectangle and fades away, revealing the real cover underneath.
 * Anything unusual falls back to normal navigation: modified / middle clicks,
 * reduced motion, an image that has not loaded, a missing target (other
 * layouts) or a slow network (hard cap). Back / forward and direct links are
 * never intercepted.
 */

const GROW_MS = 420;
const SETTLE_MS = 220;
const FADE_MS = 200;
const HARD_CAP_MS = 2400;
const EASE = 'cubic-bezier(0.22, 0.72, 0.32, 1)';

type Box = { top: number; left: number; width: number; height: number };

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function px(b: Box) {
  return { top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px` };
}

/** Where the detail cover will most likely sit: container width, 2:1 (16:10 on small screens), below the header. */
function guessTarget(): Box {
  const vw = document.documentElement.clientWidth;
  const container = document.querySelector('.container-y');
  let left = 20;
  let width = vw - 40;
  if (container) {
    const r = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    left = r.left + parseFloat(cs.paddingLeft);
    width = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }
  const ratio = vw >= 768 ? 2 : 1.6;
  return { top: vw >= 1024 ? 96 : 88, left, width, height: width / ratio };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shouldIntercept(event: React.MouseEvent): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    prefersReducedMotion() ||
    typeof Element.prototype.animate !== 'function'
  );
}

/**
 * Starts the overlay and calls `navigate()` right away. Returns false when the
 * transition cannot run (the caller then lets the link navigate normally).
 */
export function runCoverTransition(opts: { frame: HTMLElement; img: HTMLImageElement | null; slug: string; navigate: () => void }): boolean {
  const { frame, img, slug, navigate } = opts;
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const start = boxOf(frame);
  const radius = getComputedStyle(frame).borderRadius;

  const backdrop = document.createElement('div');
  backdrop.setAttribute('aria-hidden', 'true');
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '90',
    background: '#0D0E12',
    opacity: '0',
    pointerEvents: 'none',
  });

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed',
    zIndex: '91',
    overflow: 'hidden',
    borderRadius: radius,
    pointerEvents: 'none',
    ...px(start),
  });
  const copy = document.createElement('img');
  copy.src = img.currentSrc || img.src;
  copy.alt = '';
  Object.assign(copy.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
  layer.appendChild(copy);
  document.body.append(backdrop, layer);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    window.clearTimeout(cap);
    window.removeEventListener('popstate', cleanup);
    const fade = { opacity: [1, 0] };
    const timing = { duration: FADE_MS, easing: EASE, fill: 'forwards' as const };
    layer.animate(fade, timing);
    backdrop.animate(fade, timing).finished.finally(() => {
      layer.remove();
      backdrop.remove();
    });
  };

  backdrop.animate({ opacity: [0, 1] }, { duration: GROW_MS * 0.7, easing: EASE, fill: 'forwards' });
  const grow = layer.animate([px(start), px(guessTarget())], { duration: GROW_MS, easing: EASE, fill: 'forwards' });

  const settle = (target: Element) => {
    if (done) return;
    observer.disconnect();
    const realImg = target.querySelector('img');
    const go = () =>
      grow.finished
        .catch(() => undefined)
        .then(() => {
          if (done) return;
          const to = boxOf(target);
          const from = boxOf(layer);
          return layer
            .animate([px(from), { ...px(to), borderRadius: getComputedStyle(target).borderRadius }], { duration: SETTLE_MS, easing: EASE, fill: 'forwards' })
            .finished.catch(() => undefined);
        })
        .then(cleanup);
    if (realImg && !realImg.complete) {
      realImg.addEventListener('load', go, { once: true });
      realImg.addEventListener('error', cleanup, { once: true });
    } else {
      go();
    }
  };

  const targetPath = new URL((frame.closest('a') as HTMLAnchorElement | null)?.href ?? location.href).pathname;
  const check = () => {
    const target = document.querySelector(`[data-cover-target="${CSS.escape(slug)}"]`);
    if (target) return settle(target);
    // Arrived on the page but it has no matching cover (other layout) → just fade out.
    if (location.pathname === targetPath) window.setTimeout(() => (document.querySelector(`[data-cover-target="${CSS.escape(slug)}"]`) ? check() : cleanup()), 120);
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true });
  const cap = window.setTimeout(cleanup, HARD_CAP_MS);
  window.addEventListener('popstate', cleanup);

  navigate();
  return true;
}
