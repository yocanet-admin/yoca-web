/**
 * Teklifler ve Belgeler — model and amounts (pure).
 * Run: npx tsx --test tests/documents.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayment, computeTotals, divRound, fmtMoney, fmtPct, fmtQty, parseMoney, parseScaled } from '../lib/documents/calc';
import { bodyParts, missingFor, newContent, newItem, sanitizeContent, type LineItem, type PaymentStep } from '../lib/documents/model';
import { docSettingsProblems, ibanValid, sanitizeDocSettings } from '../lib/documents/settings';
import { sampleLetter, sampleQuote, SAMPLE_ISSUER } from './fixtures-documents';

const B = (n: number | string) => BigInt(n);
const item = (over: Partial<LineItem>): LineItem => ({ ...newItem(), title: 'Kalem', ...over });
const step = (over: Partial<PaymentStep>): PaymentStep => ({ id: Math.random().toString(36).slice(2, 8), label: 'Ödeme', mode: 'percent', value: '', due: '', ...over });

test('half-up rounding on minor units', () => {
  assert.equal(divRound(B(5), B(10)), B(1));
  assert.equal(divRound(B(4), B(10)), B(0));
  assert.equal(divRound(B(15), B(10)), B(2));
  assert.equal(divRound(B(-15), B(10)), B(-2));
});

test('money and decimal parsing (Turkish and English forms, no guessing)', () => {
  assert.equal(parseMoney('12.500'), B(1250000));
  assert.equal(parseMoney('12.500,50'), B(1250050));
  assert.equal(parseMoney('12,500.50'), B(1250050));
  assert.equal(parseMoney('12500.5'), B(1250050));
  assert.equal(parseMoney('₺ 1.234,56'), B(123456));
  assert.equal(parseMoney('0'), B(0));
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('12.50.0'), undefined);
  assert.equal(parseMoney('1.2345'), undefined);
  assert.equal(parseMoney('abc'), undefined);
  assert.equal(parseScaled('1,5', 3), B(1500));
  assert.equal(parseScaled('2.25', 3), B(2250));
  assert.equal(parseScaled('1,2345', 3), undefined);
  assert.equal(parseScaled('', 2), null);
});

test('line totals: quantity × price, per-line discount, tax once per rate', () => {
  const t = computeTotals([
    item({ id: 'a', quantity: '3', unitPrice: '0,10', taxRate: '20' }), // 0,30
    item({ id: 'b', quantity: '1', unitPrice: '0,05', taxRate: '20' }), // 0,05 → base 0,35 → tax 0,07
    item({ id: 'c', quantity: '1,5', unitPrice: '100,01', discountPct: '10', taxRate: '10' }), // 150,015 → 150,02; disc 15,002 → 15,00; net 135,02; tax 13,502 → 13,50
  ]);
  assert.equal(t.complete, true);
  assert.equal(t.subtotal, B(15037));
  assert.equal(t.discount, B(1500));
  assert.equal(t.net, B(13537));
  assert.deepEqual(t.taxes.map((x) => [x.rateBp, x.base, x.tax]), [[B(1000), B(13502), B(1350)], [B(2000), B(35), B(7)]]);
  assert.equal(t.tax, B(1357));
  assert.equal(t.grand, B(14894));
});

test('a missing price is reported by name and never counted as 0', () => {
  const t = computeTotals([item({ title: 'Tasarım', unitPrice: '1000' }), item({ title: 'Barındırma', unitPrice: '' })]);
  assert.equal(t.complete, false);
  assert.equal(t.grand, null);
  assert.deepEqual(t.missingPrices, ['Barındırma']);
  assert.equal(t.subtotal, B(100000));
});

test('invalid quantity / discount / tax are errors, not zeros', () => {
  const t = computeTotals([item({ quantity: '0', unitPrice: '10' }), item({ discountPct: '120', unitPrice: '10' }), item({ taxRate: 'x', unitPrice: '10' })]);
  assert.equal(t.errors.length, 3);
  assert.equal(t.grand, null);
});

test('blank lines are ignored', () => {
  const t = computeTotals([item({ unitPrice: '10', taxRate: '0' }), newItem()]);
  assert.equal(t.lines.length, 1);
  assert.equal(t.grand, B(1000));
});

test('payment plan: percentages that add to 100 % match the total to the kuruş', () => {
  const plan = computePayment([step({ value: '33,33' }), step({ value: '33,33' }), step({ value: '33,34' })], B(100001));
  assert.equal(plan.problem, null);
  assert.equal(plan.sum, B(100001));
  assert.equal(plan.rows[0].amount, B(33330));
  assert.equal(plan.rows[2].amount, B(100001) - B(33330) * B(2));
  const half = computePayment([step({ value: '50' }), step({ value: '50' })], B(29808058));
  assert.equal(half.problem, null);
  assert.equal((half.rows[0].amount as bigint) + (half.rows[1].amount as bigint), B(29808058));
});

test('payment plan problems are explicit', () => {
  assert.match(computePayment([step({ value: '50' }), step({ value: '40' })], B(10000)).problem ?? '', /uyuşmuyor/);
  assert.match(computePayment([step({ value: '70' }), step({ value: '40' })], B(10000)).problem ?? '', /%100/);
  assert.match(computePayment([step({ value: '50' })], null).problem ?? '', /fiyatı eksik/);
  assert.equal(computePayment([step({ mode: 'amount', value: '60' }), step({ mode: 'amount', value: '40' })], B(10000)).problem, null);
  assert.match(computePayment([step({ mode: 'amount', value: '60' }), step({ value: '50' })], B(10000)).problem ?? '', /uyuşmuyor/);
  assert.equal(computePayment([], B(10000)).problem, null);
});

test('formatting by document language', () => {
  assert.equal(fmtMoney(B(123456789), 'TRY', 'tr'), '₺1.234.567,89');
  assert.equal(fmtMoney(B(123456789), 'USD', 'en'), '$1,234,567.89');
  assert.equal(fmtMoney(B(5), 'AZN', 'tr'), '0,05 AZN');
  assert.equal(fmtPct(B(2000)), '20');
  assert.equal(fmtPct(B(1850)), '18,5');
  assert.equal(fmtQty('1,5'), '1,5');
  assert.equal(fmtQty('1500'), '1.500');
});

test('sample quote computes and its plan matches', () => {
  const c = sampleQuote();
  const t = computeTotals(c.items);
  assert.equal(t.grand, B(29808058));
  const plan = computePayment(c.payment, t.grand);
  assert.equal(plan.problem, null);
});

test('sanitize keeps only the parts of the type and caps sizes', () => {
  const letter = sanitizeContent({ ...sampleQuote(), blocks: [{ key: 'body', heading: 'x', body: 'Metin' }] }, 'letter');
  assert.equal(letter.items.length, 0);
  assert.equal(letter.payment.length, 0);
  assert.equal(letter.validUntil, '');
  const q = sanitizeContent({ items: Array.from({ length: 200 }, () => newItem()), currency: 'XXX', locale: 'de' }, 'quote');
  assert.equal(q.items.length, 80);
  assert.equal(q.currency, 'TRY');
  assert.equal(q.locale, 'tr');
  assert.equal(sanitizeContent({ issueDate: '2026-13-40' }, 'quote').issueDate.length, 10);
});

test('what is missing blocks finalizing (prices, plan, markers, proforma issuer facts)', () => {
  const c = newContent('quote');
  const m = missingFor('quote', c, SAMPLE_ISSUER, { missingPrices: [] });
  assert.ok(m.blocking.some((x) => /Alıcı/.test(x)));
  assert.ok(m.blocking.some((x) => /iş kalemi/.test(x)));
  const q = sampleQuote();
  q.blocks[0].body += ' [EKSİK: müşterinin vergi numarası]';
  const m2 = missingFor('quote', q, SAMPLE_ISSUER, { missingPrices: ['Barındırma'], paymentProblem: 'plan bozuk' });
  assert.ok(m2.blocking.some((x) => /Barındırma/.test(x)));
  assert.ok(m2.blocking.includes('plan bozuk'));
  assert.ok(m2.blocking.some((x) => /EKSİK/.test(x)));
  const p = sanitizeContent(sampleQuote(), 'proforma');
  const m3 = missingFor('proforma', p, SAMPLE_ISSUER);
  assert.ok(m3.blocking.some((x) => /vergi dairesi/.test(x)));
  assert.ok(m3.blocking.some((x) => /unvanı/.test(x)));
  assert.deepEqual(missingFor('letter', sampleLetter(), SAMPLE_ISSUER).blocking, []);
});

test('body text: sub-headings with "## " in text sections only', () => {
  assert.deepEqual(bodyParts('Giriş\n\n## Sizden beklediğimiz\n\nİçerikler.', false), [
    { type: 'p', text: 'Giriş' }, { type: 'h', text: 'Sizden beklediğimiz' }, { type: 'p', text: 'İçerikler.' },
  ]);
  assert.deepEqual(bodyParts('## not a heading in a list', true), [{ type: 'li', text: '## not a heading in a list' }]);
});

test('body text: paragraphs, bullets, list blocks', () => {
  assert.deepEqual(bodyParts('Bir\niki\n\n- madde\n• ikinci\nSon', false), [
    { type: 'p', text: 'Bir iki' }, { type: 'li', text: 'madde' }, { type: 'li', text: 'ikinci' }, { type: 'p', text: 'Son' },
  ]);
  assert.deepEqual(bodyParts('a\n\nb', true), [{ type: 'li', text: 'a' }, { type: 'li', text: 'b' }]);
});

test('IBAN checksum; settings never keep an invalid account silently', () => {
  assert.ok(ibanValid('TR33 0006 1005 1978 6457 8413 26'));
  assert.ok(!ibanValid('TR33 0006 1005 1978 6457 8413 27'));
  assert.ok(!ibanValid('TR000000000000000000000000'));
  const s = sanitizeDocSettings({ bankAccounts: [{ bank: 'Banka', holder: 'Yoca', iban: 'TR000000000000000000000000' }], validityDays: 900, defaultTaxRate: 'yirmi' });
  assert.equal(s.validityDays, 30);
  assert.equal(s.defaultTaxRate, '20');
  assert.ok(docSettingsProblems(s).some((x) => /IBAN geçersiz/.test(x)));
});
