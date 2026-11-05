'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Yoca — cookie consent banner.
 * Analytics (GA4 via NEXT_PUBLIC_GA4_ID) loads only after the visitor
 * accepts optional cookies. The choice persists in localStorage.
 * The admin panel (/admin) never loads analytics and never shows this
 * floating banner over its forms; it has its own Turkish, in-page notice
 * (components/admin/AdminPrivacyNotice) that stores the same choice.
 */

interface CookieConsentProps {
  text: string;
  acceptAll: string;
  essentialOnly: string;
}

export const CONSENT_STORAGE_KEY = 'yoca_consent';
const STORAGE_KEY = CONSENT_STORAGE_KEY;
const isAdminPath = (p: string | null) => Boolean(p && (p === '/admin' || p.startsWith('/admin/')));
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? '';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __yocaAnalyticsLoaded?: boolean;
  }
}

function loadAnalytics(): void {
  if (!GA4_ID || window.__yocaAnalyticsLoaded) return;
  window.__yocaAnalyticsLoaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA4_ID, { anonymize_ip: true });
}

export default function CookieConsent({ text, acceptAll, essentialOnly }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const admin = isAdminPath(pathname);

  useEffect(() => {
    if (admin) { setVisible(false); return; }
    let stored: { analytics: boolean } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      stored = null;
    }
    if (stored === null) {
      setVisible(true);
    } else if (stored.analytics) {
      loadAnalytics();
    }
  }, [admin]);

  const decide = (analytics: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ analytics, ts: Date.now() }));
    } catch {
      // storage unavailable — proceed for this session only
    }
    setVisible(false);
    if (analytics) loadAnalytics();
  };

  if (!visible || admin) return null;

  return (
    <div
      role="region"
      aria-label="Cookies"
      className="glass fixed bottom-4 right-4 z-[150] grid w-[min(520px,calc(100vw-2rem))] gap-3.5 rounded-md p-5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
    >
      <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => decide(true)} className="btn-primary min-h-0 px-4 py-2 text-[13px]">
          {acceptAll}
        </button>
        <button type="button" onClick={() => decide(false)} className="btn-ghost min-h-0 px-4 py-2 text-[13px]">
          {essentialOnly}
        </button>
      </div>
    </div>
  );
}
