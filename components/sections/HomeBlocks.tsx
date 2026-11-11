import Link from 'next/link';
import type { Dict } from '@/lib/i18n';
import type { Locale } from '@/types';
import type { InsightSummary } from '@/lib/insights';
import ProcessTimeline from '@/components/ui/ProcessTimeline';
import InsightCard from '@/components/insights/InsightCard';
import BrandMark from '@/components/ui/BrandMark';
import { COMPANY } from '@/lib/company';

/**
 * Yoca — home page blocks after the services list (2026).
 * Process (dark, scroll-linked rail only) → Check-Up (soft white, how it
 * works, no score / time promise) → Insights (only published posts in the
 * current language; hidden when there are none) → closing call + channels.
 */

export function HomeProcess({ home }: { home: Dict['home'] }) {
  return (
    <section className="relative z-[7] border-t border-line bg-surface py-20 lg:py-32" aria-labelledby="home-process-title">
      <div className="container-y">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16" data-reveal="auto">
          <div>
            <p className="eyebrow">{home.processEyebrow}</p>
            <h2 id="home-process-title" className="mt-5 max-w-[18ch] text-[clamp(32px,4.2vw,58px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
              {home.processTitle}
            </h2>
          </div>
          <p className="max-w-[46ch] text-[16px] leading-relaxed text-muted lg:justify-self-end lg:text-[17px]">{home.processSub}</p>
        </div>
        <ProcessTimeline steps={home.process} tone="dark" />
      </div>
    </section>
  );
}

interface HomeCheckupProps {
  t: Dict['checkup'];
  home: Dict['home'];
  description: string;
  ctaLabel: string;
  base: string;
}

export function HomeCheckup({ t, home, description, ctaLabel, base }: HomeCheckupProps) {
  const count = String(t.questions.length);
  return (
    <section className="section-light relative z-[7] py-20 lg:py-32" aria-labelledby="home-checkup-title">
      <div className="container-y grid gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-20">
        <div data-reveal="auto">
          <p className="eyebrow !text-[rgba(5,5,5,0.62)]">{t.eyebrow}</p>
          <h2 id="home-checkup-title" className="mt-5 max-w-[16ch] text-[clamp(32px,4.2vw,58px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            {t.introTitle}
          </h2>
          <p className="light-muted mt-6 max-w-[50ch] text-[16px] leading-relaxed lg:text-[17px]">{description}</p>
          <Link
            href={`${base}/checkup`}
            className="mt-9 inline-flex min-h-12 items-center gap-2 rounded-sm bg-[#050505] px-8 py-4 text-[15px] font-bold text-white transition-colors duration-200 hover:bg-[#1f2128]"
          >
            {ctaLabel} <span aria-hidden="true" className="icon-arrow text-yoca-lime">→</span>
          </Link>
        </div>

        <div className="grid content-start gap-12" data-reveal="auto">
          <div>
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[rgba(5,5,5,0.62)]">{home.checkupHow}</h3>
            <ol className="mt-5 grid gap-0 border-t border-[rgba(5,5,5,0.16)]">
              {home.checkupSteps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[48px_1fr] gap-4 border-b border-[rgba(5,5,5,0.16)] py-6">
                  <span className="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-[#267800]">{index + 1}</span>
                  <span>
                    <span className="block text-[19px] font-extrabold tracking-[-0.01em]">{step.title}</span>
                    <span className="light-muted mt-1.5 block text-[15px] leading-relaxed">{step.desc.replace('{n}', count)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[rgba(5,5,5,0.62)]">{home.checkupLooks}</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {t.sections.map((section) => (
                <li key={section.key} className="rounded-full border border-[rgba(5,5,5,0.2)] bg-white px-4 py-2 text-[14px] font-bold">
                  {section.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

interface HomeInsightsProps {
  items: InsightSummary[];
  categoryOf: (key: string | null) => string;
  t: Dict['insights'];
  home: Dict['home'];
  base: string;
  locale: Locale;
}

export function HomeInsights({ items, categoryOf, t, home, base, locale }: HomeInsightsProps) {
  // Empty state = no section at all (no placeholder cards, no drafts).
  if (items.length === 0) return null;
  return (
    <section className="relative z-[7] bg-surface-deep py-20 lg:py-28" aria-labelledby="home-insights-title">
      <div className="container-y">
        <div className="flex flex-wrap items-end justify-between gap-6" data-reveal="auto">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 id="home-insights-title" className="mt-5 text-[clamp(30px,3.6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              {home.insightsTitle}
            </h2>
          </div>
          <Link href={`${base}/insights`} className="btn-ghost">
            {t.back} <span aria-hidden="true" className="icon-arrow">→</span>
          </Link>
        </div>
        <ul className={`mt-12 grid gap-6 ${items.length > 1 ? 'md:grid-cols-2' : ''} ${items.length > 2 ? 'lg:grid-cols-3' : ''}`}>
          {items.map((item) => (
            <li key={item.id} data-reveal="auto">
              <InsightCard item={item} category={categoryOf(item.category_key)} base={base} locale={locale} minRead={t.minRead} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface HomeClosingProps {
  t: Dict['cta'];
  home: Dict['home'];
  base: string;
}

export function HomeClosing({ t, home, base }: HomeClosingProps) {
  const instagramHandle = '@' + COMPANY.instagram.replace(/\/+$/, '').split('/').pop();
  const channels = [
    { label: home.channelEmail, value: COMPANY.email, href: `mailto:${COMPANY.email}`, external: true },
    { label: 'Instagram', value: instagramHandle, href: COMPANY.instagram, external: true },
    { label: home.channelForm, value: home.ctaBrief, href: `${base}/contact`, external: false },
  ];
  return (
    <section className="relative z-[7] overflow-hidden border-t border-line bg-surface-deep py-20 lg:py-32" aria-labelledby="home-closing-title">
      <BrandMark className="pointer-events-none absolute -bottom-10 -end-8 h-[min(52vw,340px)] w-auto opacity-[0.06] rtl:-scale-x-100" ink="#FFFFFF" />
      <div className="container-y relative grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
        <div data-reveal="auto">
          <h2 id="home-closing-title" className="max-w-[16ch] text-[clamp(36px,5vw,72px)] font-extrabold leading-[1] tracking-[-0.035em]">
            {t.heading}
          </h2>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-muted">{t.body}</p>
          <Link href={`${base}/contact`} className="btn-primary mt-9 px-8 py-4 text-base">
            {home.ctaBrief} <span aria-hidden="true" className="icon-arrow">→</span>
          </Link>
        </div>
        <div data-reveal="auto">
          <h3 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-subtle">{home.closingChannels}</h3>
          <ul className="mt-4 border-t border-line">
            {channels.map((channel) => (
              <li key={channel.label} className="border-b border-line">
                {channel.external ? (
                  <a href={channel.href} {...(channel.href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noopener noreferrer' })} className="group flex min-h-[64px] items-center justify-between gap-4 py-4">
                  <span>
                    <span className="block text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">{channel.label}</span>
                    <span className="mt-1 block text-[18px] font-bold transition-colors duration-200 group-hover:text-yoca-lime" dir="auto">
                      {channel.value}
                    </span>
                  </span>
                  {channel.external ? (
                    <span aria-hidden="true" className="text-yoca-lime">↗</span>
                  ) : (
                    <span aria-hidden="true" className="icon-arrow text-yoca-lime">→</span>
                  )}
                  </a>
                ) : (
                  <Link href={channel.href} className="group flex min-h-[64px] items-center justify-between gap-4 py-4">
                  <span>
                    <span className="block text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">{channel.label}</span>
                    <span className="mt-1 block text-[18px] font-bold transition-colors duration-200 group-hover:text-yoca-lime" dir="auto">
                      {channel.value}
                    </span>
                  </span>
                  {channel.external ? (
                    <span aria-hidden="true" className="text-yoca-lime">↗</span>
                  ) : (
                    <span aria-hidden="true" className="icon-arrow text-yoca-lime">→</span>
                  )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
