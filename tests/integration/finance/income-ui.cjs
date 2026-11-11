// TEST ONLY: local stack (app :3190, gateway :54331). Synthetic data (income-e2e + e2e); nothing is sent anywhere.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
const sql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const today = sql(`select (now() at time zone 'Europe/Istanbul')::date`);
const month = today.slice(0, 7);
const prev = sql(`select to_char(('${today}'::date - interval '1 month'), 'YYYY-MM')`);
const next = sql(`select to_char(('${today}'::date + interval '1 month'), 'YYYY-MM')`);
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const mName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const recId = sql(`select id from fin_receivables where title = 'TEST GEL danışmanlık'`);
const opsPer = sql(`select p.id from ops_periods p join ops_services s on s.id = p.service_id where s.name = 'TEST GEL hosting'`);

async function login(ctx, start) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`http://localhost:3190${start}`);
  await page.fill('input[type="email"]', 'finance@test.local');
  await page.fill('input[type="password"]', 'itest-finance-pw');
  await page.click('button[type="submit"]');
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const { page } = await login(ctx, '/admin/ops');
  await page.waitForURL(/\/admin\/finance/, { timeout: 20000 });
  check('finance: an Operasyon URL redirects to the Finans overview', /\/admin\/finance$/.test(page.url()), page.url());
  await page.getByRole('heading', { name: /Nakit hareketi/ }).waitFor();
  const nav = flat(await page.locator('aside nav').innerText());
  check('finance menu: Genel bakış, Gelirler, Giderler only', /Genel bakış/.test(nav) && /Gelirler/.test(nav) && /Giderler/.test(nav) && !/Operasyon|Kokpit|Ayarlar|Insights/.test(nav), nav);

  const cash = flat(await page.locator('section[aria-labelledby="cash-h"]').innerText());
  check(`overview ${mName(month)} cash: in ₺750,00 (Gelirler 900 − 100 refund, Operasyon refund −50; the 600 collected last month is not this month's cash)`, /TAHSILAT \(GIREN\) · [^₺]*₺750,00/i.test(cash), cash.slice(0, 260));
  check('overview: "Net nakit farkı" is labelled as not profit; no "kâr" figure', /Kâr değildir/.test(cash) && /kâr veya zarar değildir/.test(cash), '');
  const period = flat(await page.locator('section[aria-labelledby="period-h"]').innerText());
  const pick = (txt, re) => (txt.match(re) ?? [])[1] ?? null;
  const ovIncome = { b: pick(period, /BEKLENEN ALACAK (.+?) \d+ kayıt/i), t: pick(period, /TAHSIL EDILEN (.+?) net/i), k: pick(period, /KALAN ALACAK (.+?) \d+ kayıt/i) };
  check('overview period: income cards present (beklenen / tahsil edilen / kalan)', Boolean(ovIncome.b && ovIncome.t && ovIncome.k), JSON.stringify(ovIncome));
  const mov = flat(await page.locator('section[aria-labelledby="mov-h"]').innerText());
  check('overview movements: the Operasyon refund once, the voided collection not listed', (mov.match(/Operasyon · tahsilat TEST GEL hosting/g) ?? []).length === 1 && !/₺400,00 Operasyon · tahsilat/.test(mov), mov.slice(0, 200));
  await page.screenshot({ path: `${OUT}/finans-genel-bakis.png`, fullPage: true });

  // dark month picker: open with keyboard, move, Escape, outside click, choose
  const trigger = page.getByRole('button', { name: mName(month) });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Ay ve yıl seçin' });
  await dialog.waitFor();
  const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
  const sel = page.getByRole('gridcell', { selected: true });
  const selBg = await sel.evaluate((el) => getComputedStyle(el).backgroundColor);
  check('picker: dark popover (not the white native calendar), selected month in lime', bg === 'rgb(28, 31, 37)' /* panel token --tile-2 (shared Yoca panel design) */ && selBg === 'rgb(162, 255, 0)', `${bg} / ${selBg}`);
  await page.screenshot({ path: `${OUT}/ay-secici-acik.png`, clip: { x: 260, y: 120, width: 700, height: 470 } });
  const focused0 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await page.keyboard.press('ArrowLeft');
  const focused1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  check('picker keyboard: focus starts on the selected month, ← moves to the previous month', focused0?.startsWith(MONTHS[Number(month.slice(5, 7)) - 1]) && focused1?.startsWith(MONTHS[Number(prev.slice(5, 7)) - 1]), `${focused0} → ${focused1}`);
  await page.keyboard.press('Escape');
  const closedByEsc = (await dialog.count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'))) === 'dialog';
  check('picker: Escape closes and returns focus to the trigger; the month did not change', closedByEsc && !/ay=/.test(page.url()));
  await trigger.click();
  await dialog.waitFor();
  await page.mouse.click(1300, 900);
  check('picker: a click outside closes it', (await dialog.count()) === 0);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await dialog.waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.waitForURL(new RegExp(`ay=${prev}`));
  const cashPrev = flat(await page.locator('section[aria-labelledby="cash-h"]').innerText());
  check(`picker Enter chooses ${mName(prev)}; its cash shows the Operasyon collection ₺600,00 (by real date)`, /TAHSILAT \(GIREN\) · [^₺]*₺600,00/i.test(cashPrev), cashPrev.slice(0, 200));
  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await page.waitForURL((u) => !/ay=/.test(u.toString()));
  check('picker: the ‹ › buttons still work (back to this month)', /\/admin\/finance$/.test(page.url()));
  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await page.waitForURL(new RegExp(`ay=${next}`));
  const periodNext = flat(await page.locator('section[aria-labelledby="period-h"]').innerText());
  check(`${mName(next)} period: the USD receivable stays USD (never added to TRY)`, /BEKLENEN ALACAK \$250\.00|BEKLENEN ALACAK US\$250|BEKLENEN ALACAK 250,00 USD|BEKLENEN ALACAK .*250/i.test(periodNext) && !/BEKLENEN ALACAK ₺/i.test(periodNext), periodNext.slice(0, 160));

  // Gelirler list
  await page.goto('http://localhost:3190/admin/finance/income?state=all');
  await page.getByText(/^Beklenen · /).waitFor();
  const cards = flat(await page.locator('section[aria-label="Gelir dönem takibi"]').innerText());
  const gl = { b: pick(cards, /BEKLENEN · \S+ \d{4} (.+?) \d+ kayıt/i), t: pick(cards, /TAHSIL EDILEN · \S+ \d{4} (.+?) \S+ \d{4} gelirlerine/i), k: pick(cards, /KALAN ALACAK · \S+ \d{4} (.+?) \d+ kayıt/i) };
  check('Gelirler cards equal the overview income cards for the same month (one rule, two screens)', gl.b === ovIncome.b && gl.t === ovIncome.t && gl.k === ovIncome.k, `${JSON.stringify(gl)} vs ${JSON.stringify(ovIncome)}`);
  await page.goto('http://localhost:3190/admin/finance/income?state=all&q=TEST%20GEL');
  await page.locator('tbody tr').first().waitFor();
  const line = flat(await page.locator("xpath=//div[span[starts-with(normalize-space(.),'Beklenen:')]]").first().innerText());
  check(`Gelirler ${mName(month)} (TEST GEL): 2 kayıt · Beklenen ₺2.000,00 · Tahsil edilen ₺1.350,00 · Kalan ₺650,00`, new RegExp(`^${mName(month)} 2 kayıt Beklenen: ₺2\.000,00 Tahsil edilen: ₺1\.350,00 Kalan: ₺650,00`).test(line), line);
  const rows = await page.locator('tbody tr').allInnerTexts();
  check('Gelirler list: the manual receivable and the Operasyon collection, once each', rows.length === 2 && rows.some((r) => /TEST GEL danışmanlık/.test(r)) && rows.some((r) => /TEST GEL hosting/.test(r) && /Kaynak: Operasyon/.test(r)), rows.map((r) => flat(r).slice(0, 60)).join(' | '));
  await page.screenshot({ path: `${OUT}/gelirler-liste.png`, fullPage: true });

  // receivable detail
  await page.goto(`http://localhost:3190/admin/finance/income/${recId}`);
  await page.getByRole('heading', { name: 'Tahsilatlar' }).waitFor();
  const det = flat(await page.locator('main').innerText());
  check('receivable page: partial state, net 800 / remaining 200, voided collection kept with reason, history with the actor', /Kısmen tahsil edildi/.test(det) && /₺800,00 \/ ₺200,00/.test(det) && /İptal edildi/.test(det) && /TEST mükerrer/.test(det), det.slice(0, 200));
  await page.locator('summary', { hasText: 'İşlem geçmişi' }).first().click();
  await page.getByText(/finance@test\.local Tahsilat/).first().waitFor({ timeout: 8000 }).catch(() => {});
  check('receivable page: history lists the finance actions on the receivable and its collections', /finance@test\.local (Alacak|Tahsilat)/.test(flat(await page.locator('main').innerText())));
  await page.getByRole('button', { name: 'Tutarı düzelt' }).click();
  await page.getByLabel(/Doğru tutar/).fill('1050,00');
  const saveFix = page.getByRole('button', { name: 'Düzeltmeyi kaydet' });
  const disabledWithoutReason = await saveFix.isDisabled();
  await page.getByLabel('Gerekçe (zorunlu)').fill('TEST teklif 1.050 TL idi');
  await saveFix.click();
  await page.getByText('Beklenen tutar gerekçeyle düzeltildi; tahsilatlar değişmedi.').waitFor();
  await page.getByText(/Gerekçe: TEST teklif 1\.050 TL idi/).waitFor();
  const fixed = flat(await page.locator('main').innerText());
  check('correction UI: needs a reason; saved with who / when / why; collections unchanged (net 800, remaining now 250)', disabledWithoutReason && /Beklenen tutar gerekçeyle düzeltildi; tahsilatlar değişmedi/.test(fixed) && /finance@test\.local · .* · Gerekçe: TEST teklif 1\.050 TL idi/.test(fixed) && /₺800,00 \/ ₺250,00/.test(fixed), fixed.slice(0, 160));
  await page.screenshot({ path: `${OUT}/gelir-ayrinti.png`, fullPage: true });

  // ops receivable page
  await page.goto(`http://localhost:3190/admin/finance/income/ops/${opsPer}`);
  await page.getByRole('heading', { name: 'Müşteri tahsilatı' }).waitFor();
  const opsTxt = flat(await page.locator('main').innerText());
  check('Operasyon collection page: same-source note, net ₺550,00, no "Operasyon’da aç" for finance, no cost / notes', /aynı ödeme kaydıdır/.test(opsTxt) && /₺550,00 \/ ₺450,00/.test(opsTxt) && !/Operasyon’da aç/.test(opsTxt) && !/GİZLİ/.test(opsTxt) && !/₺400,00 \/|Maliyet/.test(opsTxt), opsTxt.slice(0, 200));
  await page.locator('summary', { hasText: 'İşlem geçmişi' }).first().click();
  await page.waitForTimeout(800);
  check('Operasyon collection page: history shows the admin\'s Operasyon record too', /admin@test\.local Operasyon ödemesi/.test(flat(await page.locator('main').innerText())));
  await page.screenshot({ path: `${OUT}/gelir-operasyon.png`, fullPage: true });

  // Giderler uses the same dark picker
  await page.goto('http://localhost:3190/admin/expenses');
  await page.getByText(/^Ödenen · /).waitFor();
  check('Giderler: the same picker (no native month input left)', (await page.locator('input[type="month"]').count()) === 0 && (await page.getByRole('button', { name: mName(month) }).count()) === 1);

  // mobile
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mp = (await login(m, '/admin/finance')).page;
  await mp.getByRole('heading', { name: /Nakit hareketi/ }).waitFor({ timeout: 20000 });
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  await mp.getByRole('button', { name: mName(month) }).tap();
  const mdlg = mp.getByRole('dialog', { name: 'Ay ve yıl seçin' });
  await mdlg.waitFor();
  const box = await mdlg.boundingBox();
  check('mobile: no horizontal scroll; the picker opens by tap and fits the screen', sw <= 390 && box && box.x >= 0 && box.x + box.width <= 390, `scrollWidth=${sw} box=${box ? `${Math.round(box.x)}+${Math.round(box.width)}` : 'none'}`);
  await mp.screenshot({ path: `${OUT}/mobil-ay-secici.png` });
  await mp.getByRole('gridcell', { name: new RegExp(`^${MONTHS[Number(prev.slice(5, 7)) - 1]} `) }).tap();
  await mp.waitForURL(new RegExp(`ay=${prev}`));
  check('mobile: tapping a month selects it and closes the picker', (await mdlg.count()) === 0);
  await mp.goto('http://localhost:3190/admin/finance/income');
  await mp.getByText(/^Beklenen · /).waitFor();
  const sw2 = await mp.evaluate(() => document.documentElement.scrollWidth);
  check('mobile Gelirler: no horizontal page scroll', sw2 <= 390, `scrollWidth=${sw2}`);
  await mp.screenshot({ path: `${OUT}/mobil-gelirler.png`, fullPage: true });

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
