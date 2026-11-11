import { NextResponse } from 'next/server';
import { isAppLocale } from '@/lib/localeDetect';
import { lookupCaseStudy } from '@/lib/work';

/**
 * Yoca — is /{locale}/work/{slug} a public page? (asked by middleware.ts)
 *
 * The middleware runs at the edge without the service role, so it cannot see
 * hidden case_studies rows; this server route answers for it with the same
 * merge rule as the page (lib/work.ts). The answer is ONLY the outcome:
 *   { state: 'found' | 'missing' | 'uncertain' }
 * "missing" is the same for a hidden project and an unknown slug — exactly what
 * the public page already shows — so nothing about hidden rows is disclosed.
 * "uncertain" = the data source could not answer (the middleware then lets the
 * page decide; a data-source error never becomes a 404).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const locale = params.get('locale') ?? '';
  const slug = params.get('slug') ?? '';
  if (!isAppLocale(locale) || !slug || slug.length > 200) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json({ state: await lookupCaseStudy(locale, slug) }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ state: 'uncertain' }, { headers: NO_STORE });
  }
}
