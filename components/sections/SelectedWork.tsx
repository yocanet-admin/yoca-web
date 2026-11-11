import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import ProjectCard, { type ProjectCardData } from '@/components/work/ProjectCard';

/**
 * Yoca — "Selected projects" (home, soft-white section).
 * Replaces the endlessly scrolling capture strip with a still, scannable
 * grid: the first project runs full width, the rest sit two per row.
 * Real captures only; every card shows name, scope and link without hover.
 */
interface SelectedWorkProps {
  home: Dict['home'];
  viewLabel: string;
  base: string;
  projects: Array<ProjectCardData & { transition: boolean }>;
}

export default function SelectedWork({ home, viewLabel, base, projects }: SelectedWorkProps) {
  if (projects.length === 0) return null;
  const rest = projects.length - 1;
  return (
    <section className="section-light relative z-[7] py-20 lg:py-32" aria-labelledby="selected-work-title">
      <div className="container-y">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6" data-reveal="auto">
          <div>
            <p className="eyebrow !text-[rgba(5,5,5,0.62)]">{home.workEyebrow}</p>
            <h2 id="selected-work-title" className="mt-5 max-w-[18ch] text-[clamp(34px,4.6vw,64px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
              {home.workTitle}
            </h2>
          </div>
          <Link
            href={`${base}/work`}
            className="inline-flex min-h-12 items-center gap-2 rounded-sm border border-[rgba(5,5,5,0.22)] px-6 py-3 text-[15px] font-bold transition-colors duration-200 hover:border-[#050505] hover:bg-[#050505] hover:text-white"
          >
            {home.workAll} <span aria-hidden="true" className="icon-arrow">→</span>
          </Link>
        </div>

        <ul className="mt-12 grid gap-x-6 gap-y-14 md:grid-cols-2 lg:mt-16 lg:gap-x-8 lg:gap-y-20">
          {projects.map((project, index) => {
            // First card full width; an unpaired last card also takes the full row.
            const wide = index === 0 || (rest % 2 === 1 && index === projects.length - 1);
            return (
              <li key={project.slug} className={wide ? 'md:col-span-2' : ''} data-reveal="auto">
                <ProjectCard
                  project={project}
                  href={`${base}/work/${project.slug}`}
                  size={wide ? 'wide' : 'half'}
                  viewLabel={viewLabel}
                  transition={project.transition}
                  priority={index === 0}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
