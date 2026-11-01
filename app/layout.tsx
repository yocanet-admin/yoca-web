import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import CookieConsent from '@/components/ui/CookieConsent';
import ScrollProgress from '@/components/ui/ScrollProgress';
import VercelAnalytics from '@/components/ui/VercelAnalytics';
import { getDict } from '@/lib/i18n';
import { getContent } from '@/lib/content';
import {
  buildMetadata,
  getRequestContext,
  jsonLdString,
  organizationSchema,
  professionalServiceSchema,
} from '@/lib/seo';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

export function generateMetadata(): Metadata {
  const ctx = getRequestContext();
  const t = getDict(ctx.locale);
  const meta = buildMetadata({
    ctx,
    path: '/',
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
  });
  // Search Console HTML-tag verification (public token by design; env var overrides the default).
  const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? 'LVGW4fjn2iUVtUSWWXk9SyhKcjPnJ-OwFn8kvZZ24Ws';
  meta.verification = { google: googleVerification };
  return meta;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = getRequestContext();
  const t = await getContent(ctx.locale);

  return (
    <html lang={ctx.locale} dir={ctx.locale === 'ar' ? 'rtl' : 'ltr'} className={manrope.variable}>
      <body className="font-sans">
        {/* JSON-LD structured data (valid anywhere in the document) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(organizationSchema(ctx.host)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString(professionalServiceSchema(ctx.host, ctx.locale)),
          }}
        />
        <ScrollProgress />
        {children}
        <CookieConsent
          text={t.cookies.text}
          acceptAll={t.cookies.acceptAll}
          essentialOnly={t.cookies.essentialOnly}
        />
        <VercelAnalytics />
      </body>
    </html>
  );
}
