/**
 * Teklifler ve Belgeler — page breaking of the PDF template (renders real PDFs).
 * Run: npx tsx --test tests/documents-pdf.test.ts
 */
import { test } from 'node:test';
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
