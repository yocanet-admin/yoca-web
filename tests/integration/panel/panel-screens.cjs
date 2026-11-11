// TEST ONLY: local stack (app :3190, gateway :54331). Every panel screen in the shared Yoca panel design.
// Run after setup-db.sh + build + start.sh:
//   psql … -f tests/integration/panel/seed-screens.sql   (synthetic TEST records: long names, several currencies, empty fields)
//   NODE_PATH=tests/integration/node_modules node tests/integration/panel/panel-screens.cjs [out-dir]
// Checks per screen at 1440, 1024 and 390 px: it opens without a page error, has a page title (h1) in the
// panel head, the page never scrolls sideways, no native <input type="date"> (dates use the Turkish dark
// DateField), tables are framed (admin-table) and become cards on phones. Also: the finance user still
// reaches only the Finans screens; the new-document dialog opens, Escape/Vazgeç closes it and focus returns.
// Exceptions checked on purpose: the Hizmetler filter group folds on phones; the Insights scheduling field is
// DateField + hour/minute (local value, same format as before); a wide inner table (CSV preview) scrolls
// sideways inside its own named, focusable area instead of becoming cards, and the page itself does not.
// It writes nothing except one draft document created through the app's own API when none exists.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3190';
const psql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const first = (q) => psql(q).split('\n')[0] || null;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  — ${detail}` : ''}`); };

async function login(browser, email, pw, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/ops`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

  // one draft document (through the app, never a direct insert)
  if (!first('select id from doc_documents limit 1')) {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/documents`); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: '+ Yeni belge' }).first().click();
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Oluştur ve aç' }).click();
    await page.waitForURL(/\/admin\/documents\/[0-9a-f-]{36}/, { timeout: 30000 });
    await ctx.close();
  }

  const ids = {
    client: first("select id from clients where name like 'TEST Kuzey%'"),
    service: first("select id from ops_services where name like 'TEST kuzey%'"),
    project: first("select id from ops_projects where name like 'TEST%'"),
    doc: first('select id from doc_documents order by created_at desc'),
    receivable: first("select id from fin_receivables where status = 'open' order by created_at limit 1"),
    expense: first('select id from fin_expenses order by created_at limit 1'),
    insight: first("select id from insights where slug = 'test-long-title'"),
  };
  const routes = [
    '/admin/submissions', '/admin/clients', '/admin/traffic', '/admin/seo', '/admin/sites',
    '/admin/ops', '/admin/ops/clients', ids.client && `/admin/ops/clients/${ids.client}`,
    '/admin/ops/services', '/admin/ops/services/new', ids.service && `/admin/ops/services/${ids.service}`,
    ids.project && `/admin/ops/projects/${ids.project}`,
    '/admin/ops/finance', '/admin/ops/finance?view=collections', '/admin/ops/finance?view=costs', '/admin/ops/finance?view=payments', '/admin/ops/finance?view=calendar',
    '/admin/documents', '/admin/documents/settings', '/admin/documents/materials', ids.doc && `/admin/documents/${ids.doc}`,
    '/admin/ops/providers', '/admin/ops/licenses', '/admin/ops/settings',
    '/admin/finance', '/admin/finance/income', '/admin/finance/income/new', ids.receivable && `/admin/finance/income/${ids.receivable}`,
    '/admin/expenses/new', ids.expense && `/admin/expenses/${ids.expense}`,
    '/admin/sections', '/admin/menus', '/admin/content', '/admin/work', '/admin/work/results',
    '/admin/insights', '/admin/insights/new', ids.insight && `/admin/insights/${ids.insight}`,
    '/admin/newsletter', '/admin/team', '/admin/signature', '/admin/company', '/admin/activity', '/admin/settings',
  ].filter(Boolean);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    const { ctx } = await login(browser, 'admin@test.local', 'itest-admin-pw', viewport);
    const bad = { error: [], head: [], over: [], date: [], table: [] };
    for (const route of routes) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(BASE + route, { timeout: 90000 });
      await page.waitForTimeout(route.includes('/documents/') || route.includes('/insights/') ? 3500 : 2200);
      const m = await page.evaluate(() => ({
        h1: Boolean(document.querySelector('main h1')?.textContent?.trim()),
        head: Boolean(document.querySelector('main .admin-head, main header h1.admin-h1')),
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        nativeDate: document.querySelectorAll('main input[type="date"]').length,
        plainTables: Array.from(document.querySelectorAll('main table')).filter((t) => !t.closest('.sr-only') && !t.closest('[role="dialog"]') && !t.classList.contains('admin-table') && !t.closest('.admin-card, .admin-box, section')).length,
        cardRows: Array.from(document.querySelectorAll('main .admin-table-cards .admin-table tbody tr, main .admin-table-cards-lg .admin-table tbody tr')).filter((tr) => getComputedStyle(tr).display === 'grid').length,
        tableRows: document.querySelectorAll('main .admin-table tbody tr').length,
      }));
      if (errors.length) bad.error.push(`${route}: ${errors[0].slice(0, 80)}`);
      if (!m.h1 || !m.head) bad.head.push(route);
      if (m.over > 0) bad.over.push(`${route} (+${m.over}px)`);
      if (m.nativeDate) bad.date.push(`${route} (${m.nativeDate})`);
      if (viewport.width === 390 && m.tableRows && m.cardRows !== m.tableRows) bad.table.push(`${route} (${m.cardRows}/${m.tableRows} kart)`);
      if (viewport.width === 390) await page.screenshot({ path: `${OUT}/screens-390-${route.replace(/^\/admin\/?/, '').replace(/[^a-z0-9]+/gi, '_') || 'kokpit'}.png`, fullPage: false });
      await page.close();
    }
    const w = viewport.width;
    check(`${w}px: ${routes.length} ekran sayfa hatası olmadan açılıyor`, bad.error.length === 0, bad.error.join(' | '));
    check(`${w}px: her ekranda panel başlığı (Yoca başlık düzeni)`, bad.head.length === 0, bad.head.join(', '));
    check(`${w}px: hiçbir ekran yatay kaymıyor`, bad.over.length === 0, bad.over.join(', '));
    check(`${w}px: tarih alanları Türkçe koyu takvim (yerel tarih girişi yok)`, bad.date.length === 0, bad.date.join(', '));
    if (w === 390) check('390px: tablo satırları telefonda kart', bad.table.length === 0, bad.table.join(', '));
    await ctx.close();
  }

  // dialog: opens, Escape-free close via Vazgeç, focus back on the opener
  {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/documents`); await page.waitForTimeout(2500);
    const opener = page.getByRole('button', { name: '+ Yeni belge' }).first();
    await opener.click();
    const dlg = page.locator('[role="dialog"][aria-modal="true"]');
    const box = await dlg.locator('.admin-dialog').boundingBox();
    check('Yeni belge penceresi panel diliyle açılıyor (admin-dialog)', (await dlg.count()) === 1 && Boolean(box) && box.width <= 560);
    await dlg.getByRole('button', { name: 'Vazgeç' }).click();
    check('Vazgeç pencereyi kapatıyor', (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 0);
    await ctx.close();
  }

  // date field: Turkish dark calendar, Escape closes and returns focus to its button
  {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/ops/services`); await page.waitForTimeout(2500);
    const btn = page.getByRole('button', { name: 'Bitiş (başlangıç): takvimi aç' });
    await btn.click();
    const cal = page.getByTestId('date-dialog');
    const title = await cal.locator('[aria-live="polite"]').textContent();
    check('Filtre tarihinde Türkçe takvim açılıyor', /Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık/.test(title ?? ''), title);
    await page.keyboard.press('Escape');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check('Escape takvimi kapatıyor, odak takvim düğmesine dönüyor', (await cal.count()) === 0 && focused === 'Bitiş (başlangıç): takvimi aç', String(focused));
    await page.getByRole('button', { name: 'Bitiş (başlangıç): takvimi aç' }).click();
    await page.getByTestId('date-dialog').getByRole('button', { name: 'Bugün', exact: true }).click();
    await page.waitForTimeout(400);
    check('Tarih seçimi adres çubuğundaki filtreye yazılıyor', /[?&]from=\d{4}-\d{2}-\d{2}/.test(page.url()), page.url());
    const input = page.getByLabel('Bitiş (başlangıç) (gg.aa.yyyy)');
    await input.fill(''); await input.press('Tab'); await page.waitForTimeout(400);
    check('Tarih silinince filtre kalkıyor', !/[?&]from=/.test(page.url()), page.url());
    await ctx.close();
  }

  // Hizmetler on a phone: search stays visible, the long filter group folds behind "Filtreler"
  {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 390, height: 844 });
    await page.goto(`${BASE}/admin/ops/services`); await page.waitForTimeout(2500);
    const toggle = page.locator('button[aria-controls="hizmet-filtreler"]');
    const box = page.locator('#hizmet-filtreler');
    const search = page.getByLabel('Hizmet ara');
    check('390px Hizmetler: arama görünür, filtre grubu kapalı', (await search.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false' && !(await box.isVisible()));
    await toggle.click();
    check('390px Hizmetler: “Filtreler” açılınca grup görünüyor', (await toggle.getAttribute('aria-expanded')) === 'true' && (await box.isVisible()));
    await page.goto(`${BASE}/admin/ops/services?status=active`); await page.waitForTimeout(2500);
    const label = (await page.locator('button[aria-controls="hizmet-filtreler"]').textContent()) ?? '';
    check('390px Hizmetler: kapalıyken etkin filtre sayısı ve adı görünüyor', /Filtreler · 1: Hizmet durumu/.test(label) && !(await page.locator('#hizmet-filtreler').isVisible()), label);
    await ctx.close();
  }
  // Hizmetler 1440: the desktop filter group is not folded
  {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/ops/services`); await page.waitForTimeout(2500);
    check('1440px Hizmetler: filtre grubu açık, katlama düğmesi yok', (await page.locator('#hizmet-filtreler').isVisible()) && !(await page.locator('button[aria-controls="hizmet-filtreler"]').isVisible()));
    // missing label names the record field when the shown date is the open period's
    const row = page.locator('main tr', { hasText: 'TEST E-posta paketi' }).first();
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    check('Eksik etiketi hangi alanın eksik olduğunu söylüyor (hizmet kaydı bitişi; gösterilen tarih açık dönemin)', /Hizmet kaydında bitiş tarihi/.test(rowText) && /açık dönemin bitişi/.test(rowText), rowText.slice(0, 200));
    const dom = (await page.locator('main tr', { hasText: 'TEST kuzey-anadolu' }).first().innerText()).replace(/\s+/g, ' ');
    check('Kayıt ve dönem bitişi aynı olan hizmette bitiş eksiği yok', !/bitiş tarihi/i.test(dom), dom.slice(0, 200));
    // CSV preview (client-side only, nothing is created): wide preview scrolls inside its own frame
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'CSV içe aktar' }).first().click();
    await page.locator('section[aria-label="CSV içe aktar"] input[type="file"]').setInputFiles({ name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from('name,kind,note\nTEST önizleme-alan-adi.test,domain,Yalnız önizleme\n') });
    await page.waitForTimeout(800);
    const region = page.getByRole('region', { name: /İçe aktarma önizlemesi/ });
    const r = await region.evaluate((el) => ({ label: el.getAttribute('aria-label'), tab: el.tabIndex, sw: el.scrollWidth, cw: el.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth })).catch((e) => ({ err: e.message }));
    check('İç tablo kendi alanında yana kayıyor; alan odaklanabilir ve “yana kaydırılabilir” diye adlandırılmış; sayfa taşmıyor', r.sw > r.cw && r.tab === 0 && /yana kaydırılabilir/.test(r.label ?? '') && r.page <= 0, JSON.stringify(r));
    check('Kaydırma ipucu görünüyor', await page.getByText('↔ Tablo yana kaydırılabilir').first().isVisible());
    await ctx.close();
  }

  // Insights scheduling: dark date field + hour/minute; preview top bar in the shared look
  if (ids.insight) {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/insights/${ids.insight}`); await page.waitForTimeout(3500);
    await page.getByRole('button', { name: 'Yayın', exact: true }).click(); await page.waitForTimeout(400);
    const group = page.getByRole('group', { name: 'Zamanla (yerel saat)' });
    check('Zamanlama alanı görünür; yerel tarih-saat girişi yok', (await group.isVisible()) && (await page.locator('main input[type="datetime-local"]').count()) === 0);
    const btn = page.getByRole('button', { name: 'Zamanla', exact: true });
    await group.getByLabel('Zamanla (yerel saat): tarih (gg.aa.yyyy)').fill('15.01.2031');
    await group.getByLabel('Zamanla (yerel saat): tarih (gg.aa.yyyy)').press('Tab');
    const onlyDate = await btn.isDisabled();
    await group.getByLabel('Zamanla (yerel saat): saat').selectOption('09');
    const noMinute = await btn.isDisabled();
    await group.getByLabel('Zamanla (yerel saat): dakika').selectOption('30');
    check('Zamanla yalnız tarih, saat ve dakika birlikte seçilince etkin', onlyDate && noMinute && !(await btn.isDisabled()), `${onlyDate}/${noMinute}`);
    // the confirm text shows the local value the field emits; dismissing it sends nothing
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
    await btn.click(); await page.waitForTimeout(400);
    check('Alan yerel değeri eski biçimde veriyor (2031-01-15 09:30), onay reddedilince işlem yok', asked.includes('2031-01-15 09:30 için zamanlansın'), asked);
    check('Takvim düğmesi koyu Türkçe tarih bileşeninden', (await group.getByRole('button', { name: 'Zamanla (yerel saat): tarih: takvimi aç' }).count()) === 1);
    await page.getByRole('button', { name: 'Önizle', exact: true }).first().click(); await page.waitForTimeout(800);
    const dlg = page.getByRole('dialog', { name: 'Önizleme' });
    const seg = dlg.getByRole('group', { name: 'Önizleme genişliği' });
    const mobile = seg.getByRole('button', { name: 'Mobil (390 px)' });
    await mobile.click();
    const bar = await dlg.evaluate((el) => ({ tabs: el.querySelectorAll('.admin-tabs .admin-tab').length, primary: Boolean(el.querySelector('.admin-btn-primary')) }));
    check('Önizleme üst çubuğu ortak görünümde (sekme grubu + birincil Kapat)', bar.tabs === 2 && bar.primary && (await mobile.getAttribute('aria-pressed')) === 'true', JSON.stringify(bar));
    await dlg.getByRole('button', { name: 'Kapat' }).click();
    check('Önizleme Kapat ile kapanıyor', (await page.getByRole('dialog', { name: 'Önizleme' }).count()) === 0);
    await ctx.close();
  }

  // finance user: Finans screens only (role limits unchanged)
  {
    const { ctx, page } = await login(browser, 'finance@test.local', 'itest-finance-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/finance/income`); await page.waitForTimeout(2500);
    const ok = await page.locator('main h1', { hasText: 'Gelirler' }).count();
    const groups = await page.locator('aside nav').textContent();
    check('Finans kullanıcısı Gelirler ekranını görüyor', ok === 1);
    check('Finans kullanıcısının menüsünde yalnız Finans grubu', !/Operasyon|Site içeriği|Sistem/.test(groups ?? ''), groups);
    await page.goto(`${BASE}/admin/ops/services`); await page.waitForTimeout(2500);
    check('Finans kullanıcısı Operasyon ekranını açamıyor', (await page.locator('main h1', { hasText: 'Hizmetler ve varlıklar' }).count()) === 0);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
