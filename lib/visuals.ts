/**
 * Yoca — key visuals (abstract studio objects made for Yoca with ChatGPT;
 * no people, screens, logos or numbers). Files live in /public/visuals:
 *   services/<service-slug>.webp   1512×1008  service page band
 *   about.webp, checkup.webp       1512×1008  page bands
 *   og/<name>.jpg                  1200×630   social share images
 * Insights without their own cover borrow the visual of their topic.
 */

const CATEGORY_VISUAL: Record<string, string> = {
  strategy: 'checkup',
  brand: 'brand-strategy-identity',
  digital: 'web-digital-experiences',
  growth: 'growth-performance',
  ai: 'ai-automation',
  product: 'digital-product-development',
};

function visualPath(name: string): string {
  return name === 'checkup' || name === 'about' ? `/visuals/${name}.webp` : `/visuals/services/${name}.webp`;
}

/** Fallback cover for an insight category (null when the category is unknown). */
export function categoryCover(key: string | null | undefined): string | null {
  const name = key ? CATEGORY_VISUAL[key] : undefined;
  return name ? visualPath(name) : null;
}

/** Fallback share image for an insight category. */
export function categoryOgImage(key: string | null | undefined): string | null {
  const name = key ? CATEGORY_VISUAL[key] : undefined;
  return name ? `/visuals/og/${name}.jpg` : null;
}
