// TEST ONLY: local stack (app :3190, gateway :54331). Synthetic "TEST AY" data; nothing is sent anywhere.
// Monthly cards and the list follow the selected month; December periods created ahead never enter November.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
const sql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };

// local test DB only: start from an empty Giderler (Operasyon test rows stay; their dates are checked below)
sql(`set session_replication_role = replica;
  delete from fin_import_rows; delete from fin_imports; delete from fin_documents; delete from fin_payments; delete from fin_periods; delete from fin_expenses;
  delete from ops_payments where service_id in (select id from ops_services where name like 'TEST %'); delete from ops_periods where service_id in (select id from ops_services where name like 'TEST %');`);
sql(`insert into fin_expenses (title, category, kind, recurrence, first_due_on, amount, currency) values
  ('TEST AY Ofis kirası', 'rent', 'recurring', 'monthly', '2026-11-20', 10000, 'TRY'),
  ('TEST AY Aidat', 'utilities', 'recurring', 'monthly', '2026-11-30', 500, 'TRY'),
  ('TEST AY Su', 'utilities', 'recurring', 'monthly', '2026-11-02', null, 'TRY'),
  ('TEST AY İnternet', 'internet', 'recurring', 'monthly', '2026-11-16', 700, 'TRY'),
  ('TEST AY Muhasebe', 'accounting', 'recurring', 'monthly', '2026-11-30', 2000, 'TRY')`);
sql(`update fin_periods set amount = 300, review_note = 'TEST: Ödendi, tarih yok' where seq = 0 and expense_id = (select id from fin_expenses where title = 'TEST AY Su')`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3190/admin/expenses');
  await page.fill('input[type="email"]', 'admin@test.local');
  await page.fill('input[type="password"]', 'itest-admin-pw');
  await page.click('button[type="submit"]');
  await page.getByText(/^Ödenen · /).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const cards = async () => page.locator('section[aria-label="Genel bakış"]').innerText();
  const line = async () => page.locator("xpath=//div[span[starts-with(normalize-space(.),'Tutar:')]]").first().innerText();
  const flat = (s) => s.replace(/\s+/g, ' ');

  const rolled = sql(`select string_agg(e.title || ' ' || p.due_on || ' ' || coalesce(p.amount::text, 'bekleniyor'), ' | ' order by p.due_on) from fin_periods p join fin_expenses e on e.id = p.expense_id where p.seq > 0`);
  check('setup: opening the page created the December periods ahead (rent, internet, water)', /Ofis kirası 2026-12-20 10000/.test(rolled) && /İnternet 2026-12-16 700/.test(rolled) && /Su 2026-12-02 bekleniyor/.test(rolled), rolled);

  const nov = flat(await cards());
  check('Kasım: Gider ₺13.500,00 (December not included)', /Gider · Kasım 2026 ₺13\.500,00/.test(nov), nov);
  check('Kasım: Ödenen ₺0 shown as —, Kalan ₺13.200,00, tarih bekleyen ₺300,00', /Ödenen · Kasım 2026 —/.test(nov) && /Kalan · Kasım 2026 ₺13\.200,00/.test(nov) && /tarih bekleniyor ₺300,00/.test(nov), nov);
  check('Kasım: no 30-day card mixing months', !/30 GÜN/i.test(nov));
  check('Geciken card says "Tüm aylar · bugün itibarıyla"; Ödenen explains net payments of the month', /Geciken · Tüm aylar · bugün itibarıyla/.test(nov) && /Kasım 2026 dönemlerine kaydedilen net ödemeler \(iadeler düşülür\); ödeme tarihine göre değil/.test(nov), nov);
  check('Geciken: the past-due water awaiting a date is not an overdue debt', /bugün itibarıyla — 0 dönem/.test(nov));
  const novLine = flat(await line());
  check('Kasım list: scope "Kasım 2026", 5 periods, Tutar 13.500, Kalan 13.200, tarih bekleyen 300', /Kasım 2026 5 dönem Tutar: ₺13\.500,00 Kalan: ₺13\.200,00 Ödeme tarihi bekleyen: ₺300,00/.test(novLine), novLine);
  await page.screenshot({ path: `${OUT}/ay-kasim.png`, fullPage: true });

  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await page.waitForURL(/ay=2026-12/);
  await page.waitForTimeout(500);
  const dec = flat(await cards());
  check('Aralık: Gider ₺10.700,00 (rent + internet), water counted as "tutarı bekleniyor", no review', /Gider · Aralık 2026 ₺10\.700,00 3 dönem · 1 dönemin tutarı bekleniyor/.test(dec) && !/tarih bekleniyor/i.test(dec), dec);
  const decLine = flat(await line());
  check('Aralık list: scope "Aralık 2026", 3 periods', /^Aralık 2026 3 dönem/.test(decLine), decLine);
  await page.screenshot({ path: `${OUT}/ay-aralik.png`, fullPage: true });

  await page.getByRole('button', { name: 'Tüm aylar' }).click();
  await page.waitForURL(/kapsam=tum/);
  await page.waitForTimeout(400);
  const allLine = flat(await line());
  const decCards = flat(await cards());
  check('Tüm aylar: the list shows every month (8 expense periods + Operasyon) while the cards stay on Aralık', /^Tüm aylar \d+ dönem/.test(allLine) && Number(allLine.match(/(\d+) dönem/)[1]) >= 8 && /Gider · Aralık 2026 ₺10\.700,00/.test(decCards), allLine);

  await page.getByRole('button', { name: 'Bu aya dön' }).click();
  await page.waitForTimeout(500);
  check('Bu aya dön: back to Kasım, list follows the month again', /Gider · Kasım 2026 ₺13\.500,00/.test(flat(await cards())) && /^Kasım 2026 5 dönem/.test(flat(await line())), page.url());

  await page.goto('http://localhost:3190/admin/expenses?from=2026-11-15&to=2026-12-31');
  await page.waitForTimeout(800);
  const customLine = flat(await line());
  check('custom due-date range is respected (list) and labelled; cards stay on the month', /^Vade 15 Kas 2026 – 31 Ara 2026 7 dönem Tutar: ₺23\.900,00/.test(customLine) && /Gider · Kasım 2026 ₺13\.500,00/.test(flat(await cards())), customLine);

  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mp = await m.newPage();
  await mp.goto('http://localhost:3190/admin/expenses');
  await mp.fill('input[type="email"]', 'admin@test.local');
  await mp.fill('input[type="password"]', 'itest-admin-pw');
  await mp.click('button[type="submit"]');
  // phones show the compact summary (the desktop cards are hidden there)
  await mp.locator('section[aria-label="Genel bakış (özet)"]').waitFor({ timeout: 20000 });
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
  check('mobile: month selector fits, no horizontal page scroll', sw <= 390, `scrollWidth=${sw}`);
  await mp.screenshot({ path: `${OUT}/ay-mobil.png`, fullPage: true });

  await browser.close();
  sql(`set session_replication_role = replica; delete from fin_periods; delete from fin_expenses where title like 'TEST AY%';`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
