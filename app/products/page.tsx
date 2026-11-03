import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import PageIntro from '@/components/ui/PageIntro';
import CtaSection from '@/components/sections/CtaSection';
import Reveal from '@/components/ui/Reveal';
import ProductMotif from '@/components/products/ProductMotif';
import ProductMedia from '@/components/products/ProductMedia';
import { getProductMedia } from '@/lib/productMedia';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import { buildMetadata, breadcrumbSchema, getRequestContext, jsonLdString } from '@/lib/seo';
import { brandText } from '@/components/ui/BrandText';

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  return buildMetadata({
    ctx,
    path: '/products',
    title: t.products.metaTitle,
    description: t.products.metaDescription,
  });
}

export default async function ProductsPage() {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);
  const base = ctx.base;
  const p = t.products;

  const statusLabel = { live: p.statusLive, soon: p.statusSoon, exp: p.statusExp } as const;
  const statusClass = {
    live: 'bg-yoca-green text-black',
    soon: 'bg-[#F5D90A] text-black',
    exp: 'bg-[#050505] text-white',
  } as const;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbSchema(ctx.host, [
              { name: t.nav.home, path: base },
              { name: t.nav.products, path: `${base}/products` },
            ]),
          ),
        }}
      />
      <SiteHeader t={t} path="/products" />
      <main id="main">
        {/* ── Intro ─────────────────────────────────────────────── */}
        <PageIntro
          eyebrow={p.eyebrow}
          title={p.heading}
          sub={p.sub}
          compact
          rail={p.items.map((product) => (
            <a
              key={product.key}
              href={`#${product.key}`}
              className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle transition-colors hover:text-yoca-lime"
            >
              <span aria-hidden="true" className="slant block h-2 w-2.5 bg-yoca-green" />
              <span lang="en">{product.name}</span>
            </a>
          ))}
        />

        {/* ── Products as an editorial index on soft white ─────── */}
        <section className="section-light relative z-[7] py-16 lg:py-24">
          <div className="container-y">
            <ol className="border-t border-[rgba(5,5,5,0.16)]">
              {p.items.map((product, index) => (
                <Reveal key={product.key} delay={0.04}>
                  <li
                    id={product.key}
                    className="grid scroll-mt-28 gap-8 border-b border-[rgba(5,5,5,0.16)] py-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,4fr)_minmax(0,6fr)] lg:gap-10 lg:py-16"
                  >
                    {/* Numeral + status */}
                    <div className="flex items-start justify-between gap-4 lg:block">
                      <span className="block text-[clamp(56px,7vw,104px)] font-extrabold leading-[0.85] tracking-[-0.05em] text-[rgba(5,5,5,0.14)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={`slant mt-1 inline-block px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] lg:mt-6 ${statusClass[product.status]}`}>
                        {statusLabel[product.status]}
                      </span>
                    </div>

                    {/* Identity + copy */}
                    <div>
                      <h2 className="text-[clamp(26px,2.8vw,40px)] font-extrabold leading-tight tracking-[-0.03em]">{product.name}</h2>
                      <p className="light-subtle mt-3 text-[12px] font-bold uppercase tracking-[0.14em]">{brandText(product.category)}</p>
                      <p className="light-muted mt-5 max-w-[50ch] text-[16px] leading-relaxed">{product.desc}</p>
                      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
                        {product.capabilities.map((capability) => (
                          <li key={capability} className="flex items-center gap-2 text-[13px] font-bold">
                            <span aria-hidden="true" className="slant block h-2 w-2.5 flex-none bg-yoca-green" />
                            {capability}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Media (real product presentation) or motif (until assets exist) + CTA */}
                    <div className="light-card flex flex-col justify-between gap-8 p-7 lg:p-9">
                      {getProductMedia(product.key) ? (
                        <ProductMedia media={getProductMedia(product.key)!} name={product.name} />
                      ) : (
                        <div aria-hidden="true" className="[&_svg]:h-16 [&_svg]:w-auto">
                          <ProductMotif productKey={product.key} />
                        </div>
                      )}
                      {product.url ? (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-12 w-fit items-center gap-2 bg-[#050505] px-6 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-yoca-green hover:text-black"
                        >
                          {product.cta} ↗
                        </a>
                      ) : (
                        // No public product URL yet: a real link to the contact form about this product.
                        <Link
                          href={`${base}/contact?product=${encodeURIComponent(product.key)}#contact-form`}
                          className="inline-flex min-h-12 w-fit items-center gap-2 border border-[rgba(5,5,5,0.3)] px-6 py-2.5 text-[14px] font-bold text-[#050505] transition-colors hover:border-[#050505] hover:bg-[#050505] hover:text-white"
                        >
                          {p.enquireCta} <span aria-hidden="true">→</span>
                        </Link>
                      )}
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <CtaSection t={t.cta} base={base} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
