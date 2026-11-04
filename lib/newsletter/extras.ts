import type { SupabaseClient } from '@supabase/supabase-js';
import { getDict } from '@/lib/i18n';
import { categoryName, getInsightCategories } from '@/lib/insights';
import { SERVICE_SLUGS } from '@/lib/serviceSlugs';
import { getCompanyInfo } from '@/lib/siteSettings';
import { COMPANY } from '@/lib/company';
import { senderLine, type NewsletterLocale, type PublishedVersion } from '@/lib/newsletter/core';
import type { IssueExtras, Sender } from '@/lib/newsletter/template';
import type { Locale } from '@/types';

/**
 * Yoca — what an issue e-mail carries besides the article (server only):
 * category name, the one-line invitation from the article's own CTA setting,
 * two more published articles in the same language, and the sender line
 * from Şirket bilgileri (official name + address once filled, else the
 * address shown on the site).
 */

export async function newsletterSender(): Promise<Sender> {
  const c = await getCompanyInfo().catch(() => null);
  return senderLine(c ?? {}, COMPANY.legalName, COMPANY.address.line);
}

export function ctaFor(v: PublishedVersion, site: string): IssueExtras['cta'] {
  const t = getDict(v.locale as Locale);
  const base = `${site}/${v.locale}`;
  const utm = 'utm_source=newsletter&utm_medium=email&utm_campaign=' + encodeURIComponent(`insights-${v.slug}`.slice(0, 100));
  switch (v.cta_type) {
    case 'contact':
      return { label: t.insights.ctaContact, url: `${base}/contact?${utm}` };
    case 'checkup':
      return { label: t.insights.ctaCheckup, url: `${base}/checkup?${utm}` };
    case 'service': {
      const i = v.related_service ? (SERVICE_SLUGS as readonly string[]).indexOf(v.related_service) : -1;
      const s = i >= 0 ? t.services.items[i] : null;
      return s ? { label: `${t.insights.exploreService}: ${s.name}`, url: `${base}/services/${v.related_service}?${utm}` } : null;
    }
    case 'product': {
      const p = v.related_product ? t.products.items.find((x) => (x as { key?: string }).key === v.related_product) : null;
      return p ? { label: `${t.insights.exploreProduct}: ${p.name}`, url: `${base}/products?${utm}#${v.related_product}` } : null;
    }
    default:
      return null;
  }
}

export async function issueExtras(db: SupabaseClient, groupId: string, versions: PublishedVersion[], site: string): Promise<Record<string, IssueExtras>> {
  const [categories, sender] = await Promise.all([getInsightCategories().catch(() => []), newsletterSender()]);
  const out: Record<string, IssueExtras> = {};
  for (const v of versions) {
    const { data } = await db
      .from('insights')
      .select('title, slug')
      .eq('locale', v.locale)
      .eq('status', 'PUBLISHED')
      .lte('publish_at', new Date().toISOString())
      .neq('group_id', groupId)
      .order('publish_at', { ascending: false })
      .limit(2);
    const more = ((data ?? []) as Array<{ title: string; slug: string }>).map((m) => ({
      title: m.title,
      url: `${site}/${v.locale}/insights/${encodeURIComponent(m.slug)}?utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(`insights-${v.slug}`.slice(0, 100))}`,
    }));
    out[v.locale as NewsletterLocale] = {
      category: categoryName(categories, v.category_key ?? null, v.locale as Locale) || null,
      cta: ctaFor(v, site),
      more,
      sender,
    };
  }
  return out;
}
