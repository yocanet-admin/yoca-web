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

/** Panel labels for the currency picker (one currency per document; there is no exchange-rate system). */
export const CURRENCY_LABEL: Record<DocCurrency, string> = {
  TRY: 'Türk lirası (TRY)', USD: 'ABD doları (USD)', EUR: 'Euro (EUR)', GBP: 'İngiliz sterlini (GBP)', AZN: 'Azerbaycan manatı (AZN)',
};

/** Shown first in currency pickers; the others stay fully supported and selectable. */
export const PRIMARY_CURRENCIES: DocCurrency[] = ['TRY', 'USD', 'EUR'];
export const OTHER_CURRENCIES: DocCurrency[] = DOC_CURRENCIES.filter((c) => !PRIMARY_CURRENCIES.includes(c));

/** Units offered in the "Birim" picker (a unit written earlier that is not in the list stays as it is). */
export const UNIT_OPTIONS = ['adet', 'proje', 'paket', 'saat', 'gün', 'sayfa', 'ay', 'yıl'] as const;

/** How a line is billed. "once" = one-time (the default and every line written before this field existed). */
export const BILLINGS = ['once', 'monthly', 'yearly'] as const;
export type Billing = (typeof BILLINGS)[number];
export const BILLING_LABEL: Record<Billing, { tr: string; en: string; per: { tr: string; en: string } }> = {
  once: { tr: 'Tek seferlik', en: 'One-time', per: { tr: '', en: '' } },
  monthly: { tr: 'Aylık', en: 'Monthly', per: { tr: 'ay', en: 'month' } },
  yearly: { tr: 'Yıllık', en: 'Yearly', per: { tr: 'yıl', en: 'year' } },
};
export type PriceBasis = '' | 'fixed' | 'estimate';

export const DOC_STATUSES = ['draft', 'final', 'archived'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** Quote follow-up, marked by an admin by hand. Not a signature, not a verified customer approval. */
export const QUOTE_STATES = ['sent', 'accepted', 'rejected', 'expired'] as const;
export type QuoteState = (typeof QUOTE_STATES)[number];

export const KIND_LABEL: Record<DocKind, { tr: string; en: string; short: string }> = {
  quote: { tr: 'Fiyat teklifi', en: 'Price quotation', short: 'Teklif' },
  proforma: { tr: 'Proforma', en: 'Proforma', short: 'Proforma' },
  letter: { tr: 'Antetli yazı / Bilgilendirme', en: 'Letter', short: 'Yazı' },
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
  /** One-time (default), monthly or yearly. Optional only for content written before it existed. */
  billing?: Billing;
  /** Recurring lines: number of periods (months / years) this quote assumes. '' = not stated (shown as such, never guessed). */
  term?: string;
  /** Recurring lines: the year billing starts. 1 = from the start; 2 = from year 2 (a future renewal, never in the first-period totals). */
  startYear?: number;
  /** id of another line this one is included in (e.g. first-year domain + hosting in the website). It has no price of its own. */
  includedIn?: string;
  /** Lines billed from year 2 on: 'fixed' = price commitment, 'estimate' = per the current tariff, may change. */
  priceBasis?: PriceBasis;
  /** The unit price is an AI suggestion that nobody has reviewed yet (cleared when the admin edits or confirms it). */
  aiPrice?: boolean;
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
  /** Letters: the salutation line ("Sayın Yetkili,"); printed before the text. */
  salutation: string;
  closing: string;
  signatory: { name: string; title: string };
  /** Optional link to an Operasyon project (ops_projects.id); the document keeps its own copy of the name. */
  projectId: string | null;
  /** ÖRNEK (synthetic) document: fictional names allowed, printed "ÖRNEK", never finalized, sent or linked to a client. */
  sample?: boolean;
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
  return { id: localId('i'), title: '', description: '', quantity: '1', unit: '', unitPrice: '', discountPct: '', taxRate: defaultTaxRate, billing: 'once', term: '', startYear: 1, includedIn: '', priceBasis: '', aiPrice: false };
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
    salutation: kind === 'letter' ? (locale === 'tr' ? 'Sayın Yetkili,' : 'Dear Sir or Madam,') : '',
    closing: kind === 'letter' ? (locale === 'tr' ? 'Saygılarımızla,' : 'Kind regards,') : '',
    signatory: opts.signatory ?? { name: '', title: '' },
    projectId: null,
    sample: false,
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
          const billing: Billing = (BILLINGS as readonly string[]).includes(it.billing as string) ? (it.billing as Billing) : 'once';
          const sy = Number(it.startYear);
          return {
            id: id(it.id, 'i'), title: str(it.title, LIMITS.title), description: str(it.description, LIMITS.itemDescription),
            quantity: str(it.quantity, 20).trim(), unit: str(it.unit, 30), unitPrice: str(it.unitPrice, 30).trim(),
            discountPct: str(it.discountPct, 10).trim(), taxRate: str(it.taxRate, 10).trim(),
            billing,
            term: billing !== 'once' && /^\d{1,3}$/.test(str(it.term, 4).trim()) && Number(it.term) >= 1 ? String(Number(it.term)) : '',
            startYear: billing !== 'once' && Number.isInteger(sy) && sy >= 1 && sy <= 5 ? sy : 1,
            includedIn: typeof it.includedIn === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(it.includedIn) ? it.includedIn : '',
            priceBasis: it.priceBasis === 'fixed' || it.priceBasis === 'estimate' ? it.priceBasis : '',
            aiPrice: it.aiPrice === true,
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
    salutation: str(v.salutation, 160),
    closing: str(v.closing, 120),
    signatory: { name: str(sig.name, 120), title: str(sig.title, 120) },
    projectId: typeof v.projectId === 'string' && /^[0-9a-f-]{36}$/i.test(v.projectId) ? v.projectId : null,
    sample: v.sample === true,
  };
}

/* ── What is missing (blocking = cannot finalize; warnings = shown) ─────── */

export const MISSING_MARKER = /\[(?:EKSİK|EKSIK|MISSING)[^\]]*\]/gi;
/** A missing-fact marker about the payment plan ("[EKSİK: Ödeme aşamaları ve oranları]"). */
export const PAYMENT_MARKER = /\[(?:EKSİK|EKSIK|MISSING)[^\]]*(?:ödeme|odeme|oran|aşama|asama|taksit|vade|payment|instal)[^\]]*\]/gi;

/** Payment steps with percentages that add up to exactly 100 (a complete plan). */
export function planComplete(steps: PaymentStep[]): boolean {
  const used = steps.filter((s) => s.value.trim() || s.label.trim());
  if (!used.length || used.some((s) => s.mode !== 'percent')) return false;
  const sum = used.reduce((a, s) => a + Math.round(Number(s.value.replace(',', '.')) * 100), 0);
  return used.every((s) => /^\d{1,3}([.,]\d{1,2})?$/.test(s.value.trim())) && sum === 10000;
}

/** The structured plan as one sentence, for text that should state it ("%50 Başlangıç ödemesi (Sözleşme imzasında), …"). */
export function planSentence(steps: PaymentStep[], locale: DocLocale = 'tr'): string {
  return steps.filter((s) => s.value.trim() || s.label.trim()).map((s) => `%${s.value.trim()} ${s.label.trim() || (locale === 'tr' ? 'ödeme' : 'payment')}${s.due.trim() ? ` (${s.due.trim()})` : ''}`).join(', ');
}

/** Replace payment-plan markers in a text with the plan sentence (only when the plan is complete). */
export function fillPaymentMarkers(text: string, steps: PaymentStep[], locale: DocLocale = 'tr'): { text: string; filled: number } {
  if (!planComplete(steps)) return { text, filled: 0 };
  let filled = 0;
  const out = text.replace(PAYMENT_MARKER, () => { filled += 1; return planSentence(steps, locale); });
  return { text: out, filled };
}

/* ── Payment percentages written in text vs the structured plan ── */

const PAY_WORD = /ödeme|ödenir|ödenecek|peşin|avans|başlangıç|teslim|bakiye|kalan|imza|sözleşme|taksit|vade|fatura|payment|upfront|deposit|advance|balance|delivery|signature|instal/i;
const TAX_WORD = /kdv|vat|vergi|stopaj|tax/i;
const PCT_RE = () => /(?:%\s?(\d{1,3}(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,]\d{1,2})?)\s?%|yüzde\s+(\d{1,3}(?:[.,]\d{1,2})?))/gi;

/* When a payment is due, reduced to comparable tokens. Equivalent words share a category
   (başlangıç = imza = sözleşme = peşin = avans = ön ödeme). */
const TIMING: Array<[string, RegExp]> = [
  ['start', /başlangıç|baslangic|imza|sözleşme|sozlesme|peşin|pesin|avans|ön ödeme|on odeme|upfront|signature|deposit|advance|\bstart/i],
  ['delivery', /teslim|delivery|deliver/i],
  ['launch', /yayın|yayin|canlı|canli|launch|go-live|live\b/i],
  ['approval', /onay|approval|approve/i],
  ['monthly', /aylık|her ay|monthly|every month/i],
];
export interface Timing { cats: string[]; days: number | null }
/** Timing tokens of a phrase ("Yayından 30 gün sonra" → launch + 30 gün); null when it says nothing about timing. */
export function classifyTiming(phrase: string): Timing | null {
  const t = phrase.toLocaleLowerCase('tr');
  const cats = TIMING.filter(([, re]) => re.test(t)).map(([c]) => c);
  const m = /(\d{1,3})\s*(gün|gun|day|hafta|week|ay\b|month)/i.exec(t);
  const days = m ? Number(m[1]) * (/hafta|week/i.test(m[2]) ? 7 : /ay|month/i.test(m[2]) ? 30 : 1) : null;
  return cats.length || days !== null ? { cats, days } : null;
}
const timingOfStep = (s: { label: string; due: string }) => (s.due.trim() && classifyTiming(s.due)) || classifyTiming(s.label);
const timingOfPhrase = (seg: string) => { const paren = /\(([^)]*)\)/.exec(seg)?.[1]; return (paren && classifyTiming(paren)) || classifyTiming(seg); };

export interface TextStep { pct: number; timing: Timing | null; phrase: string }
/**
 * Payment steps a text states ("%50 başlangıçta, %50 teslimde", "Sözleşmede %30, teslimde %70",
 * "yüzde 30 peşin"): only in sentences that talk about payment, never a percentage next to
 * KDV / VAT / tax ("%20 KDV"), never above 100; "%100 memnuniyet" (no payment words) is ignored.
 * Each step keeps the words that say when it is due (before the percentage when the sentence
 * starts with them, otherwise after it up to the next percentage).
 */
export function paymentStepsInText(text: string): TextStep[] {
  const out: TextStep[] = [];
  for (const sentence of text.split(/(?<=[.!?;])\s+|\n+/)) {
    if (!PAY_WORD.test(sentence)) continue;
    const hits: Array<{ pct: number; start: number; end: number }> = [];
    const re = PCT_RE();
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence))) {
      const around = sentence.slice(Math.max(0, m.index - 14), m.index + m[0].length + 14);
      if (TAX_WORD.test(around)) continue;
      const n = Number((m[1] ?? m[2] ?? m[3]).replace(',', '.'));
      if (n > 0 && n <= 100) hits.push({ pct: n, start: m.index, end: m.index + m[0].length });
    }
    if (!hits.length) continue;
    const lead = sentence.slice(0, hits[0].start).split(/[,:;]/).pop() ?? '';
    const prefix = Boolean(classifyTiming(lead)); // "Başlangıçta %30, teslimde %70"
    hits.forEach((h, i) => {
      const seg = prefix
        ? (sentence.slice(i ? hits[i - 1].end : 0, h.start).split(/[,:;]/).pop() ?? '')
        : sentence.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : sentence.length);
      const paren = /\(([^)]*)\)/.exec(seg)?.[1];
      const clean = (paren || seg.replace(/^\s*['’][a-zçğıöşü]*/i, '')).replace(/^[\s,;:]+|[\s,;:.]+$/g, '');
      out.push({ pct: h.pct, timing: timingOfPhrase(seg), phrase: clean.slice(0, 60) });
    });
  }
  return out;
}
export function paymentPercentsInText(text: string): number[] {
  return paymentStepsInText(text).map((s) => s.pct);
}

/** Percentages of a complete plan ([] when the plan is not complete). */
export function planPercents(steps: PaymentStep[]): number[] {
  return planComplete(steps) ? steps.filter((s) => s.value.trim()).map((s) => Number(s.value.replace(',', '.'))) : [];
}

const sameTiming = (a: Timing, b: Timing) => {
  if (a.days !== null && b.days !== null) { if (a.days !== b.days) return false; }
  else if ((a.days === null) !== (b.days === null)) return false; // "teslimde" vs "teslimden 30 gün sonra"
  if (a.cats.length && b.cats.length && !a.cats.some((c) => b.cats.includes(c))) return false;
  return true;
};

export interface PaymentConflict { text: number[]; plan: number[]; stage?: { n: number; text: string; plan: string } }
/**
 * The payment text (sections "Ödeme koşulları" and "Notlar") disagrees with a complete plan:
 *  - a percentage the plan does not have, or a full split (adding to 100) that differs; or
 *  - a step whose timing differs ("teslimde" vs "Yayından 30 gün sonra"; "30 gün" vs "45 gün").
 * Mentioning only some of the plan's own percentages, equivalent words (imza = başlangıç) and
 * timing that can not be read are not conflicts.
 */
export function paymentTextConflict(c: Pick<DocContent, 'blocks' | 'payment'>): PaymentConflict | null {
  const plan = planPercents(c.payment);
  if (!plan.length) return null;
  const steps = c.blocks.filter((b) => b.key === 'terms' || b.key === 'notes').flatMap((b) => paymentStepsInText(b.body));
  if (!steps.length) return null;
  const text = steps.map((s) => s.pct);
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y).join('/');
  const foreign = text.some((n) => !plan.includes(n));
  const fullDiffers = Math.abs(text.reduce((a, n) => a + n, 0) - 100) < 0.001 && sorted(text) !== sorted(plan);
  if (foreign || fullDiffers) return { text, plan };
  // timing: pair text steps with plan steps (by order when the counts match, otherwise by percentage)
  const planSteps = c.payment.filter((s) => s.value.trim());
  const used = new Set<number>();
  for (let i = 0; i < steps.length; i += 1) {
    let j = steps.length === planSteps.length ? i : planSteps.findIndex((p, k) => !used.has(k) && Number(p.value.replace(',', '.')) === steps[i].pct);
    if (j < 0 || used.has(j)) continue;
    used.add(j);
    const pt = timingOfStep(planSteps[j]);
    const tt = steps[i].timing;
    if (pt && tt && !sameTiming(tt, pt)) return { text, plan, stage: { n: j + 1, text: steps[i].phrase, plan: (planSteps[j].due.trim() || planSteps[j].label.trim()) } };
  }
  return null;
}
export const pctList = (a: number[]) => a.map((n) => `%${String(n).replace('.', ',')}`).join(' / ');
/**
 * Rewrite the payment sentence(s) of a text from a complete plan: the first sentence that states
 * payment percentages becomes "Ödeme planı: %40 … (…), …", further such sentences are removed.
 * Text without payment percentages is left as it is.
 */
export function syncPaymentSentences(text: string, steps: PaymentStep[], locale: DocLocale = 'tr'): { text: string; changed: boolean } {
  if (!planComplete(steps)) return { text, changed: false };
  let done = false;
  let changed = false;
  const lines = text.split('\n').map((line) => line.split(/(?<=[.!?;])\s+/).map((sentence) => {
    if (!paymentStepsInText(sentence).length) return sentence;
    changed = true;
    if (done) return '';
    done = true;
    return `${locale === 'tr' ? 'Ödeme planı' : 'Payment plan'}: ${planSentence(steps, locale)}.`;
  }).filter(Boolean).join(' '));
  return { text: lines.join('\n'), changed };
}

/** One Turkish sentence saying what differs. */
export function conflictText(x: PaymentConflict): string {
  return x.stage
    ? `${x.stage.n}. aşama metinde “${x.stage.text}”, planda “${x.stage.plan}”`
    : `metinde ${pctList(x.text)}, planda ${pctList(x.plan)}`;
}

/* ── File names shown to people (downloads, e-mail attachments) ──── */

const KIND_FILE: Record<DocKind, string> = { quote: 'Teklif', proforma: 'Proforma', letter: 'Yazı', status_report: 'Durum-Raporu', delivery: 'Teslim-Belgesi' };
const asciiName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/**
 * "Yoca-Teklif-TKL-2026-0003-Taslak.pdf", "Yoca-Teklif-TKL-2026-0003-v1.pdf" (a past render: "…-v1-r3.pdf").
 * `ascii: true` gives the ASCII fallback ("Yoca-Yazi-…" for "Yoca-Yazı-…"). Storage keys are never renamed.
 */
export function docFileName(kind: DocKind, number: string, version: 'draft' | number, opts: { revision?: number; ascii?: boolean } = {}): string {
  const tail = version === 'draft' ? 'Taslak' : `v${version}${opts.revision ? `-r${opts.revision}` : ''}`;
  const name = `Yoca-${KIND_FILE[kind] ?? 'Belge'}-${asciiName(number) || 'belge'}-${tail}.pdf`;
  return opts.ascii ? asciiName(name.slice(0, -4)) + '.pdf' : name;
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / RFC 5987). */
export function contentDisposition(type: 'inline' | 'attachment', utf8Name: string): string {
  const fallback = asciiName(utf8Name.replace(/\.pdf$/i, '')) + (/\.pdf$/i.test(utf8Name) ? '.pdf' : '');
  const enc = encodeURIComponent(utf8Name).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${enc}`;
}

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
  return [c.subject, c.reference, c.projectName, c.period, c.deliveryTime, c.salutation, c.closing, c.signatory.name, c.signatory.title,
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
    real.forEach((i, n) => { if (i.aiPrice && i.unitPrice.trim() && !i.includedIn) blocking.push(`AI fiyat önerisi kontrol edilmedi: ${i.title.trim() || `${n + 1}. kalem`} (fiyatı düzenleyin veya “Fiyatı kontrol ettim” deyin).`); });
    real.forEach((i, n) => { if ((i.billing ?? 'once') === 'monthly' && !i.includedIn && !i.term) warnings.push(`${i.title.trim() || `${n + 1}. kalem`}: aylık hizmetin süresi belirtilmedi (teklifte “süre belirtilmedi” yazar).`); });
  }
  if (c.sample) blocking.push('Bu bir ÖRNEK (sentetik) belge: kesinleştirilemez ve gönderilemez. Gerçek teklif için yeni belge açın veya örnek işaretini kaldırıp bilgileri gerçek bilgilerle değiştirin.');
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
  // A complete payment plan next to a text that still says the plan is missing: conflicting, never printed silently.
  if (def.payment && planComplete(c.payment)) {
    const stale = c.blocks.flatMap((b) => b.body.match(PAYMENT_MARKER) ?? []);
    if (stale.length) blocking.push(`Ödeme planı dolu ama metinde hâlâ ${stale[0]} yazıyor. Metni planla uyumlu hâle getirin (Eksikler kutusundaki “İşareti ödeme planıyla doldur”).`);
  }
  const conflict = def.payment ? paymentTextConflict(c) : null;
  if (conflict) blocking.push(`Ödeme metni ile plan uyuşmuyor: ${conflictText(conflict)}. Metni veya planı düzeltin.`);
  const markers = allText(c).match(MISSING_MARKER) ?? [];
  for (const m of Array.from(new Set(markers)).slice(0, 10)) blocking.push(`Metinde doldurulmamış yer var: ${m}`);
  return { blocking, warnings };
}

/** Split a block body into paragraphs / bullet lines / sub-headings for display (pure). */
export function bodyParts(body: string, list: boolean): Array<{ type: 'p' | 'li' | 'h'; text: string }> {
  const out: Array<{ type: 'p' | 'li' | 'h'; text: string }> = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ').trim() }); para = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    // "## Başlık" inside a text section = a sub-heading (letters, reports).
    if (!list && /^#{1,3}\s+\S/.test(line)) { flush(); out.push({ type: 'h', text: line.replace(/^#{1,3}\s+/, '') }); continue; }
    const bullet = /^[-•*]\s+/.exec(line);
    if (bullet || list) { flush(); out.push({ type: 'li', text: line.replace(/^[-•*]\s+/, '') }); continue; }
    para.push(line);
  }
  flush();
  return out.filter((p) => p.text);
}

/** One line of panel text about how a line is billed ("Aylık · süre belirtilmedi", "Web sitesi kalemine dahil", …). */
export function billingText(it: LineItem, items: LineItem[]): string {
  if (it.includedIn) {
    const t = items.find((x) => x.id === it.includedIn);
    return t ? `“${t.title.trim() || 'kalem'}” kalemine dahil (ayrı fiyatı yok)` : 'Dahil olduğu kalem bulunamadı';
  }
  const b = it.billing ?? 'once';
  if (b === 'once') return 'Tek seferlik';
  const per = BILLING_LABEL[b].per.tr;
  const start = (it.startYear ?? 1) > 1 ? `${it.startYear}. yıldan itibaren` : 'başlangıçtan itibaren';
  const term = it.term ? `${it.term} ${per}` : 'süre belirtilmedi';
  const basis = (it.startYear ?? 1) > 1 ? (it.priceBasis === 'fixed' ? 'sabit fiyat' : it.priceBasis === 'estimate' ? 'güncel tarifeye göre tahmini' : 'fiyat niteliği seçilmedi') : '';
  return [BILLING_LABEL[b].tr, start, term, basis].filter(Boolean).join(' · ');
}
