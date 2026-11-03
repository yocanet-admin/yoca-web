import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { Locale } from '@/types';
import { COMPANY } from '@/lib/company';
import {
  absoluteLocalizedUrl,
  absoluteUrl,
  canonicalHostFor,
  DEFAULT_LOCALE,
  HREFLANG,
  LOCALES,
} from '@/lib/domains';

/** Yoca — SEO helpers: request context, metadata + hreflang, JSON-LD builders. */

export interface RequestSeoContext {
  locale: Locale;
  host: string;
  /** Locale base path, e.g. "/tr" — prefix for every internal link. */
  base: string;
}

/** Read the locale/host that the middleware attached to the request. */
export function getRequestContext(): RequestSeoContext {
  const h = headers();
  const locale = (h.get('x-yoca-locale') as Locale) || DEFAULT_LOCALE;
  const host = canonicalHostFor(h.get('x-yoca-host') ?? h.get('host'));
  const base = h.get('x-yoca-base') ?? `/${locale}`;
  return { locale, host, base };
}

export const OG_LOCALES: Record<Locale, string> = {
  en: 'en_US',
  tr: 'tr_TR',
  az: 'az_AZ',
  ar: 'ar_AR',
};

/**
 * Build page metadata with path-based canonical + hreflang alternates:
 *   en    → https://host/en{path}
 *   tr-TR → https://host/tr{path}
 *   az-AZ → https://host/az{path}
 *   ar    → https://host/ar{path}
 *   x-default → https://host/en{path}
 */
export function buildMetadata(opts: {
  ctx: RequestSeoContext;
  path: string;
  title: string;
  description: string;
  ogImagePath?: string;
}): Metadata {
  const { ctx, path, title, description } = opts;
  const canonical = absoluteLocalizedUrl(ctx.host, ctx.locale, path);
  const ogImage = absoluteUrl(ctx.host, opts.ogImagePath ?? '/brand/og-default.png');

  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[HREFLANG[locale]] = absoluteLocalizedUrl(ctx.host, locale, path);
  }
  languages['x-default'] = absoluteLocalizedUrl(ctx.host, DEFAULT_LOCALE, path);

  return {
    metadataBase: new URL(`https://${ctx.host}`),
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'website',
      siteName: 'Yoca',
      title,
      description,
      url: canonical,
      locale: OG_LOCALES[ctx.locale],
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'Yoca — Your Own Creative Agency' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/favicons/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicons/favicon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: '/favicons/apple-touch-icon.png',
    },
  };
}

// ── JSON-LD builders ───────────────────────────────────────────────
type JsonLd = Record<string, unknown>;

function postalAddress(): JsonLd {
  return {
    '@type': 'PostalAddress',
    streetAddress: COMPANY.address.street,
    addressLocality: COMPANY.address.district,
    addressRegion: COMPANY.address.city,
    addressCountry: COMPANY.address.countryCode,
  };
}

export function organizationSchema(host: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Yoca',
    alternateName: 'Your Own Creative Agency',
    url: absoluteUrl(host, '/'),
    logo: absoluteUrl(host, '/brand/yoca-logo-primary.svg'),
    email: COMPANY.email,
    sameAs: [COMPANY.instagram],
    address: postalAddress(),
  };
}

export function professionalServiceSchema(host: string, locale: Locale): JsonLd {
  const descriptions: Record<Locale, string> = {
    en: 'Brand strategy, web experiences, growth systems, creative production, AI automation and digital product development.',
    tr: 'Marka stratejisi, web deneyimleri, büyüme sistemleri, yaratıcı üretim, yapay zekâ otomasyonu ve dijital ürün geliştirme.',
    az: 'Brend strategiyası, veb təcrübələri, inkişaf sistemləri, kreativ istehsal, süni intellekt avtomatlaşdırması və rəqəmsal məhsul inkişafı.',
    ar: 'استراتيجية العلامة، التجارب الرقمية، أنظمة النمو، الإنتاج الإبداعي، أتمتة الذكاء الاصطناعي وتطوير المنتجات الرقمية.',
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Yoca',
    description: descriptions[locale],
    url: absoluteUrl(host, '/'),
    areaServed: ['TR', 'AZ', 'AE', 'SA', 'GB', 'EU'],
    priceRange: '$$',
    address: postalAddress(),
    parentOrganization: { '@type': 'Organization', name: 'Yoca' },
  };
}

export function caseStudySchema(
  host: string,
  work: { name: string; description: string; path: string; year?: string },
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    additionalType: 'CaseStudy',
    name: work.name,
    description: work.description,
    url: absoluteUrl(host, work.path),
    dateCreated: work.year,
    creator: { '@type': 'Organization', name: 'Yoca' },
  };
}

export function articleSchema(
  host: string,
  article: {
    headline: string;
    description: string;
    path: string;
    datePublished: string;
    dateModified: string;
    author: string;
    image?: string | null;
    locale: Locale;
  },
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.headline,
    description: article.description,
    inLanguage: article.locale,
    datePublished: article.datePublished,
    dateModified: article.dateModified,
    author: { '@type': 'Organization', name: article.author },
    publisher: {
      '@type': 'Organization',
      name: 'Yoca',
      logo: { '@type': 'ImageObject', url: absoluteUrl(host, '/brand/yoca-logo-primary.svg') },
    },
    mainEntityOfPage: absoluteUrl(host, article.path),
    ...(article.image ? { image: article.image.startsWith('http') ? article.image : absoluteUrl(host, article.image) } : {}),
  };
}

export function breadcrumbSchema(
  host: string,
  items: Array<{ name: string; path: string }>,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(host, item.path),
    })),
  };
}

/** Serialize a schema for a <script type="application/ld+json"> tag. */
export function jsonLdString(schema: JsonLd): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}
