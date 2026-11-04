import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import UnsubscribeConfirm from '@/components/newsletter/UnsubscribeConfirm';
import { getContent } from '@/lib/content';
import { getRequestContext } from '@/lib/seo';
import { newsletterCopy } from '@/lib/newsletter/copy';
import { isTokenShape } from '@/lib/newsletter/core';

/**
 * Yoca — newsletter status page (not indexed):
 *   ?s=confirmed | unsubscribed | invalid | expired   result of a link
 *   ?u=<token>                                         "leave?" + button
 */

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  return { title: newsletterCopy(ctx.locale).page.metaTitle, robots: { index: false, follow: false } };
}

interface PageProps {
  searchParams: { s?: string; u?: string };
}

export default async function NewsletterPage({ searchParams }: PageProps) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const copy = newsletterCopy(ctx.locale).page;
  const token = isTokenShape(searchParams.u) ? searchParams.u : null;
  const status = (['confirmed', 'unsubscribed', 'invalid', 'expired'] as const).find((s) => s === searchParams.s) ?? (token ? null : 'invalid');
  const block = status ? copy[status] : copy.unsubscribePrompt;

  return (
    <>
      <SiteHeader t={t} path="/newsletter" />
      <main id="main" className="intro-slab relative z-[7] grid min-h-[70vh] place-items-center bg-surface-deep px-5 py-24 text-center">
        <div className="grid max-w-[56ch] justify-items-center gap-4">
          <p aria-hidden="true" className="slant block h-3 w-4 bg-yoca-lime" />
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{block.title}</h1>
          <p className="text-muted">{block.body}</p>
          {!status && token && (
            <UnsubscribeConfirm token={token} label={copy.unsubscribePrompt.button} working={copy.working} doneTitle={copy.unsubscribed.title} doneBody={copy.unsubscribed.body} errorText={newsletterCopy(ctx.locale).form.errorGeneric} />
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
