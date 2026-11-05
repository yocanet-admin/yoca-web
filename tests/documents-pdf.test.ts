/**
 * Teklifler ve Belgeler — page breaking of the PDF template (renders real PDFs).
 * Run: npx tsx --test tests/documents-pdf.test.ts
 */
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { renderDocumentPdf } from '../lib/documents/pdf';
import { newContent, newItem } from '../lib/documents/model';
import { sampleQuote, SAMPLE_BANK } from './fixtures-documents';

const NOW = new Date('2026-11-05T09:00:00Z');
const issuer = { brand: 'Yoca', legalName: 'Yoca Teknoloji Ltd Şti', address: '', taxOffice: '', taxNumber: '', mersis: '', tradeRegistry: '', email: '', phone: '', website: 'https://yoca.net', kep: '' };

function shortProforma() {
  const p = newContent('proforma', { now: NOW });
  p.recipient = { ...p.recipient, company: 'Örnek Şirket' };
  p.items = [
    { ...newItem('20'), id: 'a', title: 'Marka stratejisi', description: 'Konumlandırma, marka mesajı ve iletişim çerçevesi.', quantity: '1', unit: 'paket', unitPrice: '30.000,00' },
    { ...newItem('20'), id: 'b', title: 'Görsel kimlik', description: 'Logo sistemi, renkler ve temel kurumsal uygulamalar.', quantity: '1', unit: 'paket', unitPrice: '45.000,00' },
    { ...newItem('20'), id: 'c', title: 'Dijital deneyim', description: 'Kurumsal web tasarımı ve geliştirme.', quantity: '1', unit: 'paket', unitPrice: '75.000,00' },
  ];
  p.payment = [{ id: 'p1', label: 'Başlangıçta', mode: 'percent', value: '50', due: '' }, { id: 'p2', label: 'Teslimde', mode: 'percent', value: '50', due: '' }];
  p.blocks = [];
  return p;
}

test('short proforma (3 items, totals, payment terms) fits on one page with the footer', async () => {
  const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Marka kimliği ve dijital deneyim', content: shortProforma(), issuer, bankAccounts: [], mode: 'final', version: 1 });
  assert.equal(r.pages, 1);
});

test('live case: short proforma DRAFT with the footer e-mail line and the draft status line still fits on one page', async () => {
  const p = shortProforma();
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: TERMS }];
  const live = { ...issuer, email: 'connect@yoca.net' };
  const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Proforma önizleme kontrolü', content: p, issuer: live, bankAccounts: [], mode: 'draft' });
  assert.equal(r.pages, 1);
  const txt = pdfText(r.buffer);
  if (txt) assert.ok(txt.includes('connect@yoca.net') && txt.includes('180.000,00') && txt.includes('%50 · Teslimde'), 'footer e-mail, total and payment plan all present');
});

test('fuller company profile (multi-line address, tax facts, MERSİS, KEP): nothing dropped, the document flows instead of overlapping', async () => {
  const p = shortProforma();
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: TERMS }];
  const full = { ...issuer, email: 'connect@yoca.net', phone: '+90 212 555 01 23', address: 'Örnek Mahallesi Örnek Caddesi No: 1\nİş Merkezi B Blok\nŞişli / İstanbul', taxOffice: 'Örnek', taxNumber: '1234567890', mersis: '0123456789000015', tradeRegistry: '123456-5', kep: 'ornek@hs01.kep.tr' };
  const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Proforma', content: p, issuer: full, bankAccounts: [SAMPLE_BANK], mode: 'draft' });
  assert.ok(r.pages >= 1 && r.pages <= 2, `pages=${r.pages}`);
  const txt = pdfText(r.buffer);
  if (txt) for (const s of ['180.000,00', '%50 · Teslimde', 'Kapsam dışı talepler', 'İş Merkezi B Blok', 'ornek@hs01.kep.tr']) assert.ok(txt.includes(s), s);
});

const ONE_LINE_TERMS = 'Başlangıçta %50, teslimde %50. Kapsam dışı talepler ayrıca değerlendirilir.';

test('approved proforma closing: 3 items, one-line terms, normal address/tax facts and one bank account on ONE page; plan and bank side by side', async () => {
  const p = shortProforma();
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: ONE_LINE_TERMS }];
  p.bankAccountIds = [SAMPLE_BANK.id];
  const normal = { ...issuer, email: 'connect@yoca.net', phone: '+90 212 555 01 23', address: 'Örnek Mah. Örnek Cad. No: 1, Şişli / İstanbul', taxOffice: 'Örnek', taxNumber: '1234567890' };
  for (const mode of ['draft', 'final'] as const) {
    const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Marka kimliği ve dijital deneyim', content: p, issuer: normal, bankAccounts: [SAMPLE_BANK], mode, ...(mode === 'final' ? { version: 1 } : {}) });
    assert.equal(r.pages, 1, mode);
    const txt = pdfText(r.buffer);
    if (txt) {
      assert.equal(txt.split('Kapsam dışı talepler ayrıca değerlendirilir').length - 1, 1, 'terms once');
      assert.ok(txt.includes('ÖDEME VE KOŞULLAR') && txt.includes('BANKA BİLGİLERİ') && txt.includes('Vergi dairesi: Örnek'), 'plan, bank and tax facts present');
    }
  }
  // longer terms (several lines): no further squeezing — the closing moves to page 2 whole, nothing dropped
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: TERMS }];
  const r2 = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Marka kimliği ve dijital deneyim', content: p, issuer: normal, bankAccounts: [SAMPLE_BANK], mode: 'final', version: 1 });
  assert.ok(r2.pages <= 2, `pages=${r2.pages}`);
  const t2 = pdfText(r2.buffer);
  if (t2) assert.ok(t2.includes('Bu belge örnek fiyatlarla hazırlanmıştır') && t2.includes('BANKA BİLGİLERİ'));
});

test('proforma with many bank accounts: every account is printed, the document flows instead of cutting', async () => {
  const p = shortProforma();
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: TERMS }];
  const banks = Array.from({ length: 8 }, (_, i) => ({ ...SAMPLE_BANK, id: `bk${i}`, bank: `Banka ${i + 1}` }));
  p.bankAccountIds = banks.map((b) => b.id);
  const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Çok hesaplı', content: p, issuer, bankAccounts: banks, mode: 'final', version: 1 });
  assert.ok(r.pages >= 2, `pages=${r.pages}`);
  const txt = pdfText(r.buffer);
  if (txt) for (let i = 1; i <= 8; i += 1) assert.ok(txt.includes(`Banka ${i}`), `Banka ${i}`);
});

test('long documents still flow over several pages (no forced single page)', async () => {
  const q = sampleQuote();
  q.items = Array.from({ length: 24 }, (_, i) => ({ ...newItem('20'), id: `x${i}`, title: `İş paketi ${i + 1}`, description: 'Atölye, araştırma ve iki revizyon turu; PDF ve kaynak dosyalarla teslim.', quantity: '1', unit: 'gün', unitPrice: '1.000,00' }));
  const r = await renderDocumentPdf({ kind: 'quote', number: 'TKL-2026-0042', title: 'Uzun teklif', content: q, issuer, bankAccounts: [SAMPLE_BANK], mode: 'final', version: 1 });
  assert.ok(r.pages >= 4, `pages=${r.pages}`);
});

/** Text of a PDF with pdftotext when it is installed (text checks are skipped otherwise). */
function pdfText(buf: Buffer): string | null {
  try {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yoca-pdf-')), 'x.pdf');
    fs.writeFileSync(f, buf);
    return execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
  } catch { return null; }
}
const TERMS = 'Başlangıçta %50, teslimde %50. Kapsam dışı talepler ayrıca değerlendirilir. Bu belge örnek fiyatlarla hazırlanmıştır.';

test('proforma: payment plan + short Notlar in "Ödeme ve koşullar", once, on one page (no plan page)', async () => {
  const p = shortProforma();
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: TERMS }];
  const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Marka kimliği ve dijital deneyim', content: p, issuer, bankAccounts: [], mode: 'final', version: 1 });
  assert.equal(r.pages, 1);
  const txt = pdfText(r.buffer);
  if (txt) {
    assert.equal(txt.split('Kapsam dışı talepler ayrıca değerlendirilir').length - 1, 1, 'terms text printed exactly once');
    assert.ok(!txt.includes('Plan ve koşullar') && !txt.includes('NOTLAR'));
    assert.ok(txt.includes('%50 · Başlangıçta') && txt.includes('%50 · Teslimde') && txt.includes('180.000,00'));
  }
});

test('proforma: long Notlar stays a section and flows to the next page, nothing dropped', async () => {
  const p = shortProforma();
  const long = `${TERMS}\n\n${'Revizyon talepleri yazılı olarak iletilir ve bir sonraki çalışma gününde değerlendirilir; kapsam dışı işler için ayrıca yazılı teklif hazırlanır. '.repeat(10)}`;
  p.blocks = [{ id: 'n', key: 'notes', heading: 'Notlar', body: long }];
  const r = await renderDocumentPdf({ kind: 'proforma', number: 'PRF-2026-0001', title: 'Uzun koşullar', content: p, issuer, bankAccounts: [], mode: 'final', version: 1 });
  assert.ok(r.pages >= 2, `pages=${r.pages}`);
  const txt = pdfText(r.buffer);
  if (txt) {
    assert.equal(txt.split('Revizyon talepleri yazılı olarak iletilir').length - 1, 10);
    assert.equal(txt.split('Kapsam dışı talepler ayrıca değerlendirilir').length - 1, 1);
  }
});
