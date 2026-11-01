'use client';

import { Analytics } from '@vercel/analytics/next';

/**
 * Yoca — Vercel Web Analytics (cookieless page views).
 * The admin panel is never reported. GA4 stays separate and consent-gated
 * (see CookieConsent).
 */
export default function VercelAnalytics() {
  return <Analytics beforeSend={(event) => (new URL(event.url).pathname.startsWith('/admin') ? null : event)} />;
}
