/**
 * Yoca — Teklifler ve Belgeler: the AI draft SUGGESTION and how it is applied
 * (pure, client-safe; unit-tested). Server side: lib/ai/documents.ts asks the
 * model and cleans the answer into this shape; the editor shows it for review
 * and applies only what the admin selects.
 *
 * Rules (each one is tested):
 *  - Nothing is written until "Uygula"; the result of applyDraft is the new
 *    editor state (still unsaved), never a save, finalize or send.
 *  - Only the selected sections change. An empty suggested value never clears
 *    a filled field. Recipient, client link, bank accounts, signatory, project,
 *    dates (except a selected validity) and the currency are never touched.
 *  - Prices are taken only when the admin asked for them; each one arrives
 *    marked "AI fiyat önerisi — kontrol edilmeli" (LineItem.aiPrice). Tax rates
 *    always come from the document settings.
 *  - The currency is the document's. A suggestion whose request names another
 *    currency is not priced into the document until the admin confirms the
 *    document currency (acceptCurrency).
 *  - A sample ("ÖRNEK") suggestion may bring fictional names, only into a
 *    document that is not linked to a client, and marks the document as a sample.
 *  - All amounts are computed by lib/documents/calc.ts, never here.
 */

import { addDaysIso, localId, newItem, type Billing, type Block, type BlockKey, type DocContent, type DocCurrency, type LineItem, type PriceBasis, BLOCK_KEYS, DOC_CURRENCIES, blockHeading } from '@/lib/documents/model';
import { parseMoney } from '@/lib/documents/calc';

export interface SuggestedItem {
  /** Short key the model uses so one line can say it is included in another (e.g. "web"). */
  ref: string;
  title: string;
  description: string;
  quantity: string;
  unit: string;
  billing: Billing;
  /** Recurring: number of months / years if the brief states it; '' = not stated. */
  term: string;
  startYear: number;
  /** ref of the line this one is included in; '' = none. */
  includedIn: string;
  /** Plain decimal in the document currency, VAT excluded; '' when prices were not asked for. */
  unitPrice: string;
  priceBasis: PriceBasis;
  /** Short reason for the estimate (scope / effort), shown next to the price in the review. */
  priceNote: string;
}

export interface DraftSuggestion {
  title: string;
  subject: string;
  blocks: Array<{ key: string; heading: string; body: string }>;
  items: SuggestedItem[];
  payment: Array<{ label: string; percent: number | null; due: string }>;
  deliveryTime: string;
  /** Proposed validity in days from the issue date (the app computes the date); null = none. */
  validityDays: number | null;
  closing: string;
  /** How the prices were estimated (no live research) and the assumptions behind them. */
  pricing: { basis: string; assumptions: string[] };
  /** Section ids holding terms the user did not give (shown as "kontrol edilecek öneri"). */
  proposed: string[];
  missing: string[];
  warnings: string[];
  /* set by the server, not by the model */
  currency: DocCurrency;
  prices: boolean;
  sample: boolean;
  /** 'all' or one section id: a section-level regeneration only carries that section. */
  scope: string;
  currencyConflict: { requested: DocCurrency[]; selected: DocCurrency } | null;
  sampleRecipient: { company: string; name: string } | null;
}

/* ── Section ids ───────────────────────────────────────────────── */

/** Section ids used for selection, scope and "proposed": title, subject, block:<key>, items, payment, deliveryTime, validity, closing, recipient. */
export const SECTION_LABEL: Record<string, string> = {
  title: 'Başlık', subject: 'Konu', items: 'Kalemler ve fiyatlar', payment: 'Ödeme planı', deliveryTime: 'Takvim / teslim süresi',
  validity: 'Geçerlilik', closing: 'Kapanış cümlesi', recipient: 'Örnek alıcı (kurgusal)',
};
export function sectionLabel(id: string, blockLabel: (k: BlockKey) => string): string {
  if (id.startsWith('block:')) return blockLabel(id.slice(6) as BlockKey);
  return SECTION_LABEL[id] ?? id;
}
export const isBlockKey = (k: string): k is BlockKey => (BLOCK_KEYS as readonly string[]).includes(k);

/** The section ids a suggestion actually carries (non-empty only). */
export function sectionsOf(s: DraftSuggestion): string[] {
  const out: string[] = [];
  if (s.title.trim()) out.push('title');
  if (s.subject.trim()) out.push('subject');
  for (const b of s.blocks) if (b.body.trim() && !out.includes(`block:${b.key}`)) out.push(`block:${b.key}`);
  if (s.items.some((i) => i.title.trim())) out.push('items');
  if (s.payment.length) out.push('payment');
  if (s.deliveryTime.trim()) out.push('deliveryTime');
  if (s.validityDays) out.push('validity');
  if (s.closing.trim()) out.push('closing');
  if (s.sample && s.sampleRecipient && (s.sampleRecipient.company || s.sampleRecipient.name)) out.push('recipient');
  return out;
}

/** Keep only one section (section-level regeneration): every other field is emptied, so applying it cannot touch them. */
export function restrictToScope(s: DraftSuggestion, scope: string): DraftSuggestion {
  if (scope === 'all') return s;
  const keepBlock = (k: string) => scope === `block:${k}` || (scope === 'payment' && k === 'terms');
  return {
    ...s,
    title: scope === 'title' ? s.title : '',
    subject: scope === 'subject' ? s.subject : '',
    blocks: s.blocks.filter((b) => keepBlock(b.key)),
    items: scope === 'items' ? s.items : [],
    payment: scope === 'payment' ? s.payment : [],
    deliveryTime: scope === 'deliveryTime' ? s.deliveryTime : '',
    validityDays: scope === 'validity' ? s.validityDays : null,
    closing: scope === 'closing' ? s.closing : '',
    pricing: scope === 'items' ? s.pricing : { basis: '', assumptions: [] },
    sampleRecipient: null,
    proposed: s.proposed.filter((p) => p === scope || (scope === 'payment' && p === 'block:terms')),
    scope,
  };
}

/* ── Request reading (deterministic, no AI) ───────────────────────── */

const CUR_PATTERNS: Array<[DocCurrency, RegExp]> = [
  ['TRY', /₺|\bTRY\b|\bTL\b|\btürk lirası|\blira\b/i],
  ['USD', /\$|\bUSD\b|\bdolar\w*|\bdollar\w*/i],
  ['EUR', /€|\bEUR\b|\beuro\w*|\bavro\w*/i],
  ['GBP', /£|\bGBP\b|\bsterlin\w*|\bpound\w*/i],
  ['AZN', /₼|\bAZN\b|\bmanat\w*/i],
];
/** Currencies a request names ("fiyatlar euro olsun", "$", "TL"). */
export function currencyMentions(text: string): DocCurrency[] {
  return CUR_PATTERNS.filter(([, re]) => re.test(text)).map(([c]) => c);
}

/** The request explicitly asks for prices ("fiyatları da öner", "fiyat ver", "fiyatlandır", "suggest prices"). */
export function pricesRequested(text: string): boolean {
  const t = text.toLocaleLowerCase('tr');
  return /fiyat(lar[ıi]n?[ıi]?|ı|i)?\s*(da\s+|de\s+)?(öner|ver|belirle|yaz|ekle|çıkar)|fiyatland[ıi]r|ücret(ler[ıi])?\s*(de\s+|da\s+)?(öner|ver|belirle)|(suggest|propose|estimate|include)\s+(the\s+)?(prices|pricing|fees)/i.test(t);
}

/** The request asks for a sample / demo draft with fictional data. */
export function sampleRequested(text: string): boolean {
  return /örnek\s+(bir\s+)?(taslak|teklif|belge)|kurgusal|sample\s+(draft|quote)|demo\s+(teklif|quote)/i.test(text.toLocaleLowerCase('tr'));
}

/** Phrases the model must not use: there is no live research behind an estimate. */
const AVERAGE_CLAIM = /[^.\n]*(türkiye|piyasa|sektör|pazar|market|industry|turkey)[^.\n]{0,20}\b(ortalama\w*|average\w*|emsal\w*)[^.\n]*[.\n]?/gi;
export function stripAverageClaims(text: string): { text: string; removed: boolean } {
  let removed = false;
  const out = text.replace(AVERAGE_CLAIM, () => { removed = true; return ''; }).replace(/\s{2,}/g, ' ').trim();
  return { text: out, removed };
}

/* ── Apply ────────────────────────────────────────────────────── */

export interface ApplyOptions {
  /** Section ids to apply; 'all' = every section the suggestion carries. */
  select: string[] | 'all';
  /** Items: add after the lines already in the document, or replace them (explicit choice). */
  itemMode: 'append' | 'replace';
  /** Default VAT for new lines (document settings; the AI never sets tax). */
  defaultTaxRate: string;
  /** The admin confirmed that the suggested prices are in the document currency despite a conflict. */
  acceptCurrency: boolean;
  /** The document is linked to a real client record (sample names are never applied then). */
  hasClient: boolean;
}

export interface ApplyResult {
  title: string;
  content: DocContent;
  applied: string[];
  skipped: Array<{ id: string; why: string }>;
}

const realItem = (i: LineItem) => Boolean(i.title.trim() || i.description.trim() || i.unitPrice.trim());

/** Suggested lines → document lines (fresh ids; "included in" refs mapped to those ids; prices only when allowed). */
export function itemsFromSuggestion(items: SuggestedItem[], withPrices: boolean, defaultTaxRate: string): LineItem[] {
  const ids = new Map<string, string>();
  const base = items.filter((i) => i.title.trim()).map((i) => { const it = newItem(defaultTaxRate); if (i.ref) ids.set(i.ref, it.id); return { s: i, it }; });
  return base.map(({ s, it }) => {
    const included = s.includedIn && s.includedIn !== s.ref ? ids.get(s.includedIn) ?? '' : '';
    const price = withPrices && !included && parseMoney(s.unitPrice) ? s.unitPrice.trim() : '';
    const recurring = !included && s.billing !== 'once';
    return {
      ...it,
      title: s.title, description: s.description, quantity: s.quantity || '1', unit: s.unit,
      billing: included ? 'once' : s.billing,
      term: recurring ? s.term : '',
      startYear: recurring ? Math.max(1, s.startYear || 1) : 1,
      includedIn: included,
      unitPrice: price,
      priceBasis: recurring && (s.startYear || 1) > 1 ? s.priceBasis : '',
      aiPrice: Boolean(price),
    } satisfies LineItem;
  });
}

export function applyDraft(doc: { title: string; content: DocContent }, s: DraftSuggestion, opts: ApplyOptions): ApplyResult {
  const c = doc.content;
  const available = sectionsOf(s);
  const want = new Set(opts.select === 'all' ? available : opts.select.filter((x) => available.includes(x)));
  const applied: string[] = [];
  const skipped: Array<{ id: string; why: string }> = [];
  const next: DocContent = { ...c };
  let title = doc.title;

  if (want.has('title')) { title = s.title.trim(); applied.push('title'); }
  if (want.has('subject')) { next.subject = s.subject.trim(); applied.push('subject'); }

  const blockIds = Array.from(want).filter((x) => x.startsWith('block:'));
  if (blockIds.length) {
    const blocks: Block[] = [...c.blocks];
    for (const id of blockIds) {
      const key = id.slice(6);
      const sb = s.blocks.find((b) => b.key === key && b.body.trim());
      if (!sb || !isBlockKey(key)) continue;
      const i = blocks.findIndex((b) => b.key === key);
      if (i >= 0) blocks[i] = { ...blocks[i], heading: blocks[i].heading.trim() || sb.heading || blockHeading(key, c.locale), body: sb.body };
      else blocks.push({ id: localId('b'), key, heading: sb.heading || blockHeading(key, c.locale), body: sb.body });
      applied.push(id);
    }
    next.blocks = blocks;
  }

  if (want.has('items')) {
    const priced = s.prices && (!s.currencyConflict || opts.acceptCurrency);
    if (s.prices && !priced) skipped.push({ id: 'items', why: `Fiyatlar alınmadı: talepte ${s.currencyConflict?.requested.join(', ')} geçiyor, belge ${c.currency}. Önce para birimini onaylayın.` });
    const fresh = itemsFromSuggestion(s.items, priced, opts.defaultTaxRate);
    next.items = opts.itemMode === 'replace' ? fresh : [...c.items.filter(realItem), ...fresh];
    applied.push('items');
  }

  if (want.has('payment')) {
    next.payment = s.payment.map((p) => ({ id: localId('p'), label: p.label, mode: 'percent' as const, value: p.percent === null ? '' : String(p.percent).replace('.', ','), due: p.due }));
    applied.push('payment');
  }
  if (want.has('deliveryTime')) { next.deliveryTime = s.deliveryTime.trim(); applied.push('deliveryTime'); }
  if (want.has('validity') && s.validityDays && c.issueDate) { next.validUntil = addDaysIso(c.issueDate, s.validityDays); applied.push('validity'); }
  if (want.has('closing')) { next.closing = s.closing.trim(); applied.push('closing'); }

  if (want.has('recipient')) {
    if (opts.hasClient) skipped.push({ id: 'recipient', why: 'Belge bir müşteri kaydına bağlı: örnek (kurgusal) alıcı uygulanmaz.' });
    else if (s.sampleRecipient) { next.recipient = { ...c.recipient, company: s.sampleRecipient.company, name: s.sampleRecipient.name }; applied.push('recipient'); }
  }
  // Fictional content entered the document: it is a sample from now on (never finalized or sent).
  if (s.sample && applied.length) next.sample = true;

  // Never changed by a suggestion.
  next.currency = c.currency;
  next.locale = c.locale;
  if (!applied.includes('recipient')) next.recipient = c.recipient;
  return { title, content: next, applied, skipped };
}

/* ── Currency change on a filled document ───────────────────────── */

/** True when any line or payment step carries an amount (a currency change then needs a decision). */
export function hasAmounts(c: DocContent): boolean {
  return c.items.some((i) => i.unitPrice.trim()) || c.payment.some((p) => p.mode === 'amount' && p.value.trim());
}

/**
 * Switch the document currency. There is no exchange-rate system, so there is
 * no conversion: "keep" keeps the same numbers under the new currency (the
 * admin chose that explicitly), "clear" removes the prices and amount steps so
 * they can be entered in the new currency.
 */
export function changeCurrency(c: DocContent, to: DocCurrency, mode: 'keep' | 'clear'): DocContent {
  if (!(DOC_CURRENCIES as readonly string[]).includes(to)) return c;
  if (mode === 'keep') return { ...c, currency: to };
  return {
    ...c,
    currency: to,
    items: c.items.map((i) => ({ ...i, unitPrice: '', aiPrice: false })),
    payment: c.payment.map((p) => (p.mode === 'amount' ? { ...p, value: '' } : p)),
  };
}
