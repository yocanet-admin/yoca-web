import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import ContactForm from '@/components/ContactForm';
import CopyEmail from '@/components/ui/CopyEmail';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { COMPANY } from '@/lib/company';
import { getFormCopy } from '@/lib/siteSettings';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({
    ctx,
    path: '/contact',
    title: t.contact.metaTitle,
    description: t.contact.metaDescription,
  });
}

export default async function ContactPage({ searchParams }: { searchParams?: { product?: string } }) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const copy = await getFormCopy(ctx.locale);
  // Coming from a product card: start the message with the product's name (only known keys).
  const product = t.products.items.find((item) => item.key === searchParams?.product);
  const prefill = product ? t.products.enquirePrefill.replace('{product}', product.name) : '';
  const base = ctx.base;
  const calendlyUrl = t.contact.calendlyUrl.trim();

  const contactPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: t.contact.heading,
    url: `https://${ctx.host}${base}/contact`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(contactPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: base },
              { name: t.nav.contact, path: `${base}/contact` },
            ]),
          ),
        }}
      />
      <SiteHeader t={t} path="/contact" />
      <main id="main">
        <PageIntro eyebrow={t.contact.eyebrow} title={t.contact.heading} sub={copy.contactDescription} compact />

        <section className="relative z-[7] py-16 lg:py-20">
          <div className="container-y grid items-start gap-10 lg:grid-cols-[7fr_4fr] lg:gap-16">
            <ContactForm
              locale={ctx.locale}
              t={{ ...t.contact, description: copy.contactDescription, success: copy.contactSuccess }}
              legal={t.legal}
              privacyHref={`${base}/privacy`}
              receiptNote={copy.receiptNote}
              errorRequired={t.checkup.errorRequired}
              errorEmail={t.checkup.errorEmail}
              errorGeneric={t.checkup.errorGeneric}
              prefillMessage={prefill}
            />
            <aside className="glass grid justify-items-start gap-3 rounded-md p-7 lg:sticky lg:top-28">
              <h2 className="text-[17px] font-extrabold">{t.contact.direct}</h2>
              <CopyEmail email="connect@yoca.net" />
              <a
                href="https://instagram.com/thisisyoca"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] font-semibold text-muted transition-colors hover:text-white"
              >
                @thisisyoca
              </a>
              <div className="mt-2 w-full border-t border-line pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">{t.contact.addressLabel}</p>
                <address className="mt-1.5 text-[14px] font-semibold not-italic leading-relaxed text-soft" dir="ltr">
                  {COMPANY.address.line}
                </address>
                <p className="mt-2 text-[13px] text-subtle">{t.contact.based}</p>
              </div>
              <div className="mt-4 w-full border-t border-line pt-5">
                <h3 className="text-[15px] font-extrabold">{t.contact.nextTitle}</h3>
                <ol className="mt-4 grid gap-4">
                  {t.contact.nextSteps.map((stepText, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-none text-[13px] font-extrabold tracking-[0.08em] text-yoca-lime">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[13px] leading-relaxed text-muted">{stepText}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>
        </section>

        {/* ── Live scheduling (Calendly) — active once a URL is set in /admin ── */}
        {calendlyUrl.startsWith('https://calendly.com/') && (
          <section className="relative z-[7] border-t border-line bg-surface py-16">
            <div className="container-y">
              <div className="mb-8 max-w-2xl">
                <h2 className="text-[clamp(26px,3vw,40px)] font-extrabold leading-[1.08] tracking-[-0.02em]">
                  {t.contact.scheduleTitle}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  {t.contact.scheduleSub}
                </p>
              </div>
              <div className="overflow-hidden rounded-md border border-line">
                <iframe
                  src={`${calendlyUrl}?hide_gdpr_banner=1&background_color=121418&text_color=f4f4f1&primary_color=a2ff00`}
                  title={t.contact.scheduleTitle}
                  loading="lazy"
                  className="h-[720px] w-full"
                />
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter t={t} />
    </>
  );
}
