/**
 * Yoca — Teklifler ve Belgeler: shared document model (pure, client-safe; unit-tested).
 *
 * One model for every document type. A type only decides which parts are
 * shown and which fields are required (KIND_DEF); there is no separate system
 * per type. Content is stored as JSON on public.doc_documents (working copy)
 * and frozen into public.doc_versions when the admin finalizes it.
 *
 * Facts are never invented here: an unknown price is an empty string and is
 * reported as missing, never treated as 0. Text that still contains an
 * "[EKSİK: …]" marker (left by the AI for facts it must not guess) cannot be
 * finalized.
 */

export const DOC_KINDS = ['quote', 'proforma', 'letter', 'status_report', 'delivery'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LOCALES = ['tr', 'en'] as const;
export type DocLocale = (typeof DOC_LOCALES)[number];

export const DOC_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'AZN'] as const;
export type DocCurrency = (typeof DOC_CURRENCIES)[number];

export const DOC_STATUSES = ['draft', 'final', 'archived'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** Quote follow-up, marked by an admin by hand. Not a signature, not a verified customer approval. */
export const QUOTE_STATES = ['sent', 'accepted', 'rejected', 'expired'] as const;
export type QuoteState = (typeof QUOTE_STATES)[number];

export const KIND_LABEL: Record<DocKind, { tr: string; en: string; short: string }> = {
  quote: { tr: 'Fiyat teklifi', en: 'Price quotation', short: 'Teklif' },
  proforma: { tr: 'Proforma', en: 'Proforma', short: 'Proforma' },
  letter: { tr: 'Antetli yazı', en: 'Letter', short: 'Yazı' },
  status_report: { tr: 'Proje durum raporu', en: 'Project status report', short: 'Durum raporu' },
  delivery: { tr: 'Teslim belgesi', en: 'Delivery note', short: 'Teslim' },
};

/** Number prefix per type: TKL-2026-0001. Numbers come from public.doc_next_number() (one counter row per prefix + year). */
export const KIND_PREFIX: Record<DocKind, string> = { quote: 'TKL', proforma: 'PRF', letter: 'YZI', status_report: 'RPR', delivery: 'TSL' };

export const STATUS_LABEL: Record<DocStatus, string> = { draft: 'Taslak', final: 'Kesinleştirildi', archived: 'Arşivlendi' };
export const QUOTE_STATE_LABEL: Record<QuoteState, string> = { sent: 'Gönderildi', accepted: 'Kabul edildi', rejected: 'Reddedildi', expired: 'Süresi doldu' };

export const BLOCK_KEYS = ['intro', 'scope', 'deliverables', 'assumptions', 'out_of_scope', 'revisions', 'terms', 'notes', 'body', 'summary', 'done', 'in_progress', 'waiting', 'next_steps', 'delivered', 'open_issues', 'acceptance', 'custom'] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];

export const BLOCK_LABEL: Record<BlockKey, { tr: string; en: string; list: boolean }> = {
  intro: { tr: 'Giriş', en: 'Introduction', list: false },
  scope: { tr: 'Kapsam', en: 'Scope', list: false },
  deliverables: { tr: 'Teslimatlar', en: 'Deliverables', list: true },
  assumptions: { tr: 'Varsayımlar', en: 'Assumptions', list: true },
  out_of_scope: { tr: 'Kapsam dışı', en: 'Out of scope', list: true },
  revisions: { tr: 'Revizyon koşulları', en: 'Revisions', list: false },
  terms: { tr: 'Ödeme koşulları', en: 'Payment terms', list: false },
  notes: { tr: 'Notlar', en: 'Notes', list: false },
  body: { tr: 'Metin', en: 'Text', list: false },
  summary: { tr: 'Özet', en: 'Summary', list: false },
  done: { tr: 'Tamamlananlar', en: 'Completed', list: true },
  in_progress: { tr: 'Devam edenler', en: 'In progress', list: true },
  waiting: { tr: 'Müşteriden beklenenler', en: 'Waiting on client', list: true },
  next_steps: { tr: 'Sonraki adımlar', en: 'Next steps', list: true },
  delivered: { tr: 'Teslim edilenler', en: 'Delivered', list: true },
  open_issues: { tr: 'Açık konular', en: 'Open issues', list: true },
  acceptance: { tr: 'Teslim notu', en: 'Acceptance note', list: false },
  custom: { tr: 'Bölüm', en: 'Section', list: false },
};

export interface KindDef {
  /** Blocks a new document starts with (order = PDF order). */
  blocks: BlockKey[];
  items: boolean;
  payment: boolean;
  validity: boolean;
  bank: boolean;
  period: boolean;
  subject: boolean;
  deliveryTime: boolean;
}

export const KIND_DEF: Record<DocKind, KindDef> = {
  quote: { blocks: ['intro', 'scope', 'deliverables', 'assumptions', 'out_of_scope', 'revisions', 'notes'], items: true, payment: true, validity: true, bank: true, period: false, subject: false, deliveryTime: true },
  proforma: { blocks: ['notes'], items: true, payment: true, validity: true, bank: true, period: false, subject: false, deliveryTime: true },
  letter: { blocks: ['body'], items: false, payment: false, validity: false, bank: false, period: false, subject: true, deliveryTime: false },
  status_report: { blocks: ['summary', 'done', 'in_progress', 'waiting', 'next_steps'], items: false, payment: false, validity: false, bank: false, period: true, subject: false, deliveryTime: false },
  delivery: { blocks: ['scope', 'delivered', 'open_issues', 'acceptance'], items: false, payment: false, validity: false, bank: false, period: false, subject: false, deliveryTime: false },
};

export interface Recipient {
  name: string;
  company: string;
  attention: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  phone: string;
}

export interface LineItem {
  id: string;
  title: string;
  description: string;
  /** Decimal text, up to 3 decimals ("1", "1,5"). */
  quantity: string;
  unit: string;
  /** Decimal text in the document currency. Empty = price not known yet (never 0). */
  unitPrice: string;
  /** Percent, up to 2 decimals. Empty = 0. */
  discountPct: string;
  /** VAT/KDV percent, chosen by the admin (never by the AI). */
  taxRate: string;
}

export interface PaymentStep {
  id: string;
  label: string;
  mode: 'percent' | 'amount';
  /** Percent ("50") or amount ("12.500,00") depending on mode. */
  value: string;
  /** When it is due, as written by the admin ("Sözleşme imzasında", "2026-12-15"). */
  due: string;
}

export interface Block {
  id: string;
  key: BlockKey;
  heading: string;
  /** Paragraphs separated by a blank line; for list blocks one item per line. Lines starting "- " are bullets. */
  body: string;
}

export interface DocContent {
  locale: DocLocale;
  /** YYYY-MM-DD */
  issueDate: string;
  validUntil: string;
  subject: string;
  reference: string;
  projectName: string;
  period: string;
  recipient: Recipient;
  currency: DocCurrency;
  items: LineItem[];
  payment: PaymentStep[];
  deliveryTime: string;
  bankAccountIds: string[];
  blocks: Block[];
  closing: string;
  signatory: { name: string; title: string };
}

export const EMPTY_RECIPIENT: Recipient = { name: '', company: '', attention: '', address: '', taxOffice: '', taxNumber: '', email: '', phone: '' };

let seq = 0;
/** Short local id for items/blocks (stable inside one document). */
export function localId(prefix = 'x'): string {
  seq = (seq + 1) % 1_000_000;
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${rnd}${seq.toString(36)}`;
}

export function blockHeading(key: BlockKey, locale: DocLocale): string {
  return BLOCK_LABEL[key][locale];
}

export function newItem(defaultTaxRate = '20'): LineItem {
  return { id: localId('i'), title: '', description: '', quantity: '1', unit: '', unitPrice: '', discountPct: '', taxRate: defaultTaxRate };
}

export function todayIso(now = new Date()): string {
  // Istanbul calendar day (UTC+3, no DST).
  const d = new Date(now.getTime() + 3 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function newContent(kind: DocKind, opts: { locale?: DocLocale; currency?: DocCurrency; validityDays?: number; defaultTaxRate?: string; closing?: string; signatory?: { name: string; title: string }; now?: Date } = {}): DocContent {
  const locale = opts.locale ?? 'tr';
  const def = KIND_DEF[kind];
  const issueDate = todayIso(opts.now);
  return {
    locale,
    issueDate,
    validUntil: def.validity ? addDaysIso(issueDate, opts.validityDays ?? 30) : '',
    subject: '',
    reference: '',
    projectName: '',
    period: '',
    recipient: { ...EMPTY_RECIPIENT },
    currency: opts.currency ?? 'TRY',
    items: def.items ? [newItem(opts.defaultTaxRate)] : [],
    payment: [],
    deliveryTime: '',
    bankAccountIds: [],
    blocks: def.blocks.map((key) => ({ id: localId('b'), key, heading: blockHeading(key, locale), body: '' })),
    closing: kind === 'letter' ? (locale === 'tr' ? 'Saygılarımızla,' : 'Kind regards,') : '',
    signatory: opts.signatory ?? { name: '', title: '' },
  };
}

/* ── Sanitizing (every write goes through here, client and server) ───────── */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max) : '');
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : '');
const id = (v: unknown, prefix: string) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : localId(prefix));

export const LIMITS = { items: 80, payment: 12, blocks: 24, blockBody: 12_000, itemDescription: 1_500, title: 200 } as const;

export function sanitizeContent(input: unknown, kind: DocKind): DocContent {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const base = newContent(kind);
  const locale = (DOC_LOCALES as readonly string[]).includes(v.locale as string) ? (v.locale as DocLocale) : base.locale;
  const currency = (DOC_CURRENCIES as readonly string[]).includes(v.currency as string) ? (v.currency as DocCurrency) : base.currency;
  const r = (v.recipient && typeof v.recipient === 'object' ? v.recipient : {}) as Record<string, unknown>;
  const def = KIND_DEF[kind];
  const items = Array.isArray(v.items) ? v.items.slice(0, LIMITS.items) : [];
  const payment = Array.isArray(v.payment) ? v.payment.slice(0, LIMITS.payment) : [];
  const blocks = Array.isArray(v.blocks) ? v.blocks.slice(0, LIMITS.blocks) : base.blocks;
  const sig = (v.signatory && typeof v.signatory === 'object' ? v.signatory : {}) as Record<string, unknown>;
  return {
    locale,
    issueDate: isoDate(v.issueDate) || base.issueDate,
    validUntil: def.validity ? isoDate(v.validUntil) : '',
    subject: str(v.subject, 300),
    reference: str(v.reference, 200),
    projectName: str(v.projectName, 200),
    period: str(v.period, 120),
    recipient: {
      name: str(r.name, 200), company: str(r.company, 200), attention: str(r.attention, 200), address: str(r.address, 600),
      taxOffice: str(r.taxOffice, 120), taxNumber: str(r.taxNumber, 40), email: str(r.email, 200), phone: str(r.phone, 60),
    },
    currency,
    items: def.items
      ? items.map((raw) => {
          const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
          return {
            id: id(it.id, 'i'), title: str(it.title, LIMITS.title), description: str(it.description, LIMITS.itemDescription),
            quantity: str(it.quantity, 20).trim(), unit: str(it.unit, 30), unitPrice: str(it.unitPrice, 30).trim(),
            discountPct: str(it.discountPct, 10).trim(), taxRate: str(it.taxRate, 10).trim(),
          };
        })
      : [],
    payment: def.payment
      ? payment.map((raw) => {
          const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
          return { id: id(p.id, 'p'), label: str(p.label, 160), mode: p.mode === 'amount' ? 'amount' : 'percent', value: str(p.value, 30).trim(), due: str(p.due, 160) } as PaymentStep;
        })
      : [],
    deliveryTime: def.deliveryTime ? str(v.deliveryTime, 200) : '',
    bankAccountIds: def.bank && Array.isArray(v.bankAccountIds) ? v.bankAccountIds.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x)).slice(0, 4) : [],
    blocks: blocks.map((raw) => {
      const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const key = (BLOCK_KEYS as readonly string[]).includes(b.key as string) ? (b.key as BlockKey) : 'custom';
      return { id: id(b.id, 'b'), key, heading: str(b.heading, 160), body: str(b.body, LIMITS.blockBody) };
    }),
    closing: str(v.closing, 120),
    signatory: { name: str(sig.name, 120), title: str(sig.title, 120) },
  };
}

/* ── What is missing (blocking = cannot finalize; warnings = shown) ─────── */

export const MISSING_MARKER = /\[(?:EKSİK|EKSIK|MISSING)[^\]]*\]/gi;

export interface Issuer {
  brand: string;
  legalName: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  mersis: string;
  tradeRegistry: string;
  email: string;
  phone: string;
  website: string;
  kep: string;
}

export interface MissingReport {
  blocking: string[];
  warnings: string[];
}

/** Every text the PDF prints (for marker checks). */
export function allText(c: DocContent): string {
  return [c.subject, c.reference, c.projectName, c.period, c.deliveryTime, c.closing, c.signatory.name, c.signatory.title,
    ...Object.values(c.recipient), ...c.items.flatMap((i) => [i.title, i.description, i.unit]), ...c.payment.flatMap((p) => [p.label, p.due]),
    ...c.blocks.flatMap((b) => [b.heading, b.body])].join('\n');
}

export function missingFor(kind: DocKind, c: DocContent, issuer: Issuer, extra: { paymentProblem?: string | null; missingPrices?: string[]; title?: string } = {}): MissingReport {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const def = KIND_DEF[kind];
  if (extra.title !== undefined && !extra.title.trim()) blocking.push('Belge başlığı boş.');
  if (!c.recipient.name.trim() && !c.recipient.company.trim()) blocking.push('Alıcı adı veya firma adı yazılmadı.');
  if (!c.issueDate) blocking.push('Düzenleme tarihi yok.');
  if (!issuer.legalName.trim()) (kind === 'proforma' ? blocking : warnings).push('Şirket bilgilerinde tam ticaret unvanı boş (Şirket bilgileri → Veri sorumlusu adı / unvanı).');
  if (def.items) {
    const real = c.items.filter((i) => i.title.trim() || i.description.trim() || i.unitPrice.trim());
    if (!real.length) blocking.push('En az bir iş kalemi gerekli.');
    real.forEach((i, n) => { if (!i.title.trim()) blocking.push(`${n + 1}. kalemin açıklaması (başlığı) boş.`); });
    for (const label of extra.missingPrices ?? []) blocking.push(`Fiyatı eksik kalem: ${label}`);
  }
  if (def.validity && !c.validUntil) (kind === 'quote' ? blocking : warnings).push('Geçerlilik tarihi yok.');
  if (def.validity && c.validUntil && c.issueDate && c.validUntil < c.issueDate) blocking.push('Geçerlilik tarihi düzenleme tarihinden önce.');
  if (def.payment && extra.paymentProblem) blocking.push(extra.paymentProblem);
  if (kind === 'proforma') {
    if (!issuer.address.trim()) blocking.push('Şirket bilgilerinde resmî adres boş.');
    if (!issuer.taxOffice.trim() || !issuer.taxNumber.trim()) blocking.push('Şirket bilgilerinde vergi dairesi / vergi numarası boş.');
    if (!c.recipient.taxNumber.trim()) warnings.push('Alıcının vergi numarası yazılmadı.');
  }
  if (kind === 'quote' && (!issuer.taxNumber.trim() || !issuer.address.trim())) warnings.push('Şirket bilgilerinde adres veya vergi numarası boş; teklifte bu satırlar görünmez.');
  if (def.subject && !c.subject.trim()) blocking.push('Konu satırı boş.');
  const filled = c.blocks.filter((b) => b.body.trim());
  if (kind === 'letter' && !filled.length) blocking.push('Yazı metni boş.');
  if (kind === 'status_report' && !filled.length) blocking.push('Raporda doldurulmuş bölüm yok.');
  if (kind === 'status_report' && !c.period.trim()) warnings.push('Rapor dönemi yazılmadı.');
  if (kind === 'delivery' && !c.blocks.some((b) => b.key === 'delivered' && b.body.trim())) blocking.push('Teslim edilenler listesi boş.');
  if (def.bank && kind === 'proforma' && !c.bankAccountIds.length) warnings.push('Banka hesabı seçilmedi.');
  const markers = allText(c).match(MISSING_MARKER) ?? [];
  for (const m of Array.from(new Set(markers)).slice(0, 10)) blocking.push(`Metinde doldurulmamış yer var: ${m}`);
  return { blocking, warnings };
}

/** Split a block body into paragraphs / bullet lines for display (pure). */
export function bodyParts(body: string, list: boolean): Array<{ type: 'p' | 'li'; text: string }> {
  const out: Array<{ type: 'p' | 'li'; text: string }> = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ').trim() }); para = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = /^[-•*]\s+/.exec(line);
    if (bullet || list) { flush(); out.push({ type: 'li', text: line.replace(/^[-•*]\s+/, '') }); continue; }
    para.push(line);
  }
  flush();
  return out.filter((p) => p.text);
}
