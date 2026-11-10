'use client';

import type { Locale } from '@/types';
import { HREFLANG, localizePath, LOCALES } from '@/lib/domains';
import { chooseLocale } from '@/lib/localeChoice';

/**
 * Yoca — language switcher (path-based i18n).
 * Each language links to the same logical page under its own prefix
 * (/en, /tr, /az, /ar): plain links, so crawlers see hreflang-consistent
 * navigation. A click SAVES the choice (yoca_locale cookie, read by the
 * middleware for unprefixed visits) and keeps the current query string and
 * #fragment. Opening an explicit language URL does not change the choice.
 */

interface LanguageSwitcherProps {
  current: Locale;
  /** Logical path without the locale prefix, e.g. "/work". */
  path: string;
  /** Per-language path when it differs (e.g. an Insight's slug in each language). */
  localePaths?: Partial<Record<Locale, string>>;
  ariaLabel: string;
}

const LABELS: Record<Locale, string> = { en: 'EN', tr: 'TR', az: 'AZ', ar: 'AR' };

export default function LanguageSwitcher({ current, path, localePaths, ariaLabel }: LanguageSwitcherProps) {
  return (
    <nav aria-label={ariaLabel} className="flex gap-0.5 rounded-sm border border-line p-0.5">
      {LOCALES.map((locale) => {
        const isActive = locale === current;
        const href = localizePath(locale, localePaths?.[locale] ?? path);
        return (
          <a
            key={locale}
            href={href}
            hrefLang={HREFLANG[locale]}
            aria-current={isActive ? 'true' : undefined}
            onClick={(event) => chooseLocale(event, locale, href)}
            className={`flex items-center justify-center rounded-sm px-2.5 py-1 text-[12px] font-bold tracking-wide transition-colors max-md:min-h-[38px] max-md:min-w-[34px] ${
              isActive ? 'bg-yoca-lime text-black' : 'text-subtle hover:text-white'
            }`}
          >
            {LABELS[locale]}
          </a>
        );
      })}
    </nav>
  );
}
