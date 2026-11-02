'use client';

import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { track } from '@vercel/analytics';
import { captureSignatureVisit, refData } from '@/lib/signatureRef';

/**
 * Yoca — Vercel Web Analytics (cookieless page views) + conversion events.
 * The admin panel is never reported. GA4 stays separate and consent-gated
 * (see CookieConsent).
 *
 * Conversion events (no personal data):
 *   cta_click       any link to /contact or /checkup   { target, from }
 *   checkup_start   first Check-Up answer               (CheckUpWizard)
 *   checkup_submit  Check-Up sent                       (CheckUpWizard)
 *   contact_submit  contact form sent                   (ContactForm)
 *   signature_visit arrived via a client site's "Built by YOCA" link { site, page }
 * Events after a signature visit also carry { ref: site } for the session.
 */
export default function VercelAnalytics() {
  useEffect(() => {
    if (!window.location.pathname.startsWith('/admin')) {
      const site = captureSignatureVisit(window.location.search);
      if (site) track('signature_visit', { site, page: window.location.pathname.slice(0, 80) });
    }
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.origin !== window.location.origin) return;
      if (window.location.pathname.startsWith('/admin')) return;
      const match = anchor.pathname.match(/\/(contact|checkup)\/?$/);
      if (!match) return;
      track('cta_click', { target: match[1], from: window.location.pathname.slice(0, 80), ...refData() });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return <Analytics beforeSend={(event) => (new URL(event.url).pathname.startsWith('/admin') ? null : event)} />;
}
