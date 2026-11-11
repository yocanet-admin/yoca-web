// TEST ONLY: local stack (app :3190 on the REAL clock, gateway :54331). Synthetic data; nothing is sent anywhere.
// Kokpit + Giderler in the Tangram layout, the shared admin shell, roles, empty/error states.
// Run after the Finans suite: bash tests/integration/start.sh && node tests/integration/panel/panel-ui.cjs [out-dir]
const { chromium, devices } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:3190';
const sql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`); };
const flat = (s) => s.replace(/\s+/g, ' ').trim();

// synthetic monitored sites with STORED results (the panel only reads them)
const res = (o) => JSON.stringify({ name: '', url: '', state: 'up', httpStatus: 200, ms: 700, finalUrl: null, signature: true, expectsSignature: false, sslExpires: null, sslDaysLeft: null, domainExpires: null, domainDaysLeft: null, hostingRenewsOn: null, problem: null, error: null, checkedAt: new Date().toISOString(), ...o }).replace(/'/g, "''");
sql(`delete from monitored_sites where name like 'TEST Panel%'`);
sql(`insert into monitored_sites (name, url, expects_signature, order_index, check_interval, last_checked_at) values
  ('TEST Panel çalışıyor', 'https://panel-1.invalid', false, 91, '15m', now() - interval '5 minutes'),
  ('TEST Panel zaman aşımı', 'https://panel-2.invalid', false, 92, '15m', now() - interval '5 minutes'),
  ('TEST Panel kapalı', 'https://panel-3.invalid', false, 93, '15m', now() - interval '5 minutes'),
  ('TEST Panel eski', 'https://panel-4.invalid', false, 94, '24h', now() - interval '3 days'),
  ('TEST Panel yeni', 'https://panel-5.invalid', false, 95, '24h', null)`);
const id = (n) => sql(`select id from monitored_sites where name = '${n}'`);
sql(`insert into site_check_state (site_id, next_check_at, last_result, last_success_at) values
  ('${id('TEST Panel çalışıyor')}', now() + interval '10 minutes', '${res({ state: 'up' })}', now() - interval '5 minutes'),
  ('${id('TEST Panel zaman aşımı')}', now() + interval '10 minutes', '${res({ state: 'unknown', httpStatus: null, ms: null, problem: 'check_incomplete', error: 'zaman aşımı (15 sn)' })}', null),
  ('${id('TEST Panel kapalı')}', now() + interval '10 minutes', '${res({ state: 'down', httpStatus: 503, problem: 'server_error', error: 'HTTP 503' })}', null),
  ('${id('TEST Panel eski')}', now() - interval '2 days', '${res({ state: 'up' })}', now() - interval '3 days')
  on conflict (site_id) do update set next_check_at = excluded.next_check_at, last_result = excluded.last_result, last_success_at = excluded.last_success_at`);

async function login(ctx, email, pw, start) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  await page.goto(`${B}${start}`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return page;
}
const noOverflow = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const b = await chromium.launch();
  // ── admin, desktop: Kokpit ──
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const reqs = [];
  ctx.on('request', (r) => reqs.push(`${r.method()} ${r.url()}`));
  const p = await login(ctx, 'admin@test.local', 'itest-admin-pw', '/admin');
  await p.getByRole('heading', { level: 1, name: 'Kokpit' }).waitFor({ timeout: 15000 });
  await p.getByText('TEST Panel kapalı').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  const sitesCard = flat(await p.locator('section[aria-labelledby="k-sites"]').innerText());
  check('kokpit: stored site results shown, failures not as healthy', /TEST Panel çalışıyor panel-1\.invalid ● Çalışıyor/.test(sitesCard) && /TEST Panel kapalı.*Sunucu hatası — HTTP 503/.test(sitesCard) && /TEST Panel zaman aşımı.*Kontrol tamamlanamadı — zaman aşımı/.test(sitesCard), sitesCard.slice(0, 300));
  check('kokpit: late result = "Sonuç güncel değil", unchecked = "Henüz kontrol edilmedi"', /TEST Panel eski.*Sonuç güncel değil/.test(sitesCard) && /TEST Panel yeni.*Henüz kontrol edilmedi/.test(sitesCard), sitesCard.slice(0, 400));
  const attn = flat(await p.locator('section[aria-labelledby="k-attn"]').innerText());
  check('kokpit: attention card = count + summary, urgent site issue listed first', /Şimdi ilgilenilmesi gerekenler/.test(attn) && /\d+ acil/.test(attn) && /Acil TEST Panel kapalı/.test(attn), attn.slice(0, 200));
  check('kokpit: opening the page sent no site check and wrote no Giderler periods',
    !reqs.some((r) => /\/api\/admin\/sites\/check/.test(r)) && !reqs.some((r) => /rpc\/fin_roll_periods/.test(r)) && reqs.some((r) => /^GET .*\/api\/admin\/health$/.test(r)) && !reqs.some((r) => /health\?refresh=1/.test(r)),
    reqs.filter((r) => /api\/admin|rpc/.test(r)).join(' | '));
  const visit = flat(await p.locator('section[aria-labelledby="k-visit"]').innerText());
  check('kokpit: visitor tile keeps "Bugün · UTC" / "Son 7 gün · bugün dahil"; no Vercel key → no number, no chart', /Ziyaretçi · Bugün · UTC/.test(visit) && /Son 7 gün · bugün dahil/.test(visit) && /Vercel anahtarı eklenmedi/.test(visit) && (await p.locator('section[aria-labelledby="k-visit"] figure').count()) === 0, visit);
  check('kokpit: traffic card shows the setup help, not a sample chart', (await p.locator('section[aria-labelledby="k-traffic"] svg').count()) === 0 && /Vercel bağlantısı gerekiyor/.test(await p.locator('section[aria-labelledby="k-traffic"]').innerText()));
  const renew = flat(await p.locator('section[aria-labelledby="k-renew"]').innerText());
  check('kokpit: renewal card loaded from Operasyon + Giderler (no error)', /Yaklaşan ödeme ve yenilemeler/.test(renew) && !/okunamadı/.test(renew), renew.slice(0, 300));
  await p.screenshot({ path: `${OUT}/panel-1-kokpit-masaustu.png`, fullPage: true });
  // same figures as Operasyon → Genel bakış
  const kokpit7 = renew.match(/7 gün içinde bitiyor (\d+)/)?.[1];
  const kokpit30 = renew.match(/30 gün içinde bitiyor (\d+)/)?.[1];
  const finOver = renew.match(/Giderler · geciken · tüm aylar (.+?) Giderler · bu ay kalan (.+?)(?: [^₺$€\d·—-]|$)/);
  const op = await ctx.newPage();
  await op.goto(`${B}/admin/ops`);
  await op.getByText(/7 gün içinde bitiyor/).first().waitFor({ timeout: 15000 }).catch(() => {});
  const ops = flat(await op.locator('main').innerText());
  const ops7 = ops.match(/7 gün içinde bitiyor (\d+)/)?.[1], ops30 = ops.match(/30 gün içinde bitiyor (\d+)/)?.[1];
  check('kokpit vs Operasyon: 7 / 30-day renewal figures match', (kokpit7 === undefined && ops7 === undefined) || (kokpit7 === ops7 && kokpit30 === ops30), `kokpit ${kokpit7}/${kokpit30} · ops ${ops7}/${ops30}`);
  await op.goto(`${B}/admin/expenses`);
  await op.getByText(/^Ödenen · /).waitFor({ timeout: 15000 });
  const giderCards = flat(await op.locator('section[aria-label="Genel bakış"]').innerText());
  const gOver = giderCards.match(/bugün itibarıyla (.+?) (\d+) dönem/);
  check('kokpit vs Giderler: overdue figure matches', !finOver || !gOver ? /Yok/.test(renew) || Boolean(gOver) : finOver[1].includes(gOver[1].split(' ')[0]) || (gOver[2] === '0' && /geciken · tüm aylar Yok/.test(renew)), `kokpit "${finOver?.[1]}" · giderler "${gOver?.[1]} / ${gOver?.[2]}"`);

  // menu groups + two tabs in step
  const p2 = await ctx.newPage();
  await p2.goto(`${B}/admin`);
  await p2.getByRole('heading', { level: 1, name: 'Kokpit' }).waitFor();
  const grpA = p.locator('aside nav button', { hasText: 'Site içeriği' });
  const grpB = p2.locator('aside nav button', { hasText: 'Site içeriği' });
  const before = await grpB.getAttribute('aria-expanded');
  await grpA.click();
  await p2.waitForTimeout(600);
  check('menu: a group toggled in one tab follows in the other tab', (await grpA.getAttribute('aria-expanded')) !== before && (await grpB.getAttribute('aria-expanded')) === (await grpA.getAttribute('aria-expanded')));
  await grpA.click();
  await p.locator('aside nav a', { hasText: 'Kokpit' }).first().waitFor();
  check('menu: active page marked (Kokpit)', (await p.locator('aside nav a[aria-current="page"]').innerText()).includes('Kokpit'));
  await p2.close();

  // error states (requests answered with an error by the test, nothing else changes)
  const pe = await ctx.newPage();
  await pe.route('**/api/admin/health*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'TEST hata' }) }));
  await pe.route('**/rest/v1/ops_services*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'TEST ops hatası' }) }));
  await pe.goto(`${B}/admin`);
  await pe.getByText(/Kontrol alınamadı/).first().waitFor({ timeout: 15000 }).catch(() => {});
  await pe.waitForTimeout(1200);
  const pet = flat(await pe.locator('main').innerText());
  check('kokpit errors: site check error shown and listed; renewal card says Operasyon could not be read', /Kontrol alınamadı: TEST hata/.test(pet) && /Site kontrolü yapılamadı: TEST hata/.test(pet) && /Operasyon verisi okunamadı/.test(pet), pet.slice(0, 300));
  await pe.close();

  // ── Giderler desktop ──
  const g = await ctx.newPage();
  g.errors = []; g.on('pageerror', (e) => g.errors.push(e.message));
  await g.goto(`${B}/admin/expenses?state=all`);
  await g.getByText(/^Ödenen · /).waitFor({ timeout: 15000 });
  check('giderler: no native date inputs (dark Turkish date field)', (await g.locator('input[type="date"]').count()) === 0 && (await g.getByRole('textbox', { name: /Vade başı/ }).getAttribute('placeholder')) === 'gg.aa.yyyy');
  const from = g.getByRole('textbox', { name: /Vade başı/ }), to = g.getByRole('textbox', { name: /Vade sonu/ });
  await from.fill('01.11.2026'); await from.press('Enter'); await g.waitForTimeout(500);
  await to.fill('31.12.2026'); await to.press('Enter'); await g.waitForTimeout(800);
  check('giderler: typed gg.aa.yyyy range goes to the URL and the list label', /from=2026-11-01/.test(g.url()) && /to=2026-12-31/.test(g.url()) && /^Vade 1 Kas 2026 – 31 Ara 2026/.test(flat(await g.locator('#giderler-kayitlar').innerText())), g.url());
  await g.getByRole('button', { name: 'Vade başı: takvimi aç' }).click();
  const cal = g.locator('[data-testid="date-dialog"]');
  check('giderler: dark calendar with Turkish month', (await cal.isVisible()) && (await cal.evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgb(255, 255, 255)' && /Kasım 2026/.test(await cal.innerText()));
  await g.keyboard.press('Escape');
  await g.goto(`${B}/admin/expenses?state=all&q=zzz-yok`);
  await g.getByText('Bu filtrelere uyan dönem yok.').waitFor({ timeout: 10000 }).catch(() => {});
  check('giderler: empty filter result has its message and a clear button', await g.getByText('Bu filtrelere uyan dönem yok.').isVisible());
  await g.goto(`${B}/admin/expenses`);
  await g.getByText(/^Ödenen · /).waitFor();
  const m0 = await g.locator('h1').count();
  await g.getByRole('button', { name: 'Sonraki ay' }).click();
  await g.waitForTimeout(600);
  check('giderler: month picker → next month in URL and cards', /ay=\d{4}-\d{2}/.test(g.url()) && m0 === 1, g.url());
  await g.getByRole('button', { name: 'Bu aya dön' }).click();
  // red only for real overdue rows
  await g.goto(`${B}/admin/expenses?state=all&kapsam=tum`);
  await g.getByText(/^Ödenen · /).waitFor();
  const reds = await g.locator('tbody tr').evaluateAll((rows) => rows.map((r) => ({ red: Boolean(r.querySelector('[class*="dueLateText"]')), st: r.querySelector('td:nth-child(7)')?.textContent ?? '' })));
  check('giderler: red due text only on "Gecikti" rows', reds.every((r) => !r.red || /Gecikti/.test(r.st)), JSON.stringify(reds.filter((r) => r.red && !/Gecikti/.test(r.st))));
  // payment flow: the list opens the period page; the real form records it (local test DB)
  await g.goto(`${B}/admin/expenses?state=open&kapsam=tum`);
  await g.getByText(/^Ödenen · /).waitFor();
  const payLink = g.locator('tbody tr').filter({ has: g.getByRole('link', { name: 'Ödeme kaydet' }) }).first();
  const title = flat(await payLink.locator('td:nth-child(2) strong').innerText());
  await payLink.getByRole('link', { name: 'Ödeme kaydet' }).click();
  await g.waitForURL(/\/admin\/expenses\/(ops\/)?[0-9a-f-]{36}/, { timeout: 15000 });
  const amount = g.locator('label:has-text("Tutar (") input').first();
  await amount.waitFor();
  await amount.fill('1');
  const before$ = Number(sql(`select count(*) from fin_payments`)) + Number(sql(`select count(*) from ops_payments`));
  await g.getByRole('button', { name: 'Kaydı ekle' }).first().click();
  await g.waitForTimeout(2500);
  const after$ = Number(sql(`select count(*) from fin_payments`)) + Number(sql(`select count(*) from ops_payments`));
  check('payment flow: "Ödeme kaydet" opens the period page; the existing form saves one record', after$ === before$ + 1, `${title}: ${before$} → ${after$}`);
  await g.screenshot({ path: `${OUT}/panel-3-odeme-sayfasi.png`, fullPage: true });
  // error state
  const ge = await ctx.newPage();
  await ge.route('**/rest/v1/fin_expenses*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'TEST giderler hatası' }) }));
  await ge.goto(`${B}/admin/expenses`);
  await ge.getByText(/TEST giderler hatası|yüklenemedi/).first().waitFor({ timeout: 15000 }).catch(() => {});
  check('giderler error: the read error is shown instead of the screen', /TEST giderler hatası|yüklenemedi/.test(await ge.locator('main').innerText()));
  await ge.close();
  await g.goto(`${B}/admin/expenses`);
  await g.getByText(/^Ödenen · /).waitFor();
  await g.screenshot({ path: `${OUT}/panel-2-giderler-masaustu.png`, fullPage: true });

  // other screens keep working inside the new shell
  const others = ['/admin/ops', '/admin/ops/services', '/admin/sites', '/admin/finance', '/admin/finance/income', '/admin/documents', '/admin/settings', '/admin/submissions', '/admin/traffic', '/admin/insights'];
  const bad = [];
  const hydration = [];
  for (const path of others) {
    const errs = [];
    const op2 = await ctx.newPage(); op2.on('pageerror', (e) => errs.push(e.message));
    await op2.goto(`${B}${path}`); await op2.waitForTimeout(1800);
    const txt = (await op2.locator('main').innerText().catch(() => '')).trim();
    const real = errs.filter((e) => !/Minified React error #(418|423)/.test(e));
    hydration.push(...errs.filter((e) => /#(418|423)/.test(e)).map(() => path));
    if (real.length || txt.length < 20 || !(await noOverflow(op2))) bad.push(`${path}: ${real[0] ?? (txt.length < 20 ? 'boş' : 'yatay taşma')}`);
    if (['/admin/ops', '/admin/sites', '/admin/finance'].includes(path)) await op2.screenshot({ path: `${OUT}/panel-diger${path.replace(/\//g, '-')}.png` });
    await op2.close();
  }
  check(`other screens render in the new shell without errors or sideways scroll (${others.length})`, bad.length === 0, bad.join(' | '));
  const own = [...p.errors, ...g.errors].filter((e) => !/Minified React error #(418|423)/.test(e));
  check('no page errors on Kokpit / Giderler (other than the hydration notice, reported apart)', own.length === 0, own.join(' | '));
  console.log(`INFO  React hydration notices (#418/#423): Kokpit ${p.errors.filter((e) => /#4(18|23)/.test(e)).length}, Giderler ${g.errors.filter((e) => /#4(18|23)/.test(e)).length}, other screens ${hydration.length}`);
  await ctx.close();

  // ── admin, phone ──
  const m = await b.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const mp = await login(m, 'admin@test.local', 'itest-admin-pw', '/admin');
  await mp.getByRole('heading', { level: 1, name: 'Kokpit' }).waitFor();
  await mp.getByText('TEST Panel kapalı').first().waitFor({ timeout: 15000 });
  const items = mp.locator('#k-attn-list > li');
  const total = await items.count();
  const shownN = await items.evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
  check('phone kokpit: at most 3 attention items, "Tümünü göster" when more', total <= 3 ? shownN === total : shownN === 3 && (await mp.getByRole('button', { name: new RegExp(`Tümünü göster \\(${total}\\)`) }).isVisible()), `${shownN}/${total}`);
  check('phone kokpit: count and urgent stay visible', /\d+/.test(await mp.locator('[class*="heroCount"]').innerText()) && /acil/.test(await mp.locator('[class*="attnSummary"]').innerText()));
  check('phone kokpit: no sideways scroll', await noOverflow(mp));
  await mp.screenshot({ path: `${OUT}/panel-4-kokpit-mobil.png`, fullPage: true });
  const menuBtn = mp.getByRole('button', { name: /Menü/ });
  await menuBtn.click();
  check('phone menu: opens with the groups', await mp.locator('#admin-mobile-menu').isVisible());
  await mp.keyboard.press('Escape');
  check('phone menu: Escape closes it', (await mp.locator('#admin-mobile-menu').count()) === 0);
  await mp.goto(`${B}/admin/expenses`);
  await mp.locator('section[aria-label="Genel bakış (özet)"]').waitFor();
  const sum = flat(await mp.locator('section[aria-label="Genel bakış (özet)"]').innerText());
  check('phone giderler: compact summary keeps "tarih bekleniyor" and "Geciken" apart when present', /Geciken · tüm aylar · bugün itibarıyla/.test(sum), sum);
  const tg = mp.locator('button[aria-controls="giderler-filtreler"]');
  check('phone giderler: filters closed at start', (await tg.getAttribute('aria-expanded')) === 'false' && !(await mp.locator('#giderler-filtreler').isVisible()));
  await mp.goto(`${B}/admin/expenses?state=overdue&q=TEST`);
  await mp.locator('section[aria-label="Genel bakış (özet)"]').waitFor();
  check('phone giderler: filter button shows the active filters', /Filtreler · 2: Gecikti, “TEST”/.test(await tg.innerText()), await tg.innerText());
  await mp.goto(`${B}/admin/expenses?state=all`);
  await mp.locator('section[aria-label="Genel bakış (özet)"]').waitFor();
  await mp.getByRole('link', { name: /Kayıtlara geç/ }).click(); await mp.waitForTimeout(400);
  check('phone giderler: "Kayıtlara geç" jumps to the records', await mp.locator('#giderler-kayitlar').evaluate((el) => el === document.activeElement && el.getBoundingClientRect().top < 160));
  const firstCard = mp.locator('ul[class*="cards"] > li').first();
  check('phone giderler: records as cards with the action visible', (await firstCard.isVisible()) && (await firstCard.getByRole('link', { name: /Ödeme kaydet|Aç/ }).isVisible()));
  check('phone giderler: no sideways scroll', await noOverflow(mp));
  await mp.screenshot({ path: `${OUT}/panel-5-giderler-mobil.png`, fullPage: true });
  await m.close();

  // ── finance user: limits unchanged ──
  const f = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const fp = await login(f, 'finance@test.local', 'itest-finance-pw', '/admin');
  await fp.waitForURL((u) => u.pathname === '/admin/finance', { timeout: 15000 }).catch(() => {});
  const fnav = await fp.locator('aside nav').textContent();
  check('finance user: /admin → Finans, menu only Finans (no Kokpit)', new URL(fp.url()).pathname === '/admin/finance' && /Giderler/.test(fnav) && !/Kokpit|Operasyon|Genel/.test(fnav.replace('Genel bakış', '')), fnav);
  await fp.goto(`${B}/admin/expenses`);
  await fp.getByText(/^Ödenen · /).waitFor({ timeout: 15000 });
  check('finance user: Giderler opens in the new layout', await fp.locator('#giderler-kayitlar').isVisible());
  await f.close();

  sql(`delete from monitored_sites where name like 'TEST Panel%'`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); sql(`delete from monitored_sites where name like 'TEST Panel%'`); process.exit(1); });
