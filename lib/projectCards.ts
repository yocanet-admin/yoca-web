import type { CaseStudy } from '@/lib/workData';
import { getWorkMedia } from '@/lib/workMedia';
import type { ProjectCardData } from '@/components/work/ProjectCard';

/**
 * Yoca — shared project-card data + rollout switch for the new detail layout.
 *
 * NEW_CASE_LAYOUT: project detail pages that use the 2026 layout (large cover
 * first, then need → work → screens → verified results → next). Only these
 * get the card → detail cover transition. Prime Wash Car is the first one for
 * review; the rest join after approval by adding their slug here.
 */
export const NEW_CASE_LAYOUT = new Set<string>(['prime-wash-car']);

export function hasNewCaseLayout(slug: string): boolean {
  return NEW_CASE_LAYOUT.has(slug);
}

export function toCardData(study: CaseStudy): ProjectCardData {
  const media = getWorkMedia(study.slug);
  return {
    slug: study.slug,
    name: study.name,
    services: study.services,
    sector: study.sector,
    year: study.year,
    cover: media.hero ?? (study.image && study.image.startsWith('/work/') ? study.image : undefined),
    clip: media.interaction,
  };
}
