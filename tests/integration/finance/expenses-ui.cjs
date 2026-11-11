// TEST ONLY: local stack (app :3190, gateway :54331). Synthetic data; nothing is sent anywhere.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
const OPS_PERIOD = process.argv[3];
// finance user's home: /admin/finance since v26 (Gelirler); /admin/expenses for code before it
const HOME = process.env.ITEST_FINANCE_HOME || '/admin/finance';
const sql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };

async function login(ctx, email, pw, start = '/admin/ops') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:3190${start}`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return page;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await login(ctx, 'finance@test.local', 'itest-finance-pw');
  await page.waitForURL((u) => u.pathname === HOME, { timeout: 15000 }).catch(() => {});
  check(`finance: /admin/ops redirects to the finance home (${HOME})`, new URL(page.url()).pathname === HOME, page.url());
  const navText = await page.locator('aside nav').innerText();
  check('finance: menu shows only the Finans / Giderler section', /Giderler/.test(navText) && !/Operasyon|Kokpit|İçerik|Insights|Ayarlar|Ekip|İşlem geçmişi/.test(navText), navText.replace(/\s+/g, ' '));
  check('finance: account line says "Finans sorumlusu"', /Finans sorumlusu/.test(await page.locator('aside').innerText()));
  await page.goto('http://localhost:3190/admin/expenses');
  await page.getByText(/^Ödenen · /).waitFor();
  await page.screenshot({ path: `${OUT}/1-giderler-genel-bakis.png`, fullPage: true });
  for (const p of ['/admin/settings', '/admin/insights', '/admin/team', '/admin', '/admin/ops/finance', '/admin/activity']) {
    await page.goto(`http://localhost:3190${p}`);
    await page.waitForURL((u) => u.pathname === HOME, { timeout: 10000 }).catch(() => {});
    if (new URL(page.url()).pathname !== HOME) { check(`finance: ${p} → Finans`, false, page.url()); }
  }
  check('finance: settings / Insights / team / cockpit / Operasyon / activity URLs all bounce to Finans', !results.some((r) => /→ Finans/.test(r.name) && !r.ok));

  // new recurring expense through the form
  await page.goto('http://localhost:3190/admin/expenses/new');
  await page.getByLabel('Açıklama').waitFor();
  await page.getByLabel('Açıklama').fill('TEST İnternet (fiber)');
  await page.getByLabel('Kategori').selectOption('internet');
  await page.locator('label:has-text("İlk vade") input').fill('2026-11-10');
  await page.locator('label:has-text("Tutar") input').first().fill('1.250,00');
  await page.getByLabel('Firma / kişi adı').fill('TEST Telekom');
  await page.getByLabel('Ödeme hesabı').fill('Şirket kartı');
  await page.screenshot({ path: `${OUT}/2-yeni-gider-formu.png`, fullPage: true });
  await page.getByRole('button', { name: 'Gideri kaydet' }).click();
  await page.waitForURL(/\/admin\/expenses\/[0-9a-f-]{36}/, { timeout: 15000 });
  const expenseId = page.url().split('/admin/expenses/')[1].split('?')[0];
  check('form: expense saved; first period created', Number(sql(`select count(*) from fin_periods where expense_id = '${expenseId}'`)) >= 1);
  // partial payment, double click → one record
  const amount = page.locator('label:has-text("Tutar (TRY)") input').first();
  await amount.waitFor();
  await amount.fill('500');
  await page.locator('label:has-text("Dekont / referans no") input').first().fill('TEST-UI-1');
  const btn = page.getByRole('button', { name: 'Kaydı ekle' }).first();
  // three clicks in the same tick (before React re-renders): only the request key protects here
  await btn.evaluate((el) => { el.click(); el.click(); el.click(); });
  await page.waitForTimeout(2500);
  const n = Number(sql(`select count(*) from fin_payments p join fin_periods r on r.id = p.period_id where r.expense_id = '${expenseId}'`));
  check('ui: partial payment saved once despite double click', n === 1, `records=${n}`);
  await page.getByText('Kısmen ödendi').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('ui: period shows "Kısmen ödendi"', await page.getByText('Kısmen ödendi').first().isVisible().catch(() => false));
  // receipt on the payment
  await page.getByRole('button', { name: 'Dekont / belge' }).first().click();
  fs.writeFileSync(`${OUT}/TEST-dekont.pdf`, '%PDF-1.4\n% TEST dekont\n%%EOF\n');
  await page.locator('li input[type=file]').first().setInputFiles({ name: 'TEST-dekont.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(`${OUT}/TEST-dekont.pdf`) });
  await page.waitForTimeout(2000);
  check('ui: receipt uploaded to fin-docs and listed', (await page.locator('li:has-text("TEST-dekont.pdf")').count()) > 0 && Number(sql(`select count(*) from storage.objects where bucket_id = 'fin-docs' and name like 'payment/%TEST-dekont.pdf'`)) >= 1);
  await page.screenshot({ path: `${OUT}/3-gider-ayrinti-kismi-odeme.png`, fullPage: true });

  // void needs a reason
  await page.getByRole('button', { name: 'İptal et' }).first().click();
  check('ui: void button disabled until a reason is written', await page.getByRole('button', { name: 'İptali kaydet' }).isDisabled());
  await page.getByPlaceholder('İptal gerekçesi (zorunlu)').fill('TEST yanlış tutar');
  await page.getByRole('button', { name: 'İptali kaydet' }).click();
  await page.waitForTimeout(1500);
  check('ui: voided payment stays visible as "İptal edildi" with who/why', await page.getByText('Gerekçe: TEST yanlış tutar').first().isVisible().catch(() => false));
  await page.locator('summary:has-text("İşlem geçmişi")').click();
  await page.waitForTimeout(1500);
  const hist = await page.locator('details:has(summary:has-text("İşlem geçmişi"))').innerText();
  check('ui: expense history shows who added / voided (fin_audit)', /finance@test\.local/.test(hist) && /Ödeme .*değiştirdi/.test(hist) && /iptal gerekçesi/.test(hist), hist.replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: `${OUT}/4-odeme-iptal-gecmis.png`, fullPage: true });

  // Operasyon provider cost as finance
  await page.goto(`http://localhost:3190/admin/expenses/ops/${OPS_PERIOD}`);
  await page.getByText('Kaynak: Operasyon').first().waitFor();
  check('finance: Operasyon cost page has no "Operasyon’da aç" link', (await page.getByRole('link', { name: 'Operasyon’da aç' }).count()) === 0);
  const body = await page.locator('main').innerText();
  check('finance: no customer name, sale price or internal note on the page', !/TEST GID Müşteri|GİZLİ|300,00/.test(body));
  await page.screenshot({ path: `${OUT}/5-operasyon-saglayici-maliyeti.png`, fullPage: true });

  // filters + CSV
  await page.goto('http://localhost:3190/admin/expenses?state=all');
  await page.getByText(/^Ödenen · /).waitFor();
  await page.screenshot({ path: `${OUT}/6-liste-tumu.png`, fullPage: true });
  await page.goto('http://localhost:3190/admin/expenses?state=all&cat=ops');
  await page.waitForTimeout(1500);
  const rows = await page.locator('tbody tr').count();
  check('filter: category "Operasyon" shows only Operasyon rows', rows >= 1 && (await page.locator('tbody tr:has-text("Giderler")').count()) === 0, `rows=${rows}`);
  await page.goto('http://localhost:3190/admin/expenses?state=all');
  await page.getByText(/^Ödenen · /).waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV indir/ }).click()]);
  const csvPath = `${OUT}/giderler.csv`;
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('csv: header + rows with source column', /^﻿?Kaynak,Gider \/ hizmet,Kategori/.test(csv) && /Operasyon,TEST GID hosting/.test(csv) && /Giderler,TEST Ofis kirası/.test(csv), csv.split('\n')[0]);
  await page.goto('http://localhost:3190/admin/expenses?view=defs');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/7-gider-tanimlari.png`, fullPage: true });

  // Excel import with the SYNTHETIC fixture (no real data in screenshots)
  sql(`set session_replication_role = replica; create temp table x as select expense_id from fin_import_rows where expense_id is not null and file_name = 'fin-import-sample.xlsx'; delete from fin_periods where expense_id in (select expense_id from x); delete from fin_import_rows where file_name = 'fin-import-sample.xlsx'; delete from fin_expenses where id in (select expense_id from x);`);
  await page.goto('http://localhost:3190/admin/expenses?view=import');
  await page.locator('input[type=file][accept=".xlsx,.xlsm"]').setInputFiles('/home/claude/ref/yoca-web/tests/fixtures/fin-import-sample.xlsx');
  await page.getByText('Kontrol toplamları (TRY)').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const pv = await page.locator('main').innerText();
  check('import preview: totals match, groups shown, one question, nothing written yet', /Uyumlu/.test(pv) && /Oluşturulacak giderler ve dönemler/.test(pv) && /Atlanan boş satırlar/.test(pv) && /gerçek ödeme tarihi/.test(pv) && Number(sql(`select count(*) from fin_import_rows where file_name = 'fin-import-sample.xlsx'`)) === 0);
  await page.screenshot({ path: `${OUT}/9-aktarim-onizleme-ornek.png`, fullPage: true });
  check('import: "Aktar" disabled until the preview is confirmed', await page.getByRole('button', { name: 'Aktar' }).isDisabled());
  await page.getByLabel('Önizlemeyi kontrol ettim').check();
  await page.getByRole('button', { name: 'Aktar' }).click();
  await page.getByText(/Aktarıldı:/).waitFor({ timeout: 15000 });
  check('import applied (synthetic): 3 created, pending list shown', /3 gider oluşturuldu/.test(await page.locator('main').innerText()) && (await page.getByText('Aktarımdan bekleyenler').count()) === 1);
  await page.screenshot({ path: `${OUT}/10-aktarim-bekleyenler-ornek.png`, fullPage: true });

  // mobile
  const m = await b.newContext({ ...require('playwright').devices['iPhone 13'], reducedMotion: 'reduce' });
  const mp = await login(m, 'finance@test.local', 'itest-finance-pw', '/admin/expenses');
  // phones show the compact summary (the desktop cards are hidden there)
  await mp.locator('section[aria-label="Genel bakış (özet)"]').waitFor();
  await mp.screenshot({ path: `${OUT}/8-mobil-genel-bakis.png`, fullPage: true });
  const wide = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('mobile: no horizontal page scroll', !wide);

  // admin
  const actx = await b.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const ap = await login(actx, 'admin@test.local', 'itest-admin-pw', '/admin/expenses');
  await ap.getByText(/^Ödenen · /).waitFor();
  // textContent: group titles are shown upper-case by CSS, innerText would return them so
  const anav = await ap.locator('aside nav').textContent();
  check('admin: full menu plus the new Finans / Giderler entry', /Operasyon/.test(anav) && /Kokpit/.test(anav) && /Giderler/.test(anav));
  await ap.goto(`http://localhost:3190/admin/expenses/ops/${OPS_PERIOD}`);
  await ap.getByText('Kaynak: Operasyon').first().waitFor();
  check('admin: Operasyon cost page links to the service', (await ap.getByRole('link', { name: 'Operasyon’da aç' }).count()) === 1);

  fs.writeFileSync(`${OUT}/fin-ui.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
