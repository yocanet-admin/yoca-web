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
