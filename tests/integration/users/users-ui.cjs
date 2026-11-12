// TEST ONLY: local stack (app :3190, gateway :54331). Sistem → Kullanıcılar, invite page, editor shell,
// live role change / closed access in an open panel, and Operasyon ayarları with missing configuration.
// Run after setup-db.sh + build + start.sh (users-e2e.mts may run before; this suite resets what it uses):
//   NODE_PATH=tests/integration/node_modules node tests/integration/users/users-ui.cjs [out-dir]
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3190';
const GW = 'http://127.0.0.1:54331';
const PW = 'Mavi-Liman-2026-Defter';
const sql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  — ${detail}` : ''}`); };
const over = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function lastToken(to) {
  const list = await (await fetch(`${GW}/capture/list`)).json();
  const html = list.filter((m) => m.path === '/capture/resend' && (m.body?.to ?? []).includes(to)).at(-1)?.body?.html ?? '';
  return /\/admin\/davet#t=([A-Za-z0-9_-]{43})/.exec(html)?.[1] ?? null;
}
async function login(browser, email, pw, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return { ctx, page };
}

(async () => {
  await fetch(`${GW}/capture/reset?users=1`);
  sql(`set session_replication_role = replica; delete from admin_invites; delete from admin_users where email not in ('admin@test.local', 'finance@test.local', 'editor@test.local');
       insert into admin_users (email, note, role, name) values ('editor@test.local', 'TEST içerik editörü', 'editor', 'TEST Editör') on conflict (email) do update set role = 'editor', status = 'active', disabled_at = null;`);
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

  // ── Admin: list + invite dialog (desktop), cards (phone)
  {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/users`); await page.waitForTimeout(2500);
    const menu = await page.locator('aside nav').textContent();
    check('admin: Sistem → Kullanıcılar in the menu; page in the panel layout', /Kullanıcılar/.test(menu ?? '') && (await page.locator('main h1', { hasText: 'Kullanıcılar' }).count()) === 1 && (await page.locator('main .admin-head').count()) === 1);
    const rowsText = await page.locator('main table').innerText();
    check('admin: list shows name, e-mail, role and account state', /admin@test\.local/.test(rowsText) && /Finans sorumlusu/.test(rowsText) && /İçerik editörü/.test(rowsText) && /Etkin/.test(rowsText));
    check('admin: own row has no actions (“Kendi hesabınız…”)', (await page.locator('tr', { hasText: 'admin@test.local' }).getByRole('button').count()) === 0);
    const opener = page.getByRole('button', { name: '+ Kullanıcı davet et' });
    await opener.click();
    const dlg = page.locator('[role="dialog"][aria-modal="true"]');
    check('invite dialog: opens with name, e-mail and the three roles', (await dlg.count()) === 1 && (await dlg.getByRole('radio').count()) === 3);
    await dlg.getByRole('button', { name: 'Daveti gönder' }).click();
    check('invite dialog: missing fields are explained, nothing sent', /Ad girin/.test(await dlg.innerText()) && sql(`select count(*) from admin_users`) === '3');
    await dlg.getByLabel('Ad soyad').fill('TEST UI Editör');
    await dlg.getByLabel('E-posta').fill('ui.editor@test.local');
    await dlg.getByRole('radio', { name: /İçerik editörü/ }).check();
    await dlg.getByRole('button', { name: 'Daveti gönder' }).click();
    await page.waitForTimeout(1500);
    const flash = await page.locator('main').innerText();
    check('invite: success only after the e-mail service accepted it; row “Davet bekliyor”', (await dlg.count()) === 0 && /adresine davet gönderildi/.test(flash) && /Davet bekliyor/.test(await page.locator('tr', { hasText: 'ui.editor@test.local' }).innerText()));
    // failed send stays visible as failed (never as sent)
    await opener.click();
    await dlg.getByLabel('Ad soyad').fill('TEST UI Gönderilemez');
    await dlg.getByLabel('E-posta').fill('fail4xx@test.local');
    await dlg.getByRole('radio', { name: /Finans sorumlusu/ }).check();
    await dlg.getByRole('button', { name: 'Daveti gönder' }).click();
    await page.waitForTimeout(1500);
    check('invite: a failed send shows an error in the dialog and “Davet gönderilemedi” in the list', /gönderilemedi/.test(await dlg.innerText()) && /Davet gönderilemedi/.test(await page.locator('tr', { hasText: 'fail4xx@test.local' }).innerText()));
    await dlg.getByRole('button', { name: 'Vazgeç' }).click();
    // cancel the failed one through the confirm dialog
    await page.locator('tr', { hasText: 'fail4xx@test.local' }).getByRole('button', { name: 'Daveti iptal et' }).click();
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Daveti iptal et' }).click();
    await page.waitForTimeout(1200);
    check('cancel: confirm dialog → invite removed from the list', (await page.locator('tr', { hasText: 'fail4xx@test.local' }).count()) === 0);
    await page.screenshot({ path: `${OUT}/users-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
    const cards = await page.evaluate(() => Array.from(document.querySelectorAll('main .admin-table tbody tr')).filter((tr) => getComputedStyle(tr).display === 'grid').length);
    check('390px: users as cards, no sideways scroll', cards === 4 && (await over(page)) <= 0, `cards=${cards} over=${await over(page)}`);
    await page.locator('tr', { hasText: 'finance@test.local' }).getByRole('button', { name: 'Rolü değiştir' }).click();
    const box = await page.locator('.admin-dialog').boundingBox();
    check('390px: role dialog fits the screen', Boolean(box) && box.x >= 0 && box.x + box.width <= 390);
    await page.keyboard.press('Escape');
    check('dialog: Escape closes it', (await page.locator('[role="dialog"]').count()) === 0);
    await page.screenshot({ path: `${OUT}/users-390.png`, fullPage: true });
    await ctx.close();
  }

  // ── Invite page (phone): set own password, token leaves the address bar
  {
    const token = await lastToken('ui.editor@test.local');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/davet#t=${token}`); await page.waitForTimeout(2000);
    check('invite page: no session needed; shows name, e-mail, role; token removed from the address bar', /ui\.editor@test\.local/.test(await page.locator('main').innerText()) && /İçerik editörü/.test(await page.locator('main').innerText()) && !page.url().includes('#t=') && (await page.locator('aside nav').count()) === 0);
    await page.getByLabel('Yeni şifre', { exact: true }).fill('kisa');
    await page.getByLabel('Yeni şifre (tekrar)').fill('kisa');
    await page.getByRole('button', { name: /Şifremi kaydet/ }).click();
    check('invite page: weak password explained', /en az 10/.test(await page.locator('main').innerText()));
    await page.getByLabel('Yeni şifre', { exact: true }).fill(PW);
    await page.getByLabel('Yeni şifre (tekrar)').fill(PW);
    await page.getByRole('button', { name: /Şifremi kaydet/ }).click();
    await page.waitForTimeout(1500);
    check('invite page: password saved → account open; 390px no sideways scroll', /Şifren kaydedildi/.test(await page.locator('main').innerText()) && (await over(page)) <= 0);
    await page.screenshot({ path: `${OUT}/davet-390.png`, fullPage: true });
    await page.goto(`${BASE}/admin/davet#t=${token}`); await page.waitForTimeout(1500);
    check('invite page: the same link again → “daha önce kullanıldı”', /daha önce kullanıldı/.test(await page.locator('main').innerText()));
    await page.goto(`${BASE}/admin/davet#t=${'x'.repeat(43)}`); await page.waitForTimeout(1500);
    check('invite page: unknown link → invalid', /geçersiz/.test(await page.locator('main').innerText()));
    await ctx.close();
  }

  // ── Editor shell: only Site içeriği; direct addresses outside it are not rendered
  {
    const { ctx, page } = await login(browser, 'ui.editor@test.local', PW, { width: 1440, height: 900 });
    check('editor: lands on Insights', /\/admin\/insights$/.test(page.url()), page.url());
    const links = await page.locator('aside nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check('editor: menu = Bölümler, Menüler, Metinler, Work, Insights, Ekip only', JSON.stringify(links) === JSON.stringify(['/admin/sections', '/admin/menus', '/admin/content', '/admin/work', '/admin/insights', '/admin/team']), JSON.stringify(links));
    check('editor: role shown as İçerik editörü', /İçerik editörü/.test(await page.locator('aside').innerText()));
    const blocked = [];
    for (const path of ['/admin', '/admin/ops/services', '/admin/finance', '/admin/expenses', '/admin/submissions', '/admin/clients', '/admin/newsletter', '/admin/signature', '/admin/company', '/admin/activity', '/admin/settings', '/admin/users', '/admin/documents']) {
      await page.goto(BASE + path); await page.waitForTimeout(1800);
      if (!/\/admin\/insights$/.test(page.url())) blocked.push(`${path}→${page.url()}`);
    }
    check('editor: every address outside content is sent back to Insights (never rendered)', blocked.length === 0, blocked.join(' | '));
    const opened = [];
    for (const path of ['/admin/sections', '/admin/menus', '/admin/content', '/admin/work', '/admin/work/results', '/admin/team', '/admin/insights/new']) {
      const errors = [];
      page.removeAllListeners('pageerror'); page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(BASE + path); await page.waitForTimeout(2200);
      const h1 = await page.locator('main h1').first().textContent().catch(() => null);
      if (!page.url().endsWith(path) || !h1 || errors.length) opened.push(`${path} h1=${h1} err=${errors[0] ?? ''}`);
    }
    check('editor: all content screens open without errors', opened.length === 0, opened.join(' | '));
    const id = sql(`select id from insights order by created_at limit 1`);
    if (id) {
      await page.goto(`${BASE}/admin/insights/${id}`); await page.waitForTimeout(3000);
      await page.getByRole('button', { name: 'Yayın', exact: true }).click(); await page.waitForTimeout(400);
      check('editor: Insights publish tab without the newsletter (Bülten) box', !(/Bülten \(e-posta\)/.test(await page.locator('main').innerText())) && (await page.getByRole('group', { name: 'Zamanla (yerel saat)' }).count()) === 1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/insights`); await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Menü/ }).click(); await page.waitForTimeout(300);
    const mob = await page.locator('#admin-mobile-menu a').evaluateAll((as) => as.map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/admin')));
    check('editor 390px: phone menu has the same six content links', mob.length === 6 && !mob.includes('/admin'), JSON.stringify(mob));
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });

    // live role change: the open panel follows the database
    sql(`update admin_users set role = 'finance' where email = 'ui.editor@test.local'`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(2500);
    check('role change (open panel): notice shown, moved to Finans, menu = Finans', /\/admin\/finance$/.test(page.url()) && /rolü değişti/.test(await page.locator('main').innerText()) && JSON.stringify(await page.locator('aside nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) === JSON.stringify(['/admin/finance', '/admin/finance/income', '/admin/expenses']), page.url());
    // closed access: the open panel signs out with a clear message
    sql(`update admin_users set status = 'disabled' where email = 'ui.editor@test.local'`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(2500);
    check('closed access (open panel): signed out with “erişimi kapatıldı”', (await page.locator('input[type="password"]').count()) === 1 && /erişimi kapatıldı/.test(await page.locator('body').innerText()));
    await ctx.close();
  }

  // ── Finance: user management not reachable
  {
    const { ctx, page } = await login(browser, 'finance@test.local', 'itest-finance-pw', { width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/users`); await page.waitForTimeout(2000);
    check('finance: /admin/users is never rendered (back to Finans)', /\/admin\/finance$/.test(page.url()) && (await page.locator('main h1', { hasText: 'Kullanıcılar' }).count()) === 0);
    await ctx.close();
  }

  // ── Operasyon ayarları with missing licence configuration (phone)
  {
    const { ctx, page } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 390, height: 844 });
    await page.route('**/api/admin/ops/settings', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      if (body?.environment) body.environment.licenseApi = { configured: false, missing: ['YOCA_LICENSE_API_URL', 'YOCA_LICENSE_API_KEY_ID', 'YOCA_LICENSE_API_SECRET'] };
      await route.fulfill({ response: res, json: body });
    });
    await page.goto(`${BASE}/admin/ops/settings`); await page.waitForTimeout(2500);
    const text = await page.locator('main').innerText();
    check('ops settings 390px: missing licence configuration listed, no sideways scroll', /Bağlı değil/.test(text) && /YOCA_LICENSE_API_SECRET/.test(text) && (await over(page)) <= 0, `over=${await over(page)}`);
    await page.screenshot({ path: `${OUT}/ops-settings-eksik-390.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  await fetch(`${GW}/capture/reset?users=1`);
  sql(`delete from admin_users where email = 'ui.editor@test.local'`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
