import type { Locale } from '@/types';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { fetchMenu } from '@/lib/supabase';
import { hasPublishedInsights } from '@/lib/insights';
import { applyInsightsVisibility } from '@/lib/publicRules';
import { getRequestContext } from '@/lib/seo';
import HeaderShell from '@/components/ui/HeaderShell';
import LanguageMenu from '@/components/ui/LanguageMenu';
import MobileMenu from '@/components/ui/MobileMenu';
import type { Dict } from '@/lib/i18n';
import type { MenuItem } from '@/types';

/**
 * Yoca — site header (Server Component).
 *
 * Navigation architecture (desktop):
 *   [Logo = Home]  About · Services · Work · Products   [■ Digital Check-Up] [EN/TR/AZ/AR] [Start a Project]
 * - Home and Contact are NOT nav items (logo = home; Start a Project → contact).
 * - Digital Check-Up is a bordered utility action with a lime square icon —
 *   it never competes with the solid-lime primary CTA.
 * - Breakpoints: ≥1280 full · 1120–1279 compact (nowrap, tighter gaps)
 *   · ≤1119 overlay menu.
 * - Active page: 2px lime underline under the current nav link.
 */

interface SiteHeaderProps {
  t: Dict;
  /** Current logical path (no locale prefix). */
  path?: string;
  /**
   * Per-language target when the page's path differs by language (an Insight
   * has a different slug in each language). Missing locales use `path`.
   */
  localePaths?: Partial<Record<Locale, string>>;
}

/** Map known internal routes to their localized nav labels. */
function localizedTitle(url: string, fallback: string, t: Dict): string {
  const map: Record<string, string> = {
    '/': t.nav.home,
    '/about': t.nav.about,
    '/services': t.nav.services,
    '/work': t.nav.work,
    '/products': t.nav.products,
    '/insights': t.nav.insights,
    '/checkup': t.nav.checkup,
    '/contact': t.nav.contact,
  };
  return map[url] ?? fallback;
}

/** Routes that live in the utility group / logo, never in the main nav. */
const NON_NAV_URLS = new Set(['/', '/checkup', '/contact']);

export default async function SiteHeader({ t, path = '/', localePaths }: SiteHeaderProps) {
  const ctx = getRequestContext();
  const base = ctx.base;
  const withBase = (url: string) => (url === '/' ? base : `${base}${url}`);

  const [rows, insightsLive] = await Promise.all([fetchMenu('header'), hasPublishedInsights(ctx.locale)]);
  const rawItems: Array<MenuItem & { logical?: string }> = rows
    ? rows
        .filter((row) => !NON_NAV_URLS.has(row.url))
        .map((row) => ({
          title: localizedTitle(row.url, row.title, t),
          url: row.url,
          external: /^(https?:|mailto:)/.test(row.url),
        }))
    : [
        { title: t.nav.about, url: '/about' },
        { title: t.nav.services, url: '/services' },
        { title: t.nav.work, url: '/work' },
        { title: t.nav.products, url: '/products' },
        { title: t.nav.insights, url: '/insights' },
      ];
  // Insights is part of the primary navigation once THIS locale has a published
  // post; until then the link is hidden (also when a CMS menu row lists it).
  const items = applyInsightsVisibility(rawItems, insightsLive, { title: t.nav.insights, url: '/insights', external: false }).map((item) =>
    item.external ? item : { ...item, logical: item.url, url: withBase(item.url) },
  );

  const isActive = (logical?: string) =>
    !!logical && (logical === path || (logical !== '/' && path.startsWith(logical)));

  // Overlay menu still lists every page (incl. Check-Up + Contact).
  const overlayItems: MenuItem[] = [
    ...items,
    { title: t.nav.checkup, url: `${base}/checkup` },
    { title: t.nav.contact, url: `${base}/contact` },
  ];

  return (
    <HeaderShell>
        <Link href={base} aria-label="Yoca — Home" className="flex-none shrink-0">
          <img
            src="/brand/yoca-logo-primary.svg"
            alt="Yoca"
            width={148}
            height={37}
            className="h-9 w-auto max-sm:h-7"
          />
        </Link>

        {/* Main nav — desktop only (≥1180px), never wraps */}
        <nav aria-label="Main" className="hidden min-[1120px]:block">
          <ul className="flex items-center gap-0.5 whitespace-nowrap min-[1280px]:gap-1.5">
            {items.map((item) => (
              <li key={item.url + item.title}>
                {item.external ? (
                  <a
                    href={item.url}
                    className="inline-block whitespace-nowrap rounded-sm px-3 py-2 text-[14px] font-semibold text-muted transition-colors hover:text-white min-[1280px]:px-4"
                    {...(item.url.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {item.title}
                  </a>
                ) : (
                  <Link
                    href={item.url}
                    aria-current={isActive(item.logical) ? 'page' : undefined}
                    className={`relative inline-block whitespace-nowrap rounded-sm px-3 py-2 text-[14px] font-semibold transition-colors duration-200 min-[1280px]:px-4 ${
                      isActive(item.logical) ? 'text-white' : 'nav-line text-muted hover:text-white min-[1280px]:after:inset-x-4'
                    }`}
                  >
                    {item.title}
                    {isActive(item.logical) && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3 bottom-0 h-[2px] bg-yoca-lime min-[1280px]:inset-x-4"
                      />
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Utility action group */}
        <div className="flex items-center gap-2.5 min-[1280px]:gap-4">
          <Link
            href={`${base}/checkup`}
            className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-sm border border-line bg-white/[0.02] px-3 text-[13px] font-bold text-soft transition-colors duration-200 hover:border-yoca-lime/60 hover:text-yoca-lime min-[1120px]:inline-flex min-[1280px]:px-3.5"
          >
            <span aria-hidden="true" className="slant block h-2 w-2.5 flex-none bg-yoca-lime" />
            <span className="hidden min-[1280px]:inline">{t.nav.checkup}</span>
            <span className="sr-only min-[1280px]:hidden">{t.nav.checkup}</span>
          </Link>
          <div className="max-[359px]:hidden">
            <LanguageMenu current={ctx.locale} path={path} localePaths={localePaths} ariaLabel={t.common.languageSwitcher} />
          </div>
          <Link
            href={`${base}/contact`}
            className="btn-primary hidden h-10 !min-h-10 shrink-0 whitespace-nowrap !px-5 !py-0 !text-[14px] min-[1120px]:inline-flex min-[1280px]:!px-6"
          >
            {t.hero.primaryCta}
          </Link>
          <div className="min-[1120px]:hidden">
            <MobileMenu
              items={overlayItems}
              cta={{ title: t.hero.primaryCta, url: `${base}/contact` }}
              secondaryCta={{ title: t.nav.checkup, url: `${base}/checkup` }}
              locale={ctx.locale}
              path={path}
              localePaths={localePaths}
              languageLabel={t.common.languageSwitcher}
            />
          </div>
        </div>
    </HeaderShell>
  );
}
