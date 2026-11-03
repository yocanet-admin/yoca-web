import { NextRequest, NextResponse } from 'next/server';
import { insightSlugFromPath } from '@/lib/insightAlternates';

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
 * - /{locale}/insights/{slug} without a published article in that language
 *   is rewritten to an unknown path, so the visitor gets the branded 404
 *   page WITH a real 404 status (notFound() inside the streamed page would
 *   answer 200 + noindex). Draft previews (?preview=) skip the check; any
 *   lookup error fails open (the page itself still shows not-found).
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
