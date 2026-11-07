import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { exactNumber, excelDate, readWorkbook } from '../lib/fin/xlsx';
import { planImport, readExpenseSheet, settleOpsOverlap, suggest } from '../lib/fin/importPlan';

// Synthetic fixture only (tests/fixtures/fin-import-sample.xlsx) — no real data in the repository.
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const buf = fs.readFileSync('tests/fixtures/fin-import-sample.xlsx');
const wb = readWorkbook(buf);
const sheet = wb.sheet('Ofis Giderleri')!;
const read = readExpenseSheet(sheet, wb.date1904);
const plan = planImport({ sheet: 'Ofis Giderleri', ...read, hash: sha });
const row = (name: string) => plan.rows.find((r) => r.name === name)!;

test('xlsx: exact numbers (no float, no scientific notation) and Excel dates', () => {
  assert.equal(exactNumber('1.234567891E9'), '1234567891');
  assert.equal(exactNumber('46346.0'), '46346');
  assert.equal(exactNumber('1.5E-3'), '0.0015');
  assert.equal(excelDate('46346'), '2026-11-20');
  assert.deepEqual(wb.sheets, ['Ofis Giderleri']);
  assert.equal(wb.hasMacros, false);
});

test('sheet: header row found by its labels, totals labels read', () => {
  assert.equal(read.headerRow, 8);
  assert.equal(read.cols.name, 'A');
  assert.equal(read.labels.get('toplam (tl)'), '2750');
});

test('month: from the row dates; the "Örnek" cell is not taken as data', () => {
  assert.equal(plan.month, '2026-10');
  assert.ok(plan.monthEvidence.some((e) => /Örnek ifade \(veri sayılmadı\)/.test(e)));
  assert.equal(plan.warnings.length, 0);
});

test('rows: create / pending payment / needs info / suggestion / duplicate / blank', () => {
  assert.equal(row('ÖRNEK Ofis kirası').action, 'create');
  assert.equal(row('ÖRNEK Ofis kirası').recurrence, 'monthly');
  assert.equal(row('ÖRNEK Ofis kirası').amount, '1000.00');
  assert.equal(row('ÖRNEK Ofis kirası').method, 'bank_transfer');
  assert.equal(row('ÖRNEK Su').action, 'pending_payment');
  assert.equal(row('ÖRNEK Su').variable, true);
  assert.equal(row('ÖRNEK Elektrik').action, 'needs_info');
  assert.equal(row('ÖRNEK Doğalgaz').amount, null);
  assert.equal(row('ÖRNEK SGK ödemeleri').amountNote, '“?”');
  assert.equal(row('ÖRNEK Muhasebeci ücreti').amount, '1500.00');
  assert.equal(row('ÖRNEK Muhasebeci ücreti').due, '2026-10-25');
  assert.equal(row('Domain, hosting, sunucu ve veritabanı').action, 'possible_duplicate');
  assert.equal(row('Çalışan maaşları').action, 'suggestion');
  assert.equal(row('Diğer gider 1').action, 'skip_blank');
});

test('missing values are never zero, empty status is never "Ödenmedi", notes keep exact digits', () => {
  assert.equal(row('ÖRNEK Muhasebeci ücreti').status, 'empty');
  assert.ok(row('ÖRNEK Muhasebeci ücreti').reasons.some((r) => /“Ödenmedi” varsayılmadı/.test(r)));
  assert.equal(row('ÖRNEK Elektrik').note, '987654321');
  assert.equal(row('ÖRNEK Elektrik').due, null);
});

test('paid without a date: no payment invented, period held for review, one question', () => {
  assert.equal(plan.totals.system.paidImported, BigInt(0));
  assert.equal(plan.totals.system.review, BigInt(25000));
  assert.equal(plan.questions.length, 1);
  assert.match(plan.questions[0], /ÖRNEK Su/);
});

test('totals: computed from the rows, compared with the sheet cells; missing amounts excluded', () => {
  assert.equal(plan.totals.computed.total, BigInt(275000));
  assert.equal(plan.totals.computed.paid, BigInt(25000));
  assert.equal(plan.totals.computed.remaining, BigInt(250000));
  assert.deepEqual(plan.totals.match, { total: true, paid: true, remaining: true });
  assert.equal(plan.totals.computed.missingCount, 3);
  assert.equal(plan.totals.system.remaining, BigInt(250000));
});

test('keys are stable; a changed cell changes the hash, not the key', () => {
  const again = planImport({ sheet: 'Ofis Giderleri', ...read, hash: sha });
  assert.deepEqual(again.rows.map((r) => [r.key, r.hash]), plan.rows.map((r) => [r.key, r.hash]));
  const changedRows = read.rows.map((r) => (r.name === 'ÖRNEK Ofis kirası' ? { ...r, amountText: '1100' } : r));
  const changed = planImport({ sheet: 'Ofis Giderleri', ...read, rows: changedRows, hash: sha });
  const a = plan.rows.find((r) => r.name === 'ÖRNEK Ofis kirası')!; const b = changed.rows.find((r) => r.name === 'ÖRNEK Ofis kirası')!;
  assert.equal(a.key, b.key);
  assert.notEqual(a.hash, b.hash);
});

test('possible duplicate only when Operasyon has a service of that kind; otherwise an ordinary suggestion (nothing created)', () => {
  const domain = row('Domain, hosting, sunucu ve veritabanı');
  const mail = { ...domain, row: 99, key: 'x|r99|kurumsal-e-posta', name: 'Kurumsal e-posta ve bulut depolama', opsKinds: suggest('Kurumsal e-posta ve bulut depolama').opsKinds };
  assert.equal(mail.action, 'possible_duplicate');
  // Operasyon has a VPS only (as in production)
  const settled = settleOpsOverlap([domain, mail, row('Çalışan maaşları')], ['vps']);
  assert.equal(settled[0].action, 'possible_duplicate');
  assert.equal(settled[1].action, 'suggestion');
  assert.match(settled[1].reasons[0], /Operasyon’da bu türde hizmet yok/);
  assert.equal(settled[1].amount, mail.amount); // nothing else changes
  assert.equal(settled[1].hash, mail.hash);     // same source hash → a re-upload is still "already"
  assert.equal(settled[2].action, 'suggestion');
  // an e-mail service in Operasyon makes it a candidate again (still never merged)
  assert.equal(settleOpsOverlap([mail], ['email'])[0].action, 'possible_duplicate');
  // no Operasyon service at all → no possible duplicates
  assert.ok(settleOpsOverlap(plan.rows, []).every((r) => r.action !== 'possible_duplicate'));
});
