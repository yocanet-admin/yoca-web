import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import UnsubscribeConfirm from '@/components/newsletter/UnsubscribeConfirm';
import LanguagePreference from '@/components/newsletter/LanguagePreference';
import { getContent } from '@/lib/content';
import { getRequestContext } from '@/lib/seo';
import { getSupabaseServiceRole } from '@/lib/supabase';
import { newsletterCopy } from '@/lib/newsletter/copy';
import { isTokenShape } from '@/lib/newsletter/core';

/**
 * Yoca — newsletter page (not indexed):
 *   ?s=confirmed | unsubscribed | invalid | expired   result of a link
 *   ?u=<key>   preferences from the link in every e-mail: newsletter
 *              language + "Bültenden ayrıl" (both POST, so mail scanners
 *              that open links change nothing)
 */

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  return { title: newsletterCopy(ctx.locale).page.metaTitle, robots: { index: false, follow: false } };
}

interface PageProps {
  searchParams: { s?: string; u?: string };
}

async function subscriberByKey(token: string): Promise<{ locale: string; status: string } | null> {
  const db = getSupabaseServiceRole();
  if (!db) return null;
  const { data } = await db.from('newsletter_subscribers').select('locale, status').eq('unsubscribe_token', token).maybeSingle();
  return (data as { locale: string; status: string } | null) ?? null;
}

export default async function NewsletterPage({ searchParams }: PageProps) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const all = newsletterCopy(ctx.locale);
  const copy = all.page;
  const token = isTokenShape(searchParams.u) ? searchParams.u : null;
  const sub = token ? await subscriberByKey(token) : null;
  let status = (['confirmed', 'unsubscribed', 'invalid', 'expired'] as const).find((s) => s === searchParams.s) ?? null;
  if (!status && (!token || !sub)) status = 'invalid';
  if (!status && sub?.status === 'unsubscribed') status = 'unsubscribed';
  const prefs = !status && token && sub;

  return (
    <>
      <SiteHeader t={t} path="/newsletter" />
      <main id="main" className="intro-slab relative z-[7] grid min-h-[70vh] place-items-center bg-surface-deep px-5 py-24 text-center">
        <div className="grid w-full max-w-[56ch] justify-items-center gap-4">
          <p aria-hidden="true" className="slant block h-3 w-4 bg-yoca-lime" />
          {prefs ? (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{copy.prefs.title}</h1>
              <p className="text-muted">{copy.prefs.body}</p>
              <LanguagePreference token={token} current={sub.locale} label={all.form.langLabel} save={copy.prefs.save} saved={copy.prefs.saved} errorText={all.form.errorGeneric} working={copy.working} />
              <div className="mt-6 grid w-full justify-items-center gap-3 border-t border-line pt-6">
                <p className="text-[15px] font-bold">{copy.prefs.leave}</p>
                <p className="text-[14px] text-muted">{copy.unsubscribePrompt.body}</p>
                <UnsubscribeConfirm token={token} label={copy.unsubscribePrompt.button} working={copy.working} doneTitle={copy.unsubscribed.title} doneBody={copy.unsubscribed.body} errorText={all.form.errorGeneric} />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{copy[status ?? 'invalid'].title}</h1>
              <p className="text-muted">{copy[status ?? 'invalid'].body}</p>
            </>
          )}
          <Link href={`${ctx.base}/insights`} className="btn-ghost mt-4">
            {copy.back} <span aria-hidden="true" className="icon-arrow">→</span>
          </Link>
        </div>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
