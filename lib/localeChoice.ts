import type { MouseEvent } from 'react';
import { LOCALE_COOKIE } from '@/lib/localeDetect';

/**
 * Yoca — what a click in a language switcher does (client side; shared by the
 * header menu and the mobile switcher). The link itself stays a plain,
 * crawlable <a href="/tr/…">. The click saves the choice in the yoca_locale
 * cookie (read by the middleware for unprefixed visits) and keeps the current
 * query string and #fragment. Opening an explicit language URL does not save anything.
 */
export function saveLocaleChoice(locale: string) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    // cookies blocked: the link still works, the choice is just not remembered
  }
}

export function chooseLocale(event: MouseEvent<HTMLAnchorElement>, locale: string, href: string) {
  saveLocaleChoice(locale);
  // new tab / window / download: leave the plain link to the browser
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.location.assign(`${href}${window.location.search}${window.location.hash}`);
}
