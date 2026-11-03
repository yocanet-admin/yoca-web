/* eslint-disable @next/next/no-img-element */
import { fetchTeam } from '@/lib/supabase';
import type { Dict } from '@/lib/i18n';

/**
 * Yoca — Team Showcase (Server Component).
 *
 * Glassmorphic member cards driven by the Supabase `team_members` table.
 * Photos render grayscale and transition to colour on hover; each card shows
 * the role badge, short bio, links, specialist tags and a LinkedIn link.
 * Only ACTIVE and VERIFIED members are fetched (name, role and photo confirmed
 * in the admin); with none the whole section renders nothing — no fake
 * people, no AI portraits, ever.
 */

interface TeamSectionProps {
  t: Dict['team'];
}

export default async function TeamSection({ t }: TeamSectionProps) {
  const team = await fetchTeam();
  if (team.length === 0) return null;

  return (
    <section
      id="team"
      className="relative z-[7] py-20 lg:py-28"
    >
      <div className="container-y">
        <div className="mb-12 max-w-2xl lg:mb-16">
          <h2 className="text-[clamp(32px,4.2vw,56px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            {t.heading}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">{t.sub}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((member) => (
            <article
              key={member.id}
              className="glass group relative overflow-hidden rounded-md transition-all duration-300 hover:-translate-y-1 hover:border-yoca-lime/40"
            >
              <div className="aspect-square overflow-hidden bg-surface-secondary">
                <img
                  src={member.image_url || '/brand/yoca-symbol.svg'}
                  alt={member.name}
                  width={400}
                  height={400}
                  loading="lazy"
                  className={`h-full w-full transition-all duration-500 ease-out group-hover:scale-[1.03] group-hover:grayscale-0 ${
                    member.image_url ? 'object-cover grayscale' : 'object-contain p-16 opacity-40'
                  }`}
                />
              </div>
              <div className="relative p-6">
                <h3 className="text-lg font-extrabold">{member.name}</h3>
                {member.role && (
                  <p className="mt-1 text-[13px] font-semibold text-muted">{member.role}</p>
                )}
                {member.bio && <p className="mt-3 text-[14px] leading-relaxed text-muted">{member.bio}</p>}
                {member.links && member.links.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {member.links.slice(0, 4).map((link) => (
                      <li key={link.url}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-soft underline-offset-2 hover:text-yoca-lime hover:underline">{link.label}</a>
                      </li>
                    ))}
                  </ul>
                )}
                {member.tags && member.tags.length > 0 && (
                  <ul className="mt-3.5 flex flex-wrap gap-1.5">
                    {member.tags.slice(0, 5).map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-yoca-lime/25 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-yoca-lime"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
                {member.linkedin && (
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${t.linkedin} ${member.name}`}
                    className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-sm border border-line text-muted transition-colors duration-200 hover:border-yoca-lime hover:bg-yoca-lime hover:text-black"
                  >
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
