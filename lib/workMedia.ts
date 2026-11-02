/**
 * Yoca — case-study media manifest.
 *
 * AUTHENTIC media only: real browser captures of the live sites Yoca built.
 * Never generated screens. The hero is a device presentation of those
 * captures; only the blurred room behind the devices may be an AI-made
 * backdrop. The interaction loop is a scroll through a real full-page capture. Register a file here ONLY when it exists in /public/work/<slug>/;
 * the case-study page renders a chapter per registered slot and shows the
 * clean typographic cover otherwise.
 *
 *   hero.webp          1920×1200  large project hero (device presentation)
 *   brand-01.webp      1600×1000  identity / brand system board
 *   desktop-01.webp    1920×1200  desktop screen (browser frame)
 *   desktop-02.webp    1920×1200  second desktop screen
 *   mobile-01.webp     900×1800   phone screen
 *   mobile-02.webp     900×1800   second phone screen
 *   interaction.webm   1600×1000  ≤ 8 s muted loop, with poster interaction.webp
 */

export interface WorkMedia {
  hero?: string;
  brand?: string[];
  desktop?: string[];
  mobile?: string[];
  interaction?: { video: string; poster: string };
}

/** Captures: live sites, 1440×1000 @2x desktop and 390×844 @3x mobile (Oct–Nov 2026).
 *  mehmet-altioklar: captured in the owner's browser (desktop 1440 wide, mobile 390 wide at 2×), Nov 2026. */
function real(slug: string): WorkMedia {
  return {
    hero: `/work/${slug}/hero.webp`,
    desktop: [`/work/${slug}/desktop-01.webp`, `/work/${slug}/desktop-02.webp`],
    mobile: [`/work/${slug}/mobile-01.webp`, `/work/${slug}/mobile-02.webp`],
    interaction: { video: `/work/${slug}/interaction.webm`, poster: `/work/${slug}/interaction.webp` },
  };
}

export const WORK_MEDIA: Record<string, WorkMedia> = {
  'prime-wash-car': real('prime-wash-car'),
  'sp-medya': real('sp-medya'),
  cleova: real('cleova'),
  sunsoft: real('sunsoft'),
  'mehmet-altioklar': real('mehmet-altioklar'),
};

export function getWorkMedia(slug: string): WorkMedia {
  return WORK_MEDIA[slug] ?? {};
}
