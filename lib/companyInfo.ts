/**
 * Yoca — company & KVKK settings (pure, client-safe; unit-tested).
 * Stored server side in cockpit_settings key "company_info" (admin-only RLS); the
 * public notice page reads it with the service role.
 *
 * Only facts already known are pre-filled: brand Yoca, site https://yoca.net,
 * connect@yoca.net, and the address SHOWN on the site (kept separate from the
 * official address — it is not treated as the legal notice address, and
 * "Yoca" is not treated as the legal trade name). Every official field starts
 * empty and is shown as "tamamlanacak" until the owner fills it.
 */

export interface CompanyInfo {
  brand: string;
  website: string;
  /** Data controller: real person's full name or full trade name. */
  controllerName: string;
  controllerType: '' | 'person' | 'company';
  /** Official address for notices (not the marketing address). */
  officialAddress: string;
  /** Address shown on the site today (informational only). */
  siteAddress: string;
  generalEmail: string;
  /** Phone line printed on documents (Teklifler ve Belgeler). Empty = not printed. */
  phone: string;
  /** How data subjects apply (e.g. e-mail address, KEP, postal address). */
  dataRequestChannel: string;
  kep: string;
  mersis: string;
  tradeRegistry: string;
  taxOffice: string;
  taxNumber: string;
  noticeVersion: string;
  /** YYYY-MM-DD */
  noticeUpdatedAt: string;
  /** Filled only after legal review — empty = "hukuki inceleme gerekli". */
  legalBasisContact: string;
  legalBasisCheckup: string;
  retentionContact: string;
  retentionCheckup: string;
  /** v16 newsletter (Insights bülteni). */
  legalBasisNewsletter: string;
  retentionNewsletter: string;
  transferAssessment: string;
  legalReviewDone: boolean;
  legalReviewNote: string;
}

export const DEFAULT_COMPANY: CompanyInfo = {
  brand: 'Yoca',
  website: 'https://yoca.net',
  controllerName: '',
  controllerType: '',
  officialAddress: '',
  siteAddress: 'Bağdat Caddesi, No: 131, Kadıköy / İstanbul',
  generalEmail: 'connect@yoca.net',
  phone: '',
  dataRequestChannel: '',
  kep: '',
  mersis: '',
  tradeRegistry: '',
  taxOffice: '',
  taxNumber: '',
  noticeVersion: '',
  noticeUpdatedAt: '',
  legalBasisContact: '',
  legalBasisCheckup: '',
  retentionContact: '',
  retentionCheckup: '',
  legalBasisNewsletter: '',
  retentionNewsletter: '',
  transferAssessment: '',
  legalReviewDone: false,
  legalReviewNote: '',
};

const TEXT_FIELDS: Array<[keyof CompanyInfo, number]> = [
  ['controllerName', 200], ['officialAddress', 400], ['siteAddress', 200], ['generalEmail', 200], ['phone', 40], ['dataRequestChannel', 400], ['kep', 200],
  ['mersis', 40], ['tradeRegistry', 120], ['taxOffice', 120], ['taxNumber', 40], ['noticeVersion', 40], ['noticeUpdatedAt', 10],
  ['legalBasisContact', 2000], ['legalBasisCheckup', 2000], ['retentionContact', 2000], ['retentionCheckup', 2000], ['legalBasisNewsletter', 2000], ['retentionNewsletter', 2000], ['transferAssessment', 3000], ['legalReviewNote', 2000],
];

export function sanitizeCompany(input: Partial<CompanyInfo> | null | undefined): CompanyInfo {
  const v = (input ?? {}) as Record<string, unknown>;
  const out: CompanyInfo = { ...DEFAULT_COMPANY };
  for (const [key, max] of TEXT_FIELDS) {
    if (typeof v[key] === 'string') (out as unknown as Record<string, unknown>)[key] = (v[key] as string).trim().slice(0, max);
  }
  if (v.controllerType === 'person' || v.controllerType === 'company' || v.controllerType === '') out.controllerType = v.controllerType;
  out.legalReviewDone = v.legalReviewDone === true;
  if (out.noticeUpdatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(out.noticeUpdatedAt)) out.noticeUpdatedAt = '';
  if (out.generalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.generalEmail)) out.generalEmail = DEFAULT_COMPANY.generalEmail;
  return out;
}

/** Fields that must be completed before the notice stops being a draft (Turkish labels). */
export function missingForNotice(c: CompanyInfo): string[] {
  const missing: string[] = [];
  if (!c.controllerName) missing.push('Veri sorumlusu (gerçek kişi adı veya tam ticaret unvanı)');
  if (!c.controllerType) missing.push('Veri sorumlusu türü (gerçek kişi / şirket)');
  if (!c.officialAddress) missing.push('Resmî adres');
  if (!c.dataRequestChannel) missing.push('Kişisel veri başvuru kanalı');
  if (!c.noticeVersion) missing.push('Metin sürümü');
  if (!c.noticeUpdatedAt) missing.push('Güncelleme tarihi');
  if (!c.legalBasisContact) missing.push('Hukuki sebep — iletişim formu');
  if (!c.legalBasisCheckup) missing.push('Hukuki sebep — Check-Up');
  if (!c.retentionContact) missing.push('Saklama süresi — iletişim formu');
  if (!c.retentionCheckup) missing.push('Saklama süresi — Check-Up');
  if (!c.legalBasisNewsletter) missing.push('Hukuki sebep — Insights bülteni');
  if (!c.retentionNewsletter) missing.push('Saklama süresi — Insights bülteni');
  if (!c.transferAssessment) missing.push('Yurt dışına aktarım değerlendirmesi');
  if (!c.legalReviewDone) missing.push('Hukuki inceleme onayı');
  return missing;
}

/**
 * Owner flag (cockpit_settings key "kvkk_published", default OFF). While OFF
 * the notice page carries the "TASLAK — hukuki inceleme tamamlanmadı" banner,
 * is noindex, is left out of the sitemap and is not linked from the footer
 * (the line under the two forms still links to it, as required). It can only
 * be switched ON when nothing required is missing (checked by the admin API).
 */
export interface KvkkPublish {
  published: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
}

export const DEFAULT_KVKK_PUBLISH: KvkkPublish = { published: false, publishedAt: null, publishedBy: null };

export function sanitizeKvkkPublish(input: Partial<KvkkPublish> | null | undefined): KvkkPublish {
  const v = input ?? {};
  return {
    published: v.published === true,
    publishedAt: typeof v.publishedAt === 'string' ? v.publishedAt : null,
    publishedBy: typeof v.publishedBy === 'string' ? v.publishedBy : null,
  };
}

/** Is the notice final? Flag ON and nothing required missing (pure; unit-tested). */
export function noticeIsFinal(company: CompanyInfo, flag: KvkkPublish): boolean {
  return flag.published && missingForNotice(company).length === 0;
}
