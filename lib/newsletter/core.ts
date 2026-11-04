import { createHash, randomBytes } from 'node:crypto';

/**
 * Yoca — newsletter helpers without I/O (unit-tested in tests/newsletter.test.ts).
 */

export const NEWSLETTER_LOCALES = ['en', 'tr', 'az', 'ar'] as const;
export type NewsletterLocale = (typeof NEWSLETTER_LOCALES)[number];

export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A pending address gets at most one confirmation e-mail in this window. */
export const CONFIRM_RESEND_MS = 10 * 60 * 1000;
/** "Bültene gönder" needs a test e-mail to the admin within this window. */
export const TEST_VALID_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[a-z]{2,}$/i;

export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length < 6 || email.length > 190 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function asLocale(raw: unknown): NewsletterLocale {
  return (NEWSLETTER_LOCALES as readonly string[]).includes(String(raw)) ? (String(raw) as NewsletterLocale) : 'en';
}

export function newToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`newsletter:${ip}`).digest('hex');
}

export function isTokenShape(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{48}$/.test(token);
}

export interface PublishedVersion {
  id: string;
  locale: NewsletterLocale;
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  cover_alt: string | null;
  reading_minutes: number;
  source_insight_id?: string | null;
}

/**
 * Which language version a subscriber receives: their own language when it
 * is published, otherwise the English version, otherwise the source article,
 * otherwise any published version. null when nothing is published.
 */
export function pickVersion(locale: NewsletterLocale, versions: PublishedVersion[]): PublishedVersion | null {
  if (!versions.length) return null;
  return (
    versions.find((v) => v.locale === locale) ??
    versions.find((v) => v.locale === 'en') ??
    versions.find((v) => v.source_insight_id === null) ??
    versions[0]
  );
}

export function articleUrl(site: string, v: Pick<PublishedVersion, 'locale' | 'slug'>): string {
  const params = new URLSearchParams({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: `insights-${v.slug}`.slice(0, 100) });
  return `${site}/${v.locale}/insights/${encodeURIComponent(v.slug)}?${params.toString()}`;
}

export function unsubscribeUrl(site: string, token: string): string {
  return `${site}/api/newsletter/unsubscribe?token=${token}`;
}

export function confirmUrl(site: string, token: string): string {
  return `${site}/api/newsletter/confirm?token=${token}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "a***@example.com" for lists and logs. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}
