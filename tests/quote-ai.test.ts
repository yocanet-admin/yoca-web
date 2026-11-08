/**
 * Teklif — AI taslak: prices on request, currency, one-time vs recurring,
 * sample vs real, merge / apply rules (pure). Synthetic data only.
 * Run: npx tsx --test tests/quote-ai.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanDraft, type RawDraft } from '../lib/ai/documents';
import { mockStructured } from '../lib/ai/mock';
import { applyDraft, setBilling, changeCurrency, currencyMentions, hasAmounts, pricesRequested, restrictToScope, sampleRequested, sectionsOf, stripAverageClaims, type ApplyOptions, type DraftSuggestion } from '../lib/documents/aiDraft';
import { billingErrors, computeDocument, computeLine, computeTotals, quantityText, totalsJson } from '../lib/documents/calc';
import { DOC_CURRENCIES, OTHER_CURRENCIES, PRIMARY_CURRENCIES, missingFor, newContent, newItem, sanitizeContent, type DocContent, type DocCurrency } from '../lib/documents/model';
import { SAMPLE_ISSUER, sampleQuote } from './fixtures-documents';

const B = (n: number | string) => BigInt(n);
const NOW = new Date('2026-11-05T09:00:00Z');
const REQUEST = 'Marka kimliği, web sitesi ve sosyal medya yönetimi için ayrı kalemlerle teklif hazırla. Marka kimliği ve web sitesi tek seferlik; sosyal medya aylık. İlk yıl domain ve hosting web sitesine dahil, ikinci yıldan itibaren yıllık yenileme var. Fiyatları da öner.';

/** The user message the route builds (only the lines the mock reads). */
function userMsg(o: { currency: DocCurrency; prices: boolean; sample?: boolean; scope?: string; recipient?: string; current?: unknown; brief?: string }) {
  return [
    o.recipient ? `Recipient: ${o.recipient} (real client record)` : 'Recipient: (not given)',
    `Selected currency: ${o.currency}`, `Prices requested: ${o.prices ? 'yes' : 'no'}`, `Sample: ${o.sample ? 'yes' : 'no'}`, `Scope: ${o.scope ?? 'all'}`,
    o.current ? `Current document:\n<CURRENT>\n${JSON.stringify(o.current)}\n</CURRENT>` : '',
    `Brief:\n<BRIEF>\n${o.brief ?? REQUEST}\n</BRIEF>`,
  ].filter(Boolean).join('\n');
}
function suggest(o: { currency: DocCurrency; prices?: boolean; sample?: boolean; scope?: string; recipient?: string; current?: unknown; brief?: string }): DraftSuggestion {
  const brief = o.brief ?? REQUEST;
  const prices = o.prices ?? pricesRequested(brief);
  const raw = mockStructured('doc_draft', userMsg({ ...o, prices, brief })) as RawDraft;
  return cleanDraft('quote', raw, { currency: o.currency, prices, sample: Boolean(o.sample), scope: o.scope ?? 'all', brief });
}
function quote(currency: DocCurrency = 'USD'): DocContent {
  const c = newContent('quote', { now: NOW, currency, validityDays: 30, defaultTaxRate: '20' });
  c.recipient = { ...c.recipient, company: 'TEST Gerçek Müşteri A.Ş.', name: 'Test Kişi', email: 'test@musteri.test' };
  return c;
}
const OPTS: ApplyOptions = { select: 'all', itemMode: 'replace', defaultTaxRate: '20', acceptCurrency: false, hasClient: true };

test('request reading: explicit price request, named currencies, sample request, average claims', () => {
  assert.equal(pricesRequested(REQUEST), true);
  assert.equal(pricesRequested('Fiyatlarını öner lütfen'), true);
  assert.equal(pricesRequested('Fiyat ver'), true);
  assert.equal(pricesRequested('Marka kimliği ve web sitesi teklifi hazırla.'), false);
  assert.deepEqual(currencyMentions(REQUEST), []);
  assert.deepEqual(currencyMentions('Fiyatlar euro olsun'), ['EUR']);
  assert.deepEqual(currencyMentions('aylık 1000 TL, kurulum $500'), ['TRY', 'USD']);
  assert.equal(sampleRequested('Örnek bir teklif hazırla'), true);
  assert.equal(sampleRequested('Gerçek teklif'), false);
  const r = stripAverageClaims('Tahmin kapsam üzerinden yapıldı. Fiyatlar Türkiye ortalamasına göre belirlenmiştir. Son.');
  assert.equal(r.removed, true);
  assert.ok(!/ortalama/i.test(r.text) && /kapsam/.test(r.text) && /Son\./.test(r.text), r.text);
  assert.equal(stripAverageClaims('Piyasa ortalaması değil, efor tahmini.').removed, true);
});

test('cleanDraft (example request, USD): priced lines, included line without price, monthly without duration, year-2 renewal as estimate', () => {
  const s = suggest({ currency: 'USD' });
  assert.equal(s.currency, 'USD');
  assert.equal(s.prices, true);
  assert.equal(s.currencyConflict, null);
  const by = Object.fromEntries(s.items.map((i) => [i.ref, i]));
  assert.deepEqual(Object.keys(by), ['brand', 'web', 'host1', 'social', 'renew']);
  assert.equal(by.brand.billing, 'once'); assert.equal(by.brand.unitPrice, '2600');
  assert.equal(by.web.billing, 'once'); assert.equal(by.web.unitPrice, '4300');
  assert.equal(by.host1.includedIn, 'web'); assert.equal(by.host1.unitPrice, '', 'an included line never carries a price (the model sent one)');
  assert.equal(by.social.billing, 'monthly'); assert.equal(by.social.term, '', 'duration not stated → not guessed'); assert.equal(by.social.unitPrice, '990');
  assert.equal(by.renew.billing, 'yearly'); assert.equal(by.renew.startYear, 2); assert.equal(by.renew.priceBasis, 'estimate');
  // whole quote: title, intro, scope, deliverables, assumptions, out of scope, revisions, terms, notes, payment, timeline, validity, closing
  assert.deepEqual(sectionsOf(s), ['title', 'block:intro', 'block:scope', 'block:deliverables', 'block:assumptions', 'block:out_of_scope', 'block:revisions', 'block:terms', 'block:notes', 'items', 'payment', 'deliveryTime', 'validity', 'closing']);
  for (const id of ['block:revisions', 'payment', 'deliveryTime', 'validity', 'items']) assert.ok(s.proposed.includes(id), `${id} is a proposal to check`);
  assert.ok(!/ortalama/i.test(s.pricing.basis), 'the "Türkiye ortalaması" claim was removed');
  assert.ok(s.warnings.some((w) => /ortalaması/.test(w)));
  assert.ok(s.blocks.find((b) => b.key === 'assumptions')!.body.includes('süresi belirtilmedi'));
  assert.equal(s.sampleRecipient, null);
});

test('cleanDraft: prices only when asked; the currency follows the selection (TRY / EUR) and is never switched', () => {
  const none = suggest({ currency: 'EUR', prices: false, brief: 'Marka kimliği, web sitesi ve sosyal medya yönetimi için ayrı kalemlerle teklif hazırla.' });
  assert.ok(none.items.every((i) => i.unitPrice === '' && i.priceNote === ''));
  assert.equal(none.prices, false);
  assert.equal(none.pricing.basis, '');
  const eur = suggest({ currency: 'EUR' });
  assert.equal(eur.currency, 'EUR');
  assert.equal(eur.items.find((i) => i.ref === 'brand')!.unitPrice, '2400');
  const tr = suggest({ currency: 'TRY' });
  assert.equal(tr.items.find((i) => i.ref === 'web')!.unitPrice, '140000');
  // a raw model answer with garbage prices / quantities is cleaned, not trusted
  const raw = mockStructured('doc_draft', userMsg({ currency: 'USD', prices: true })) as RawDraft;
  raw.items[0].unitPrice = 'çok'; raw.items[1].unitPrice = '-5'; raw.items[0].quantity = '0';
  const c = cleanDraft('quote', raw, { currency: 'USD', prices: true, sample: false, scope: 'all', brief: REQUEST });
  assert.equal(c.items[0].unitPrice, ''); assert.equal(c.items[1].unitPrice, ''); assert.equal(c.items[0].quantity, '1');
  assert.ok(c.warnings.some((w) => /okunamadı/.test(w)));
});

test('cleanDraft: a request naming another currency is a conflict to resolve, not a switch', () => {
  const s = suggest({ currency: 'USD', brief: `${REQUEST} Fiyatlar euro olsun.` });
  assert.equal(s.currency, 'USD');
  assert.deepEqual(s.currencyConflict, { requested: ['EUR'], selected: 'USD' });
  // not acknowledged → prices are not written; acknowledged → they are, still in USD
  const doc = { title: '', content: quote('USD') };
  const a = applyDraft(doc, s, { ...OPTS, acceptCurrency: false });
  assert.equal(a.content.currency, 'USD');
  assert.ok(a.content.items.every((i) => i.unitPrice === ''));
  assert.ok(a.skipped.some((x) => x.id === 'items'));
  const b = applyDraft(doc, s, { ...OPTS, acceptCurrency: true });
  assert.equal(b.content.currency, 'USD');
  assert.equal(b.content.items[0].unitPrice, '2600');
});

test('apply (example, USD): lines, included link, AI price flags, untouched identity; totals kept apart by the calc', () => {
  const s = suggest({ currency: 'USD' });
  const c0 = quote('USD');
  const r = applyDraft({ title: '', content: c0 }, s, OPTS);
  const c = r.content;
  assert.equal(c.currency, 'USD');
  assert.deepEqual(c.recipient, c0.recipient, 'real customer identity unchanged');
  assert.equal(c.sample, false);
  assert.equal(c.items.length, 5);
  const [brand, web, host1, social, renew] = c.items;
  assert.equal(host1.includedIn, web.id);
  assert.equal(host1.unitPrice, '');
  assert.equal(host1.aiPrice, false);
  assert.ok(brand.aiPrice && web.aiPrice && social.aiPrice && renew.aiPrice);
  assert.ok(c.items.every((i) => i.taxRate === '20'), 'tax from the settings, never from the AI');
  assert.equal(c.validUntil, '2026-12-05');
  const d = computeDocument(c);
  // today: one-time only (2600 + 4300) × 1.20
  assert.equal(d.totals.grand, B(828000));
  assert.equal(d.totals.lines.find((l) => l.id === host1.id)!.included, true);
  assert.deepEqual(d.issues.missingPrices, [], 'included line is not "price missing"');
  assert.equal(d.recurring.length, 2);
  const [m, y] = d.recurring;
  assert.equal(m.key, 'monthly:1'); assert.equal(m.totals.grand, B(118800)); assert.equal(m.term, null); assert.equal(m.termTotal, null);
  assert.equal(y.key, 'yearly:2'); assert.equal(y.totals.grand, B(24000));
  assert.equal(d.payment.problem, null);
  assert.deepEqual(d.payment.rows.map((x) => x.amount), [B(414000), B(414000)], 'payment plan on the one-time total only');
  // what blocks finalizing: unreviewed AI prices; the missing monthly duration is a warning
  const miss = missingFor('quote', c, SAMPLE_ISSUER, { title: r.title, missingPrices: [...d.issues.missingPrices, ...d.issues.errors], paymentProblem: d.payment.problem });
  assert.equal(miss.blocking.filter((x) => /AI fiyat önerisi/.test(x)).length, 4);
  assert.ok(miss.warnings.some((x) => /süresi belirtilmedi/.test(x)));
  // the admin confirms the prices → nothing AI-related blocks any more
  const ok = { ...c, items: c.items.map((i) => ({ ...i, aiPrice: false })) };
  const miss2 = missingFor('quote', ok, SAMPLE_ISSUER, { title: r.title, missingPrices: [], paymentProblem: null });
  assert.ok(!miss2.blocking.some((x) => /AI fiyat/.test(x)), miss2.blocking.join(' | '));
  // a stated duration gives an informational total, still outside today's total
  ok.items[3].term = '6';
  const d2 = computeDocument(ok);
  assert.equal(d2.recurring[0].termTotal, B(712800));
  assert.equal(d2.totals.grand, B(828000));
  const json = totalsJson(ok);
  assert.equal(json.grand, '828000');
  assert.deepEqual(json.recurring.map((g) => [g.billing, g.startYear, g.grand]), [['monthly', 1, '118800'], ['yearly', 2, '24000']]);
});

test('apply rules: only selected sections; an empty suggestion never clears a filled field', () => {
  const c0 = quote('TRY');
  c0.blocks.find((b) => b.key === 'notes')!.body = 'Elle yazılmış not.';
  c0.deliveryTime = 'Elle: 4 hafta';
  const s = suggest({ currency: 'TRY' });
  const only = applyDraft({ title: 'Elle başlık', content: c0 }, s, { ...OPTS, select: ['block:revisions'] });
  assert.equal(only.title, 'Elle başlık');
  assert.equal(only.content.deliveryTime, 'Elle: 4 hafta');
  assert.equal(only.content.blocks.find((b) => b.key === 'notes')!.body, 'Elle yazılmış not.');
  assert.ok(only.content.blocks.find((b) => b.key === 'revisions')!.body.includes('iki revizyon'));
  assert.deepEqual(only.applied, ['block:revisions']);
  assert.equal(only.content.items.length, 1, 'items untouched');
  const empty: DraftSuggestion = { ...s, title: '', blocks: [], items: [], payment: [], deliveryTime: '', validityDays: null, closing: '', proposed: [], warnings: [] };
  const e = applyDraft({ title: 'Elle başlık', content: c0 }, empty, OPTS);
  assert.equal(e.title, 'Elle başlık');
  assert.deepEqual(e.content, { ...c0 });
  assert.deepEqual(e.applied, []);
  // items: append keeps the existing lines; replace is an explicit choice
  const withLine = { ...c0, items: [{ ...newItem('20'), title: 'Elle kalem', unitPrice: '100' }] };
  assert.equal(applyDraft({ title: '', content: withLine }, s, { ...OPTS, select: ['items'], itemMode: 'append' }).content.items.length, 6);
  assert.equal(applyDraft({ title: '', content: withLine }, s, { ...OPTS, select: ['items'], itemMode: 'replace' }).content.items.length, 5);
});

test('section-level regeneration: only that section comes back and only it changes (manual edits stay)', () => {
  const s = suggest({ currency: 'USD' });
  const base = applyDraft({ title: '', content: quote('USD') }, s, { ...OPTS, acceptCurrency: true });
  // manual edits after applying
  const c = { ...base.content, blocks: base.content.blocks.map((b) => (b.key === 'scope' ? { ...b, body: 'ELLE DÜZENLENDİ' } : b)), items: base.content.items.map((i, n) => (n === 0 ? { ...i, unitPrice: '2750', aiPrice: false } : i)) };
  const rev = suggest({ currency: 'USD', scope: 'block:revisions', brief: 'Yalnızca revizyon koşullarını yeniden yaz: üç tur olsun.' });
  assert.deepEqual(sectionsOf(rev), ['block:revisions'], 'the mock returned a whole draft; only the scope is kept');
  const r1 = applyDraft({ title: base.title, content: c }, rev, { ...OPTS, select: 'all' });
  assert.ok(r1.content.blocks.find((b) => b.key === 'revisions')!.body.includes('üç revizyon'));
  assert.equal(r1.content.blocks.find((b) => b.key === 'scope')!.body, 'ELLE DÜZENLENDİ');
  assert.deepEqual(r1.content.items, c.items);
  assert.deepEqual(r1.content.payment, c.payment);
  assert.equal(r1.title, base.title);
  // "notları kısalt": the notes become shorter, nothing else moves
  const notes = c.blocks.find((b) => b.key === 'notes')!.body;
  const sh = suggest({ currency: 'USD', scope: 'block:notes', brief: 'Notları kısalt.', current: { blocks: c.blocks } });
  const r2 = applyDraft({ title: base.title, content: c }, sh, { ...OPTS, select: 'all' });
  const after = r2.content.blocks.find((b) => b.key === 'notes')!.body;
  assert.ok(after.length < notes.length && after.length > 0, `${after} < ${notes}`);
  assert.deepEqual(r2.content.blocks.filter((b) => b.key !== 'notes'), c.blocks.filter((b) => b.key !== 'notes'));
  // "ödeme planını değiştir": payment steps (+ payment terms text) only
  const pay = suggest({ currency: 'USD', scope: 'payment', brief: 'Ödeme planını üç adıma böl.' });
  assert.deepEqual(sectionsOf(pay), ['block:terms', 'payment']);
  const r3 = applyDraft({ title: base.title, content: c }, pay, { ...OPTS, select: 'all' });
  assert.deepEqual(r3.content.payment.map((p) => p.value), ['40', '30', '30']);
  assert.deepEqual(r3.content.items, c.items);
  assert.equal(computeDocument(r3.content).payment.problem, null);
  assert.equal(restrictToScope(s, 'all'), s);
});

test('sample vs real: fictional names only for a sample without a client; marked ÖRNEK; the document becomes a sample', () => {
  const s = suggest({ currency: 'EUR', sample: true });
  assert.ok(s.title.startsWith('ÖRNEK'));
  assert.ok(s.sampleRecipient && /ÖRNEK/.test(s.sampleRecipient.company) && /ÖRNEK/.test(s.sampleRecipient.name));
  const linked = applyDraft({ title: '', content: quote('EUR') }, s, { ...OPTS, hasClient: true });
  assert.equal(linked.content.recipient.company, 'TEST Gerçek Müşteri A.Ş.');
  assert.ok(linked.skipped.some((x) => x.id === 'recipient'));
  const free = newContent('quote', { now: NOW, currency: 'EUR' });
  const r = applyDraft({ title: '', content: free }, s, { ...OPTS, hasClient: false });
  assert.equal(r.content.sample, true);
  assert.match(r.content.recipient.company, /^ÖRNEK/);
  assert.equal(r.content.recipient.email, '', 'no contact facts invented');
  assert.equal(r.content.recipient.taxNumber, '');
  assert.equal(r.content.bankAccountIds.length, 0);
  const miss = missingFor('quote', r.content, SAMPLE_ISSUER, { title: r.title });
  assert.ok(miss.blocking.some((x) => /ÖRNEK \(sentetik\) belge/.test(x)), 'a sample cannot be finalized');
  // non-sample request: no fictional recipient at all
  assert.equal(suggest({ currency: 'EUR' }).sampleRecipient, null);
});

test('currency change on a filled quote: explicit keep vs clear; no conversion', () => {
  const c = applyDraft({ title: '', content: quote('TRY') }, suggest({ currency: 'TRY' }), OPTS).content;
  assert.equal(hasAmounts(c), true);
  assert.equal(hasAmounts(quote('TRY')), false);
  const keep = changeCurrency(c, 'EUR', 'keep');
  assert.equal(keep.currency, 'EUR');
  assert.deepEqual(keep.items.map((i) => i.unitPrice), c.items.map((i) => i.unitPrice));
  const clear = changeCurrency(c, 'USD', 'clear');
  assert.equal(clear.currency, 'USD');
  assert.ok(clear.items.every((i) => i.unitPrice === '' && !i.aiPrice));
  assert.equal(clear.items.length, c.items.length);
  assert.equal(changeCurrency(c, 'XXX' as DocCurrency, 'keep'), c);
});

test('model: new line fields round-trip through sanitize; old content stays one-time with the same totals', () => {
  const old = sampleQuote();
  const before = computeTotals(old.items).grand;
  const s = sanitizeContent(JSON.parse(JSON.stringify(old)), 'quote');
  assert.ok(s.items.every((i) => i.billing === 'once' && i.startYear === 1 && i.includedIn === '' && i.aiPrice === false));
  assert.equal(computeDocument(s).totals.grand, before);
  assert.equal(computeDocument(s).recurring.length, 0);
  assert.equal(s.sample, false);
  const raw = { items: [
    { id: 'a', title: 'A', billing: 'monthly', term: '6', startYear: 1, unitPrice: '10' },
    { id: 'b', title: 'B', billing: 'weekly', term: 'x', startYear: 9, includedIn: 'bad id!', priceBasis: 'maybe', aiPrice: 'yes' },
    { id: 'c', title: 'C', billing: 'yearly', startYear: 2, priceBasis: 'fixed', aiPrice: true, unitPrice: '5' },
  ], sample: true };
  const t = sanitizeContent(raw, 'quote');
  assert.deepEqual(t.items.map((i) => [i.billing, i.term, i.startYear, i.includedIn, i.priceBasis, i.aiPrice]), [
    ['monthly', '6', 1, '', '', false], ['once', '', 1, '', '', false], ['yearly', '', 2, '', 'fixed', true],
  ]);
  assert.equal(t.sample, true);
});

test('billing checks: dangling "included in", nested inclusion, future price without basis', () => {
  const a = { ...newItem('20'), id: 'a', title: 'Web', unitPrice: '100' };
  const b = { ...newItem('20'), id: 'b', title: 'Hosting 1. yıl', includedIn: 'zzz' };
  const c = { ...newItem('20'), id: 'c', title: 'Yenileme', billing: 'yearly' as const, startYear: 2, unitPrice: '10' };
  const errs = billingErrors([a, b, c]);
  assert.ok(errs.some((e) => /Hosting 1\. yıl: dahil olduğu kalem bulunamadı/.test(e)));
  assert.ok(errs.some((e) => /Yenileme: 2\. yıldan itibaren/.test(e)));
  assert.deepEqual(billingErrors([a, { ...b, includedIn: 'a' }, { ...c, priceBasis: 'estimate' }]), []);
  assert.ok(billingErrors([a, { ...b, includedIn: 'a' }, { ...newItem(), id: 'd', title: 'D', includedIn: 'b' }]).some((e) => /başka bir kaleme dahil/.test(e)));
  // only recurring lines and no one-time line: the payment plan says why it cannot be checked
  const doc = { ...newContent('quote', { now: NOW }), items: [{ ...c, priceBasis: 'estimate' as const }], payment: [{ id: 'p', label: 'Başlangıç', mode: 'percent' as const, value: '100', due: '' }] };
  assert.match(computeDocument(doc).payment.problem ?? '', /tek seferlik/);
});

function pdfText(buf: Buffer): string | null {
  try {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yoca-q-')), 'x.pdf');
    fs.writeFileSync(f, buf);
    return execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
  } catch { return null; }
}

test('PDF: one-time total apart from monthly / year-2 groups, "Dahil" for the included line, currency code, ÖRNEK for a sample', async () => {
  const { renderDocumentPdf } = await import('../lib/documents/pdf');
  const issuer = { ...SAMPLE_ISSUER, legalName: 'Yoca Test Ltd. Şti.' };
  for (const cur of ['TRY', 'USD', 'EUR'] as DocCurrency[]) {
    const c = applyDraft({ title: '', content: quote(cur) }, suggest({ currency: cur }), { ...OPTS, acceptCurrency: true }).content;
    const r = await renderDocumentPdf({ kind: 'quote', number: 'TKL-2026-0099', title: 'Test teklifi', content: c, issuer, bankAccounts: [], mode: 'draft' });
    const txt = pdfText(r.buffer);
    if (!txt) return; // pdftotext not installed: layout-only run
    const ns = txt.replace(/\s+/g, ''); // letter-spaced kickers come out as "T E K …"
    assert.ok(ns.includes(`TEKSEFERLİKTOPLAM/${cur}`), `${cur}: one-time total label`);
    assert.ok(ns.includes(`TUTAR/${cur}`), `${cur}: amount column currency`);
    assert.ok(ns.includes('TEKRARLAYANVESONRAKİDÖNEMÜCRETLERİ') && /tek seferlik toplama ve ödeme planına dahil değildir/.test(txt) && !/bugünkü/i.test(txt), cur);
    assert.ok(txt.includes('Aylık · başlangıçtan itibaren') && txt.includes('Yıllık · 2. yıldan itibaren'), cur);
    assert.ok(txt.includes('Süre belirtilmedi'), `${cur}: monthly duration not stated`);
    assert.ok(/Dahil/.test(txt) && ns.includes('KURUMSALWEBSİTESİKALEMİNEDAHİL'), `${cur}: included line`);
    assert.ok(txt.includes('Güncel tarifeye göre tahmini'), `${cur}: renewal basis`);
    if (cur === 'USD') assert.ok(txt.includes('8.280,00') && txt.includes('1.188,00 USD') && txt.includes('240,00 USD') && txt.includes('4.140,00 USD'), 'USD amounts');
    if (cur === 'EUR') assert.ok(txt.includes('7.620,00') && txt.includes('1.080,00 EUR'), 'EUR amounts');
    if (cur === 'TRY') assert.ok(txt.includes('270.000,00') && txt.includes('38.400,00 TRY'), 'TRY amounts');
    assert.ok(!/\$|€/.test(txt) || cur !== 'TRY', 'TRY document has no $ / €');
  }
  const free = newContent('quote', { now: NOW, currency: 'EUR' });
  const sample = applyDraft({ title: '', content: free }, suggest({ currency: 'EUR', sample: true }), { ...OPTS, hasClient: false, acceptCurrency: true });
  const r = await renderDocumentPdf({ kind: 'quote', number: 'TKL-2026-0100', title: sample.title, content: sample.content, issuer, bankAccounts: [], mode: 'draft' });
  const txt = pdfText(r.buffer);
  if (txt) assert.ok(/ÖRNEK/.test(txt) && txt.includes('ÖRNEK belge · gerçek teklif değildir') && !/TASLAK/.test(txt.slice(0, 400)), 'sample marking');
});

test('"Adet / Süre": quantity + unit for one-time lines; duration for recurring lines (never an assumed 1 ay); old lines unchanged', () => {
  const once = { ...newItem('20'), title: 'Marka kimliği', quantity: '1', unit: 'proje' };
  assert.equal(quantityText(once), '1 proje');
  assert.equal(quantityText({ ...once, quantity: '12', unit: 'saat' }), '12 saat');
  assert.equal(quantityText({ ...once, quantity: '1500', unit: '' }), '1.500');
  const social = { ...newItem('20'), title: 'Sosyal medya', billing: 'monthly' as const, quantity: '1', unit: 'ay', unitPrice: '100' };
  assert.equal(quantityText(social), 'süre belirtilmedi');
  assert.equal(quantityText({ ...social, term: '6' }), '6 ay');
  assert.equal(quantityText({ ...social, term: '6' }, 'en'), '6 months');
  assert.equal(quantityText({ ...social, billing: 'yearly', startYear: 2, term: '' }), 'süre belirtilmedi');
  // fixture written before the field existed: same text as before ("6 bin kelime", "1 paket")
  const old = sampleQuote();
  assert.deepEqual(old.items.map((i) => quantityText(i)), ['1 paket', '1 paket', '1 proje', '6 bin kelime', '1 yıl']);
});

test('recurring line: the unit price is the period amount; the duration never multiplies it (no double count)', () => {
  const social = { ...newItem('20'), id: 's', title: 'Sosyal medya', billing: 'monthly' as const, quantity: '6', unit: 'ay', unitPrice: '1000', term: '6' };
  assert.equal(computeLine(social, 0).net, B(100000), 'a stray quantity 6 is not a multiplier on a monthly line');
  const d = computeDocument({ ...newContent('quote', { now: NOW }), items: [social] });
  assert.equal(d.recurring[0].totals.grand, B(120000), '₺1.200 / ay incl. VAT');
  assert.equal(d.recurring[0].termTotal, B(720000), '6 ay için toplam = 6 × 1.200');
  assert.equal(d.totals.grand, null, 'nothing one-time: no "today" total');
  const noTerm = computeDocument({ ...newContent('quote', { now: NOW }), items: [{ ...social, term: '' }] });
  assert.equal(noTerm.recurring[0].term, null);
  assert.equal(noTerm.recurring[0].termTotal, null, 'no duration → no definite total');
});

test('billing switch keeps "Adet / Süre" coherent: 6 ay one-time ⇄ monthly × 6 ay; included has no price', () => {
  const once = { ...newItem('20'), id: 'a', title: 'Sosyal medya', quantity: '6', unit: 'ay', unitPrice: '1000' };
  const m = setBilling(once, 'monthly');
  assert.deepEqual([m.billing, m.quantity, m.unit, m.term], ['monthly', '1', 'ay', '6']);
  const back = setBilling(m, 'once');
  assert.deepEqual([back.billing, back.quantity, back.unit, back.term], ['once', '6', 'ay', '']);
  assert.equal(computeLine(back, 0).net, B(600000), 'one-time 6 ay × price');
  const y = setBilling({ ...newItem('20'), quantity: '1', unit: 'proje' }, 'yearly');
  assert.deepEqual([y.quantity, y.unit, y.term], ['1', 'yıl', '']);
  const inc = setBilling({ ...once, unitPrice: '5', aiPrice: true }, 'included', 'web');
  assert.deepEqual([inc.includedIn, inc.unitPrice, inc.aiPrice], ['web', '', false]);
});

test('AI: a stated duration ("6 ay") becomes term; a model that put it in quantity is normalized; unstated stays unstated', () => {
  const stated = suggest({ currency: 'USD', brief: `${REQUEST} Sosyal medya yönetimi 6 ay olsun.` });
  const soc = stated.items.find((i) => i.ref === 'social')!;
  assert.deepEqual([soc.billing, soc.quantity, soc.unit, soc.term], ['monthly', '1', 'ay', '6']);
  assert.ok(stated.blocks.find((b) => b.key === 'assumptions')!.body.includes('6 ay için teklif edilmiştir'));
  const c = applyDraft({ title: '', content: quote('USD') }, stated, OPTS).content;
  const d = computeDocument(c);
  assert.equal(d.recurring[0].term, 6);
  assert.equal(d.recurring[0].termTotal, B(712800), '6 × $1.188,00');
  assert.equal(d.totals.grand, B(828000), 'the 6-month total is never added to today');
  assert.ok(!missingFor('quote', c, SAMPLE_ISSUER, { title: 'x' }).warnings.some((w) => /süresi belirtilmedi/.test(w)));
  const unstated = suggest({ currency: 'USD' }).items.find((i) => i.ref === 'social')!;
  assert.equal(unstated.term, '');
  const raw = mockStructured('doc_draft', userMsg({ currency: 'USD', prices: true })) as RawDraft;
  raw.items[3] = { ...raw.items[3], quantity: '6', unit: 'ay', term: '' };
  raw.items[4] = { ...raw.items[4], unit: 'adet' };
  const n = cleanDraft('quote', raw, { currency: 'USD', prices: true, sample: false, scope: 'all', brief: REQUEST });
  assert.deepEqual([n.items[3].quantity, n.items[3].unit, n.items[3].term], ['1', 'ay', '6']);
  assert.equal(n.items[4].unit, 'yıl');
});

test('AI price check: checked or user-entered prices stay; a price the AI writes again is unchecked again', () => {
  const s = suggest({ currency: 'USD' });
  const first = applyDraft({ title: '', content: quote('USD') }, s, OPTS).content;
  // the admin checks every price (or types their own): no AI flag left
  const checked = { ...first, items: first.items.map((i) => ({ ...i, aiPrice: false })) };
  assert.ok(!missingFor('quote', checked, SAMPLE_ISSUER, { title: 'x' }).blocking.some((x) => /AI fiyat/.test(x)));
  // a section regeneration that does not touch items leaves the checks alone
  const rev = suggest({ currency: 'USD', scope: 'block:revisions', brief: 'Revizyon koşullarını yeniden yaz.' });
  assert.ok(applyDraft({ title: '', content: checked }, rev, OPTS).content.items.every((i) => !i.aiPrice));
  // the AI writes the prices again (items regenerated) → unchecked again, finalizing blocked again
  const again = applyDraft({ title: '', content: checked }, suggest({ currency: 'USD', scope: 'items', brief: 'Kalemlere fiyat öner.' }), { ...OPTS, itemMode: 'replace' }).content;
  assert.equal(again.items.filter((i) => i.aiPrice).length, 4);
  assert.equal(missingFor('quote', again, SAMPLE_ISSUER, { title: 'x' }).blocking.filter((x) => /AI fiyat/.test(x)).length, 4);
});

test('currencies: TRY, USD, EUR first; GBP and AZN still supported (sanitize, labels, PDF code)', () => {
  assert.deepEqual(PRIMARY_CURRENCIES, ['TRY', 'USD', 'EUR']);
  assert.deepEqual(OTHER_CURRENCIES, ['GBP', 'AZN']);
  assert.deepEqual([...DOC_CURRENCIES], ['TRY', 'USD', 'EUR', 'GBP', 'AZN']);
  assert.equal(sanitizeContent({ currency: 'GBP' }, 'quote').currency, 'GBP');
  assert.equal(sanitizeContent({ currency: 'AZN' }, 'quote').currency, 'AZN');
  const gbp = suggest({ currency: 'GBP' });
  assert.equal(gbp.items[0].unitPrice, '2050');
});

test('PDF: "ADET / SÜRE" column reads "1 paket", "1 proje", "6 ay" / "süre belirtilmedi" with "aylık faturalanır"; old quote keeps its quantities', async () => {
  const { renderDocumentPdf } = await import('../lib/documents/pdf');
  const issuer = { ...SAMPLE_ISSUER, legalName: 'Yoca Test Ltd. Şti.' };
  const c = applyDraft({ title: '', content: quote('USD') }, suggest({ currency: 'USD', brief: `${REQUEST} Sosyal medya yönetimi 6 ay olsun.` }), { ...OPTS, acceptCurrency: true }).content;
  const r = await renderDocumentPdf({ kind: 'quote', number: 'TKL-2026-0101', title: 'Test', content: c, issuer, bankAccounts: [], mode: 'draft' });
  const txt = pdfText(r.buffer);
  if (!txt) return;
  const ns = txt.replace(/\s+/g, '');
  assert.ok(ns.includes('ADET/SÜRE') && !/MİKTAR/.test(ns), 'column label');
  assert.ok(txt.includes('1 paket') && txt.includes('1 proje') && txt.includes('6 ay') && txt.includes('aylık faturalanır') && txt.includes('yıllık faturalanır'));
  assert.ok(txt.includes('6 aylık hizmet toplamı (KDV dahil): 7.128,00 USD') && txt.includes('Aylık toplam (KDV dahil): 1.188,00 USD / ay') && txt.includes('Aylık birim fiyat, toplam aylık hizmet bedelidir.') && txt.includes('Ödeme planı tek seferlik toplam üzerinden: 8.280,00 USD') && txt.includes('Yıllık yenileme (KDV dahil): 240,00 USD / yıl') && txt.includes('İlk dönem toplamlarına dahil değildir') && !/bugünkü/i.test(txt), 'separate totals, plan basis, renewal apart');
  const old = await renderDocumentPdf({ kind: 'quote', number: 'TKL-2026-0102', title: 'Eski', content: sampleQuote(), issuer, bankAccounts: [], mode: 'final', version: 1 });
  const ot = pdfText(old.buffer)!;
  assert.ok(ot.includes('6 bin kelime') && ot.includes('1 paket') && ot.includes('298.080,58') && !/TEKRARLAYAN/.test(ot.replace(/\s+/g, '')), 'old quote: same quantities and total, no recurring block');
});
