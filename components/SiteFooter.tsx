/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { fetchMenu } from '@/lib/supabase';
import { hasPublishedInsights } from '@/lib/insights';
import { getCompanyInfo, getKvkkPublish } from '@/lib/siteSettings';
import { noticeIsFinal } from '@/lib/companyInfo';
import { getRequestContext } from '@/lib/seo';
import type { Dict } from '@/lib/i18n';
import { COMPANY } from '@/lib/company';
import FooterWordmark from '@/components/ui/FooterWordmark';
import YocaSignature from '@/components/branding/YocaSignature';

/**
 * Yoca — site footer.
 * Giant closing hook ("What should we build together next?") with a
 * three-card action gateway (Start a Project · Digital Check-Up · Explore
 * Yoca Products), a 4-column breakdown, the official "Made to move forward."
 * signature lockup in the bottom bar and the oversized wordmark.
 */

interface SiteFooterProps {
  t: Dict;
}

export default async function SiteFooter({ t }: SiteFooterProps) {
  const ctx = getRequestContext();
  const base = ctx.base;
  const withBase = (url: string) => (url === '/' ? base : `${base}${url}`);

  const [rows, insightsLive, company, kvkk] = await Promise.all([fetchMenu('footer'), hasPublishedInsights(ctx.locale), getCompanyInfo(), getKvkkPublish()]);
  // The notice is linked here only once the owner published it as final (kvkk_published).
  const noticeFinal = noticeIsFinal(company, kvkk);
  const year = new Date().getFullYear();

  const systemsCol = [
    { title: t.systems.items[0]?.name ?? 'Yoca Brand System™', url: `${base}/services#brand` },
    { title: t.systems.items[1]?.name ?? 'Yoca Growth Engine™', url: `${base}/services#growth` },
    { title: t.systems.items[2]?.name ?? 'Yoca Scale Framework™', url: `${base}/services#scale` },
  ];
  const companyCol = [
    { title: t.nav.about, url: `${base}/about` },
    { title: t.overview.title, url: `${base}/overview` },
    { title: t.nav.services, url: `${base}/services` },
    { title: t.nav.work, url: `${base}/work` },
    ...(insightsLive ? [{ title: t.nav.insights, url: `${base}/insights` }] : []),
    { title: t.nav.checkup, url: `${base}/checkup` },
    { title: t.nav.contact, url: `${base}/contact` },
  ];
  const productsCol = t.products.items.map((product) => ({
    title: product.name,
    url: `${base}/products#${product.key}`,
  }));
  // Connect column: external links from the CMS menu + brand contacts.
  const connectCol = (rows ?? [])
    .filter((row) => /^(https?:|mailto:)/.test(row.url))
    .map((row) => ({ title: row.title, url: row.url, external: true }));
  if (connectCol.length === 0) {
    connectCol.push(
      { title: 'Instagram', url: 'https://instagram.com/thisisyoca', external: true },
      { title: 'connect@yoca.net', url: 'mailto:connect@yoca.net', external: true },
    );
  }

  const columns: Array<{ heading: string; items: Array<{ title: string; url: string; external?: boolean }> }> = [
    { heading: t.footer.colSystems, items: systemsCol },
    { heading: t.footer.company, items: companyCol },
    { heading: t.footer.colProducts, items: productsCol },
    { heading: t.footer.connect, items: connectCol },
  ];

  return (
    <footer className="relative z-[7] border-t border-line bg-surface-deep pb-8 pt-16 lg:pt-24">
      <div className="container-y">
        {/* ── Closing hook + 3-column action gateway ─────────────── */}
        <div className="border-b border-line pb-14">
          <p className="max-w-[16ch] text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {t.footer.hook}
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {/* 01 — Primary */}
            <Link
              href={`${base}/contact`}
              className="group flex flex-col justify-between gap-6 rounded-md bg-yoca-lime p-7 text-black transition-colors hover:bg-yoca-green"
            >
              <p className="text-[14px] font-semibold leading-relaxed text-black/70">
                {t.footer.gatewayProject}
              </p>
              <span className="text-xl font-extrabold tracking-tight">
                {t.footer.hookCta} <span aria-hidden="true" className="icon-arrow">→</span>
              </span>
            </Link>
            {/* 02 — Secondary */}
            <Link
              href={`${base}/checkup`}
              className="group flex flex-col justify-between gap-6 rounded-md border border-line bg-surface p-7 transition-colors hover:border-yoca-lime/60"
            >
              <p className="text-[14px] leading-relaxed text-muted">{t.footer.gatewayCheckup}</p>
              <span className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-soft transition-colors group-hover:text-yoca-lime">
                <span aria-hidden="true" className="block h-2.5 w-2.5 flex-none bg-yoca-lime" />
                {t.nav.checkup} <span aria-hidden="true" className="icon-arrow">→</span>
              </span>
            </Link>
            {/* 03 — Tertiary */}
            <Link
              href={`${base}/products`}
              className="group flex flex-col justify-between gap-6 rounded-md border border-line/60 p-7 transition-colors hover:border-line"
            >
              <p className="text-[14px] leading-relaxed text-subtle">{t.footer.gatewayProducts}</p>
              <span className="text-xl font-extrabold tracking-tight text-muted transition-colors group-hover:text-white">
                {t.footer.exploreProducts} <span aria-hidden="true" className="icon-arrow">→</span>
              </span>
            </Link>
          </div>
        </div>

        {/* ── 4-column system breakdown ──────────────────────────── */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 border-b border-line py-12 lg:grid-cols-4">
          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">
                {column.heading}
              </h2>
              <ul className="grid gap-2.5">
                {column.items.map((item) => (
                  <li key={item.url + item.title}>
                    {item.external ? (
                      <a
                        href={item.url}
                        className="inline-block py-0.5 text-[14px] text-muted transition-colors hover:text-yoca-lime"
                        {...(item.url.startsWith('http')
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {item.title}
                      </a>
                    ) : (
                      <Link
                        href={item.url}
                        className="inline-block py-0.5 text-[14px] text-muted transition-colors hover:text-yoca-lime"
                      >
                        {item.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar: copyright (start) · Yoca signature lockup (end) */}
        <div className="flex flex-wrap items-center justify-between gap-x-7 gap-y-4 pt-7 text-[13px] text-subtle">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <p>
              © {year} {t.footer.rights}
            </p>
            <p className="text-[12px]">{t.footer.message}</p>
            <address className="text-[12px] not-italic" dir="ltr">{COMPANY.address.line}</address>
            {noticeFinal && <Link href={`${base}/privacy`} className="text-[12px] transition-colors hover:text-yoca-lime">{t.legal.noticeTitle}</Link>}
          </div>
          <YocaSignature variant="signature" theme="dark" source="yoca.net" className="footer-signature" />
        </div>

        {/* One ending: the real logo as an oversized hairline outline. */}
        <FooterWordmark />
      </div>
    </footer>
  );
}
