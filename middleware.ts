import { NextRequest, NextResponse } from 'next/server';

/**
 * Yoca — edge middleware for path-based i18n routing.
 *
 * URL structure: /en/… /tr/… /az/… /ar/… (Arabic renders RTL).
 * - A request with a locale prefix is REWRITTEN to the unprefixed route
 *   (app/ pages stay flat) while `x-yoca-locale` / `x-yoca-base` headers
 *   carry the locale to the application layer.
 * - A request without a prefix 308-redirects to the visitor's preferred
 *   locale (remembered in the `yoca_locale` cookie; default: en).
 * - /admin, /api, /_vercel (Web Analytics), sitemap/robots/manifest and all static files bypass
 *   locale handling entirely.
 * - www.* hosts 308-redirect to the apex host.
 */

const LOCALES = ['en', 'tr', 'az', 'ar'] as const;
type AppLocale = (typeof LOCALES)[number];

export const config = {
  // Skip Next internals and any path with a file extension (static assets).
  matcher: ['/((?!_next/|_vercel/|api/|admin|.*\\..*).*)'],
};

function isLocale(value: string | undefined): value is AppLocale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function middleware(request: NextRequest) {
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

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-yoca-locale', segment);
    requestHeaders.set('x-yoca-base', `/${segment}`);
    requestHeaders.set('x-yoca-host', host);

    const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    response.headers.set('x-yoca-locale', segment);
    // Remember the visitor's language for future unprefixed requests.
    response.cookies.set('yoca_locale', segment, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
    return response;
  }

  // ── No locale prefix → redirect to the preferred locale ──────────
  const cookieLocale = request.cookies.get('yoca_locale')?.value;
  const locale: AppLocale = isLocale(cookieLocale) ? cookieLocale : 'en';
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url, 308);
}
