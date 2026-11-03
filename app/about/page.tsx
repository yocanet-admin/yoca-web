import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import SplitWords from '@/components/ui/SplitWords';
import TeamSection from '@/components/sections/TeamSection';
import CtaSection from '@/components/sections/CtaSection';
import SectionWrapper from '@/components/SectionWrapper';
import Reveal from '@/components/ui/Reveal';
import BrandMark from '@/components/ui/BrandMark';
import Manifesto from '@/components/ui/Manifesto';
import PageVisual from '@/components/ui/PageVisual';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';
import { brandText } from '@/components/ui/BrandText';
import { getAboutIntro } from '@/lib/siteSettings';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({
    ctx,
    path: '/about',
    title: t.about.metaTitle,
    description: t.about.metaDescription,
    ogImagePath: '/visuals/og/about.jpg',
  });
}

/** Measurement / delivery stack — real tools used on engagements. */
const STACK = [
  'Google Analytics 4',
  'Google Tag Manager',
  'Meta Pixel & CAPI',
  'Google Ads',
  'Search Console',
  'Semrush',
  'Hotjar',
  'Cloudflare',
  'Next.js',
  'Supabase',
  'Vercel',
  'Figma',
];

export default async function AboutPage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const a = t.about;
  // Admin-approved intro (Metinler → Hakkımızda giriş metni); a draft is never shown.
  const intro = await getAboutIntro();
  const introText = intro.status === 'approved' ? intro.text[ctx.locale] ?? '' : '';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: base },
              { name: t.nav.about, path: `${base}/about` },
            ]),
          ),
        }}
      />
      <SiteHeader t={t} path="/about" />
      <main id="main">
        {/* ── Intro ─────────────────────────────────────────────── */}
        <PageIntro eyebrow={a.eyebrow} title={a.heading} sub={a.sub} subTone="lime" titleMax="max-w-[22ch]" />
        <PageVisual src="/visuals/about.webp" priority />
        {introText && (
          <section className="relative z-[7] py-12 lg:py-16">
            <div className="container-y">
              <p className="max-w-[60ch] text-[clamp(19px,1.8vw,24px)] font-semibold leading-[1.6] text-soft">{introText}</p>
            </div>
          </section>
        )}

        {/* ── Editorial spread: sticky manifesto + flowing methodology ── */}
        <section className="relative z-[7] border-t border-line bg-surface py-16 lg:py-28">
          <div className="container-y grid gap-12 lg:grid-cols-[5fr_6fr] lg:gap-20">
            {/* Sticky manifesto column */}
            <div className="lg:sticky lg:top-32 lg:self-start">
              <Reveal>
                <h2 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-yoca-lime">
                  {a.storyTitle}
                </h2>
                <div className="mt-6 grid max-w-[58ch] gap-6 text-[17px] leading-[1.85] text-soft">
                  <p className="text-[21px] font-bold leading-[1.6] text-white">{a.story1}</p>
                  <p>{a.story2}</p>
                  <p>{a.story3}</p>
                </div>
                <Link href={`${base}/contact`} className="btn-primary mt-9">
                  {t.hero.primaryCta}
                </Link>
              </Reveal>
            </div>

            {/* The three systems as a numbered index — canonical 01→02→03 order */}
            <ol className="border-t border-line">
              {t.systems.items.map((system, index) => (
                <Reveal key={system.name} delay={index * 0.08}>
                  <li className="grid gap-4 border-b border-line py-8 md:grid-cols-[72px_minmax(0,1fr)] md:gap-8">
                    <span className="text-[clamp(28px,3vw,44px)] font-extrabold leading-none tracking-[-0.04em] text-yoca-lime">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="text-[clamp(20px,2vw,26px)] font-extrabold tracking-[-0.02em]">{system.name}</h3>
                      <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{brandText(system.tagline)}</p>
                      <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">{system.body}</p>
                      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                        {system.points.map((point) => (
                          <li key={point} className="flex items-center gap-2 text-[13px] font-semibold text-soft">
                            <span aria-hidden="true" className="slant block h-2 w-2.5 flex-none bg-yoca-green" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Scroll-activated manifesto ────────────────────────── */}
        <section className="section-light relative z-[7] py-24 lg:py-40">
          <div className="container-y">
            <BrandMark variant="modules" className="mb-10 h-9 w-auto" />
            <Manifesto lines={a.manifesto} tone="light" />
          </div>
        </section>

        {/* ── Values ────────────────────────────────────────────── */}
        <section
          className="relative z-[7] bg-surface-deep py-16 lg:py-24"
        >
          <div className="container-y grid gap-10 lg:grid-cols-[2fr_3fr] lg:gap-20">
            {/* Sticky title (desktop only; plain flow on mobile) */}
            <div className="lg:sticky lg:top-32 lg:self-start">
              <Reveal>
                <h2 className="text-[clamp(32px,4.2vw,56px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
                  <SplitWords text={a.valuesTitle} />
                </h2>
                <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-muted">
                  {a.valuesSub}
                </p>
              </Reveal>
            </div>
            {/* Principles as an index — hairline rows, hover fills the start rule */}
            <ol className="border-t border-line">
              {a.values.map((value, index) => (
                <Reveal key={value.title} delay={index * 0.06}>
                  <li className="group relative grid gap-3 border-b border-line py-7 ps-6 md:grid-cols-[56px_minmax(0,1fr)] md:gap-6 lg:py-9">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 start-0 w-px bg-line transition-all duration-300 group-hover:w-[3px] group-hover:bg-yoca-lime"
                    />
                    <span className="text-[13px] font-extrabold tracking-[0.1em] text-yoca-lime md:pt-2">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="text-[clamp(22px,2.4vw,32px)] font-extrabold leading-tight tracking-[-0.02em]">{value.title}</h3>
                      <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-muted">{value.body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ── How we're built — compact operational layer (typographic; real
            team/workspace photography can be added here when it exists) ── */}
        {a.builtLines?.length > 0 && (
          <section className="relative z-[7] border-t border-line bg-surface py-16 lg:py-24">
            <div className="container-y grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-20">
              <Reveal>
                <p className="eyebrow">{a.builtTitle}</p>
              </Reveal>
              <ol className="grid gap-2 sm:grid-cols-2">
                {a.builtLines.map((line, index) => (
                  <Reveal key={line} delay={index * 0.06}>
                    <li className="flex items-start gap-3 border-t border-line py-5">
                      <span aria-hidden="true" className={`slant mt-2 block h-2.5 w-3 flex-none ${index === 3 ? 'bg-yoca-lime' : 'bg-yoca-green'}`} />
                      <span className="text-[clamp(20px,2.2vw,30px)] font-extrabold leading-tight tracking-[-0.02em] text-soft">{line}</span>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* ── Team (Supabase-driven; hidden while empty) ────────── */}
        <SectionWrapper sectionKey="team">
          <TeamSection t={t.team} />
        </SectionWrapper>

        {/* ── Tech stack ────────────────────────────────────────── */}
        <section className="relative z-[7] border-t border-line bg-surface py-16 lg:py-20">
          <div className="container-y">
            <Reveal>
              <div className="mb-9 max-w-2xl">
                <h2 className="text-[clamp(26px,3vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
                  {a.stackTitle}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{a.stackSub}</p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ul className="flex flex-wrap gap-2.5">
                {STACK.map((tool) => (
                  <li
                    key={tool}
                    className="rounded-sm border border-line bg-surface-deep px-3.5 py-2 text-[13px] font-bold text-soft transition-colors duration-200 hover:border-yoca-lime/50 hover:text-yoca-lime"
                  >
                    {tool}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <CtaSection t={t.cta} base={base} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
