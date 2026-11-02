/** Yoca — shared TypeScript types. */

export type Locale = 'en' | 'tr' | 'az' | 'ar';

export interface DomainConfig {
  host: string;
  locale: Locale;
  hreflang: string; // e.g. "tr-TR"
  /** When set, this host 308-redirects to the canonical host. */
  canonicalHost?: string;
}

// ── Supabase rows ──────────────────────────────────────────────────
export interface SectionRow {
  id: number;
  key: string;
  name: string;
  is_active: boolean;
  updated_at: string;
}

export interface MenuRow {
  id: number;
  title: string;
  url: string;
  location: 'header' | 'footer';
  order_index: number;
  is_active: boolean;
}

export interface TeamMemberRow {
  id: number;
  name: string;
  role: string;
  image_url: string | null;
  linkedin: string | null;
  tags: string[] | null;
  order_index: number;
  is_active: boolean;
}

export interface CheckupSubmissionRow {
  id: string;
  data_json: Record<string, CheckupAnswer>;
  contact_info_json: CheckupContact;
  created_at: string;
}

// ── Check-up wizard ────────────────────────────────────────────────
export interface CheckupAnswer {
  /** Selected option index. */
  i: number;
  /** Selected option label (in the submission locale). */
  v: string;
}

export interface CheckupContact {
  name: string;
  company: string;
  email: string;
  phone: string;
  locale: Locale;
  score: number;
}

export interface CheckupQuestion {
  key: string;
  title: string;
  options: string[];
}

export interface CheckupPayload {
  answers: Record<string, number>;
  contact: { name: string; company: string; email: string; phone: string };
  locale: Locale;
  /** Honeypot — must stay empty. */
  website?: string;
  /** Milliseconds the wizard was open before submitting (spam timing). */
  elapsed?: number;
}

// ── UI data ────────────────────────────────────────────────────────
export interface ClientLogo {
  name: string;
  src: string;
  href?: string;
}

export interface PartnerBadge {
  key: 'google' | 'meta' | 'tiktok';
  name: string;
  level: string;
  /** RGB triplet used for the glow, e.g. "66,133,244". */
  glow: string;
}

export interface CityClock {
  key: 'istanbul' | 'baku' | 'london' | 'dubai';
  label: string;
  timeZone: string;
}

// ── CMS rows (v3) ──────────────────────────────────────────────────
export interface CaseStudyLocalized {
  name: string;
  sector: string;
  summary: string;
  problem: string;
  approach: string;
  solution: string;
  results: string;
  /** Headline metric badge shown on cards, e.g. "+210% organic growth". */
  metricBadge?: string;
  /** Verified result stats rendered as a mini chart on the detail page. */
  stats?: Array<{ label: string; value: string; bar?: number }>;
  /** Client quote (optional). */
  quote?: string;
  quoteAuthor?: string;
}

export interface CaseStudyRow {
  id: number;
  slug: string;
  year: string;
  market: string;
  image_url: string;
  services: string[] | null;
  order_index: number;
  is_active: boolean;
  /** Work status label + filter: client case study, concept project, Yoca product, experimental, Yoca venture. */
  kind: 'client' | 'concept' | 'product' | 'experimental' | 'venture';
  /** Optional hover-preview video (muted loop) for the Work grid. */
  video_url: string | null;
  /** Optional live/interactive project link shown on the case detail page. */
  live_url: string | null;
  content: Partial<Record<Locale, CaseStudyLocalized>>;
}

export interface SiteContentRow {
  id: number;
  key: string;
  locale: Locale;
  value: string;
}

export interface ContactSubmissionRow {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string;
  locale: string;
  created_at: string;
}

export interface MenuItem {
  title: string;
  url: string;
  external?: boolean;
}

// ── Insights ───────────────────────────────────────────────────────
export type InsightStatus = 'DRAFT' | 'IN_REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type InsightCtaType = 'none' | 'contact' | 'checkup' | 'service' | 'product';

export interface InsightSource {
  title: string;
  url: string;
  domain: string;
  accessed_at: string;
  source_type?: string;
}

export interface InsightFaq {
  q: string;
  a: string;
}

export interface InsightRow {
  id: string;
  group_id: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  cover_url: string | null;
  cover_alt: string | null;
  cover_caption: string | null;
  category_key: string | null;
  tags: string[];
  author_name: string;
  author_role: string | null;
  status: InsightStatus;
  publish_at: string | null;
  featured: boolean;
  related_service: string | null;
  related_product: string | null;
  related_insight_id: string | null;
  cta_type: InsightCtaType;
  seo_title: string | null;
  meta_description: string | null;
  canonical_override: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  noindex: boolean;
  sources: InsightSource[];
  faq: InsightFaq[];
  reading_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface InsightCategoryRow {
  key: string;
  names: Record<Locale, string>;
  sort_order: number;
}
