import { NextRequest, NextResponse } from 'next/server';
import { insightSlugFromPath } from '@/lib/insightAlternates';
import { isAppLocale, LOCALE_COOKIE, pickLocale, type AppLocale } from '@/lib/localeDetect';

/**
 * Yoca — edge middleware for path-based i18n routing.
 *
 * URL structure: /en/… /tr/… /az/… /ar/… (Arabic renders RTL).
 * - A request with a locale prefix is REWRITTEN to the unprefixed route
 *   (app/ pages stay flat) while `x-yoca-locale` / `x-yoca-base` headers
 *   carry the locale to the application layer.
 * - A request with a prefix is served in that language, whatever the
 *   browser or country says, and does not change the saved preference.
 * - A request without a prefix 307-redirects (temporary, not cacheable) to
 *   the visitor's language: saved switcher choice (`yoca_locale` cookie) →
 *   browser languages → country (x-vercel-ip-country) → en (lib/localeDetect.ts).
 * - /admin, /api, /_vercel (Web Analytics), sitemap/robots/manifest and all static files bypass
 *   locale handling entirely.
 * - www.* hosts 308-redirect to the apex host.
 * - /{locale}/insights/{slug} without a published article in that language
 *   is rewritten to an unknown path, so the visitor gets the branded 404
 *   page WITH a real 404 status (notFound() inside the streamed page would
 *   answer 200 + noindex). Draft previews (?preview=) skip the check; any
 *   lookup error fails open (the page itself still shows not-found).
 */


export const config = {
  // Skip Next internals and any path with a file extension (static assets).
  matcher: ['/((?!_next/|_vercel/|api/|admin|.*\\..*).*)'],
};

const isLocale = (value: string | undefined): value is AppLocale => isAppLocale(value);

const NOT_FOUND_PATH = '/__yoca-not-found';

/** true = published row exists, false = definitely missing, null = unknown (fail open). */
async function insightExists(locale: AppLocale, slug: string): Promise<boolean | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const params = new URLSearchParams({
    select: 'id',
    locale: `eq.${locale}`,
    slug: `eq.${slug}`,
    status: 'eq.PUBLISHED',
    publish_at: `lte.${new Date().toISOString()}`,
    limit: '1',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/insights?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) ? rows.length > 0 : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function middleware(request: NextRequest) {
  const rawHost = (request.headers.get('host') ?? '').toLowerCase();
  const host = rawHost.split(':')[0];

  // www → apex (any host)
  if (host.startsWith('www.')) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.host = host.replace(/^www\./, '');
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;
  const segment = pathname.split('/')[1];

  // ── Locale-prefixed request → rewrite to the flat route ──────────
  if (isLocale(segment)) {
    const rest = pathname.slice(segment.length + 1) || '/';
    const url = request.nextUrl.clone();
    url.pathname = rest;

    const slug = insightSlugFromPath(rest);
    if (slug && !request.nextUrl.searchParams.has('preview')) {
      const exists = await insightExists(segment, slug);
      if (exists === false) url.pathname = NOT_FOUND_PATH;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-yoca-locale', segment);
    requestHeaders.set('x-yoca-base', `/${segment}`);
    requestHeaders.set('x-yoca-host', host);

    const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    response.headers.set('x-yoca-locale', segment);
    // An explicit language URL is served as is and does NOT change the saved
    // preference: only the language switcher saves it (components/ui/LanguageSwitcher).
    return response;
  }

  // ── No locale prefix → temporary redirect to the visitor's language ──
  // saved choice → browser languages → country (Vercel header) → English.
  // 307 (not permanent) and not cacheable, so one visitor's language is never
  // reused for another (and a later choice is not hidden by a cached redirect).
  const { locale } = pickLocale({
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get('accept-language'),
    country: request.headers.get('x-vercel-ip-country'),
  });
  const url = request.nextUrl.clone(); // keeps the query string; the browser keeps the #fragment
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  const response = NextResponse.redirect(url, 307);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Vary', 'Cookie, Accept-Language, X-Vercel-IP-Country');
  return response;
}
