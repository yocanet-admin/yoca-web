'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import type { Locale, MenuItem } from '@/types';
import { DUR, EASE_YOCA, STAGGER } from '@/lib/motion';

/**
 * Yoca — mobile slide-over menu (Client Component).
 * Hamburger below the md breakpoint; a full-height branded panel with the
 * navigation, the primary CTA and the language switcher.
 *
 * The panel is rendered into document.body (portal): the header uses
 * backdrop-filter, which turns it into the containing block for fixed
 * children — inside it the "full-screen" panel was only as tall as the
 * header, so the page showed through the open menu. Escape closes it,
 * a route change closes it, and focus returns to the toggle.
 */

interface MobileMenuProps {
  items: MenuItem[];
  cta: { title: string; url: string };
  secondaryCta?: { title: string; url: string };
  locale: Locale;
  path: string;
  localePaths?: Partial<Record<Locale, string>>;
  languageLabel: string;
}

export default function MobileMenu({ items, cta, secondaryCta, locale, path, localePaths, languageLabel }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => setMounted(true), []);

  // Lock body scroll while the panel is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close on navigation and on Escape (focus back on the toggle).
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((value) => !value)}
        className="relative z-[120] flex h-11 w-11 flex-col items-center justify-center gap-[5px] rounded-sm border border-line bg-surface"
      >
        <span
          className={`h-[2px] w-[18px] bg-white transition-transform duration-200 ${
            open ? 'translate-y-[7px] rotate-45' : ''
          }`}
        />
        <span
          className={`h-[2px] w-[18px] bg-white transition-opacity duration-200 ${
            open ? 'opacity-0' : ''
          }`}
        />
        <span
          className={`h-[2px] w-[18px] bg-white transition-transform duration-200 ${
            open ? '-translate-y-[7px] -rotate-45' : ''
          }`}
        />
      </button>

      {mounted &&
        createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.micro, ease: EASE_YOCA }}
            className="fixed inset-0 z-[90] bg-surface-deep"
          >
            <motion.nav
              aria-label="Mobile"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: DUR.ui, ease: EASE_YOCA }}
              className="flex h-full flex-col justify-between gap-8 overflow-y-auto px-6 pb-10 pt-24"
            >
              <ul className="grid gap-1">
                {items.map((item, index) => (
                  <motion.li
                    key={item.url + item.title}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + index * STAGGER * 0.6, duration: DUR.ui, ease: EASE_YOCA }}
                  >
                    {item.external ? (
                      <a
                        href={item.url}
                        onClick={() => setOpen(false)}
                        className="block border-b border-line py-3.5 text-xl font-extrabold tracking-tight text-soft"
                        {...(item.url.startsWith('http')
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {item.title}
                      </a>
                    ) : (
                      <Link
                        href={item.url}
                        onClick={() => setOpen(false)}
                        className="block border-b border-line py-3.5 text-xl font-extrabold tracking-tight text-soft"
                      >
                        {item.title}
                      </Link>
                    )}
                  </motion.li>
                ))}
              </ul>

              <div className="grid gap-4">
                <LanguageSwitcher current={locale} path={path} localePaths={localePaths} ariaLabel={languageLabel} />
                {secondaryCta && (
                  <Link
                    href={secondaryCta.url}
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-center gap-2 text-center"
                  >
                    <span aria-hidden="true" className="block h-2 w-2 flex-none bg-yoca-lime" />
                    {secondaryCta.title}
                  </Link>
                )}
                <Link
                  href={cta.url}
                  onClick={() => setOpen(false)}
                  className="btn-primary justify-center text-center"
                >
                  {cta.title}
                </Link>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
