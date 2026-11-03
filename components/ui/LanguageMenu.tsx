'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Locale } from '@/types';
import { HREFLANG, localizePath, LOCALES } from '@/lib/domains';
import { DUR, EASE_YOCA } from '@/lib/motion';

/**
 * Yoca — header language menu (click to open).
 * A single compact trigger (current code) opens a small panel listing every
 * language in its own native name. No flags: flags mean countries, not
 * languages (English ≠ one flag; Arabic spans twenty). Escape / outside
 * click close it; links are plain <a> with hrefLang → crawlable.
 */

interface LanguageMenuProps {
  current: Locale;
  /** Logical path without the locale prefix, e.g. "/work". */
  path: string;
  /** Per-language path when it differs (e.g. an Insight's slug in each language). */
  localePaths?: Partial<Record<Locale, string>>;
  ariaLabel: string;
}

const NATIVE: Record<Locale, { code: string; name: string }> = {
  en: { code: 'EN', name: 'English' },
  tr: { code: 'TR', name: 'Türkçe' },
  az: { code: 'AZ', name: 'Azərbaycan dili' },
  ar: { code: 'AR', name: 'العربية' },
};

export default function LanguageMenu({ current, path, localePaths, ariaLabel }: LanguageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[38px] items-center gap-2 rounded-sm border px-3 text-[12px] font-bold tracking-wide transition-colors ${
          open ? 'border-yoca-lime text-white' : 'border-line text-muted hover:border-yoca-lime/60 hover:text-white'
        }`}
      >
        <span aria-hidden="true" className="slant block h-2 w-2.5 bg-yoca-lime" />
        {NATIVE[current].code}
        <svg
          aria-hidden="true"
          viewBox="0 0 10 6"
          className={`h-1.5 w-2.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.nav
            id={panelId}
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DUR.micro, ease: EASE_YOCA }}
            className="absolute end-0 top-[calc(100%+8px)] z-[120] min-w-[200px] border border-line bg-surface p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
          >
            <ul className="grid">
              {LOCALES.map((locale) => {
                const isActive = locale === current;
                return (
                  <li key={locale}>
                    <a
                      href={localizePath(locale, localePaths?.[locale] ?? path)}
                      hrefLang={HREFLANG[locale]}
                      lang={locale}
                      dir={locale === 'ar' ? 'rtl' : 'ltr'}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-[40px] items-center justify-between gap-6 rounded-sm px-3 text-[13px] font-semibold transition-colors ${
                        isActive ? 'bg-yoca-lime text-black' : 'text-soft hover:bg-surface-elevated hover:text-white'
                      }`}
                    >
                      <span>{NATIVE[locale].name}</span>
                      <span className={`text-[11px] font-bold tracking-[0.1em] ${isActive ? 'text-black/70' : 'text-subtle'}`}>
                        {NATIVE[locale].code}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
