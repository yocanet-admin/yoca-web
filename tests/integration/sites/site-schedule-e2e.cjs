// TEST ONLY: local stack (app :3190 + gateway :54331, synthetic DB from setup-db.sh incl. v28).
// The monitored sites are replaced by local stub servers on 127.0.0.1 — no request reaches a real site;
// alert / recovery messages land in the gateway's capture file, nothing is really sent.
// Run: set -a; . tests/integration/.env.itest; set +a; NODE_PATH=tests/integration/node_modules node tests/integration/sites/site-schedule-e2e.cjs [out-dir]
const { chromium } = require('playwright');
const { execFileSync, execFile } = require('node:child_process');
const http = require('node:http');
const OUT = process.argv[2] || '/tmp/yoca-itest-out';
require('node:fs').mkdirSync(OUT, { recursive: true });
const psql = (q) => execFileSync('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], { encoding: 'utf8' }).trim();
const captured = () => Number(execFileSync('bash', ['-c', 'wc -l < /var/tmp/yoca-itest-gw/captured.jsonl 2>/dev/null || echo 0'], { encoding: 'utf8' }).trim());
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hits = {};
let failStatus = 503;
const stub = http.createServer((req, res) => {
  hits[req.url] = (hits[req.url] ?? 0) + 1;
  const status = req.url === '/fail' ? failStatus : 200;
  res.writeHead(status, { 'content-type': 'text/html' });
  res.end('<html>ok</html>');
}).listen(18101, '127.0.0.1');

const cron = async () => (await fetch('http://localhost:3190/api/cron/sites', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();
const unthrottle = () => psql("update cockpit_settings set value = value - 'sites_last_at' where key = 'state'");
const st = (name) => {
  const [fail, alerted, confirm, nextMin, lastState, success] = psql(`select m.fail_count, m.alerted, s.confirm_pending, round(extract(epoch from (s.next_check_at - now())) / 60), m.last_state, s.last_success_at is not null from monitored_sites m join site_check_state s on s.site_id = m.id where m.name = '${name}'`).split('|');
  return { fail: Number(fail), alerted: alerted === 't', confirm: confirm === 't', nextMin: nextMin === '' ? null : Number(nextMin), lastState, success: success === 't' };
};
const id = (name) => psql(`select id from monitored_sites where name = '${name}'`);

(async () => {
  psql('delete from monitored_sites');
  psql(`insert into monitored_sites (name, url, expects_signature, order_index, check_interval) values
    ('TEST 15dk', 'http://127.0.0.1:18101/ok', false, 0, '15m'),
    ('TEST haftalık hata', 'http://127.0.0.1:18101/fail', false, 1, '7d'),
    ('TEST haftalık', 'http://127.0.0.1:18101/weekly', false, 2, '7d'),
    ('TEST elle', 'http://127.0.0.1:18101/manual', false, 3, 'manual')`);
  // RDAP not due (127.0.0.1 has no registry): keeps the run fully local
  psql("insert into site_check_state (site_id, domain_checked_at) select id, now() from monitored_sites on conflict (site_id) do update set domain_checked_at = now()");
  psql("delete from audit_log where entity = 'monitored_sites'");

  // 0) database level: two claims at the same moment never get the same site (the first holds its rows 1 s)
  const pg = (q) => new Promise((ok, no) => execFile('psql', ['-h', process.env.ITEST_DIR || '/var/tmp/yoca-itest', '-p', process.env.ITEST_PORT || '54339', '-U', 'postgres', '-d', process.env.ITEST_DB || 'itest', '-Atc', q], (e, out) => (e ? no(e) : ok(out.trim().split('\n').filter(Boolean)))));
  const [c1, c2] = await Promise.all([
    pg("begin; select claimed_id from site_checks_claim_due(120); select pg_sleep(1); commit;"),
    pg('select claimed_id from site_checks_claim_due(120)'),
  ]);
  const claimedIds = [...c1, ...c2].filter((x) => /^[0-9a-f-]{36}$/.test(x));
  check('two simultaneous claims: 3 due sites, no site twice, manual site never', claimedIds.length === 3 && new Set(claimedIds).size === 3 && !claimedIds.includes(id('TEST elle')), JSON.stringify({ c1, c2 }));
  check('a held site is not claimed again', psql('select count(*) from site_checks_claim_due(120)') === '0');
  psql('update site_check_state set lease_until = null');

  unthrottle();
  const cap0 = captured();

  // 1) two cron runs at the same time: every due site checked exactly once; the manual-only site never
  const [a, b] = await Promise.all([cron(), cron()]);
  check('two simultaneous runs: each due site checked once', hits['/ok'] === 1 && hits['/fail'] === 1 && hits['/weekly'] === 1, JSON.stringify({ hits, a, b }));
  check('"manual only" site not checked automatically', !hits['/manual']);
  let f = st('TEST haftalık hata');
  check('weekly site, first failure: fail 1, no alert, ONE confirmation in ~15 min', f.fail === 1 && !f.alerted && f.confirm && f.nextMin >= 14 && f.nextMin <= 15, JSON.stringify(f));
  check('15-min site: next in ~15 min; weekly site: next in ~7 days', st('TEST 15dk').nextMin >= 14 && st('TEST haftalık').nextMin >= 7 * 24 * 60 - 1);
  check('first failure: no message', captured() === cap0);

  // 2) nothing due → no request at all
  unthrottle();
  const idle = await cron();
  check('run with nothing due: no site request', hits['/ok'] === 1 && hits['/fail'] === 1 && hits['/weekly'] === 1 && idle.due === 0, JSON.stringify(idle));

  // 3) the confirmation fails → exactly one alert
  psql(`update site_check_state set next_check_at = now() - interval '1 minute' where site_id = '${id('TEST haftalık hata')}'`);
  unthrottle();
  await cron();
  f = st('TEST haftalık hata');
  check('confirmation failed: alert once, back to the weekly interval', f.fail === 2 && f.alerted && !f.confirm && f.nextMin >= 7 * 24 * 60 - 1 && captured() === cap0 + 1, JSON.stringify({ f, cap: captured() - cap0 }));

  // 4) still failing at the next weekly check: no new alert, no confirmation loop
  psql(`update site_check_state set next_check_at = now() - interval '1 minute' where site_id = '${id('TEST haftalık hata')}'`);
  unthrottle();
  await cron();
  f = st('TEST haftalık hata');
  check('alerted site failing again: no new message, no confirmation', f.fail === 3 && f.alerted && !f.confirm && captured() === cap0 + 1, JSON.stringify(f));

  // ── admin session ──
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3190/admin/sites');
  await page.fill('input[type="email"]', 'admin@test.local');
  await page.fill('input[type="password"]', 'itest-admin-pw');
  await page.click('button[type="submit"]');
  await page.getByText('Sonraki planlanan kontrol:').first().waitFor({ timeout: 30000 });
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('yoca-admin-auth') || '{}').access_token || '');
  const post = (path, body) => page.evaluate(async ([p, bd, t]) => { const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(bd) }); return { status: r.status, body: await r.json().catch(() => null) }; }, [path, body, token]);

  // 5) opening / refreshing the panel sends no request to the sites
  const before = JSON.stringify(hits);
  await page.reload();
  await page.getByText('Sonraki planlanan kontrol:').first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Listeyi yenile/ }).click();
  await sleep(2500);
  check('panel open + refresh: no request to any site', JSON.stringify(hits) === before, `${before} → ${JSON.stringify(hits)}`);

  // 6) frequency change: only the schedule moves, no message, audit row with the admin
  const ch = await post('/api/admin/sites/schedule', { id: id('TEST haftalık hata'), interval: '24h' });
  f = st('TEST haftalık hata');
  check('frequency change keeps fail count / alert state, sends nothing', ch.status === 200 && f.fail === 3 && f.alerted && captured() === cap0 + 1, JSON.stringify({ ch, f }));
  check('frequency change is audit-logged with the admin; cron bookkeeping is not', psql("select count(*) || '|' || string_agg(distinct actor, ',') from audit_log where entity = 'monitored_sites'") === '1|admin@test.local', psql("select count(*), string_agg(actor, ',') from audit_log where entity = 'monitored_sites'"));

  // 7) manual check: one at a time, 2-minute gap
  const [m1, m2] = await Promise.all([post('/api/admin/sites/check', { id: id('TEST elle') }), post('/api/admin/sites/check', { id: id('TEST elle') })]);
  const statuses = [m1.status, m2.status].sort();
  check('two simultaneous manual checks: one runs, the other is refused', statuses[0] === 200 && [409, 429].includes(statuses[1]) && hits['/manual'] === 1, JSON.stringify({ statuses, hits: hits['/manual'] }));
  const m3 = await post('/api/admin/sites/check', { id: id('TEST elle') });
  check('manual again within 2 minutes: 429', m3.status === 429 && hits['/manual'] === 1, JSON.stringify(m3));
  const manual = st('TEST elle');
  check('manual-only site after a manual check: still no automatic schedule', manual.nextMin === null && manual.success, JSON.stringify(manual));

  // 8) recovery only from a real answer (manual check counts as a real check)
  failStatus = 200;
  const rec = await post('/api/admin/sites/check', { id: id('TEST haftalık hata') });
  f = st('TEST haftalık hata');
  check('site answers again (manual check): one "düzeldi", fail count reset, next = +24 h', rec.status === 200 && f.fail === 0 && !f.alerted && captured() === cap0 + 2 && f.nextMin >= 24 * 60 - 1, JSON.stringify({ rec: rec.status, f, cap: captured() - cap0 }));

  // screens
  await page.reload();
  await page.getByText('Sonraki planlanan kontrol:').first().waitFor({ timeout: 30000 });
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/sites-schedule-desktop.png`, fullPage: true });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const mp = await mobile.newPage();
  await mp.goto('http://localhost:3190/admin/sites');
  await mp.getByText('Sonraki planlanan kontrol:').first().waitFor({ timeout: 30000 });
  await sleep(1000);
  await mp.screenshot({ path: `${OUT}/sites-schedule-mobile.png`, fullPage: false });
  // 9) a real first failure again → the card shows the pending confirmation (screenshot of that card)
  failStatus = 503;
  psql(`update site_check_state set next_check_at = now() - interval '1 minute' where site_id = '${id('TEST haftalık hata')}'`);
  unthrottle();
  await cron();
  f = st('TEST haftalık hata');
  check('24-hour site, new first failure: confirmation in ~15 min, no message', f.fail === 1 && f.confirm && f.nextMin >= 14 && f.nextMin <= 15 && captured() === cap0 + 2, JSON.stringify(f));
  await page.reload();
  const card = page.locator('section, article, div').filter({ has: page.getByText('TEST haftalık hata', { exact: true }) }).filter({ has: page.getByText('Sonraki planlanan kontrol:') }).last();
  await card.waitFor({ timeout: 30000 });
  await sleep(800);
  await card.screenshot({ path: `${OUT}/sites-schedule-confirming.png` });
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  stub.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
