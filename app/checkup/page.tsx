import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import CheckUpWizard from '@/components/checkup/CheckUpWizard';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({
    ctx,
    path: '/checkup',
    title: t.meta.checkupTitle,
    description: t.meta.checkupDescription,
    ogImagePath: '/visuals/og/checkup.jpg',
  });
}

export default async function CheckupPage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: ctx.base },
              { name: t.nav.checkup, path: `${ctx.base}/checkup` },
            ]),
          ),
        }}
      />
      <SiteHeader t={t} path="/checkup" />
      <main id="main">
        <PageIntro eyebrow={t.checkup.eyebrow} title={t.checkup.introTitle} sub={t.checkup.introSub} compact titleMax="max-w-[22ch]" />

        <section className="relative z-[7] bg-surface py-16 lg:py-20">
          <div className="container-y xl:grid xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)] xl:items-start xl:gap-16">
            <div className="mx-auto max-w-3xl xl:mx-0 xl:w-full">
              <CheckUpWizard locale={ctx.locale} t={t.checkup} />
            </div>
            {/* Decorative key visual beside the wizard on wide screens only. */}
            <figure aria-hidden="true" className="sticky top-28 hidden overflow-hidden rounded-md border border-line bg-[#0b0b0b] xl:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/visuals/checkup.webp" alt="" width={1536} height={1024} loading="lazy" decoding="async" className="block aspect-[4/5] h-auto w-full object-cover object-[60%_50%]" />
            </figure>
          </div>
        </section>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
