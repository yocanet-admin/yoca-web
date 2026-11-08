// TEST ONLY: local stack (app :3190 started with AI_MOCK=1 SEO_FIXTURE=1, gateway :54331). Synthetic data; no request leaves the machine.
// Run (after setup-db.sh + build): start the app with AI_MOCK=1 SEO_FIXTURE=1 SEO_FIXTURE_DELAY_MS=30 HEALTHCHECKS_URL_SEO=http://127.0.0.1:8199/ping/seo,
// then NODE_PATH=tests/integration/node_modules node tests/integration/seo/seo-e2e.cjs [out-dir]
// Note: it rolls v27 back and re-applies it at the end ("migration bekleniyor" check), which resets the SEO tables to the seed.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const OUT = process.argv[2] || process.env.ITEST_OUT || '/tmp/yoca-itest-out';
require('node:fs').mkdirSync(OUT, { recursive: true });
const ROOT = require('node:path').resolve(__dirname, '../../..');
const psql = (args) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', ...args], { encoding: 'utf8' }).trim();
const sql = (q) => psql(['-Atc', q]);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  — ${detail}` : ''}`); };
const captured = () => execFileSync('bash', ['-c', 'wc -l < /var/tmp/yoca-itest-gw/captured.jsonl 2>/dev/null || echo 0'], { encoding: 'utf8' }).trim();
const flat = (s) => s.replace(/\s+/g, ' ').trim();

async function login(browser, email, pw, viewport, start = '/admin/seo') {
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR', deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`http://localhost:3190${start}`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  return { ctx, page, errors };
}
const token = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('yoca-admin-auth') || '{}').access_token || '');
const api = async (page, path, body) => page.evaluate(async ([p, b, t]) => {
  const r = await fetch(p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(b) } : { headers: { Authorization: `Bearer ${t}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [path, body ?? null, await token(page)]);

// cron calls are async: the ping stand-in below runs in this process and must keep serving
const cronCall = async () => (await fetch('http://localhost:3190/api/cron/seo', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();
// local stand-in for Healthchecks (app started with HEALTHCHECKS_URL_SEO=http://127.0.0.1:8199/ping/seo)
const pings = [];
require('node:http').createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { pings.push({ method: req.method, url: req.url, body: b }); res.end('OK'); }); }).listen(8199, '127.0.0.1').unref();

(async () => {
  sql('delete from seo_weekly; delete from seo_audit_runs; delete from seo_pagespeed; delete from seo_ai_suggestions;');
  const before = { insights: sql('select count(*) from insights'), content: sql('select count(*) from site_content'), proposed: sql("select count(*) from seo_keywords where status = 'proposed'") };
  const capBefore = captured();
  const browser = await chromium.launch();

  // ── admin, desktop ──
  const { ctx, page, errors } = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 1000 });
  await page.waitForURL(/\/admin\/seo/);
  await page.getByText('Son kesin veri günü:').waitFor({ timeout: 30000 });
  const nav = flat(await page.locator('aside nav').innerText());
  check('admin menu: SEO right after Trafik in Genel', /Trafik\s*SEO/.test(nav) || /Trafik.{0,4}SEO/.test(nav), nav);
  const main = flat(await page.locator('main').innerText());
  check('Örnek veri badge (fixture adapter)', /Örnek veri/.test(main));
  check('freshness from Search Console: last final day + first incomplete day (verified)', /Son kesin veri günü: \d+ Kas 2026 \(ilk kesinleşmemiş gün \d+ Kas 2026; Search Console yanıtından doğrulandı\)/.test(main), main.slice(0, 500));
  check('zero-data days listed apart from not-final days', /Gösterim olmayan günler \(\d+\): \d+ (Eki|Kas)/.test(main) && !/Henüz kesinleşmemiş günler/.test(main));
  check('comparison shows identical filters', /İki dönemde aynı filtreler: Ülke: Tüm ülkeler · Cihaz: Tüm cihazlar · Arama türü: Web · Veri: Kesin veri/.test(main));
  check('"Ortalama pozisyon" + average note', /Ortalama pozisyon/.test(main) && /ortalamasıdır; kesin sıra değildir/.test(main));
  check('history scope text', /Günlük ham veri, ilk 250 dışındaki satırlar ve anonimleştirilmiş sorgular saklanmaz\. Search Console verisi 16 ay tutar\./.test(main));

  // filters: country → both periods use it
  await page.getByLabel('Ülke').selectOption('tur');
  await page.getByText('Ülke: Türkiye · Cihaz: Tüm cihazlar').waitFor();
  const r1 = await api(page, '/api/admin/seo?preset=28&country=tur&device=mobile&searchType=web&dataState=final');
  const rep = r1.body.report;
  check('API: current and previous filters identical (tur / mobile / web / final)', JSON.stringify(rep.current.filters) === JSON.stringify(rep.previous.filters) && rep.current.filters.country === 'tur' && rep.current.filters.device === 'mobile', JSON.stringify([rep.current.filters, rep.previous.filters]));
  check('API: previous period same length, right before', rep.previous.range.end < rep.current.range.start);
  await page.getByLabel('Ülke').selectOption('');
  await page.getByText('Ülke: Tüm ülkeler · Cihaz: Tüm cihazlar').waitFor();

  // custom range + preset 7
  await page.getByRole('button', { name: 'Son 7 gün' }).click();
  await page.waitForFunction(() => /Gösterim olmayan günler/.test(document.body.innerText));
  // fresh data: not-final days listed as such
  await page.getByLabel('Veri').selectOption('all');
  await page.getByText(/Henüz kesinleşmemiş günler \(2\)/).waitFor({ timeout: 30000 });
  check('fresh data ("all"): the 2 not-final days are listed as "henüz kesinleşmemiş"', true);
  await page.getByLabel('Veri').selectOption('final');
  await page.waitForFunction(() => !/Henüz kesinleşmemiş günler/.test(document.body.innerText));

  // ── Turkish dark calendar: keyboard ──
  const startInput = page.getByRole('textbox', { name: /Başlangıç tarihi/ });
  await startInput.focus();
  await page.keyboard.press('Alt+ArrowDown');
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
  await dialog.waitFor();
  const todayIso = sql("select to_char(current_date, 'YYYY-MM-DD')");
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-date'));
  check('calendar: Alt+↓ in the field opens a dialog with a grid; today focused', (await focused()) === todayIso, String(await focused()));
  const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
  const heads = await dialog.locator('th').allInnerTexts();
  check('calendar: dark popover, Turkish day names, week starts Monday', bg !== 'rgb(255, 255, 255)' && heads.join(',') === 'Pzt,Sal,Çar,Per,Cum,Cmt,Paz', `${bg} ${heads}`);
  check('calendar: today marked (aria-current=date), future days disabled (max = today)', (await dialog.locator('[aria-current="date"]').count()) === 1 && (await dialog.locator(`button[data-date="${todayIso}"]`).getAttribute('aria-label')).includes('(bugün)') && (await dialog.locator('button[disabled]').count()) > 0);
  await page.keyboard.press('ArrowLeft');
  const d1 = await focused();
  await page.keyboard.press('ArrowUp');
  const d2 = await focused();
  await page.keyboard.press('PageUp');
  const d3 = await focused();
  await page.keyboard.press('Home');
  const d4 = await focused();
  await page.keyboard.press('End');
  const d5 = await focused();
  const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const dow = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  check('calendar keys: ← −1 day, ↑ −7, PageUp −1 month, Home Monday, End Sunday', d1 === add(todayIso, -1) && d2 === add(todayIso, -8) && d3.slice(5, 7) !== d2.slice(5, 7) && dow(d4) === 0 && dow(d5) === 6, [d1, d2, d3, d4, d5].join(' '));
  await page.screenshot({ path: `${OUT}/seo-takvim-desktop.png`, clip: { x: 260, y: 120, width: 900, height: 620 } });
  await page.keyboard.press('Home');
  const chosen = await focused();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'detached' });
  const ddmmyyyy = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  check('calendar: Enter selects (dd.MM.yyyy), closes and returns focus to the calendar button', (await startInput.inputValue()) === ddmmyyyy(chosen) && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Başlangıç tarihi: takvimi aç');
  await page.keyboard.press('Enter');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  check('calendar: Escape closes and returns focus', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Başlangıç tarihi: takvimi aç');
  // end date: range start ≤ end — days before the start are disabled
  const endInput = page.getByRole('textbox', { name: /Bitiş tarihi/ });
  await page.getByRole('button', { name: 'Bitiş tarihi: takvimi aç' }).click();
  await dialog.waitFor();
  const beforeStart = add(chosen, -1);
  const disabledBefore = await dialog.locator(`button[data-date="${beforeStart}"]`).count() === 0 || await dialog.locator(`button[data-date="${beforeStart}"]`).isDisabled();
  check('calendar: end picker disables days before the start (start ≤ end)', disabledBefore);
  await page.keyboard.press('Escape');
  // typed input validated
  await endInput.fill('31.02.2026');
  await endInput.press('Enter');
  check('typed date: invalid day refused with a message', /gg\.aa\.yyyy/.test(await page.getByRole('alert').first().innerText()));
  await endInput.fill(ddmmyyyy(add(todayIso, 1)));
  await endInput.press('Enter');
  check('typed date: after today refused (max = today)', /En geç/.test(await page.getByRole('alert').first().innerText()));
  const endDay = add(chosen, 6) > todayIso ? todayIso : add(chosen, 6);
  await endInput.fill(ddmmyyyy(endDay));
  await endInput.press('Enter');
  await Promise.all([page.waitForResponse((r) => r.url().includes(`start=${chosen}`) && r.url().includes(`end=${endDay}`)), page.getByRole('button', { name: 'Uygula' }).click()]);
  const custom = (await api(page, `/api/admin/seo?start=${chosen}&end=${endDay}&searchType=web&dataState=final`)).body.report;
  check('typed + picked range applied (custom period)', custom.current.range.start === chosen && custom.current.range.end === endDay, JSON.stringify(custom.current.range));

  // weekly record: twice → same rows
  await page.getByRole('button', { name: 'Son 28 gün' }).click();
  await page.getByRole('button', { name: 'Şimdi kaydet' }).click();
  await page.getByText(/Haftalık kayıt: .* kaydedildi/).waitFor({ timeout: 30000 });
  const w1 = sql('select count(*) from seo_weekly');
  await page.getByRole('button', { name: 'Şimdi kaydet' }).click();
  await page.waitForTimeout(1500);
  await page.getByText(/Haftalık kayıt: .* kaydedildi/).waitFor({ timeout: 30000 });
  const w2 = sql('select count(*) from seo_weekly');
  check('weekly snapshot idempotent (same row count twice)', Number(w1) > 0 && w1 === w2, `${w1} / ${w2}`);
  check('weekly rows: Monday weeks, completed only, fixed filters, days_with_data + data_through', sql("select count(*) from seo_weekly where extract(isodow from week_start) <> 1 or week_start + 6 >= current_date - 2 or filters <> 'country=all;device=all;type=web;state=final' or days_with_data is null") === '0' && sql("select count(*) from seo_weekly where dimension='total' and data_through is not null") === '2');
  check('weekly table shown', /haftası/.test(flat(await page.locator('main').innerText())));
  await page.getByRole('button', { name: 'Kapat' }).click().catch(() => {});
  await page.screenshot({ path: `${OUT}/seo-performans-desktop.png`, fullPage: true });

  // ── keywords ──
  await page.getByRole('button', { name: 'Anahtar kelimeler' }).click();
  await page.getByText('Mevcut sorgular (Search Console)').waitFor();
  check('two separate lists: Mevcut sorgular (Search Console) / Önerilen hedef kelimeler', (await page.getByRole('heading', { name: 'Mevcut sorgular (Search Console)', exact: true }).count()) === 1 && (await page.getByRole('heading', { name: 'Önerilen hedef kelimeler (26)', exact: true }).count()) === 1);
  const groups = await page.locator('[data-testid="seo-proposed-group"] summary').allInnerTexts();
  check('suggestions grouped by service, first group open, others collapsed', groups.map((g) => g.split('(')[0].trim()).join(',') === 'Marka,Marka stratejisi,Web,Büyüme,Kreatif,AI otomasyon,Dijital ürün,Ürünler' && (await page.locator('[data-testid="seo-proposed-group"][open]').count()) === 1, groups.join(' | '));
  await page.locator('[data-testid="seo-proposed-group"] summary', { hasText: 'Marka stratejisi' }).click();
  await page.locator('[data-testid="seo-proposed-group"] summary', { hasText: 'Dijital ürün' }).click();
  const prop = page.locator('[data-testid="seo-proposed"] li', { hasText: 'marka kimliği tasarımı' });
  await prop.getByRole('button', { name: 'Etkinleştir' }).click();
  await page.getByText('“marka kimliği tasarımı” etkinleştirildi.').waitFor();
  await page.locator('[data-testid="seo-proposed"] li', { hasText: 'mvp geliştirme' }).getByRole('button', { name: 'Etkinleştir' }).click();
  await page.getByText('“mvp geliştirme” etkinleştirildi.').waitFor();
  await page.locator('[data-testid="seo-gsc-queries"] li', { hasText: 'qr menü sistemi' }).getByRole('button', { name: 'Hedefe ekle' }).click();
  await page.getByText('“qr menü sistemi” hedef kelimelere eklendi.').waitFor();
  check('adopt: GSC query → active, source gsc, target = its top page', sql("select status||'|'||source||'|'||target_path from seo_keywords where keyword='qr menü sistemi'") === 'active|gsc|/tr/products');
  // manual add: off-site path refused, then a valid one
  await page.getByRole('button', { name: '+ Kelime ekle' }).click();
  const form = page.locator('[data-testid="seo-keyword-form"]');
  await form.getByLabel('Anahtar kelime').fill('TEST seo manuel kelime');
  await form.getByLabel('Hedef sayfa (yoca.net yolu)').fill('https://example.com/tr');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await page.getByText(/Hedef sayfa yoca.net üzerinde bir yol olmalı/).waitFor();
  check('manual keyword: off-site target refused', sql("select count(*) from seo_keywords where keyword like 'TEST seo%'") === '0');
  await form.getByLabel('Hedef sayfa (yoca.net yolu)').fill('https://yoca.net/tr/services/ai-automation/');
  await form.getByLabel('Not').fill('sentetik test notu');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await page.getByText('Kelime eklendi.').waitFor();
  check('manual keyword stored as path, source manual, active', sql("select target_path||'|'||source||'|'||status from seo_keywords where keyword='TEST seo manuel kelime'") === '/tr/services/ai-automation|manual|active');
  const table = page.locator('[data-testid="seo-keyword-table"]');
  const row = table.locator('tr', { hasText: 'TEST seo manuel kelime' });
  check('active keyword without rows → "Seçilen dönemde veri yok"', /Seçilen dönemde veri yok/.test(flat(await table.locator('tr', { hasText: 'mvp geliştirme' }).innerText())));
  const kwf = flat(await page.locator('[data-testid="seo-kw-filters"]').innerText());
  check('keyword filter set shown above the table', /^Kelime değerleri: kelimenin hedef ülkesi \(boşsa tüm ülkeler\) · Tüm cihazlar · Web · Kesin veri · \d+ \S+–\d+ \S+/.test(kwf), kwf);
  check('column labelled "Hedef ülke"', (await table.getByRole('columnheader', { name: 'Hedef ülke', exact: true }).count()) === 1);
  const apiKw = (await api(page, '/api/admin/seo?preset=28&searchType=web&dataState=final')).body.keywords.find((k) => k.keyword === 'marka kimliği tasarımı');
  const apiKwUsa = (await api(page, '/api/admin/seo?preset=28&country=usa&searchType=web&dataState=final')).body.keywords.find((k) => k.keyword === 'marka kimliği tasarımı');
  check('keyword values follow the keyword\'s target country, not the page country', apiKw.metrics && apiKwUsa.metrics && apiKw.metrics.impressions === apiKwUsa.metrics.impressions && apiKw.prevMetrics !== undefined, JSON.stringify([apiKw.metrics, apiKwUsa.metrics]));
  check('active keyword with rows → its metrics', /\d/.test(flat(await table.locator('tr', { hasText: 'marka kimliği tasarımı' }).locator('td').nth(9).innerText())));
  await row.getByRole('button', { name: 'Duraklat' }).click();
  await page.getByText('Duraklatıldı.').waitFor();
  check('pause', sql("select status from seo_keywords where keyword='TEST seo manuel kelime'") === 'paused');
  await row.getByRole('button', { name: 'Düzenle' }).click();
  await form.getByLabel('Not').fill('düzenlendi');
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await page.getByText('Kelime güncellendi.').waitFor();
  check('edit', sql("select note from seo_keywords where keyword='TEST seo manuel kelime'") === 'düzenlendi');
  check('audit log records keyword changes', Number(sql("select count(*) from audit_log where entity='seo_keywords'")) >= 5);
  await page.screenshot({ path: `${OUT}/seo-kelimeler-desktop.png`, fullPage: true });
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Sil' }).click();
  await page.getByText('Kelime silindi.').waitFor();
  check('delete', sql("select count(*) from seo_keywords where keyword='TEST seo manuel kelime'") === '0');
  check('proposed suggestions stay inactive unless activated', sql("select count(*) from seo_keywords where status='proposed'") === String(Number(before.proposed) - 2));

  // ── technical ──
  await page.getByRole('button', { name: 'Teknik' }).click();
  await page.getByRole('button', { name: 'Taramayı başlat' }).click();
  await page.getByText('Kısmi tarama (sınıra ulaşıldı)').waitFor({ timeout: 60000 });
  check('audit run stored as partial with findings', sql("select status||'|'||pages_checked||'|'||source from seo_audit_runs order by started_at desc limit 1") === 'partial|50|fixture' && Number(sql('select count(*) from seo_audit_findings')) > 50);
  // one running audit per site, decided by the database (SEO_FIXTURE_DELAY_MS makes runs overlap)
  const both = await Promise.all([api(page, '/api/admin/seo/audit', {}), api(page, '/api/admin/seo/audit', {})]);
  check('audit: two parallel requests → exactly one runs, the other gets "zaten çalışıyor" (409)', both.map((r) => r.status).sort().join(',') === '200,409' && /zaten çalışıyor/.test((both.find((r) => r.status === 409) || { body: {} }).body.error || ''), JSON.stringify(both.map((r) => [r.status, r.body && r.body.error])));
  check('audit: no run left running', sql("select count(*) from seo_audit_runs where status = 'running'") === '0');
  const site = sql("select id from seo_sites where domain = 'yoca.net'");
  const ghost = sql(`insert into seo_audit_runs (site_id, status, started_at, source) values ('${site}', 'running', now() - interval '30 seconds', 'fixture') returning id`).split('\n')[0];
  const blocked = await api(page, '/api/admin/seo/audit', {});
  check('audit: a recent running run (another instance) blocks a new one', blocked.status === 409, String(blocked.status));
  sql(`update seo_audit_runs set started_at = now() - interval '10 minutes' where id = '${ghost}'`);
  const retry = await api(page, '/api/admin/seo/audit', {});
  check('audit: after the timeout the stale run is expired (failed, Zaman aşımı) and a retry works', retry.status === 200 && sql(`select status || '|' || (limit_reason like 'Zaman aşımı%')::text from seo_audit_runs where id = '${ghost}'`) === 'failed|true', `${retry.status} ${sql(`select status from seo_audit_runs where id = '${ghost}'`)}`);
  await page.reload();
  await page.getByRole('button', { name: 'Teknik' }).click();
  await page.getByText('Kısmi tarama (sınıra ulaşıldı)').waitFor({ timeout: 30000 });
  for (const p of ['/tr', '/tr/products', '/tr/contact']) {
    await page.locator('[data-testid="seo-psi-row"]', { hasText: p }).first().getByRole('button', { name: 'Test et' }).click();
    await page.getByText(`${p} test edildi (mobil + masaüstü).`).waitFor({ timeout: 30000 });
    await page.locator('[data-testid="seo-psi-row"]', { hasText: p }).first().locator('[data-testid="seo-psi-lab"]').first().waitFor({ timeout: 30000 });
  }
  const tech = flat(await page.locator('main').innerText());
  check('PSI: lab and field labels separate', /Laboratuvar ölçümü — tek seferlik test/.test(tech) && /Gerçek kullanıcı verisi \(son 28 gün\)/.test(tech));
  check('PSI: origin fallback and no-field case shown', /tüm sitenin \(origin\) verisi/.test(tech) && /Gerçek kullanıcı verisi yok \(yeterli trafik yok\)/.test(tech));
  check('PSI rows: field_scope url / origin / none stored', sql("select string_agg(distinct field_scope, ',' order by field_scope) from seo_pagespeed") === 'none,origin,url');
  await page.screenshot({ path: `${OUT}/seo-teknik-desktop.png`, fullPage: true });

  // ── opportunities + AI on request ──
  const runsBefore = sql("select count(*) from ai_runs where action='seo_suggestion'");
  await page.getByRole('button', { name: /^Fırsatlar/ }).click();
  await page.getByText('Ortalama pozisyon 8–20, anlamlı gösterim', { exact: false }).first().waitFor();
  check('no AI run until the button is pressed', sql("select count(*) from ai_runs where action='seo_suggestion'") === runsBefore);
  await page.locator('[data-testid="seo-opportunity"]').first().getByRole('button', { name: 'AI önerisi iste' }).click();
  await page.locator('[data-testid="seo-suggestion"]').first().waitFor({ timeout: 30000 });
  check('AI suggestion: one ledger row (mock), stored suggestion, nothing written to Insights / site texts',
    sql("select count(*)||'|'||min(status) from ai_runs where action='seo_suggestion'") === `${Number(runsBefore) + 1}|mock` && sql('select count(*) from seo_ai_suggestions') === '1' && sql('select count(*) from insights') === before.insights && sql('select count(*) from site_content') === before.content);
  check('suggestion labelled as suggestion only', /Yalnızca öneri: hiçbir sayfaya, Insights’a veya site metnine yazılmadı/.test(flat(await page.locator('main').innerText())));
  await page.screenshot({ path: `${OUT}/seo-firsatlar-desktop.png`, fullPage: true });
  check('admin: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // ── mobile 390 ──
  const m = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 390, height: 844 });
  await m.page.getByText('Son kesin veri günü:').waitFor({ timeout: 30000 });
  const overflow = async () => m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: no horizontal page scroll (performance)', (await overflow()) <= 0, String(await overflow()));
  await m.page.screenshot({ path: `${OUT}/seo-performans-mobile.png`, fullPage: true });
  // calendar on a phone
  await m.page.getByRole('button', { name: 'Başlangıç tarihi: takvimi aç' }).click();
  const mdlg = m.page.getByRole('dialog').filter({ has: m.page.getByRole('grid') });
  await mdlg.waitFor();
  const box = await mdlg.boundingBox();
  check('mobile: calendar popover fits the screen', box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await mdlg.scrollIntoViewIfNeeded();
  await m.page.screenshot({ path: `${OUT}/seo-takvim-mobile.png` });
  await m.page.keyboard.press('Escape');
  const fits = (sel) => m.page.evaluate((s) => Array.from(document.querySelectorAll(s)).every((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && el.scrollWidth <= el.clientWidth + 1; }), sel);
  const hiddenTable = (sel) => m.page.evaluate((s) => { const t = document.querySelector(s); return !t || t.getBoundingClientRect().width === 0; }, sel);
  for (const [tab, file, wait] of [['Anahtar kelimeler', 'seo-kelimeler-mobile.png', 'Önerilen hedef kelimeler'], ['Teknik', 'seo-teknik-mobile.png', 'PageSpeed Insights'], ['Fırsatlar', 'seo-firsatlar-mobile.png', 'Aktif hedef kelimede veri yok']]) {
    await m.page.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    await m.page.getByText(wait, { exact: false }).first().waitFor();
    check(`mobile: no horizontal page scroll (${tab})`, (await overflow()) <= 0, String(await overflow()));
    if (tab === 'Anahtar kelimeler') {
      check('mobile: target keywords as cards (table hidden), metrics and buttons inside the screen', (await m.page.locator('[data-testid="seo-keyword-card"]').count()) >= 1 && (await hiddenTable('[data-testid="seo-keyword-table"]')) && (await fits('[data-testid="seo-keyword-card"], [data-testid="seo-keyword-card"] button')));
      check('mobile: suggestions grouped and collapsible', (await m.page.locator('[data-testid="seo-proposed-group"]').count()) >= 5);
    }
    if (tab === 'Teknik') {
      check('mobile: findings as cards (severity + finding), no horizontal scrolling', (await m.page.locator('[data-testid="seo-finding-card"]').count()) > 5 && (await hiddenTable('[data-testid="seo-findings"]')) && (await fits('[data-testid="seo-finding-card"]')));
    }
    await m.page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  }
  await m.ctx.close();

  // ── finance role: hidden + refused ──
  const f = await login(browser, 'finance@test.local', 'itest-finance-pw', { width: 1440, height: 900 });
  await f.page.waitForURL(/\/admin\/finance/, { timeout: 20000 });
  check('finance: /admin/seo redirects to Finans', /\/admin\/finance$/.test(f.page.url()), f.page.url());
  check('finance menu: no SEO', !/SEO/.test(flat(await f.page.locator('aside nav').innerText())));
  const fr = await api(f.page, '/api/admin/seo');
  const fp = await api(f.page, '/api/admin/seo', { action: 'keyword_status', id: '00000000-0000-0000-0000-000000000000', status: 'active' });
  const fa = await api(f.page, '/api/admin/seo/audit', {});
  const fs = await api(f.page, '/api/admin/seo/suggest', { kind: 'striking', subject: 'x', requestKey: 'abcdefgh-1234' });
  check('finance: every SEO API refused (401)', [fr, fp, fa, fs].every((r) => r.status === 401), JSON.stringify([fr.status, fp.status, fa.status, fs.status]));
  const rls = await f.page.evaluate(async ([url, anon, t]) => (await (await fetch(`${url}/rest/v1/seo_keywords?select=id`, { headers: { apikey: anon, Authorization: `Bearer ${t}` } })).json()), [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, await token(f.page)]);
  check('finance: RLS returns no SEO rows', Array.isArray(rls) ? rls.length === 0 : true, JSON.stringify(rls).slice(0, 100));
  await f.ctx.close();

  // ── cron path ──
  const cronBad = String((await fetch('http://localhost:3190/api/cron/seo')).status);
  const cron = (await cronCall());
  const w3 = sql('select count(*) from seo_weekly');
  check('cron: refused without CRON_SECRET; with it upserts the same weeks (no duplicates)', cronBad === '401' && cron.ok && cron.weeks.length === 2 && w3 === sql("select count(distinct (site_id, week_start, dimension, key, filters)) from seo_weekly"), `${cronBad} ${JSON.stringify(cron).slice(0, 200)}`);
  check('cron rerun: still no duplicates, identical row count', (await cronCall()).ok && sql('select count(*) from seo_weekly') === w3);
  const seoPings = pings.filter((p) => p.url.startsWith('/ping/seo'));
  check('Healthchecks: unauthorized cron sends nothing; authorized → /start then success (latest week saved); content-free GET', seoPings.length >= 2 && seoPings[0].url === '/ping/seo/start' && seoPings[1].url === '/ping/seo' && seoPings.every((p) => p.method === 'GET' && p.body === ''), JSON.stringify(seoPings.slice(0, 3)));
  check('cron result reports latest and previous week separately', /^kaydedildi \(\d+ satır\)$/.test(cron.latest) && /^yenilendi \(\d+ satır\)$/.test(cron.previous) && cron.monitor === 'success', JSON.stringify([cron.latest, cron.previous, cron.monitor]));
  check('no e-mail / Telegram captured by the gateway during the SEO run', captured() === capBefore, `${capBefore} → ${captured()}`);

  // ── without v27: SEO says "migration bekleniyor", the rest keeps working ──
  psql(['-v', 'ON_ERROR_STOP=1', '-qf', `${ROOT}/supabase/rollback-v27-seo.sql`]);
  const a2 = await login(browser, 'admin@test.local', 'itest-admin-pw', { width: 1440, height: 900 });
  await a2.page.getByText('Migration bekleniyor.').waitFor({ timeout: 30000 });
  check('no v27 tables: SEO page shows "migration bekleniyor"', /migration bekleniyor \(supabase\/upgrade-v27-seo\.sql\)/.test(flat(await a2.page.locator('main').innerText())));
  const cronPending = (await cronCall());
  check('no v27 tables: cron skips quietly', cronPending.ok && cronPending.skipped === 'migration_pending', JSON.stringify(cronPending));
  const lastPing = pings.filter((p) => p.url.startsWith('/ping/seo')).at(-1);
  check('Healthchecks: a skipped run goes to /log (content-free), NOT a success', lastPing.url === '/ping/seo/log' && lastPing.body === '' && lastPing.method === 'GET', JSON.stringify(lastPing));
  await a2.page.screenshot({ path: `${OUT}/seo-migration-bekleniyor.png` });
  await a2.page.goto('http://localhost:3190/admin/traffic');
  await a2.page.getByRole('heading', { name: 'Trafik' }).waitFor();
  const docs = await api(a2.page, '/api/admin/documents');
  check('no v27 tables: other admin pages / APIs unaffected', docs.status === 200, String(docs.status));
  await a2.ctx.close();
  psql(['-v', 'ON_ERROR_STOP=1', '-qf', `${ROOT}/supabase/upgrade-v27-seo.sql`]);
  check('v27 re-applied after the test (seed restored)', sql('select count(*) from seo_keywords') === '26');

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
