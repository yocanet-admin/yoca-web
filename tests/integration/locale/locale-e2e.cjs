// TEST ONLY: local stack (app :3190). Automatic language for unprefixed URLs,
// explicit language URLs, the switcher's saved choice, excluded paths.
// Run: NODE_PATH=tests/integration/node_modules node tests/integration/locale/locale-e2e.cjs
const { chromium } = require('playwright');
const BASE = 'http://localhost:3190';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`); };
const get = async (path, headers = {}) => { const r = await fetch(BASE + path, { redirect: 'manual', headers }); return { status: r.status, location: r.headers.get('location') || '', cache: r.headers.get('cache-control') || '', vary: r.headers.get('vary') || '', setCookie: r.headers.get('set-cookie') || '' }; };
const to = (r) => (r.location ? new URL(r.location, BASE).pathname + new URL(r.location, BASE).search : '');

(async () => {
  // ── unprefixed: saved choice → browser → country → English ──
  let r = await get('/', { 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8' });
  check('no prefix, browser tr-TR → /tr (307, not cacheable, varies)', r.status === 307 && to(r) === '/tr' && /no-store/.test(r.cache) && /Accept-Language/i.test(r.vary) && /Cookie/i.test(r.vary), JSON.stringify(r));
  r = await get('/', { 'accept-language': 'en-US,en;q=0.9' });
  check('browser en-US → /en', to(r) === '/en', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'de-DE,de;q=0.9,az-Latn-AZ;q=0.8' });
  check('first browser language unsupported (de) → next supported (az)', to(r) === '/az', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'fr;q=0.4,ar-AE;q=0.7,tr;q=0.5' });
  check('browser q order wins (ar 0.7 > tr 0.5)', to(r) === '/ar', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'tr-TR', cookie: 'yoca_locale=az' });
  check('saved choice (az) beats the browser (tr)', to(r) === '/az', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'de-DE', 'x-vercel-ip-country': 'AZ' });
  check('no supported browser language → country AZ → /az', to(r) === '/az', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'de-DE', 'x-vercel-ip-country': 'TR' });
  check('country TR → /tr', to(r) === '/tr', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'en-GB', 'x-vercel-ip-country': 'TR' });
  check('browser (en) beats country (TR)', to(r) === '/en', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'de-DE', 'x-vercel-ip-country': 'DE' });
  check('unclear country (DE) → English', to(r) === '/en', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'tr;q=0, de', 'x-vercel-ip-country': 'TR' });
  check('tr refused with q=0 → not chosen from country TR → English', to(r) === '/en', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'tr;q=0, az;q=0.3', 'x-vercel-ip-country': 'TR' });
  check('tr refused (q=0), az accepted → /az', to(r) === '/az', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'de-DE', 'x-vercel-ip-country': 'IR' });
  check('country outside the list (IR) → English', to(r) === '/en', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'fr-FR', 'x-vercel-ip-country': 'MA' });
  check('Arabic-speaking but not mapped (MA) → English', to(r) === '/en', JSON.stringify(r));
  r = await get('/', { 'accept-language': 'de-DE' });
  check('no country information → English, flow still works', to(r) === '/en', JSON.stringify(r));
  r = await get('/');
  check('no signals at all → English', to(r) === '/en', JSON.stringify(r));
  r = await get('/work?utm_source=x&ref=2', { 'accept-language': 'tr' });
  check('same page + query kept: /work?… → /tr/work?…', to(r) === '/tr/work?utm_source=x&ref=2', JSON.stringify(r));
  check('the redirect sets no cookie (only the switcher saves a choice)', !r.setCookie, r.setCookie);

  // ── explicit language URL: always kept, nothing saved ──
  for (const [path, headers] of [['/tr', { 'accept-language': 'en-US', cookie: 'yoca_locale=en', 'x-vercel-ip-country': 'GB' }], ['/ar/services', { 'accept-language': 'tr-TR', cookie: 'yoca_locale=az' }], ['/en/work', { 'accept-language': 'tr', 'x-vercel-ip-country': 'TR' }]]) {
    r = await get(path, headers);
    check(`explicit ${path}: served as is (200, no redirect, no cookie written) despite browser/cookie/country`, r.status === 200 && !r.location && !/yoca_locale/.test(r.setCookie), JSON.stringify(r));
  }
  r = await get('/tr/work?x=1', { 'accept-language': 'en' });
  check('explicit URL with query: no redirect loop', r.status === 200 && !r.location, JSON.stringify(r));

  // ── excluded: admin, API, files, static ──
  for (const path of ['/admin', '/admin/sites', '/api/contact', '/sitemap.xml', '/robots.txt', '/favicon.ico', '/brand/og-default.png']) {
    r = await get(path, { 'accept-language': 'tr', 'x-vercel-ip-country': 'TR' });
    check(`not language-redirected: ${path} (${r.status})`, !/^\/(en|tr|az|ar)(\/|$)/.test(to(r)), JSON.stringify(r));
  }

  // ── switcher: saves the choice, keeps query and #fragment ──
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'en-US', extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' }, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  check('browser en-US, first visit to / → /en', new URL(page.url()).pathname === '/en', page.url());
  await page.goto(BASE + '/en/services?utm_source=test#approach');
  const cookieBefore = (await ctx.cookies()).find((c) => c.name === 'yoca_locale');
  check('opening an explicit URL saves nothing', !cookieBefore, JSON.stringify(cookieBefore));
  // header language menu
  const trigger = page.locator('button[aria-haspopup="true"]').filter({ hasText: /EN/ }).first();
  await trigger.click();
  await page.locator('a[hreflang="tr-TR"]').filter({ hasText: 'Türkçe' }).first().click();
  await page.waitForURL(/\/tr\/services/);
  const u = new URL(page.url());
  check('switcher → same page in Turkish, query and #fragment kept', u.pathname === '/tr/services' && u.search === '?utm_source=test' && u.hash === '#approach', page.url());
  const saved = (await ctx.cookies()).find((c) => c.name === 'yoca_locale');
  check('switcher saved the choice (yoca_locale=tr)', saved?.value === 'tr', JSON.stringify(saved));
  await page.goto(BASE + '/');
  check('later unprefixed visit: saved choice (tr) beats the browser (en)', new URL(page.url()).pathname === '/tr', page.url());
  await page.goto(BASE + '/en/contact');
  check('explicit /en still served in English with a saved tr choice', new URL(page.url()).pathname === '/en/contact', page.url());
  check('…and the saved choice is unchanged', (await ctx.cookies()).find((c) => c.name === 'yoca_locale')?.value === 'tr');
  await page.locator('button[aria-haspopup="true"]').filter({ hasText: /EN/ }).first().click();
  const href = await page.locator('a[hreflang="az-AZ"]').filter({ hasText: 'Azərbaycan' }).first().getAttribute('href');
  check('switcher links stay plain crawlable paths (no query in href)', href === '/az/contact', href);
  // mobile switcher
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'accept-language': 'en-US' } });
  const mp = await m.newPage();
  await mp.goto(BASE + '/en/work?ref=m');
  await mp.locator('button[aria-label="Open menu"]').first().click().catch(() => {});
  await mp.waitForTimeout(500);
  const mobileAr = mp.locator('a[hreflang="ar"]').filter({ hasText: 'AR' }).first();
  if (await mobileAr.isVisible().catch(() => false)) {
    await mobileAr.click();
    await mp.waitForURL(/\/ar\/work/);
    check('mobile switcher: /ar/work?ref=m and saved ar', new URL(mp.url()).search === '?ref=m' && (await m.cookies()).find((c) => c.name === 'yoca_locale')?.value === 'ar', mp.url());
  } else {
    check('mobile switcher reachable', false, 'menu button not found');
  }
  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
